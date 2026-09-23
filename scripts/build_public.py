#!/usr/bin/env python3
"""Build the PUBLIC copy of this repo on the local branch `public`.

The public repo gets today's working tree, minus local-only files, with every
secret replaced by REDACTED. It has its own history. The private history never
leaves this machine, because its old commits hold wallet keys and passwords.

Secrets are found where they already live, so none has to be written down
anywhere public:
  - the real .env files: any variable whose name says KEY/SECRET/PASSWORD/...
  - hardcoded fallbacks in code, like process.env.X || '...' for such an X
  - passwords inside connection URLs (postgres://user:PASSWORD@host)
  - .public-redactions: extra literals, one per line (gitignored, never published)

It refuses to commit if anything secret-looking survives the scrub. The
working tree, HEAD and the real index are never touched.

    python3 scripts/build_public.py          # build, verify, commit to `public`
    python3 scripts/build_public.py --check  # build and verify only
Then: git push public   (remote.public.push maps public -> main)
"""
import datetime
import fnmatch
import os
import re
import subprocess
import sys
import tempfile

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                      check=True).stdout.strip()

# Local-only files. Matched with fnmatch, where * also crosses "/".
EXCLUDE = [
    ".claude/*",                 # Claude Code state: settings.local.json holds wallet keys
    "*CLAUDE.md",                # internal AI working notes, one in most folders
    "*CLAUDE-CODE-BRAIN.md",
    "FIRST-RUN-PROMPTS.md",
    "_trash/*",                  # an old .next build and contract build-info
    "contracts/out/*",           # forge build output
    "backend/.cache/*",          # generated image cache
    "*.log",
    ".public-redactions",
]
ENV_SKIP_DIRS = {"node_modules", ".git", "venv", ".venv", ".next", "_trash", "backups", ".cache", "out", "lib"}

SECRET_NAME = re.compile(r"KEY|SECRET|PASS|PWD|TOKEN|JWT|DSN|WEBHOOK|MNEMONIC|SEED|PRIVATE|AUTH|CREDENTIAL", re.I)
# Identifiers whose quoted value is always a secret. Not "token" or "key" alone:
# in this codebase those also name contract addresses and token ids.
SECRET_IDENT = rb"[A-Za-z0-9_]*(?:password|passwd|pwd|secret|apikey|api_key|privatekey|private_key|mnemonic|jwt)[A-Za-z0-9_]*"
PLACEHOLDER = re.compile(rb"REDACTED|your|example|changeme$|change_me|xxx|<|\$\{|process\.env|placeholder|dummy|"
                         rb"\*\*\*|sample|replace|insert|here$|^test|^\s*$|^(pass(word)?|secret|token|api[_ ]?key)s?$",
                         re.I)
# an address, a number or a version range: never a secret
PUBLIC_VALUE = re.compile(rb"0x[0-9a-fA-F]{40}|[0-9.]+|[~^]?[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*")
URL_PW = re.compile(rb"(\b[a-z][a-z0-9+.-]*://[^:\s/'\"@`]+:)([^@\s'\"/`]+)(@)", re.I)
ENV_DEFAULT = re.compile(rb"(process\.env\.([A-Za-z0-9_]+)\s*(?:\|\||\?\?)\s*)([\"'`])(.*?)\3")
PY_DEFAULT = re.compile(rb"((?:os\.environ\.get|os\.getenv)\(\s*[\"']([A-Za-z0-9_]+)[\"']\s*,\s*)([\"'])(.*?)\3")
ASSIGN = re.compile(rb"(\b" + SECRET_IDENT + rb"[\"']?\s*[:=]\s*)([\"'`])([^\"'`\s]{6,})\2", re.I)
PW_WORD = rb"(?i)((?:pass(?:word|wd)?|pwd|secret|credential)[^\n]{0,30}?)"

# What must not survive (checked on the finished tree)
GATE = [
    ("pem-private-key", re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("hex-key", re.compile(rb"(?i)(?:priv|secret|signer|wallet|mnemonic|seed|\bpk\b|_key\b|key\s*[:=]).{0,40}?"
                           rb"\b((?:0x)?[0-9a-f]{64})\b")),
    ("mnemonic", re.compile(rb"[\"'`]((?:[a-z]{3,8} ){11}[a-z]{3,8}(?: (?:[a-z]{3,8} ){11}[a-z]{3,8})?)[\"'`]")),
    ("github-token", re.compile(rb"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})")),
    ("anthropic/openai-key", re.compile(rb"\b(sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,})")),
    ("telegram-token", re.compile(rb"\b([0-9]{8,10}:AA[A-Za-z0-9_-]{30,})")),
    ("aws-key", re.compile(rb"\b(AKIA[0-9A-Z]{16})\b")),
    ("stripe-live", re.compile(rb"\b((?:sk|rk)_live_[0-9a-zA-Z]{20,})")),
    ("google-key", re.compile(rb"\b(AIza[0-9A-Za-z_-]{35})")),
    ("slack-token", re.compile(rb"\b(xox[baprs]-[A-Za-z0-9-]{10,})")),
    ("jwt", re.compile(rb"\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})")),
    ("discord-webhook", re.compile(rb"(discord(?:app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]{20,})")),
    ("url-password", URL_PW),
    ("secret-assignment", ASSIGN),
]
# the well-known Foundry/Hardhat test phrase, public by design, and an NFT art
# prompt that happens to be twelve short words
ALLOW = {b"test test test test test test test test test test test junk",
         b"coronal loops arcing overhead like molten orange bridges above the stellar surface"}
# third-party code vendored from public upstreams: only known secrets are checked
# there (forge-std's own tests carry Anvil's public test keys)
VENDORED = ("contracts/lib/",)


def git(*args, env=None, inp=None):
    return subprocess.run(["git", "-C", ROOT, *args], input=inp, capture_output=True, check=True,
                          env={**os.environ, **(env or {})}).stdout


def strong(v):
    """Safe to replace wherever it appears, without mangling ordinary words."""
    return len(v) >= 16 or (len(v) >= 8 and bool(re.search(rb"[0-9]", v)) and bool(re.search(rb"[A-Za-z]", v)))


def usable(v):
    return len(v) >= 6 and not PLACEHOLDER.search(v) and not PUBLIC_VALUE.fullmatch(v)


def collect_literals():
    lits = set()
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ENV_SKIP_DIRS]
        for f in files:
            if f.startswith(".env") and not f.endswith((".example", ".sample", ".template")):
                for line in open(os.path.join(dirpath, f), "rb"):
                    m = re.match(rb"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
                    if not m:
                        continue
                    name, val = m.group(1).decode(), m.group(2).strip(b"\"'")
                    lits.update(u.group(2) for u in URL_PW.finditer(val))
                    if SECRET_NAME.search(name):
                        lits.add(val)
    extra = os.path.join(ROOT, ".public-redactions")
    if os.path.exists(extra):
        for line in open(extra, "rb"):
            line = line.strip()
            if line and not line.startswith(b"#"):
                lits.add(line)
    return {v for v in lits if usable(v)}


def scrub(data, lits, found):
    """Replace the secrets in one file. `found` collects the ones spotted by pattern."""
    def env_default(m):
        if SECRET_NAME.search(m.group(2).decode()) and usable(m.group(4)):
            found.add(m.group(4))
            return m.group(1) + m.group(3) + b"REDACTED" + m.group(3)
        return m.group(0)

    def url_pw(m):
        if PLACEHOLDER.search(m.group(2)):
            return m.group(0)
        found.add(m.group(2))
        return m.group(1) + b"REDACTED" + m.group(3)

    def assign(m):
        if not usable(m.group(3)):
            return m.group(0)
        found.add(m.group(3))
        return m.group(1) + m.group(2) + b"REDACTED" + m.group(2)

    for lit in sorted(lits, key=len, reverse=True):
        if strong(lit):
            data = data.replace(lit, b"REDACTED")
        else:                                   # a weak one only where it reads as a password
            data = re.sub(PW_WORD + re.escape(lit) + rb"\b", rb"\1REDACTED", data)
    data = ENV_DEFAULT.sub(env_default, data)
    data = PY_DEFAULT.sub(env_default, data)
    data = URL_PW.sub(url_pw, data)
    return ASSIGN.sub(assign, data)


def read_all(entries):
    """Yield (mode, sha, path, bytes or None for binary) for every entry."""
    cat = subprocess.Popen(["git", "-C", ROOT, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    for mode, sha, path in entries:
        cat.stdin.write(sha + b"\n")
        cat.stdin.flush()
        size = int(cat.stdout.readline().split()[2])
        data = cat.stdout.read(size)
        cat.stdout.read(1)
        yield mode, sha, path, (None if b"\0" in data[:8192] else data)
    cat.stdin.close()
    cat.wait()


def main():
    check_only = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="hsr-public-")
    idx_all, idx_pub = os.path.join(tmp, "all.idx"), os.path.join(tmp, "pub.idx")

    # 1. the whole working tree, as git would commit it, minus the local-only files
    git("read-tree", "HEAD", env={"GIT_INDEX_FILE": idx_all})
    git("add", "-A", "--", ".", env={"GIT_INDEX_FILE": idx_all})
    entries = []
    for rec in git("ls-files", "-s", "-z", env={"GIT_INDEX_FILE": idx_all}).split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, sha, _ = meta.split()
            p = path.decode(errors="replace")
            if mode != b"160000" and not any(fnmatch.fnmatch(p, pat) for pat in EXCLUDE):
                entries.append((mode, sha, path))

    # 2. scrub every text file. Secrets spotted by pattern in one file may be
    #    copied into another, so a second pass scrubs those everywhere too.
    lits = collect_literals()
    found = set()
    texts = {path: data for _, _, path, data in read_all(entries) if data is not None}
    new = {p: scrub(d, lits, found) for p, d in texts.items()}
    lits |= {v for v in found if usable(v)}
    new = {p: scrub(d, lits, set()) for p, d in texts.items()}
    final = []
    for mode, sha, path in entries:
        if path in new and new[path] != texts[path]:
            sha = git("hash-object", "-w", "--stdin", inp=new[path]).strip()
        final.append((mode, sha, path))
    changed = sum(1 for p in new if new[p] != texts[p])

    # 3. the gate: nothing secret-looking may survive
    problems = set()
    for mode, sha, path, data in read_all(final):
        p = path.decode(errors="replace")
        if re.search(r"(^|/)\.env(\.[^/]*)?$", p) and not p.endswith((".example", ".sample", ".template")):
            problems.add(("env-file", p, "whole file"))
        if data is None:
            continue
        for lit in lits:
            hit = lit in data if strong(lit) else re.search(PW_WORD + re.escape(lit) + rb"\b", data)
            if hit:
                problems.add(("known-secret", p, lit[:3].decode(errors="replace") + f"…({len(lit)})"))
        for name, rx in GATE if not p.startswith(VENDORED) else ():
            for m in rx.finditer(data):
                v = m.group(m.lastindex or 0)
                if v in ALLOW or not usable(v):
                    continue
                problems.add((name, p, v[:3].decode(errors="replace") + f"…({len(v)})"))

    print(f"{len(final)} files public, {changed} scrubbed, {len(lits)} secret values tracked")
    if problems:
        print(f"REFUSING: {len(problems)} secret-looking values survived:")
        for name, p, v in sorted(problems)[:80]:
            print(f"   [{name}] {p}  {v}")
        sys.exit(1)
    print("gate: clean")
    if check_only:
        return

    # 4. commit to `public`, on top of its own history
    git("update-index", "--add", "-z", "--index-info", env={"GIT_INDEX_FILE": idx_pub},
        inp=b"".join(m + b" " + s + b"\t" + p + b"\0" for m, s, p in final))
    tree = git("write-tree", env={"GIT_INDEX_FILE": idx_pub}).decode().strip()
    parent = subprocess.run(["git", "-C", ROOT, "rev-parse", "-q", "--verify", "refs/heads/public"],
                            capture_output=True, text=True).stdout.strip()
    if parent and git("rev-parse", parent + "^{tree}").decode().strip() == tree:
        print("public is already up to date")
        return
    msg = f"Public snapshot {datetime.date.today().isoformat()}"
    commit = git("commit-tree", tree, *(["-p", parent] if parent else []), "-m", msg).decode().strip()
    git("update-ref", "refs/heads/public", commit, *([parent] if parent else []))
    print(f"public -> {commit[:12]}  ({msg})")


if __name__ == "__main__":
    main()

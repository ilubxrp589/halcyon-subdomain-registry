"use client";

import { useMemo } from "react";
import {
  Package,
  Terminal,
  Settings,
  Code2,
  Repeat,
  Plug,
  BookOpen,
  Lock,
  Unlock,
  ArrowRight,
  Zap,
  Search,
  Shield,
  ShieldCheck,
  Fingerprint,
  Cpu,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeBlock } from "@/components/wiki/CodeBlock";
import { useWeb3ModalAccount } from "@/lib/web3modal";

/* ─── Vault Access ─────────────────────────────────────────────── */
const VAULT_KEY = "0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96";

/* ─── Color Schemes for Classified Variants ────────────────────── */
const schemes = {
  hex: {
    border: "border-amber-900/20",
    text: "text-amber-700/15",
    header: "text-amber-600/30",
    headerBorder: "border-amber-900/10",
    stamp: "text-amber-500/25",
    stampBorder: "border-amber-600/15",
    addr: "text-amber-800/10",
    lock: "text-amber-600/30",
  },
  binary: {
    border: "border-cyan-900/20",
    text: "text-cyan-700/15",
    header: "text-cyan-600/30",
    headerBorder: "border-cyan-900/10",
    stamp: "text-cyan-500/25",
    stampBorder: "border-cyan-600/15",
    addr: "text-cyan-800/10",
    lock: "text-cyan-600/30",
  },
  blocks: {
    border: "border-amber-900/20",
    text: "text-amber-700/15",
    header: "text-amber-600/30",
    headerBorder: "border-amber-900/10",
    stamp: "text-amber-500/25",
    stampBorder: "border-amber-600/15",
    addr: "text-amber-800/10",
    lock: "text-amber-600/30",
  },
};

/* ─── Classified Document Block ────────────────────────────────── */
function ClassifiedBlock({
  lines = 6,
  id = "000",
  label = "CLASSIFIED",
  variant = "hex",
}: {
  lines?: number;
  id?: string;
  label?: string;
  variant?: "hex" | "binary" | "blocks";
}) {
  const c = schemes[variant];

  const content = useMemo(() => {
    const s = lines * 7 + id.charCodeAt(id.length - 1);

    if (variant === "binary") {
      return Array.from({ length: lines }, (_, i) => {
        const groups = 3 + ((s + i) % 3);
        return Array.from({ length: groups }, (_, j) =>
          Array.from(
            { length: 8 },
            (_, k) => ((s + i * 11 + j * 5 + k * 3) % 2).toString()
          ).join("")
        ).join("  ");
      });
    }

    if (variant === "blocks") {
      const chars = "\u2588\u2593\u2592\u2591";
      return Array.from({ length: lines }, (_, i) => {
        const len = 20 + ((s + i * 7) % 30);
        const indent =
          (s + i) % 3 === 0 ? "  " : (s + i) % 3 === 1 ? "    " : "";
        return (
          indent +
          Array.from(
            { length: len },
            (_, k) => chars[(s + i * 3 + k * 7) % 4]
          ).join("")
        );
      });
    }

    const h = "0123456789abcdef";
    return Array.from({ length: lines }, (_, i) => {
      const segs = 3 + ((s + i * 3) % 4);
      return Array.from({ length: segs }, (_, j) => {
        const len = 4 + ((s + i + j * 5) % 10);
        return Array.from(
          { length: len },
          (_, k) => h[(s + i * 13 + j * 7 + k * 3) % 16]
        ).join("");
      }).join("  ");
    });
  }, [lines, id, variant]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-zinc-950 ${c.border} border p-4`}
    >
      {/* Classification header bar */}
      <div
        className={`flex items-center justify-between mb-2 pb-2 border-b ${c.headerBorder}`}
      >
        <div className="flex items-center gap-2">
          <Lock className={`h-3 w-3 ${c.lock}`} />
          <span
            className={`font-mono text-[10px] ${c.header} tracking-wider`}
          >
            DOC-{id}
          </span>
        </div>
        <span
          className={`font-mono text-[10px] ${c.header} opacity-60 tracking-wider`}
        >
          RESTRICTED
        </span>
      </div>

      {/* Encrypted content */}
      <pre
        className={`font-mono text-[11px] leading-[1.7] ${c.text} select-none overflow-hidden`}
      >
        {content.map((line, i) => (
          <div key={i} className="flex gap-4">
            {variant !== "blocks" && (
              <span className={`${c.addr} w-8 text-right shrink-0`}>
                {String(i * 16).padStart(4, "0")}
              </span>
            )}
            <span>{line}</span>
          </div>
        ))}
      </pre>

      {/* Center classification stamp */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`${c.stampBorder} border rounded-md px-6 py-2 -rotate-2 bg-zinc-950/50 backdrop-blur-[1px]`}
        >
          <div
            className={`${c.stamp} font-mono font-bold text-[10px] tracking-[0.35em] uppercase`}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page Component ─────────────────────────────────────── */

export default function ResolverSDKPage() {
  const { address, isConnected } = useWeb3ModalAccount();

  const isAuthorized = useMemo(() => {
    if (!isConnected || !address) return false;
    return address.toLowerCase() === VAULT_KEY.toLowerCase();
  }, [address, isConnected]);

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/20">
            <Package className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
                Resolver SDK
              </h1>
              {isAuthorized ? (
                <Badge className="bg-emerald-950/60 text-emerald-400 border border-emerald-700/40 text-[10px] font-mono tracking-wider">
                  <Unlock className="h-3 w-3 mr-1" />
                  DECRYPTED
                </Badge>
              ) : (
                <Badge className="bg-amber-950/60 text-amber-400 border border-amber-700/40 text-[10px] font-mono tracking-wider animate-pulse">
                  <Lock className="h-3 w-3 mr-1" />
                  RESTRICTED
                </Badge>
              )}
            </div>
            <p className="text-zinc-500 text-sm mt-1">
              TypeScript SDK for Handshake subdomain resolution on Flare
            </p>
          </div>
        </div>
        <p className="text-zinc-400 leading-relaxed max-w-3xl">
          The{" "}
          <code className="text-sm bg-zinc-800/60 text-amber-300 px-1.5 py-0.5 rounded border border-zinc-700/50">
            @halcyon/resolver-sdk
          </code>{" "}
          provides a TypeScript interface for resolving Handshake subdomains to
          Flare wallet addresses, performing reverse lookups, and interacting
          with the HSR smart contracts. Built on ethers.js v6 with automatic
          caching, retry logic, and tree-shakeable exports.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            "TypeScript",
            "Node.js / Browser",
            "ethers.js v6",
            "Tree-shakeable",
            "Zero Config",
          ].map((tag) => (
            <Badge
              key={tag}
              className="bg-zinc-800/50 text-zinc-400 border-zinc-700/40 text-xs"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Authorization Banner ── */}
      {!isAuthorized && (
        <div className="relative overflow-hidden rounded-xl border border-amber-800/25 bg-gradient-to-r from-amber-950/20 via-zinc-900/40 to-amber-950/20 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-800/20 shrink-0">
              <Fingerprint className="h-6 w-6 text-amber-500/70" />
            </div>
            <div>
              <h3 className="text-amber-300/90 font-semibold text-sm mb-1">
                Documentation Access Restricted
              </h3>
              <p className="text-amber-500/40 text-sm leading-relaxed">
                Implementation details, code examples, and configuration
                references are encrypted. Connect an authorized wallet to
                decrypt the full SDK documentation. Feature overviews remain
                visible below.
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
        </div>
      )}

      {isAuthorized && (
        <div className="rounded-xl border border-emerald-800/25 bg-gradient-to-r from-emerald-950/15 via-zinc-900/40 to-emerald-950/15 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400/80" />
            <span className="text-emerald-300/90 font-medium text-sm">
              Full documentation access granted
            </span>
            <span className="text-emerald-600/40 text-xs font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          </div>
        </div>
      )}

      {/* ── Capabilities Grid ── */}
      <section>
        <h2 className="text-xl font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Capabilities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              icon: ArrowRight,
              title: "Forward Resolution",
              desc: "Resolve HNS subdomains to Flare wallet addresses",
              iconCls: "text-amber-400",
              bgCls: "bg-amber-500/10",
            },
            {
              icon: Repeat,
              title: "Reverse Lookup",
              desc: "Map wallet addresses back to primary subdomain names",
              iconCls: "text-yellow-400",
              bgCls: "bg-yellow-500/10",
            },
            {
              icon: KeyRound,
              title: "Write Operations",
              desc: "Set records, reverse names, and batch updates on-chain",
              iconCls: "text-blue-400",
              bgCls: "bg-blue-500/10",
            },
            {
              icon: Search,
              title: "REST API Client",
              desc: "Search, query, and retrieve subdomain data off-chain",
              iconCls: "text-cyan-400",
              bgCls: "bg-cyan-500/10",
            },
            {
              icon: Cpu,
              title: "React Integration",
              desc: "Drop-in component patterns and hook examples",
              iconCls: "text-pink-400",
              bgCls: "bg-pink-500/10",
            },
            {
              icon: Shield,
              title: "Typed Errors",
              desc: "Structured error classes with automatic retry logic",
              iconCls: "text-amber-400",
              bgCls: "bg-amber-500/10",
            },
          ].map((f, i) => (
            <Card
              key={i}
              className="bg-zinc-900/40 border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
            >
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${f.bgCls}`}>
                    <f.icon className={`h-4 w-4 ${f.iconCls}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-200 text-sm">
                      {f.title}
                    </h3>
                    <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Installation ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Terminal className="h-5 w-5 text-amber-400" />
            Installation
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Install the SDK package and its peer dependency to start resolving
          Handshake subdomains in your project.
        </p>
        {isAuthorized ? (
          <div className="space-y-3">
            <CodeBlock
              language="bash"
              code="npm install @halcyon/resolver-sdk"
            />
            <p className="text-xs text-zinc-500">
              Alternative package managers:
            </p>
            <CodeBlock
              language="bash"
              code={`yarn add @halcyon/resolver-sdk\npnpm add @halcyon/resolver-sdk`}
            />
            <Card className="bg-zinc-900/40 border-zinc-800/50">
              <CardContent className="pt-4">
                <h4 className="font-medium text-zinc-300 text-sm mb-2">
                  Peer Dependencies
                </h4>
                <p className="text-xs text-zinc-500 mb-3">
                  Requires{" "}
                  <code className="bg-zinc-800/60 text-amber-300 px-1 py-0.5 rounded text-[11px]">
                    ethers@^6.0.0
                  </code>{" "}
                  as a peer dependency.
                </p>
                <CodeBlock language="bash" code="npm install ethers@^6" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <ClassifiedBlock
            lines={5}
            id="SDK-001"
            label="PACKAGE DATA ENCRYPTED"
            variant="hex"
          />
        )}
      </section>

      {/* ── Configuration ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Settings className="h-5 w-5 text-amber-400" />
            Configuration
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Initialize the resolver with custom RPC endpoints, contract addresses,
          cache settings, and optional write capabilities.
        </p>
        {isAuthorized ? (
          <div className="space-y-4">
            <CodeBlock
              language="typescript"
              code={`import { HSRResolver } from "@halcyon/resolver-sdk";

// Default: connects to Coston2 testnet
const resolver = new HSRResolver();

// Custom configuration
const resolver = new HSRResolver({
  // Custom RPC endpoint
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",

  // Contract addresses (defaults to Coston2 deployments)
  contracts: {
    resolver: "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1",
    nft: "0x1a6830B495Cd0f6dd8996c7d561EFa7868253398",
    oracle: "0xfCf8c862933b23fbFE99a30EfFB8FF867a8e55A1",
  },

  // Cache TTL in milliseconds (default: 60000)
  cacheTTL: 30000,

  // Number of retry attempts for failed calls (default: 3)
  retries: 3,
});`}
            />

            <Card className="bg-zinc-900/40 border-zinc-800/50">
              <CardContent className="pt-4 space-y-3">
                <h4 className="font-medium text-zinc-300 text-sm">
                  Configuration Options
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left">
                        <th className="pb-2 pr-4 text-zinc-300 font-medium">
                          Option
                        </th>
                        <th className="pb-2 pr-4 text-zinc-300 font-medium">
                          Type
                        </th>
                        <th className="pb-2 pr-4 text-zinc-300 font-medium">
                          Default
                        </th>
                        <th className="pb-2 text-zinc-300 font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      {[
                        [
                          "rpcUrl",
                          "string",
                          "Coston2 public RPC",
                          "JSON-RPC endpoint URL",
                        ],
                        [
                          "contracts",
                          "object",
                          "Coston2 addresses",
                          "Override contract addresses",
                        ],
                        [
                          "cacheTTL",
                          "number",
                          "60000",
                          "Cache time-to-live in ms",
                        ],
                        [
                          "retries",
                          "number",
                          "3",
                          "Max retry attempts",
                        ],
                        [
                          "signer",
                          "Signer",
                          "undefined",
                          "Ethers signer for write operations",
                        ],
                      ].map(([opt, type, def, desc], i) => (
                        <tr key={i} className="border-b border-zinc-800/50">
                          <td className="py-2 pr-4 font-mono text-xs text-amber-300">
                            {opt}
                          </td>
                          <td className="py-2 pr-4 text-xs">{type}</td>
                          <td className="py-2 pr-4 text-xs text-zinc-500">
                            {def}
                          </td>
                          <td className="py-2 text-xs">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ClassifiedBlock
            lines={10}
            id="SDK-002"
            label="CONFIG SCHEMA ENCRYPTED"
            variant="binary"
          />
        )}
      </section>

      {/* ── Forward Resolution ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Code2 className="h-5 w-5 text-amber-400" />
            Forward Resolution
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Resolve any Handshake subdomain to its associated Flare wallet address
          with optional metadata retrieval.
        </p>
        {isAuthorized ? (
          <div className="space-y-3">
            <CodeBlock
              language="typescript"
              code={`import { HSRResolver } from "@halcyon/resolver-sdk";

const resolver = new HSRResolver();

// Resolve a subdomain to an address
const address = await resolver.resolve("wallet.example");
console.log(address);
// => "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"

// Returns null if no record exists
const unknown = await resolver.resolve("nonexistent.example");
console.log(unknown);
// => null

// Resolve with metadata
const result = await resolver.resolveWithMeta("wallet.example");
console.log(result);
// => {
//   address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
//   label: "wallet",
//   parent: "example",
//   tokenId: 42n,
//   owner: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
//   tier: "Standard"
// }`}
            />
            <Card className="bg-zinc-900/40 border-zinc-800/50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Results are automatically cached for the configured{" "}
                    <code className="bg-zinc-800/60 text-amber-300 px-1 py-0.5 rounded text-[11px]">
                      cacheTTL
                    </code>{" "}
                    duration. Subsequent lookups for the same name resolve
                    instantly from cache.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ClassifiedBlock
            lines={10}
            id="SDK-003"
            label="IMPLEMENTATION REDACTED"
            variant="blocks"
          />
        )}
      </section>

      {/* ── Reverse Resolution ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Repeat className="h-5 w-5 text-amber-400" />
            Reverse Resolution
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Look up the primary subdomain name associated with any Flare wallet
          address. Reverse records must be set explicitly by the address owner.
        </p>
        {isAuthorized ? (
          <div className="space-y-3">
            <CodeBlock
              language="typescript"
              code={`// Reverse resolve: address -> subdomain name
const name = await resolver.reverse("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
console.log(name);
// => "wallet.example"

// Returns null if no reverse record is set
const noName = await resolver.reverse("0x0000000000000000000000000000000000000001");
console.log(noName);
// => null`}
            />
            <Card className="bg-zinc-900/40 border-zinc-800/50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Reverse records must be set explicitly by the address owner
                    using{" "}
                    <code className="bg-zinc-800/60 text-amber-300 px-1 py-0.5 rounded text-[11px]">
                      setReverse()
                    </code>{" "}
                    or by calling{" "}
                    <code className="bg-zinc-800/60 text-amber-300 px-1 py-0.5 rounded text-[11px]">
                      setName()
                    </code>{" "}
                    on-chain. Only returns a result if the owner has configured
                    their primary name.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ClassifiedBlock
            lines={6}
            id="SDK-004"
            label="IMPLEMENTATION REDACTED"
            variant="hex"
          />
        )}
      </section>

      {/* ── Write Operations ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-400" />
            Write Operations
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Set and update resolution records on-chain. Requires a connected
          wallet that owns the target subdomain NFT.
        </p>
        {isAuthorized ? (
          <CodeBlock
            language="typescript"
            code={`import { HSRResolver } from "@halcyon/resolver-sdk";
import { BrowserProvider } from "ethers";

// Connect with a browser wallet
const browserProvider = new BrowserProvider(window.ethereum);
const signer = await browserProvider.getSigner();

const resolver = new HSRResolver({ signer });

// Set forward record (subdomain -> address)
// You must own the subdomain NFT to set its record
await resolver.setRecord("wallet.example", "0xNewAddress...");

// Set reverse record (address -> subdomain)
// You can only set your own reverse record
await resolver.setReverse("wallet.example");

// Batch set records (if you own multiple subdomains)
await resolver.batchSetRecords([
  { name: "wallet.example", address: "0xAddr1..." },
  { name: "app.example", address: "0xAddr2..." },
]);`}
          />
        ) : (
          <ClassifiedBlock
            lines={10}
            id="SDK-005"
            label="WRITE OPS CLASSIFIED"
            variant="binary"
          />
        )}
      </section>

      {/* ── API Client ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Plug className="h-5 w-5 text-amber-400" />
            API Client Wrapper
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          A REST client wrapper for querying the HSR indexer, providing fast
          off-chain search, pricing, and ownership lookups.
        </p>
        {isAuthorized ? (
          <CodeBlock
            language="typescript"
            code={`import { HSRClient } from "@halcyon/resolver-sdk";

const client = new HSRClient({
  baseUrl: "https://api.halcyon.domains",
});

// Search available subdomains
const results = await client.search({
  query: "dev",
  parentDomain: "example",
  available: true,
});
// => [{ name: "dev", available: true, tier: "Standard Plus", priceUSD: 25 }, ...]

// Get subdomain details
const info = await client.getSubdomain("wallet", "example");
// => { label: "wallet", parent: "example", owner: "0x...", tokenId: 42, ... }

// List all subdomains owned by an address
const owned = await client.getOwnedSubdomains("0x742d35Cc...");
// => [{ name: "wallet.example", tokenId: 42 }, { name: "app.example", tokenId: 87 }]

// Get current pricing
const pricing = await client.getPricing();
// => { tiers: { 1: { usd: 500 }, 2: { usd: 100 }, ... }, flrUsd: 0.025 }`}
          />
        ) : (
          <ClassifiedBlock
            lines={12}
            id="SDK-006"
            label="API INTERFACE CLASSIFIED"
            variant="blocks"
          />
        )}
      </section>

      {/* ── Integration Example ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-amber-400" />
            Full Integration Example
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          A complete React component demonstrating subdomain resolution with
          loading states and error handling.
        </p>
        {isAuthorized ? (
          <CodeBlock
            language="typescript"
            code={`"use client";

import { useState } from "react";
import { HSRResolver } from "@halcyon/resolver-sdk";

const resolver = new HSRResolver();

export function SubdomainLookup() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleResolve = async () => {
    setLoading(true);
    try {
      const address = await resolver.resolve(name);
      setResult(address ?? "No record found");
    } catch (err) {
      setResult("Resolution failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="wallet.example"
      />
      <button onClick={handleResolve} disabled={loading}>
        {loading ? "Resolving..." : "Resolve"}
      </button>
      {result && <p>Result: {result}</p>}
    </div>
  );
}`}
          />
        ) : (
          <ClassifiedBlock
            lines={14}
            id="SDK-007"
            label="SOURCE CODE REDACTED"
            variant="hex"
          />
        )}
      </section>

      {/* ── Error Handling ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            Error Handling
          </h2>
          {isAuthorized && (
            <Badge className="bg-emerald-950/40 text-emerald-500/60 border-emerald-800/20 text-[9px] font-mono tracking-wider">
              DECRYPTED
            </Badge>
          )}
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          The SDK provides typed error classes for common failure scenarios,
          enabling precise error handling in your application.
        </p>
        {isAuthorized ? (
          <CodeBlock
            language="typescript"
            code={`import {
  HSRResolver,
  ResolverError,
  NotFoundError,
  NetworkError,
  UnauthorizedError,
} from "@halcyon/resolver-sdk";

const resolver = new HSRResolver();

try {
  await resolver.setRecord("wallet.example", "0xNewAddr...");
} catch (err) {
  if (err instanceof UnauthorizedError) {
    console.error("You do not own this subdomain NFT");
  } else if (err instanceof NetworkError) {
    console.error("RPC connection failed:", err.message);
  } else if (err instanceof NotFoundError) {
    console.error("Subdomain does not exist");
  } else if (err instanceof ResolverError) {
    console.error("Resolver error:", err.code, err.message);
  }
}`}
          />
        ) : (
          <ClassifiedBlock
            lines={8}
            id="SDK-008"
            label="ERROR TYPES CLASSIFIED"
            variant="binary"
          />
        )}
      </section>

      {/* ── Related Guides ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200">Related Guides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Smart Contracts",
              desc: "HSR contract architecture and ABIs",
              icon: Code2,
            },
            {
              title: "Flare Network",
              desc: "Flare integration and FTSO price feeds",
              icon: Zap,
            },
            {
              title: "DNS Setup",
              desc: "Configure DNS records for your subdomain",
              icon: Settings,
            },
            {
              title: "Domain Management",
              desc: "Register, transfer, and manage subdomains",
              icon: Package,
            },
          ].map((guide, i) => (
            <Card
              key={i}
              className="bg-zinc-900/30 border-zinc-800/40 hover:border-amber-800/30 transition-colors cursor-pointer"
            >
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-3">
                  <guide.icon className="h-4 w-4 text-amber-400/70" />
                  <div>
                    <h3 className="font-medium text-zinc-300 text-sm">
                      {guide.title}
                    </h3>
                    <p className="text-zinc-600 text-xs">{guide.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

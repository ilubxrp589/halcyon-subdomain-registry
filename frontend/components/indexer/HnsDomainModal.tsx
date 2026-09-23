"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Shield,
  ShieldCheck,
  ShieldX,
  Loader2,
  Globe,
  Clock,
  Server,
  Lock,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  getIndexedDomain,
  type IndexedDomain,
  type IndexedDomainDetail,
} from "@/services/indexer";
import { useTldMatch } from "./TldMatchProvider";

interface HnsDomainModalProps {
  domain: IndexedDomain | null;
  isOpen: boolean;
  onClose: () => void;
}

/* ───────── shared helpers (same as HnsDomainCard) ───────── */

function nameToGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 25%), hsl(${h2}, 70%, 15%))`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function classificationVariant(
  c: string
): "success" | "warning" | "secondary" | "destructive" {
  switch (c) {
    case "real":
      return "success";
    case "parking":
      return "warning";
    case "error":
      return "destructive";
    default:
      return "secondary";
  }
}

function httpStatusColor(status: number | null): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-amber-400";
  return "text-red-500";
}

/* ───────── detail row component ───────── */

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {label}
        </div>
        <div className="text-sm text-foreground mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/* ───────── main modal ───────── */

export function HnsDomainModal({
  domain,
  isOpen,
  onClose,
}: HnsDomainModalProps) {
  const [detail, setDetail] = useState<IndexedDomainDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const { isHsrTld } = useTldMatch();

  const [dnsState, setDnsState] = useState<"idle" | "loading" | "ok" | "fail">(
    "idle"
  );
  const [dnsResult, setDnsResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch full detail when modal opens
  useEffect(() => {
    if (!isOpen || !domain) {
      setDetail(null);
      setDnsState("idle");
      setDnsResult(null);
      return;
    }
    setLoading(true);
    getIndexedDomain(domain.name)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, domain]);

  const verifyDns = useCallback(async () => {
    if (!domain) return;
    setDnsState("loading");
    try {
      const res = await fetch(
        `https://dns.halcyon-names.io/resolve?name=${encodeURIComponent(domain.name)}&type=A`
      );
      const data = await res.json();
      if (data.Answer && data.Answer.length > 0) {
        setDnsResult(
          data.Answer.map((a: { data: string }) => a.data).join(", ")
        );
        setDnsState("ok");
      } else {
        setDnsResult("No A records found");
        setDnsState("fail");
      }
    } catch {
      setDnsResult("DNS query failed");
      setDnsState("fail");
    }
  }, [domain]);

  const copyDohUrl = () => {
    navigator.clipboard.writeText("https://dns.halcyon-names.io/dns-query");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!domain) return null;

  const d = detail || domain;
  const isTldMatch = isHsrTld(domain.name);
  const isAlive =
    d.status === "alive" &&
    d.http_status != null &&
    d.http_status >= 200 &&
    d.http_status < 400;
  const gradient = nameToGradient(d.name);
  const clusterSize = d.cluster_size || 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Gradient header */}
        <div
          className="h-32 relative flex items-end px-6 pb-4"
          style={{ background: gradient }}
        >
          {/* Status dot */}
          <div className="absolute top-4 right-4">
            <div
              className={`w-3 h-3 rounded-full ${isAlive ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"} shadow-sm`}
            />
          </div>

          <DialogHeader className="relative z-10">
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
              {d.name}/
              {d.https && (
                <Lock className="w-4 h-4 text-green-400" />
              )}
            </DialogTitle>
            {d.title && (
              <p className="text-sm text-white/70 mt-1 line-clamp-1">
                {d.title}
              </p>
            )}
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading details...
            </div>
          )}

          {/* Classification + HTTP badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={classificationVariant(d.classification)}
              className="text-xs"
            >
              {d.classification}
            </Badge>
            {d.http_status && (
              <span
                className={`text-xs font-medium ${httpStatusColor(d.http_status)}`}
              >
                HTTP {d.http_status}
              </span>
            )}
            {d.https && (
              <Badge variant="success" className="text-[10px] gap-1">
                <Lock className="w-3 h-3" /> HTTPS
              </Badge>
            )}
            {clusterSize > 1 && (
              <span className="text-xs text-muted-foreground">
                {clusterSize} domains on this IP
              </span>
            )}
          </div>

          {/* Description */}
          {d.description ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {d.description}
            </p>
          ) : null}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 border-t border-border/40 pt-3">
            <DetailRow icon={Server} label="IP Address">
              <span className="font-mono text-xs">{d.ip || "\u2014"}</span>
            </DetailRow>
            <DetailRow icon={Clock} label="Response Time">
              <span>{d.response_time_ms != null ? `${d.response_time_ms}ms` : "\u2014"}</span>
            </DetailRow>
            <DetailRow icon={Globe} label="First Seen">
              <span>{formatDate(d.first_seen)}</span>
            </DetailRow>
            <DetailRow icon={Clock} label="Last Checked">
              <span>{d.last_checked ? timeAgo(d.last_checked) : "\u2014"}</span>
            </DetailRow>
            {d.content_type ? (
              <DetailRow icon={Globe} label="Content-Type">
                <span className="truncate block">{d.content_type}</span>
              </DetailRow>
            ) : null}
            {d.redirect ? (
              <DetailRow icon={ArrowRight} label="Redirect">
                <span className="truncate block font-mono text-xs">
                  {d.redirect}
                </span>
              </DetailRow>
            ) : null}
            {d.hosting_provider ? (
              <DetailRow icon={Server} label="Hosting">
                <span>{d.hosting_provider}</span>
              </DetailRow>
            ) : null}
            {d.class_reason ? (
              <DetailRow icon={Shield} label="Classification Reason">
                <span>{d.class_reason}</span>
              </DetailRow>
            ) : null}
          </div>

          {/* Body text preview (from detail endpoint) */}
          {detail?.body_text ? (
            <div className="border-t border-border/40 pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Content Preview
              </div>
              <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-4">
                {detail.body_text}
              </p>
            </div>
          ) : null}

          {/* Keywords */}
          {detail?.keywords ? (
            <div className="border-t border-border/40 pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Keywords
              </div>
              <p className="text-xs text-muted-foreground/80">
                {detail.keywords}
              </p>
            </div>
          ) : null}

          {/* DNS Verification */}
          <div className="border-t border-border/40 pt-4 space-y-3">
            <div className="text-xs font-medium text-foreground">
              DNS Verification
            </div>
            <p className="text-xs text-muted-foreground">
              Verify live DNS resolution via{" "}
              <span className="text-amber-400">Halcyon DoH</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={verifyDns}
              disabled={dnsState === "loading"}
              className="w-full border-border/40"
            >
              {dnsState === "loading" && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              {dnsState === "idle" && (
                <Shield className="w-3.5 h-3.5 mr-1.5" />
              )}
              {dnsState === "ok" && (
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-green-500" />
              )}
              {dnsState === "fail" && (
                <ShieldX className="w-3.5 h-3.5 mr-1.5 text-red-500" />
              )}
              {dnsState === "loading"
                ? "Resolving..."
                : dnsState === "idle"
                  ? "Verify DNS Live"
                  : "Verify Again"}
            </Button>

            {dnsResult && (
              <div
                className={`rounded-lg border p-3 font-mono text-xs ${
                  dnsState === "ok"
                    ? "border-green-500/30 bg-green-500/5 text-green-400"
                    : "border-red-500/30 bg-red-500/5 text-red-400"
                }`}
              >
                {dnsResult}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            <div className="text-xs font-medium text-foreground mb-2">
              Visit this site
            </div>
            {d.https ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={`https://${d.name}./`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-border/40 gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Visit via DoH
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </Button>
                </a>
                <a
                  href={`https://${d.name}.hns.to/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-border/40 gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit via Gateway
                  </Button>
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <a
                  href={`https://${d.name}.hns.to/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-border/40 gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Visit Site
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </Button>
                </a>
                <p className="text-[11px] text-muted-foreground/60">
                  This site doesn&apos;t support HTTPS, so it opens through the hns.to
                  gateway. With DoH set up, HTTPS Handshake sites load directly in
                  your browser.
                </p>
              </div>
            )}
          </div>

          {/* Registration CTA for HSR TLDs */}
          {isTldMatch && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
              <div className="text-sm font-semibold text-green-400">
                This is a Halcyon TLD!
              </div>
              <p className="text-xs text-muted-foreground">
                Register subdomains under <strong className="text-foreground">.{domain.name}</strong> on the Halcyon marketplace.
              </p>
              <Link
                href={`/register-v2?tld=${encodeURIComponent(domain.name)}`}
                data-analytics="indexer-register-cta"
              >
                <Button
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5 mt-1"
                >
                  Register yourname.{domain.name}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* DoH CTA — conversion funnel */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <div className="text-sm font-semibold text-amber-400">
              Want to browse the Handshake web natively?
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Set up Halcyon DoH in your browser and access any Handshake domain
              directly — no gateway needed. Takes about 60 seconds.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono bg-muted/30 border border-border/40 rounded px-2 py-1.5 text-amber-400/80 truncate">
                https://dns.halcyon-names.io/dns-query
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copyDohUrl}
                className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Paste this URL into your browser&apos;s DNS-over-HTTPS settings (Chrome: chrome://settings/security)
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

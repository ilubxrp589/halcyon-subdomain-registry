"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Shield, ShieldCheck, ShieldX, Loader2, ArrowRight } from "lucide-react";
import type { IndexedDomain } from "@/services/indexer";
import { useTldMatch } from "./TldMatchProvider";

interface HnsDomainCardProps {
  domain: IndexedDomain;
  onClick?: () => void;
}

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

function classificationVariant(c: string): "success" | "warning" | "secondary" | "destructive" {
  switch (c) {
    case "real": return "success";
    case "parking": return "warning";
    case "error": return "destructive";
    default: return "secondary";
  }
}

export function HnsDomainCard({ domain, onClick }: HnsDomainCardProps) {
  const [dnsState, setDnsState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [dnsIp, setDnsIp] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const { isHsrTld } = useTldMatch();

  const isAlive = domain.status === "alive" && domain.http_status != null && domain.http_status >= 200 && domain.http_status < 400;
  const isTldMatch = isHsrTld(domain.name);
  const gradient = nameToGradient(domain.name);
  const hasScreenshot = domain.screenshot_path && !imgError;
  const clusterSize = domain.cluster_size || 0;

  const verifyDns = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDnsState("loading");
    try {
      const res = await fetch(
        `https://dns.halcyon-names.io/resolve?name=${encodeURIComponent(domain.name)}&type=A`
      );
      const data = await res.json();
      if (data.Answer && data.Answer.length > 0) {
        setDnsIp(data.Answer[0].data);
        setDnsState("ok");
      } else {
        setDnsState("fail");
      }
    } catch {
      setDnsState("fail");
    }
  };

  const visitSite = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Card
      className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm hover:border-amber-500/30 hover:bg-card/70 transition-all duration-300 cursor-pointer flex flex-col"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />

      {/* Screenshot / gradient header */}
      <div
        className="h-28 relative flex items-center justify-center overflow-hidden"
        style={hasScreenshot ? undefined : { background: gradient }}
      >
        {hasScreenshot ? (
          <img
            src={`/api/proxy/v2/indexer/screenshots/${domain.screenshot_path}`}
            alt={`${domain.name} screenshot`}
            className="w-full h-full object-cover object-top"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-4xl font-bold text-white/15 uppercase select-none tracking-wider">
            {domain.name.slice(0, 3)}
          </span>
        )}

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          {domain.https && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 text-green-400 backdrop-blur-sm">
              HTTPS
            </span>
          )}
          {clusterSize > 1 && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 text-amber-400 backdrop-blur-sm"
              title={`${clusterSize} domains share this IP${domain.hosting_provider ? ` (${domain.hosting_provider})` : ""}`}
            >
              {clusterSize} shared
            </span>
          )}
        </div>

        {/* Status dot */}
        <div className="absolute top-2 right-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isAlive ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"} shadow-sm`} />
        </div>

        {/* Response time */}
        {domain.response_time_ms != null && domain.response_time_ms < 5000 && (
          <div className="absolute bottom-1.5 right-2">
            <span className="text-[10px] text-white/60 bg-black/40 px-1.5 rounded backdrop-blur-sm">
              {domain.response_time_ms}ms
            </span>
          </div>
        )}
      </div>

      <CardContent className="p-4 flex flex-col gap-1.5 flex-1">
        {/* Domain name + visit */}
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold text-foreground group-hover:text-amber-400 transition-colors truncate">
            {domain.name}/
          </h3>
          {isAlive && (
            <a
              href={`http://${domain.name}./`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={visitSite}
              className="shrink-0 text-muted-foreground hover:text-amber-400 transition-colors"
              title="Visit site (requires HNS resolver)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Title */}
        {domain.title && (
          <p className="text-sm text-muted-foreground truncate">
            {domain.title}
          </p>
        )}

        {/* Description */}
        {domain.description && (
          <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-auto">
            {domain.description.length > 120 ? domain.description.slice(0, 120) + "..." : domain.description}
          </p>
        )}

        {/* Tags row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Badge variant={classificationVariant(domain.classification)} className="text-[10px] px-1.5 py-0">
            {domain.classification}
          </Badge>
          {domain.http_status && (
            <span className="text-[10px] text-muted-foreground">
              HTTP {domain.http_status}
            </span>
          )}
          {domain.last_checked && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto" title={new Date(domain.last_checked).toLocaleString()}>
              {timeAgo(domain.last_checked)}
            </span>
          )}
        </div>

        {/* DNS verify */}
        <div className="mt-2 pt-2 border-t border-border/40">
          {dnsState === "idle" && (
            <button
              onClick={verifyDns}
              className="text-[11px] text-muted-foreground hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              <Shield className="w-3 h-3" />
              Verify DNS
            </button>
          )}
          {dnsState === "loading" && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Resolving...
            </span>
          )}
          {dnsState === "ok" && (
            <span className="text-[11px] text-green-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Resolves to {dnsIp}
            </span>
          )}
          {dnsState === "fail" && (
            <span className="text-[11px] text-red-500 flex items-center gap-1.5">
              <ShieldX className="w-3.5 h-3.5" />
              No DNS records
            </span>
          )}
        </div>

        {/* Registration CTA for HSR TLDs */}
        {isTldMatch && (
          <Link
            href={`/register-v2?tld=${encodeURIComponent(domain.name)}`}
            onClick={(e) => e.stopPropagation()}
            data-analytics="indexer-register-cta"
            className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            Register yourname.{domain.name}
            <ArrowRight className="w-3 h-3 ml-auto" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

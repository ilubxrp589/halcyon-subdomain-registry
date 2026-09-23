"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { OfficialBadge } from "@/components/common/OfficialBadge";
import { PriceDisplay } from "@/components/PriceDisplay";
import { truncateAddress } from "@/lib/utils";
import { Search, Loader2, CheckCircle, XCircle, ArrowRight, Clock } from "lucide-react";
import type { TldPublicDetail } from "@/services/tldBrowse";

interface PublicViewProps {
  tld: TldPublicDetail;
}

export function PublicView({ tld }: PublicViewProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{
    available: boolean;
    fullName: string;
    priceUsdCents: number | null;
  } | null>(null);

  const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

  const handleSearch = useCallback(async () => {
    const q = query.toLowerCase().trim();
    if (!q) return;
    setIsSearching(true);
    setResult(null);
    try {
      const res = await fetch(`${API_V2}/search?q=${encodeURIComponent(q)}&tld=${tld.label}`);
      const data = await res.json();
      const r = data.results?.[0];
      if (r) {
        setResult({
          available: r.available,
          fullName: r.fullName,
          priceUsdCents: r.price?.usdCents ?? null,
        });
      }
    } catch {
      // silent
    } finally {
      setIsSearching(false);
    }
  }, [query, tld.label, API_V2]);

  const pricing = tld.pricing?.lengthPricesUsdCents;

  return (
    <div className="space-y-6">
      {/* TLD Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">
              {tld.displayName || `.${tld.label}`}
            </h1>
            {tld.displayName && (
              <span className="text-lg text-muted-foreground font-mono">.{tld.label}</span>
            )}
            <OfficialBadge isOfficial={tld.isOfficial} />
          </div>
          {tld.description && (
            <p className="text-sm text-muted-foreground mb-1">{tld.description}</p>
          )}
          <div className="text-sm text-muted-foreground">
            Owner: {truncateAddress(tld.owner)} · Staked {tld.stakedAt ? new Date(tld.stakedAt).toLocaleDateString() : ""}
          </div>
          <div className="text-sm text-muted-foreground">
            {tld.sldCount} domain{tld.sldCount !== 1 ? "s" : ""} registered
            {tld.registrationEnabled ? (
              <span className="ml-2 text-green-400">Open for registration</span>
            ) : (
              <span className="ml-2 text-red-400">Registration closed</span>
            )}
          </div>
        </div>
        <Link href={`/register-v2?tld=${tld.label}`}>
          <button className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all">
            Register Under .{tld.label}
            <ArrowRight className="inline ml-2 h-4 w-4" />
          </button>
        </Link>
      </div>

      {/* In-page Search */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Search for a name under .{tld.label}</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="yourname"
            className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-amber-500/50 transition-all font-mono"
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>

        {result && (
          <div className="mt-3 flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              {result.available ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="font-mono font-bold">{result.fullName}</span>
              <span className={`text-xs ${result.available ? "text-green-400" : "text-red-400"}`}>
                {result.available ? "Available" : "Taken"}
              </span>
            </div>
            {result.available && (
              <div className="flex items-center gap-3">
                {result.priceUsdCents != null && result.priceUsdCents > 0 && (
                  <PriceDisplay usdCents={result.priceUsdCents} compact />
                )}
                <Link href={`/register-v2?tld=${tld.label}`}>
                  <button className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold rounded-lg transition-colors">
                    Register
                  </button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pricing */}
      {pricing && pricing.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Pricing</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {["1 char", "2 chars", "3 chars", "4 chars", "5+ chars"].map((label, i) => {
              const price = pricing[i] ?? pricing[pricing.length - 1];
              return (
                <div key={label} className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className="font-bold">${(price / 100).toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">/year</div>
                </div>
              );
            })}
          </div>
          {tld.pricing?.multiYearDiscounts && (
            <p className="text-xs text-muted-foreground mt-2">
              Multi-year discounts available
            </p>
          )}
        </div>
      )}

      {/* Recent Registrations */}
      {tld.recentRegistrations && tld.recentRegistrations.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Recent Registrations</h3>
          <div className="space-y-2">
            {tld.recentRegistrations.map((reg) => (
              <div key={reg.fullName} className="flex items-center justify-between text-sm">
                <span className="font-mono">{reg.fullName}</span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(reg.registeredAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

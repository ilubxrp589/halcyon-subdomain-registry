"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { browseTlds, type BrowseTld } from "@/services/tldBrowse";
import { OfficialBadge } from "@/components/common/OfficialBadge";
import { ArrowRight } from "lucide-react";

export function FeaturedTlds() {
  const [tlds, setTlds] = useState<BrowseTld[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    browseTlds("official", "popular", undefined, 1, 8)
      .then((data) => setTlds(data.tlds))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (tlds.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <OfficialBadge isOfficial size="sm" />
          Official Collection
        </h3>
        <Link
          href="/explore?filter=official"
          className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tlds.map((tld) => (
          <Link
            key={tld.label}
            href={`/register-v2?tld=${tld.label}`}
            className="group relative p-4 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 hover:bg-white/[0.07] transition-all"
          >
            <div className="text-lg font-bold mb-1">.{tld.label}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {tld.sldCount} domain{tld.sldCount !== 1 ? "s" : ""}
            </div>
            <div className="text-sm text-amber-400">
              From ${((tld.startingPriceUsdCents ?? 200) / 100).toFixed(0)}/yr
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { OfficialBadge } from "@/components/common/OfficialBadge";
import { truncateAddress } from "@/lib/utils";
import { Users } from "lucide-react";
import type { BrowseTld } from "@/services/tldBrowse";

interface TldCardProps {
  tld: BrowseTld;
}

export function TldCard({ tld }: TldCardProps) {
  const priceDisplay = tld.startingPriceUsdCents
    ? `$${(tld.startingPriceUsdCents / 100).toFixed(2)}`
    : "Free";

  return (
    <Link href={`/tld/${tld.label}`}>
      <Card className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm hover:border-amber-500/30 hover:bg-card/70 transition-all duration-300 cursor-pointer">
        {/* Hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />

        <CardContent className="p-5">
          {/* Header: TLD name + badge */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                {tld.displayName || `.${tld.label}`}
              </h3>
              {tld.displayName && (
                <span className="text-xs text-muted-foreground font-mono">.{tld.label}</span>
              )}
            </div>
            <OfficialBadge isOfficial={tld.isOfficial} />
          </div>

          {/* Owner */}
          <p className="text-xs text-muted-foreground mb-4">
            {tld.isOfficial ? "by Halcyon" : `by ${truncateAddress(tld.owner)}`}
          </p>

          {/* Stats row */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{tld.sldCount} {tld.sldCount === 1 ? "domain" : "domains"}</span>
            </div>
            <div className="text-amber-400 font-medium">
              from {priceDisplay}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

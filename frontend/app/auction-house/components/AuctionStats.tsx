"use client";

import type { AuctionStats as AuctionStatsType } from "@/services/auctionHouseApi";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, TrendingUp, BarChart3, ShoppingBag, CheckCircle } from "lucide-react";

export default function AuctionStats({
  stats,
  loading,
}: {
  stats: AuctionStatsType | null;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-halcyon h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  const items = [
    { label: "Active", value: stats.activeCount.toLocaleString(), icon: Activity, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Opened 24h", value: stats.opens24h.toLocaleString(), icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Total Bids", value: stats.totalBids.toLocaleString(), icon: BarChart3, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Closed", value: stats.closedCount.toLocaleString(), icon: CheckCircle, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "For Sale", value: stats.listingCount.toLocaleString(), icon: ShoppingBag, color: "text-pink-400", bg: "bg-pink-400/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="stat-card flex items-center gap-3 px-3 py-3"
        >
          <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
            <item.icon className={`w-4 h-4 ${item.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums text-foreground">{item.value}</p>
            <p className="text-xs text-muted-foreground/70">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

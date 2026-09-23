"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuctionHouse } from "@/hooks/useAuctionHouse";
import {
  checkNameAvailability,
  type NameAvailability,
} from "@/services/auctionHouseApi";
import AuctionCard from "./AuctionCard";
import AuctionStats from "./AuctionStats";
import AuctionFilters from "./AuctionFilters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gavel,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Search,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

export default function DiscoverTab({
  auctions,
  pagination,
  stats,
  trending,
  loading,
  error,
  filters,
  setFilters,
}: {
  auctions: ReturnType<typeof useAuctionHouse>["auctions"];
  pagination: ReturnType<typeof useAuctionHouse>["pagination"];
  stats: ReturnType<typeof useAuctionHouse>["stats"];
  trending: ReturnType<typeof useAuctionHouse>["trending"];
  loading: boolean;
  error: string | null;
  filters: ReturnType<typeof useAuctionHouse>["filters"];
  setFilters: ReturnType<typeof useAuctionHouse>["setFilters"];
}) {
  const [avail, setAvail] = useState<NameAvailability | null>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);

  const handleCheckAvailability = async () => {
    const q = filters.q?.trim();
    if (!q) return;
    setCheckingAvail(true);
    try {
      const result = await checkNameAvailability(q);
      setAvail(result);
    } catch {
      toast.error("Failed to check availability");
    } finally {
      setCheckingAvail(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <AuctionStats stats={stats} loading={loading && !stats} />

      {/* Filters */}
      <AuctionFilters filters={filters} onChange={setFilters} />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* Auction List */}
      {loading && auctions.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-14 rounded-xl" />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="glass-card text-center py-16 px-6">
          <Gavel className="w-12 h-12 mx-auto mb-3 text-halcyon-teal/40" />
          <p className="text-lg font-semibold text-foreground">No auctions found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try adjusting your filters or search query
          </p>
          {filters.q?.trim() && (
            <div className="mt-4">
              {!avail ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckAvailability}
                  disabled={checkingAvail}
                >
                  {checkingAvail ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Checking...</>
                  ) : (
                    <><Search className="w-4 h-4 mr-1" /> Check if &quot;{filters.q.trim()}&quot; is available</>
                  )}
                </Button>
              ) : (
                <div className="inline-block rounded-xl border border-halcyon-teal/20 bg-background/40 backdrop-blur-sm p-4 text-left max-w-sm mx-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono font-bold text-sm">{avail.name}/</span>
                    <Badge
                      variant={avail.status === "available" ? "success" : avail.status === "auction" ? "warning" : "secondary"}
                    >
                      {avail.status === "available" ? "Available" : avail.status === "auction" ? "In Auction" : "Registered"}
                    </Badge>
                  </div>
                  {avail.status === "available" && (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">This name has no owner. You can open an auction to claim it.</p>
                      <Link href={`/auction-house/${encodeURIComponent(avail.name)}`}>
                        <Button size="sm" className="btn-halcyon rounded-lg text-xs font-semibold">
                          <Gavel className="w-3 h-3 mr-1" /> Open Auction <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </>
                  )}
                  {avail.status === "auction" && (
                    <Link href={`/auction-house/${encodeURIComponent(avail.name)}`}>
                      <Button size="sm" variant="outline" className="mt-2 text-xs">
                        View Auction <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {avail.status === "registered" && (
                    <Link href={`/auction-house/${encodeURIComponent(avail.name)}`}>
                      <Button size="sm" variant="outline" className="mt-2 text-xs">
                        {avail.listing ? "View Listing" : "View Name"} <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 ml-2 text-[10px] text-muted-foreground"
                    onClick={() => setAvail(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2 auction-grid-enter">
            {auctions.map((auction) => (
              <AuctionCard key={auction.name} auction={auction} variant="list" />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setFilters({ page: pagination.page - 1 })}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
                <span className="hidden sm:inline"> ({pagination.total} names)</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters({ page: pagination.page + 1 })}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Trending Section */}
      {trending.length > 0 && (
        <div className="pt-4 border-t border-halcyon-teal/10">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Flame className="w-4 h-4 text-orange-400" />
            Trending Names
          </h2>
          <div className="flex flex-wrap gap-2">
            {trending.slice(0, 20).map((t) => (
              <Link
                key={t.name}
                href={`/auction-house/${encodeURIComponent(t.name)}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-background/40 backdrop-blur-sm border border-halcyon-teal/15 hover:bg-halcyon-teal/15 hover:border-halcyon-teal/30 hover:shadow-md transition-all"
              >
                {t.name}/
                {t.bidCount > 0 && (
                  <span className="text-muted-foreground ml-0.5">
                    {t.bidCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Expiring section moved to its own tab */}
    </div>
  );
}

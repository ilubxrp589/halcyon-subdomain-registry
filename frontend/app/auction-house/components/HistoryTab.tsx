"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  getActivityHistory,
  type HistoryEntry,
  type Pagination as PaginationType,
} from "@/services/auctionHouseApi";
import { decodePunycode, displayName } from "@/lib/punycode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Wallet,
} from "lucide-react";

export default function HistoryTab() {
  const { isConnected, address } = useWeb3ModalAccount();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getActivityHistory({
          address,
          page,
          limit: 30,
          type: typeFilter || undefined,
        });
        if (!cancelled) {
          setHistory(res.history);
          setPagination(res.pagination);
        }
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isConnected, address, page, typeFilter]);

  if (!isConnected) {
    return (
      <div className="glass-card text-center py-16 px-6">
        <Wallet className="w-12 h-12 mx-auto mb-3 text-halcyon-teal/40" />
        <h2 className="text-lg font-semibold mb-1">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground">Connect to view your transaction history</p>
      </div>
    );
  }

  const EVENT_LABELS: Record<string, string> = {
    bid: "Bid Placed",
    listed: "Listed",
    sold: "Sold",
    cancelled: "Delisted",
    price_changed: "Price Changed",
  };

  const EVENT_COLORS: Record<string, string> = {
    bid: "text-amber-400",
    listed: "text-blue-400",
    sold: "text-green-400",
    cancelled: "text-red-400",
    price_changed: "text-purple-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your bids, listings, and marketplace activity</p>
        <div className="flex gap-2">
          {["", "bid", "listing", "sale"].map((t) => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                typeFilter === t
                  ? "bg-halcyon-teal/15 border-halcyon-teal/30 text-halcyon-teal"
                  : "border-halcyon-teal/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "" ? "All" : t === "bid" ? "Bids" : t === "listing" ? "Listings" : "Sales"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-12 rounded-xl" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card text-center py-16 px-6">
          <Clock className="w-12 h-12 mx-auto mb-3 text-halcyon-teal/40" />
          <p className="text-lg font-semibold">No history yet</p>
          <p className="text-sm text-muted-foreground mt-1">Your auction and marketplace activity will appear here</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {history.map((entry, i) => (
              <div
                key={`${entry.eventType}-${entry.name}-${i}`}
                className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="secondary" className="text-[10px] w-20 justify-center shrink-0">
                    <span className={EVENT_COLORS[entry.eventType] || "text-muted-foreground"}>
                      {EVENT_LABELS[entry.eventType] || entry.eventType}
                    </span>
                  </Badge>
                  <Link
                    href={`/auction-house/${encodeURIComponent(entry.name)}`}
                    className="font-mono text-sm font-medium hover:text-amber-400 truncate"
                  >
                    {displayName(entry.name)}/
                    {decodePunycode(entry.name) && (
                      <span className="text-[9px] text-muted-foreground/50 ml-1">{entry.name}</span>
                    )}
                  </Link>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {entry.amountHns > 0 && (
                    <span className="text-amber-400 font-semibold">{entry.amountHns.toLocaleString()} HNS</span>
                  )}
                  <span className="text-muted-foreground w-20 text-right">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

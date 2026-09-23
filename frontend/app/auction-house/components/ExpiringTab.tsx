"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  getExpiringDomains,
  type ExpiringDomain,
  type ExpiringDomainsParams,
  type ExpiringStats,
  type ExpiryStatus,
  type ExpirySort,
  type Pagination as PaginationType,
} from "@/services/auctionHouseApi";
import { decodePunycode, displayName } from "@/lib/punycode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Gavel,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Eye,
  AlertTriangle,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";

export default function ExpiringTab() {
  const [domains, setDomains] = useState<ExpiringDomain[]>([]);
  const [stats, setStats] = useState<ExpiringStats | null>(null);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpiryStatus>("all");
  const [sortBy, setSortBy] = useState<ExpirySort>("days-left");
  const [page, setPage] = useState(1);
  const { isConnected } = useWeb3ModalAccount();
  const { getAuthCredentials } = useAuth();
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchExpiring = useCallback(async (p = page) => {
    if (!initialLoad) setRefreshing(true);
    try {
      const params: ExpiringDomainsParams = {
        page: p,
        limit: 20,
        sort: sortBy,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (search.trim()) params.q = search.trim();

      const res = await getExpiringDomains(params);
      setDomains(res.names);
      setStats(res.stats);
      setPagination(res.pagination);
    } catch {
      toast.error("Failed to load expiring names");
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, [page, sortBy, statusFilter, search, initialLoad]);

  useEffect(() => {
    fetchExpiring(1);
    setPage(1);
  }, [sortBy, statusFilter]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchExpiring(1);
    }, 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  useEffect(() => {
    if (page > 1) fetchExpiring(page);
  }, [page]);

  const handleOpenAuction = async (name: string) => {
    if (!isConnected) {
      toast.error("Connect your wallet first");
      return;
    }
    try {
      const creds = await getAuthCredentials();
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2/hns-wallet/auction/open`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...creds, name }),
        }
      );
      const data = await resp.json();
      if (data.success) {
        toast.success(`Auction opened for ${name}/ — tx: ${data.txHash?.slice(0, 12)}...`);
        fetchExpiring(page);
      } else {
        toast.error(data.error || "Failed to open auction");
      }
    } catch {
      toast.error("Failed to open auction");
    }
  };

  const statusBadge = (d: ExpiringDomain) => {
    if (d.reAuction) {
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
          Re-Auction ({d.reAuction.state})
        </Badge>
      );
    }
    switch (d.status) {
      case "expired":
        return (
          <Badge variant="destructive" className="text-[10px]">
            Expired
          </Badge>
        );
      case "grace":
        return (
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">
            Grace ({d.graceDaysLeft}d)
          </Badge>
        );
      case "expiring":
        return (
          <Badge
            variant={d.daysLeft < 30 ? "destructive" : d.daysLeft < 90 ? "warning" : "secondary"}
            className="text-[10px]"
          >
            {d.daysLeft}d left
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl bg-background/30 backdrop-blur-sm border border-halcyon-teal/10 px-4 py-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.expired}</div>
            <div className="text-xs text-muted-foreground">Expired</div>
          </div>
          <div className="rounded-xl bg-orange-500/5 border border-orange-500/20 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{stats.grace}</div>
            <div className="text-xs text-muted-foreground">Grace Period</div>
          </div>
          <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.expiring}</div>
            <div className="text-xs text-muted-foreground">Expiring</div>
          </div>
          <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.withReAuction}</div>
            <div className="text-xs text-muted-foreground">Re-Auctioning</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/40 border-halcyon-teal/10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ExpiryStatus)}>
          <SelectTrigger className="w-[160px] bg-background/40 border-halcyon-teal/10">
            <span className="truncate">
              {{ all: "All Statuses", expired: "Expired", grace: "Grace Period", expiring: "Expiring Soon" }[statusFilter]}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="grace">Grace Period</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as ExpirySort)}>
          <SelectTrigger className="w-[160px] bg-background/40 border-halcyon-teal/10">
            <span className="truncate">
              {{ "days-left": "Urgency (soonest)", "days-left-desc": "Most time left", value: "Highest value", length: "Shortest name", "name-asc": "Name A-Z", "name-desc": "Name Z-A" }[sortBy]}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days-left">Urgency (soonest)</SelectItem>
            <SelectItem value="days-left-desc">Most time left</SelectItem>
            <SelectItem value="value">Highest value</SelectItem>
            <SelectItem value="length">Shortest name</SelectItem>
            <SelectItem value="name-asc">Name A-Z</SelectItem>
            <SelectItem value="name-desc">Name Z-A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {initialLoad ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-16 rounded-xl" />
          ))}
        </div>
      ) : domains.length === 0 && !refreshing ? (
        <div className="text-center py-16">
          <Hourglass className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {search ? "No expiring names match your search." : "No names expiring within the next year."}
          </p>
        </div>
      ) : (
        <div className={`space-y-2 transition-opacity duration-150 ${refreshing ? "opacity-60" : ""}`}>
          {domains.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between rounded-xl bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-4 py-3 hover:bg-halcyon-teal/5 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Link
                  href={`/auction-house/${encodeURIComponent(d.name)}`}
                  className="font-mono text-sm font-semibold hover:text-halcyon-teal transition-colors truncate"
                >
                  {displayName(d.name)}/
                  {decodePunycode(d.name) && (
                    <span className="text-[9px] text-muted-foreground/50 ml-1">{d.name}</span>
                  )}
                </Link>
                {statusBadge(d)}
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Value */}
                {d.value > 0 && (
                  <span className="text-xs text-amber-400 hidden sm:block">
                    {d.value.toLocaleString()} HNS
                  </span>
                )}

                {/* Name length */}
                <span className="text-xs text-muted-foreground hidden md:block">
                  {d.name.length} chars
                </span>

                {/* Owner (truncated) */}
                {d.owner && (
                  <span className="text-[10px] text-muted-foreground font-mono hidden lg:block">
                    {d.owner.slice(0, 8)}...
                  </span>
                )}

                {/* Action button */}
                {d.status === "expired" && !d.reAuction && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-halcyon-teal/30 hover:bg-halcyon-teal/10 text-xs h-7"
                    onClick={() => handleOpenAuction(d.name)}
                  >
                    <Gavel className="w-3 h-3 mr-1" />
                    Open Auction
                  </Button>
                )}
                {d.reAuction && (
                  <Link href={`/auction-house/${encodeURIComponent(d.name)}`}>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-halcyon-teal to-halcyon-green text-white text-xs h-7"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Auction
                    </Button>
                  </Link>
                )}
                {d.status === "expiring" && !d.reAuction && (
                  <Link href={`/auction-house/${encodeURIComponent(d.name)}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Details
                    </Button>
                  </Link>
                )}
                {d.status === "grace" && !d.reAuction && (
                  <Link href={`/auction-house/${encodeURIComponent(d.name)}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-orange-400"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Grace Period
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-muted-foreground">
            Showing {((page - 1) * 20) + 1}-{Math.min(page * 20, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { TldCard } from "./TldCard";
import { TldFilters } from "./TldFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { browseTlds, type BrowseTld, type BrowseFilter, type BrowseSort } from "@/services/tldBrowse";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TldGrid() {
  const [tlds, setTlds] = useState<BrowseTld[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const [sort, setSort] = useState<BrowseSort>("popular");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 24;

  const fetchTlds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await browseTlds(filter, sort, search || undefined, page, limit);
      setTlds(data.tlds);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load TLDs");
    } finally {
      setLoading(false);
    }
  }, [filter, sort, search, page]);

  useEffect(() => {
    fetchTlds();
  }, [fetchTlds]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filter, sort, search]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <TldFilters
        filter={filter}
        sort={sort}
        search={search}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onSearchChange={setSearch}
      />

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "TLD" : "TLDs"} found
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={fetchTlds}>
            Try Again
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-5 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-20" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TLD cards grid */}
      {!loading && !error && tlds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tlds.map((tld) => (
            <TldCard key={tld.tokenId} tld={tld} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tlds.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg mb-2">No TLDs found</p>
          <p className="text-muted-foreground text-sm">
            {search ? "Try a different search term" : "No TLDs match the selected filters"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

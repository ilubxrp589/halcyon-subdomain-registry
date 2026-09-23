"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SearchX,
  ShoppingCart,
  Filter,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  searchTerm?: string;
  filterBy?: string;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
}

export function EmptyState({
  searchTerm,
  filterBy,
  onClearSearch,
  onClearFilters,
  onRefresh,
}: EmptyStateProps) {
  const hasFilters = filterBy && filterBy !== "all";
  const hasSearch = searchTerm && searchTerm.trim().length > 0;
  const hasAnyFilters = hasFilters || hasSearch;

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-4">
      {/* Icon Container */}
      <div
        className={cn(
          "w-24 h-24 rounded-full flex items-center justify-center mb-6",
          "bg-gradient-to-br from-white/5 to-white/10",
          "border border-white/10"
        )}
      >
        {hasSearch ? (
          <SearchX className="w-12 h-12 text-slate-500" />
        ) : hasFilters ? (
          <Filter className="w-12 h-12 text-slate-500" />
        ) : (
          <ShoppingCart className="w-12 h-12 text-slate-500" />
        )}
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-white mb-2 text-center">
        {hasSearch
          ? "No domains found"
          : hasFilters
          ? "No matching listings"
          : "No listings available"}
      </h3>

      {/* Description */}
      <p className="text-slate-400 text-center max-w-md mb-6">
        {hasSearch ? (
          <>
            We couldn&apos;t find any domains matching &quot;
            <span className="text-amber-400 font-medium">{searchTerm}</span>
            &quot;. Try adjusting your search or browse all listings.
          </>
        ) : hasFilters ? (
          <>
            No {filterBy === "auction" ? "auctions" : "fixed price listings"}{" "}
            are currently available. Try changing your filter or check back later.
          </>
        ) : (
          <>
            The marketplace is waiting for its first listing! Be the first to
            list your domain and start trading.
          </>
        )}
      </p>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {hasSearch && onClearSearch && (
          <Button
            variant="outline"
            onClick={onClearSearch}
            className="border-white/10 hover:bg-white/10"
          >
            <SearchX className="w-4 h-4 mr-2" />
            Clear Search
          </Button>
        )}

        {hasFilters && onClearFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            className="border-white/10 hover:bg-white/10"
          >
            <Filter className="w-4 h-4 mr-2" />
            Clear Filters
          </Button>
        )}

        {hasAnyFilters && onRefresh && (
          <Button
            variant="outline"
            onClick={() => {
              onClearSearch?.();
              onClearFilters?.();
            }}
            className="border-white/10 hover:bg-white/10"
          >
            View All Listings
          </Button>
        )}

        {!hasAnyFilters && (
          <>
            {onRefresh && (
              <Button
                variant="outline"
                onClick={onRefresh}
                className="border-white/10 hover:bg-white/10"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            )}
            <Link href="/dashboard">
              <Button className="bg-amber-600 hover:bg-amber-700">
                List Your Domain
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Suggestions */}
      {hasSearch && (
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500 mb-3">Suggestions:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Short names", "Numbers", "Popular TLDs"].map((suggestion) => (
              <button
                key={suggestion}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm",
                  "bg-white/5 border border-white/10",
                  "text-slate-400 hover:text-white hover:bg-white/10",
                  "transition-colors"
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

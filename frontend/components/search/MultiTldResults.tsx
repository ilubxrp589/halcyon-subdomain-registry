"use client";

import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { OfficialBadge } from "@/components/common/OfficialBadge";
import { PriceDisplay } from "@/components/PriceDisplay";
import type { MultiSearchResult } from "@/services/tldBrowse";

interface MultiTldResultsProps {
  query: string;
  results: MultiSearchResult[];
  isSearching: boolean;
  onSelectResult: (result: MultiSearchResult) => void;
  filter: "all" | "official" | "community";
  onFilterChange: (filter: "all" | "official" | "community") => void;
}

const FILTER_OPTIONS = [
  { value: "all" as const, label: "All TLDs" },
  { value: "official" as const, label: "Official" },
  { value: "community" as const, label: "Community" },
];

export function MultiTldResults({
  query,
  results,
  isSearching,
  onSelectResult,
  filter,
  onFilterChange,
}: MultiTldResultsProps) {
  const availableCount = results.filter((r) => r.available).length;

  if (isSearching) {
    return (
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Searching across all TLDs...</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-white/10 animate-fadeInUp">
      {/* Header with count and filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{query}</span>
          {" "}available on{" "}
          <span className="text-green-400 font-medium">{availableCount}</span>
          {" "}of {results.length} TLDs
        </div>

        {/* Filter pills */}
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFilterChange(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                filter === opt.value
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results list */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {results.map((r) => (
          <div
            key={r.fullName}
            onClick={() => r.available && onSelectResult(r)}
            className={`flex items-center justify-between gap-2 p-3 rounded-xl transition-all ${
              r.available
                ? "hover:bg-white/5 cursor-pointer"
                : "opacity-50 cursor-default"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {r.available ? (
                <div className="p-1.5 rounded-full bg-green-500/20 shrink-0">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                </div>
              ) : (
                <div className="p-1.5 rounded-full bg-red-500/20 shrink-0">
                  <XCircle className="h-4 w-4 text-red-400" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white truncate text-sm">
                    {r.fullName}
                  </span>
                  <OfficialBadge isOfficial={r.isOfficial} size="xs" />
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.available ? (
                    <span className="text-green-400">Available</span>
                  ) : (
                    <span className="text-red-400">
                      Taken{r.currentOwner ? ` by ${r.currentOwner.slice(0, 8)}...` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {r.available && r.priceUsdCents != null && r.priceUsdCents > 0 && (
                <div className="text-right">
                  <PriceDisplay usdCents={r.priceUsdCents} compact />
                </div>
              )}
              {r.available && (
                <button className="px-3 py-1.5 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all">
                  Register
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

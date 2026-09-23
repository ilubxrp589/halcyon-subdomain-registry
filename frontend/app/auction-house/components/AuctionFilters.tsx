"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import type { AuctionFilters as AuctionFiltersType } from "@/hooks/useAuctionHouse";

const STATE_PILLS = [
  { value: "BIDDING", label: "Bidding" },
  { value: "ENDING", label: "Ending Soon" },
  { value: "OPENING", label: "Opening" },
  { value: "REVEAL", label: "Reveal" },
];

const SORT_OPTIONS = [
  { value: "ending-soon", label: "Ending Soon" },
  { value: "most-bids", label: "Most Bids" },
  { value: "highest-value", label: "Highest Value" },
  { value: "newest", label: "Newest" },
];

const LENGTH_PRESETS = [
  { label: "Any", min: undefined, max: undefined },
  { label: "1-3", min: 1, max: 3 },
  { label: "4-6", min: 4, max: 6 },
  { label: "7-12", min: 7, max: 12 },
  { label: "13+", min: 13, max: undefined },
];

export default function AuctionFilters({
  filters,
  onChange,
}: {
  filters: AuctionFiltersType;
  onChange: (f: Partial<AuctionFiltersType>) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.q || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== (filters.q || "")) {
        onChange({ q: searchInput || undefined });
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const hasAdvancedFilters = !!(filters.minLength || filters.maxLength || filters.minBid || filters.maxBid);

  const clearAdvanced = () => {
    onChange({ minLength: undefined, maxLength: undefined, minBid: undefined, maxBid: undefined });
  };

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search any Handshake name..."
          className="pl-9 pr-9 h-12 rounded-xl bg-background/50 backdrop-blur-sm border-halcyon-teal/20 focus:shadow-[0_0_0_2px_hsl(var(--halcyon-teal)/0.3)] transition-shadow"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* State pills + filters + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-background/40 backdrop-blur-sm border border-halcyon-teal/10 rounded-xl p-1">
          {STATE_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => onChange({ state: pill.value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.state === pill.value
                  ? "bg-gradient-to-r from-halcyon-teal to-halcyon-green text-white shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Contested toggle */}
        <button
          onClick={() => onChange({ contested: filters.contested === 'false' ? undefined : 'false' })}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            filters.contested === 'false'
              ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
              : "border-halcyon-teal/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          {filters.contested === 'false' ? 'All Names' : 'With Bids'}
        </button>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            hasAdvancedFilters
              ? "bg-halcyon-teal/15 border-halcyon-teal/30 text-halcyon-teal"
              : "border-halcyon-teal/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
          {hasAdvancedFilters && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-halcyon-teal" />}
          <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        <div className="ml-auto w-40">
          <Select
            value={filters.sort || "ending-soon"}
            onValueChange={(v) => onChange({ sort: v })}
          >
            <SelectTrigger className="h-9 text-xs rounded-lg bg-background/50 border-halcyon-teal/15">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="rounded-xl border border-halcyon-teal/15 bg-background/40 backdrop-blur-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Advanced Filters</span>
            {hasAdvancedFilters && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={clearAdvanced}>
                Clear All
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name Length */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Name Length</span>
              <div className="flex gap-1">
                {LENGTH_PRESETS.map((preset) => {
                  const active = filters.minLength === preset.min && filters.maxLength === preset.max;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => onChange({ minLength: preset.min, maxLength: preset.max })}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                        active
                          ? "bg-halcyon-teal/15 border-halcyon-teal/30 text-halcyon-teal"
                          : "border-halcyon-teal/8 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bid Value Range */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Bid Value (HNS)</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={filters.minBid || ""}
                  onChange={(e) => onChange({ minBid: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="h-8 text-xs rounded-lg bg-background/50 border-halcyon-teal/15"
                />
                <span className="text-xs text-muted-foreground">-</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={filters.maxBid || ""}
                  onChange={(e) => onChange({ maxBid: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="h-8 text-xs rounded-lg bg-background/50 border-halcyon-teal/15"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

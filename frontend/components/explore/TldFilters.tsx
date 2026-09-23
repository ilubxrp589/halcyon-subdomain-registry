"use client";

import { Input } from "@/components/ui/input";
import { Search, Star, Globe, Layers } from "lucide-react";
import type { BrowseFilter, BrowseSort } from "@/services/tldBrowse";

interface TldFiltersProps {
  filter: BrowseFilter;
  sort: BrowseSort;
  search: string;
  onFilterChange: (filter: BrowseFilter) => void;
  onSortChange: (sort: BrowseSort) => void;
  onSearchChange: (search: string) => void;
}

const FILTER_OPTIONS: { value: BrowseFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All TLDs", icon: Layers },
  { value: "official", label: "Official", icon: Star },
  { value: "community", label: "Community", icon: Globe },
];

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "cheapest", label: "Cheapest" },
  { value: "most-slds", label: "Most Domains" },
];

export function TldFilters({
  filter,
  sort,
  search,
  onFilterChange,
  onSortChange,
  onSearchChange,
}: TldFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search TLDs..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-muted/30 border-border/40 focus:border-amber-500/50"
        />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Filter pills */}
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onFilterChange(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all duration-200 ${
                filter === value
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-muted/30 text-muted-foreground border border-border/40 hover:border-border hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as BrowseSort)}
          className="px-3 py-1.5 rounded-lg text-sm bg-muted/30 border border-border/40 text-foreground focus:border-amber-500/50 focus:outline-none cursor-pointer"
        >
          {SORT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              Sort: {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TLD } from "@/services/api";

export interface SearchFilterValues {
  minPrice?: number;
  maxPrice?: number;
  minLen?: number;
  maxLen?: number;
  tlds: string[];
}

interface SearchFiltersProps {
  availableTLDs: TLD[];
  selectedTLD: string;
  filters: SearchFilterValues;
  onChange: (filters: SearchFilterValues) => void;
}

export function SearchFilters({
  availableTLDs,
  selectedTLD,
  filters,
  onChange,
}: SearchFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (partial: Partial<SearchFilterValues>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Filters
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-xl space-y-3 animate-fadeInUp">
          {/* Price Range */}
          <div>
            <label className="text-xs text-white/60 block mb-1">Price (USD)</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice ?? ""}
                onChange={(e) => update({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
                className="w-20 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50"
              />
              <span className="text-white/30 text-xs self-center">–</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice ?? ""}
                onChange={(e) => update({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                className="w-20 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50"
              />
            </div>
          </div>

          {/* Character Length */}
          <div>
            <label className="text-xs text-white/60 block mb-1">Length (characters)</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                min={1}
                max={63}
                value={filters.minLen ?? ""}
                onChange={(e) => update({ minLen: e.target.value ? Number(e.target.value) : undefined })}
                className="w-20 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50"
              />
              <span className="text-white/30 text-xs self-center">–</span>
              <input
                type="number"
                placeholder="Max"
                min={1}
                max={63}
                value={filters.maxLen ?? ""}
                onChange={(e) => update({ maxLen: e.target.value ? Number(e.target.value) : undefined })}
                className="w-20 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50"
              />
            </div>
          </div>

          {/* TLD multi-select */}
          {availableTLDs.length > 1 && (
            <div>
              <label className="text-xs text-white/60 block mb-1">TLDs</label>
              <div className="flex flex-wrap gap-1.5">
                {availableTLDs.map((t) => {
                  const active = filters.tlds.includes(t.name) || (filters.tlds.length === 0 && t.name === selectedTLD);
                  return (
                    <button
                      key={t.name}
                      onClick={() => {
                        const current = filters.tlds.length > 0 ? filters.tlds : [selectedTLD];
                        const next = active
                          ? current.filter((n) => n !== t.name)
                          : [...current, t.name];
                        update({ tlds: next.length === 0 ? [selectedTLD] : next });
                      }}
                      className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                        active
                          ? "bg-[hsl(var(--halcyon-teal))]/20 border-[hsl(var(--halcyon-teal))]/50 text-white"
                          : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                      }`}
                    >
                      .{t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchFilters;

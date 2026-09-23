"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HnsDomainCard } from "./HnsDomainCard";
import { HnsDomainModal } from "./HnsDomainModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  getIndexedDomains,
  searchIndexedDomains,
  type IndexedDomain,
  type IndexerPagination,
  type Classification,
  type IndexerSort,
} from "@/services/indexer";

interface HnsDomainGridProps {
  onDomainClick?: (domain: IndexedDomain) => void;
}

const CLASSIFICATIONS: { label: string; value: Classification | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Real Sites", value: "real" },
  { label: "Parking", value: "parking" },
  { label: "Empty", value: "empty" },
  { label: "Error", value: "error" },
];

const SORTS: { label: string; value: IndexerSort }[] = [
  { label: "Name", value: "name" },
  { label: "Newest", value: "newest" },
  { label: "Recently Checked", value: "checked" },
  { label: "Fastest", value: "response_time" },
];

export function HnsDomainGrid({ onDomainClick }: HnsDomainGridProps) {
  const [domains, setDomains] = useState<IndexedDomain[]>([]);
  const [pagination, setPagination] = useState<IndexerPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [classification, setClassification] = useState<Classification | "all">("real");
  const [sort, setSort] = useState<IndexerSort>("name");
  const [page, setPage] = useState(1);
  const [letter, setLetter] = useState("");

  const [selectedDomain, setSelectedDomain] = useState<IndexedDomain | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (debouncedQuery) {
        // Full-text search mode
        const data = await searchIndexedDomains(debouncedQuery, {
          page,
          limit: 24,
          classification: classification === "all" ? undefined : classification,
        });
        setDomains(data.data);
        setPagination(data.pagination);
      } else {
        // Browse mode
        const data = await getIndexedDomains({
          page,
          limit: 24,
          classification: classification === "all" ? undefined : classification,
          sort,
          letter: letter || undefined,
        });
        setDomains(data.data);
        setPagination(data.pagination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, [page, classification, sort, letter, debouncedQuery]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [classification, sort, letter, debouncedQuery]);

  const clearSearch = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    searchInputRef.current?.focus();
  };

  const handleDomainClick = (domain: IndexedDomain) => {
    if (onDomainClick) {
      onDomainClick(domain);
    } else {
      setSelectedDomain(domain);
      setModalOpen(true);
    }
  };

  const letters = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const isSearchMode = debouncedQuery.length > 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder='Search domains, titles, descriptions... (press "/" to focus)'
          className="pl-9 pr-9 bg-muted/20 border-border/40"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Result count when searching */}
      {isSearchMode && pagination && !loading && (
        <p className="text-sm text-muted-foreground">
          {pagination.total.toLocaleString()} result{pagination.total !== 1 ? "s" : ""} for &ldquo;{debouncedQuery}&rdquo;
        </p>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Classification filter */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
          {CLASSIFICATIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => setClassification(c.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                classification === c.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Sort — only in browse mode */}
        {!isSearchMode && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as IndexerSort)}
            className="text-xs bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-muted-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* A-Z letter nav — only in browse mode */}
      {!isSearchMode && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setLetter("")}
            className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
              letter === "" ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            All
          </button>
          {letters.map((l) => (
            <button
              key={l}
              onClick={() => setLetter(l)}
              className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                letter === l ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={fetchDomains}>Try Again</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      )}

      {/* Domain grid */}
      {!loading && !error && domains.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {domains.map((domain) => (
            <HnsDomainCard
              key={domain.id}
              domain={domain}
              onClick={() => handleDomainClick(domain)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && domains.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">No domains found</p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            {isSearchMode ? "Try different search terms" : "Try adjusting your filters"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages}
            <span className="text-muted-foreground/60 ml-2">({pagination.total.toLocaleString()} total)</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Domain detail modal */}
      <HnsDomainModal
        domain={selectedDomain}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

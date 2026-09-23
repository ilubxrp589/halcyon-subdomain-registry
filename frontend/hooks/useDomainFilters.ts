"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

export interface DomainFilterState {
  search: string;
  status: "all" | "active" | "pending" | "expired";
  dns: "all" | "active" | "pending";
  listing: "all" | "listed" | "not-listed";
  tld: string | null;
}

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "registered-newest"
  | "registered-oldest"
  | "expiring-soonest"
  | "expiring-latest"
  | "token-asc"
  | "token-desc";

export type ViewMode = "list" | "grid";

interface DomainForFiltering {
  id: number;
  fqdn: string;
  status: string;
  dns_active: boolean;
  isListed?: boolean;
  token_id: number;
  registered_at?: string;
  expires_at?: string;
}

const STORAGE_KEY = "hsr-domain-filters";

const defaultFilters: DomainFilterState = {
  search: "",
  status: "all",
  dns: "all",
  listing: "all",
  tld: null,
};

const defaultSortBy: SortOption = "name-asc";
const defaultViewMode: ViewMode = "list";

interface StoredPreferences {
  filters: DomainFilterState;
  sortBy: SortOption;
  viewMode: ViewMode;
}

function loadPreferences(): StoredPreferences {
  if (typeof window === "undefined") {
    return { filters: defaultFilters, sortBy: defaultSortBy, viewMode: defaultViewMode };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        filters: { ...defaultFilters, ...parsed.filters },
        sortBy: parsed.sortBy || defaultSortBy,
        viewMode: parsed.viewMode || defaultViewMode,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { filters: defaultFilters, sortBy: defaultSortBy, viewMode: defaultViewMode };
}

function savePreferences(prefs: StoredPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

export function useDomainFilters<T extends DomainForFiltering>(domains: T[]) {
  const [filters, setFilters] = useState<DomainFilterState>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortBy);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const prefs = loadPreferences();
    setFilters(prefs.filters);
    setSortBy(prefs.sortBy);
    setViewMode(prefs.viewMode);
    setIsInitialized(true);
  }, []);

  // Save preferences whenever they change
  useEffect(() => {
    if (isInitialized) {
      savePreferences({ filters, sortBy, viewMode });
    }
  }, [filters, sortBy, viewMode, isInitialized]);

  // Update a single filter
  const updateFilter = useCallback(
    <K extends keyof DomainFilterState>(key: K, value: DomainFilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Extract available TLDs from domains
  const availableTLDs = useMemo(() => {
    const tlds = new Set<string>();
    domains.forEach((d) => {
      const parts = d.fqdn.split(".");
      if (parts.length > 1) {
        tlds.add(parts.slice(1).join("."));
      }
    });
    return Array.from(tlds).sort();
  }, [domains]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.status !== "all" ||
      filters.dns !== "all" ||
      filters.listing !== "all" ||
      filters.tld !== null
    );
  }, [filters]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search !== "") count++;
    if (filters.status !== "all") count++;
    if (filters.dns !== "all") count++;
    if (filters.listing !== "all") count++;
    if (filters.tld !== null) count++;
    return count;
  }, [filters]);

  // Filter and sort domains
  const filteredDomains = useMemo(() => {
    let result = [...domains];

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter((d) => d.fqdn.toLowerCase().includes(searchLower));
    }

    // Apply status filter
    if (filters.status !== "all") {
      result = result.filter((d) => d.status === filters.status);
    }

    // Apply DNS filter
    if (filters.dns !== "all") {
      if (filters.dns === "active") {
        result = result.filter((d) => d.dns_active);
      } else {
        result = result.filter((d) => !d.dns_active);
      }
    }

    // Apply listing filter
    if (filters.listing !== "all") {
      if (filters.listing === "listed") {
        result = result.filter((d) => d.isListed);
      } else {
        result = result.filter((d) => !d.isListed);
      }
    }

    // Apply TLD filter
    if (filters.tld) {
      result = result.filter((d) => d.fqdn.endsWith(`.${filters.tld}`));
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.fqdn.localeCompare(b.fqdn);
        case "name-desc":
          return b.fqdn.localeCompare(a.fqdn);
        case "registered-newest":
          return (
            new Date(b.registered_at || 0).getTime() -
            new Date(a.registered_at || 0).getTime()
          );
        case "registered-oldest":
          return (
            new Date(a.registered_at || 0).getTime() -
            new Date(b.registered_at || 0).getTime()
          );
        case "expiring-soonest":
          return (
            new Date(a.expires_at || 0).getTime() -
            new Date(b.expires_at || 0).getTime()
          );
        case "expiring-latest":
          return (
            new Date(b.expires_at || 0).getTime() -
            new Date(a.expires_at || 0).getTime()
          );
        case "token-asc":
          return a.token_id - b.token_id;
        case "token-desc":
          return b.token_id - a.token_id;
        default:
          return 0;
      }
    });

    return result;
  }, [domains, filters, sortBy]);

  return {
    filters,
    updateFilter,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    filteredDomains,
    availableTLDs,
    hasActiveFilters,
    activeFilterCount,
    clearAllFilters,
  };
}

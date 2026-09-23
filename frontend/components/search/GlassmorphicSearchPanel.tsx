"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Search, Loader2, CheckCircle, XCircle, AlertCircle, Bell, BellOff, Bookmark, BookmarkCheck, X, ShoppingCart } from "lucide-react";
import { searchSubdomain, getSuggestions, watchDomain, unwatchDomain, checkAlerts, getMarketplaceListing, TLD, SearchSuggestion, AuthCredentials, MarketplaceListing } from "@/services/api";
import { cn } from "@/lib/utils";
import { SearchFilters, SearchFilterValues } from "./SearchFilters";
import { loadSavedSearches, saveSearch, deleteSavedSearch, SavedSearch } from "@/lib/savedSearches";

interface SearchResult {
  available: boolean;
  subdomain: string;
  tld: string;
  fqdn: string;
  tier?: string;
  priceUSD?: number;
  priceFLR?: number;
  owner?: string;
  error?: string;
}

interface GlassmorphicSearchPanelProps {
  availableTLDs: TLD[];
  currencySymbol: string;
  onRegisterClick: (result: SearchResult) => void;
  walletAddress?: string;
  getAuthCredentials?: () => Promise<AuthCredentials>;
}

export function GlassmorphicSearchPanel({
  availableTLDs,
  currencySymbol,
  onRegisterClick,
  walletAddress,
  getAuthCredentials,
}: GlassmorphicSearchPanelProps) {
  const [subdomain, setSubdomain] = useState("");
  const [tld, setTld] = useState(availableTLDs[0]?.name || "cryptofans");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");

  // Suggestions state
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Filters state
  const [filters, setFilters] = useState<SearchFilterValues>({
    tlds: [],
  });

  // Saved searches state
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Marketplace state
  const [marketplaceListing, setMarketplaceListing] = useState<MarketplaceListing | null>(null);

  // Watch state
  const [watching, setWatching] = useState(false);
  const [alertToast, setAlertToast] = useState<string | null>(null);

  // Load saved searches on mount
  useEffect(() => {
    setSavedSearches(loadSavedSearches());
  }, []);

  // Poll for alerts every 60s if wallet connected
  useEffect(() => {
    if (!walletAddress) return;
    const poll = async () => {
      try {
        const { available } = await checkAlerts(walletAddress);
        if (available.length > 0) {
          setAlertToast(`${available[0]} is now available!${available.length > 1 ? ` (+${available.length - 1} more)` : ""}`);
          setTimeout(() => setAlertToast(null), 8000);
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (subdomain.length < 2) {
      setSuggestions([]);
      setCorrections([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const data = await getSuggestions(subdomain, {
          tld,
          minLen: filters.minLen,
          maxLen: filters.maxLen,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
        });
        setSuggestions(data.suggestions);
        setCorrections(data.corrections);
        setShowSuggestions(true);
        setSelectedSuggIdx(-1);
      } catch { /* silent */ }
      setLoadingSuggestions(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subdomain, tld, filters.minLen, filters.maxLen, filters.minPrice, filters.maxPrice]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!subdomain.trim()) return;

    setIsSearching(true);
    setResult(null);
    setError("");
    setShowSuggestions(false);
    setMarketplaceListing(null);

    try {
      const data = await searchSubdomain(subdomain.trim().toLowerCase(), tld);
      const searchResult: SearchResult = {
        available: data.available,
        subdomain: data.subdomain,
        tld: data.tld,
        fqdn: data.fqdn,
        tier: data.tier,
        priceUSD: data.price?.usd,
        priceFLR: data.price?.flr,
        owner: data.owner,
        error: data.error,
      };
      setResult(searchResult);
      setWatching(false);

      // If taken, check marketplace in background
      if (!searchResult.available) {
        getMarketplaceListing(searchResult.fqdn).then((listing) => {
          setMarketplaceListing(listing);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [subdomain, tld]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggIdx((prev) => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === "Enter" && selectedSuggIdx >= 0) {
        e.preventDefault();
        const selected = suggestions[selectedSuggIdx];
        setSubdomain(selected.subdomain);
        setShowSuggestions(false);
        // Trigger search with selected
        setTimeout(() => handleSearch(), 0);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && subdomain.trim()) {
      handleSearch();
    }
  };

  const selectSuggestion = (s: SearchSuggestion) => {
    setSubdomain(s.subdomain);
    setShowSuggestions(false);
    setTimeout(() => handleSearch(), 0);
  };

  const handleSaveSearch = () => {
    if (!subdomain.trim()) return;
    const updated = saveSearch({
      query: subdomain.trim(),
      tld,
      filters: {
        minLen: filters.minLen,
        maxLen: filters.maxLen,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
      },
    });
    setSavedSearches(updated);
  };

  const handleRestoreSaved = (saved: SavedSearch) => {
    setSubdomain(saved.query);
    setTld(saved.tld);
    if (saved.filters) {
      setFilters((prev) => ({ ...prev, ...saved.filters }));
    }
    setShowSaved(false);
    setTimeout(() => handleSearch(), 0);
  };

  const handleWatch = async () => {
    if (!result || !getAuthCredentials || !walletAddress) return;
    try {
      const creds = await getAuthCredentials();
      await watchDomain(creds, result.fqdn);
      setWatching(true);
    } catch { /* silent */ }
  };

  const handleUnwatch = async () => {
    if (!result || !getAuthCredentials || !walletAddress) return;
    try {
      const creds = await getAuthCredentials();
      await unwatchDomain(creds, result.fqdn);
      setWatching(false);
    } catch { /* silent */ }
  };

  const isSearchSaved = savedSearches.some((s) => s.query === subdomain.trim() && s.tld === tld);

  // Auto-size TLD select to fit selected value
  const tldMeasureRef = useRef<HTMLSpanElement>(null);
  const [tldSelectWidth, setTldSelectWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (tldMeasureRef.current) {
      // Add padding (px-3 = 24px) + dropdown arrow space (~20px)
      setTldSelectWidth(tldMeasureRef.current.offsetWidth + 44);
    }
  }, [tld]);

  return (
    <div className="glassmorphic-panel w-full max-w-3xl mx-auto animate-fadeInUp">
      {/* Alert Toast */}
      {alertToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-amber-500/90 text-white rounded-xl shadow-lg animate-fadeInUp">
          <Bell className="h-4 w-4" />
          <span className="text-sm font-medium">{alertToast}</span>
          <button onClick={() => setAlertToast(null)} className="ml-2">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Glassmorphic container */}
      <div className="backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl shadow-2xl p-3 sm:p-5">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-halcyon-gradient mb-1">
            Halcyon Subdomain Registry
          </h1>
          <p className="text-muted-foreground text-sm">
            Secure your unique NFT domain identity
          </p>
        </div>

        {/* Search Form */}
        <div className="space-y-3">
          <div className="flex gap-2">
            {/* Subdomain Input + Suggestions */}
            <div className="flex-1 relative" ref={suggestionsRef}>
              <input
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="yourname"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50 focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/20 transition-all font-mono"
                disabled={isSearching}
              />

              {/* Suggestions Dropdown */}
              {showSuggestions && (suggestions.length > 0 || corrections.length > 0) && (
                <div className="absolute z-40 top-full mt-1 left-0 right-0 sm:right-auto sm:w-full min-w-[280px] backdrop-blur-xl bg-black/80 border border-white/10 rounded-xl shadow-2xl max-h-64 overflow-y-auto overflow-x-hidden">
                  {/* Corrections */}
                  {corrections.length > 0 && (
                    <div className="px-3 py-2.5 border-b border-white/5 text-xs text-white/50">
                      Did you mean:{" "}
                      {corrections.map((c, i) => (
                        <button
                          key={c}
                          onClick={() => { setSubdomain(c); setShowSuggestions(false); }}
                          className="text-[hsl(var(--halcyon-teal))] hover:underline"
                        >
                          {c}{i < corrections.length - 1 ? ", " : ""}
                        </button>
                      ))}
                      ?
                    </div>
                  )}

                  {/* Suggestion items */}
                  {suggestions.map((s, idx) => (
                    <button
                      key={s.fqdn}
                      onClick={() => selectSuggestion(s)}
                      className={cn(
                        "w-full px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm hover:bg-white/5 transition-colors gap-1 sm:gap-2",
                        idx === selectedSuggIdx && "bg-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-white truncate text-xs sm:text-sm">{s.fqdn}</span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                            s.available
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {s.available ? "Available" : "Taken"}
                        </span>
                      </div>
                      {s.available && s.priceUSD && (
                        <span className="text-xs text-white/50 shrink-0 pl-0 sm:pl-0">${s.priceUSD}</span>
                      )}
                    </button>
                  ))}

                  {loadingSuggestions && (
                    <div className="px-3 py-2 text-xs text-white/30 text-center">
                      <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                      Loading...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TLD Selector — auto-sizes to selected value */}
            <span ref={tldMeasureRef} className="absolute invisible whitespace-nowrap text-sm" aria-hidden="true">.{tld}</span>
            <select
              value={tld}
              onChange={(e) => setTld(e.target.value)}
              style={tldSelectWidth ? { width: tldSelectWidth } : undefined}
              className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50 transition-all cursor-pointer"
              disabled={isSearching}
            >
              {availableTLDs.map((t) => (
                <option key={t.name} value={t.name} className="bg-gray-900">
                  .{t.name}
                </option>
              ))}
            </select>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={!subdomain.trim() || isSearching}
              className="px-5 py-2.5 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isSearching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Saved Searches & Bookmark */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSearch}
              disabled={!subdomain.trim()}
              title={isSearchSaved ? "Search saved" : "Save this search"}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 disabled:opacity-30 transition-colors"
            >
              {isSearchSaved ? (
                <BookmarkCheck className="h-3.5 w-3.5 text-[hsl(var(--halcyon-teal))]" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )}
              {isSearchSaved ? "Saved" : "Save search"}
            </button>
          {savedSearches.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                Saved searches ({savedSearches.length})
              </button>
              {showSaved && (
                <div className="absolute z-30 top-full mt-1 w-64 backdrop-blur-xl bg-black/80 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                  {savedSearches.map((s) => (
                    <div key={s.id} className="flex items-center group">
                      <button
                        onClick={() => handleRestoreSaved(s)}
                        className="flex-1 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/5 font-mono"
                      >
                        {s.query}.{s.tld}
                      </button>
                      <button
                        onClick={() => setSavedSearches(deleteSavedSearch(s.id))}
                        className="px-2 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>

          {/* Filters */}
          <SearchFilters
            availableTLDs={availableTLDs}
            selectedTLD={tld}
            filters={filters}
            onChange={setFilters}
          />

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        {/* Search Result */}
        {result && (
          <div
            className={cn(
              "mt-4 pt-4 border-t border-white/10 animate-fadeInUp",
              "transition-all duration-300"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {result.available ? (
                  <div className="p-2 rounded-full bg-green-500/20">
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  </div>
                ) : (
                  <div className="p-2 rounded-full bg-red-500/20">
                    <XCircle className="h-6 w-6 text-red-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-mono font-bold text-xl text-white truncate">
                    {result.fqdn}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.available ? (
                      <span className="text-green-400">Available</span>
                    ) : (
                      <span className="text-red-400">
                        Taken{result.owner ? ` by ${result.owner.slice(0, 8)}...` : ""}
                      </span>
                    )}
                    {result.tier && (
                      <span className="ml-2 text-white/60">
                        • {result.tier.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Watch button for taken domains */}
                {!result.available && walletAddress && getAuthCredentials && (
                  <button
                    onClick={watching ? handleUnwatch : handleWatch}
                    title={watching ? "Stop watching" : "Watch for availability"}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      watching
                        ? "bg-[hsl(var(--halcyon-teal))]/20 text-[hsl(var(--halcyon-teal))]"
                        : "bg-white/5 text-white/40 hover:text-white/70"
                    )}
                  >
                    {watching ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                  </button>
                )}

                {result.available && result.priceFLR && (
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">
                      {result.priceFLR.toFixed(2)} {currencySymbol}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ~${result.priceUSD?.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Marketplace listing info for taken domains */}
            {!result.available && marketplaceListing && (
              <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div>
                  <div className="text-sm text-amber-300 font-medium">Listed on Marketplace</div>
                  <div className="text-lg font-bold text-white">
                    {marketplaceListing.price.toFixed(2)} <span className="text-sm text-amber-400">{currencySymbol}</span>
                  </div>
                </div>
                <a
                  href={`/marketplace/${marketplaceListing.listingId}`}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Buy on Marketplace
                </a>
              </div>
            )}

            {result.available && (
              <button
                onClick={() => onRegisterClick(result)}
                className="w-full mt-3 py-2.5 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-semibold rounded-xl hover:opacity-90 transition-all"
              >
                Register Now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GlassmorphicSearchPanel;

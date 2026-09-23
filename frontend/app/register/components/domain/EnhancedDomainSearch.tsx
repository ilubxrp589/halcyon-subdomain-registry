"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  Globe,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TLD } from "@/services/api";

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

interface EnhancedDomainSearchProps {
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  tld: string;
  onTldChange: (value: string) => void;
  availableTLDs: TLD[];
  isLoadingTLDs: boolean;
  searchResult: SearchResult | null;
  isSearching: boolean;
  onSearch: () => void;
  onSelectResult: (result: SearchResult) => void;
  currencySymbol: string;
}

export function EnhancedDomainSearch({
  subdomain,
  onSubdomainChange,
  tld,
  onTldChange,
  availableTLDs,
  isLoadingTLDs,
  searchResult,
  isSearching,
  onSearch,
  onSelectResult,
  currencySymbol,
}: EnhancedDomainSearchProps) {
  const [showTldDropdown, setShowTldDropdown] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && subdomain.trim()) {
      onSearch();
    }
  };

  const handleResultClick = () => {
    if (searchResult?.available) {
      onSelectResult(searchResult);
    }
  };

  const getTierColor = (tier?: string) => {
    switch (tier) {
      case "ultra_premium":
        return "text-amber-400";
      case "premium":
        return "text-yellow-400";
      case "standard_plus":
        return "text-blue-400";
      default:
        return "text-[hsl(var(--halcyon-green))]";
    }
  };

  const getTierLabel = (tier?: string) => {
    switch (tier) {
      case "ultra_premium":
        return "Ultra Premium";
      case "premium":
        return "Premium";
      case "standard_plus":
        return "Standard Plus";
      default:
        return "Standard";
    }
  };

  return (
    <div className="glass-card p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--halcyon-teal))]/10 mb-4">
          <Globe className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
          <span className="text-sm font-medium text-[hsl(var(--halcyon-teal))]">
            Domain Search
          </span>
        </div>
        <h2 className="text-2xl font-bold mb-2">Find Your Perfect Domain</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          Search for an available subdomain on the .{tld} TLD
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[hsl(var(--background))]/50 border border-[hsl(var(--border))] focus-within:ring-2 focus-within:ring-[hsl(var(--halcyon-teal))]/50 focus-within:border-[hsl(var(--halcyon-teal))]/50">
          <input
            type="text"
            value={subdomain}
            onChange={(e) => onSubdomainChange(e.target.value.toLowerCase())}
            onKeyDown={handleKeyDown}
            placeholder="Enter subdomain name"
            className="flex-1 px-4 py-3 bg-transparent text-lg font-medium focus:outline-none placeholder:text-[hsl(var(--muted-foreground))]/50"
          />

          {/* TLD Selector */}
          <div className="relative">
            <button
              onClick={() => setShowTldDropdown(!showTldDropdown)}
              disabled={isLoadingTLDs}
              className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[hsl(var(--muted))]/50 hover:bg-[hsl(var(--muted))] transition-colors font-mono font-bold"
            >
              .{tld}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  showTldDropdown && "rotate-180"
                )}
              />
            </button>

            {showTldDropdown && !isLoadingTLDs && (
              <div className="absolute top-full right-0 mt-2 w-48 rounded-lg bg-[hsl(var(--popover))] border border-[hsl(var(--border))] shadow-xl z-50 overflow-hidden">
                {availableTLDs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onTldChange(t.name);
                      setShowTldDropdown(false);
                    }}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-[hsl(var(--muted))] transition-colors",
                      tld === t.name && "bg-[hsl(var(--halcyon-teal))]/10"
                    )}
                  >
                    <span className="font-mono font-bold">.{t.name}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">
                      ({t.domain_count} registered)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Button */}
          <button
            onClick={onSearch}
            disabled={!subdomain.trim() || isSearching}
            className="btn-halcyon px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            Search
          </button>
        </div>
      </div>

      {/* Search Result - Click to proceed */}
      {searchResult && (
        <div
          onClick={handleResultClick}
          className={cn(
            "p-4 rounded-xl border-2 transition-all",
            searchResult.available
              ? "border-[hsl(var(--halcyon-green))] bg-[hsl(var(--halcyon-green))]/10 cursor-pointer hover:bg-[hsl(var(--halcyon-green))]/20"
              : "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {searchResult.available ? (
                <CheckCircle className="h-6 w-6 text-[hsl(var(--halcyon-green))] flex-shrink-0" />
              ) : (
                <XCircle className="h-6 w-6 text-[hsl(var(--destructive))] flex-shrink-0" />
              )}
              <div>
                <div className="font-mono font-bold text-lg">
                  {searchResult.fqdn}
                </div>
                {searchResult.available ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className={cn("text-sm font-medium", getTierColor(searchResult.tier))}
                    >
                      {getTierLabel(searchResult.tier)}
                    </span>
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      ${searchResult.priceUSD?.toFixed(2)} / {searchResult.priceFLR?.toFixed(2)}{" "}
                      {currencySymbol}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-[hsl(var(--destructive))]">
                    {searchResult.error || "Already registered"}
                  </div>
                )}
              </div>
            </div>

            {searchResult.available && (
              <div className="flex items-center gap-2 text-[hsl(var(--halcyon-green))] font-medium">
                <Sparkles className="h-4 w-4" />
                Click to customize
              </div>
            )}
          </div>

          {searchResult.available && (
            <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))] pl-9">
              Click this result to proceed to NFT customization
            </p>
          )}
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {showTldDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowTldDropdown(false)}
        />
      )}
    </div>
  );
}

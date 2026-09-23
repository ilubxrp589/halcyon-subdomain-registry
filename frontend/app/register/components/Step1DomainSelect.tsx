"use client";

import { Search, Check, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, getPriceTier, formatUSD } from "@/lib/utils";
import { TLD } from "@/services/api";

export interface SearchResult {
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

interface Step1DomainSelectProps {
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  tld: string;
  onTldChange: (tld: string) => void;
  availableTLDs: TLD[];
  isLoadingTLDs: boolean;
  searchResult: SearchResult | null;
  isSearching: boolean;
  onSearch: () => void;
  onContinue: () => void;
  currencySymbol: string;
  className?: string;
}

export function Step1DomainSelect({
  subdomain,
  onSubdomainChange,
  tld,
  onTldChange,
  availableTLDs,
  isLoadingTLDs,
  searchResult,
  isSearching,
  onSearch,
  onContinue,
  currencySymbol,
  className,
}: Step1DomainSelectProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Search Availability</CardTitle>
        <CardDescription>
          Enter the subdomain you want to register
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="yourname"
              value={subdomain}
              onChange={(e) => onSubdomainChange(e.target.value.toLowerCase())}
              onKeyDown={handleKeyDown}
              className="pr-24"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              .{tld}
            </div>
          </div>
          <Button onClick={onSearch} disabled={!subdomain || isSearching}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* TLD Selector */}
        <div className="flex gap-2 flex-wrap">
          {isLoadingTLDs ? (
            <Badge variant="outline" className="opacity-50">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Loading TLDs...
            </Badge>
          ) : (
            availableTLDs.map((t) => (
              <Badge
                key={t.id}
                variant={tld === t.name ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onTldChange(t.name)}
              >
                .{t.name}
              </Badge>
            ))
          )}
        </div>

        {/* Search Result */}
        {searchResult && (
          <div
            className={cn(
              "p-4 rounded-lg border",
              searchResult.available
                ? "bg-green-500/10 border-green-500/30"
                : "bg-red-500/10 border-red-500/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {searchResult.available ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
                <span className="font-mono font-semibold">
                  {searchResult.fqdn}
                </span>
              </div>
              {searchResult.available ? (
                <Badge variant="success">Available</Badge>
              ) : (
                <Badge variant="destructive">Taken</Badge>
              )}
            </div>

            {searchResult.available && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tier</span>
                  <span
                    className={getPriceTier(searchResult.subdomain).color}
                  >
                    {searchResult.tier}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span>
                    {formatUSD(searchResult.priceUSD || 0)} (
                    {searchResult.priceFLR?.toFixed(0)} {currencySymbol})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  Plus network gas fees (estimated ~0.01-0.05 {currencySymbol})
                </p>
                <Button className="w-full mt-4" onClick={onContinue}>
                  Continue to Purchase
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {searchResult.error && (
              <p className="mt-2 text-sm text-red-500">{searchResult.error}</p>
            )}

            {searchResult.owner && (
              <p className="mt-2 text-sm text-muted-foreground">
                Owned by {searchResult.owner}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

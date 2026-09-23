"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingCart, X, Trash2, Plus, Tag, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBulkPricing, BulkPricingResult, searchSubdomain, SearchResult } from "@/services/api";

interface CartItem {
  subdomain: string;
  tld: string;
  fqdn: string;
  tier: string;
  priceUSD: number;
  priceFLR: number;
}

interface DomainCartProps {
  tld: string;
  currencySymbol: string;
  isConnected: boolean;
  onPurchase: (items: CartItem[], totalFLR: number) => void;
  className?: string;
}

export function DomainCart({
  tld,
  currencySymbol,
  isConnected,
  onPurchase,
  className,
}: DomainCartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [pricing, setPricing] = useState<BulkPricingResult | null>(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);

  // Fetch bulk pricing when items change
  useEffect(() => {
    if (items.length === 0) {
      setPricing(null);
      return;
    }

    const fetchPricing = async () => {
      setIsPricingLoading(true);
      try {
        const result = await getBulkPricing(tld, items.map(i => i.subdomain));
        setPricing(result);
        // Update item prices from bulk pricing
        setItems(prev => prev.map(item => {
          const pricedItem = result.items.find(p => p.subdomain === item.subdomain);
          if (pricedItem) {
            return { ...item, priceUSD: pricedItem.priceUSD, priceFLR: pricedItem.priceFLR, tier: pricedItem.tier };
          }
          return item;
        }));
      } catch (e) {
        console.error("Failed to fetch bulk pricing:", e);
      } finally {
        setIsPricingLoading(false);
      }
    };

    const timer = setTimeout(fetchPricing, 300);
    return () => clearTimeout(timer);
  }, [items.length, tld]);

  const addDomain = useCallback(async () => {
    const subdomain = inputValue.trim().toLowerCase();
    if (!subdomain) return;

    // Check if already in cart
    if (items.some(item => item.subdomain === subdomain)) {
      setSearchError("Domain already in cart");
      return;
    }

    // Check cart limit
    if (items.length >= 5) {
      setSearchError("Maximum 5 domains per batch");
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const result = await searchSubdomain(subdomain, tld);
      if (!result.available) {
        setSearchError(result.owner ? `Already owned by ${result.owner.slice(0, 8)}...` : "Domain not available");
        return;
      }

      setItems(prev => [...prev, {
        subdomain: result.subdomain,
        tld: result.tld,
        fqdn: result.fqdn,
        tier: result.tier || "standard",
        priceUSD: result.price?.usd || 0,
        priceFLR: result.price?.flr || 0,
      }]);
      setInputValue("");
    } catch (e) {
      setSearchError("Failed to check availability");
    } finally {
      setIsSearching(false);
    }
  }, [inputValue, items, tld]);

  const removeDomain = (subdomain: string) => {
    setItems(prev => prev.filter(item => item.subdomain !== subdomain));
  };

  const clearCart = () => {
    setItems([]);
    setPricing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addDomain();
    }
  };

  const handlePurchase = () => {
    if (!pricing || items.length === 0) return;
    onPurchase(items, pricing.total.flr);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "ultra_premium": return "text-yellow-400";
      case "premium": return "text-amber-400";
      case "standard_plus": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  return (
    <>
      {/* Floating Cart Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 p-4 rounded-full shadow-lg transition-all",
          "bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))]",
          "hover:scale-105 hover:shadow-xl",
          items.length > 0 && "animate-pulse",
          className
        )}
      >
        <ShoppingCart className="h-6 w-6 text-white" />
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>

      {/* Cart Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer */}
          <div className="relative w-full max-w-md bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
                <h2 className="font-semibold text-lg">Bulk Registration</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-[hsl(var(--muted))] rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add Domain Input */}
            <div className="p-4 border-b border-[hsl(var(--border))]">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                      setSearchError("");
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Add domain..."
                    className="w-full px-3 py-2 pr-16 rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                    .{tld}
                  </span>
                </div>
                <button
                  onClick={addDomain}
                  disabled={!inputValue || isSearching || items.length >= 5}
                  className="px-4 py-2 rounded-lg bg-[hsl(var(--halcyon-teal))] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                </button>
              </div>
              {searchError && (
                <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {searchError}
                </p>
              )}
              <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                Add up to 5 domains. Earn bonus preview credits: 2=15, 3=20, 4=25, 5=30
              </p>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {items.length === 0 ? (
                <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Your cart is empty</p>
                  <p className="text-sm mt-1">Add domains above to get started</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.subdomain}
                    className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--muted))]"
                  >
                    <div>
                      <div className="font-mono font-medium">{item.fqdn}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
                        <span className={getTierColor(item.tier)}>
                          {item.tier.replace("_", " ")}
                        </span>
                        <span>•</span>
                        <span>${item.priceUSD.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeDomain(item.subdomain)}
                      className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Pricing Summary */}
            {items.length > 0 && (
              <div className="border-t border-[hsl(var(--border))] p-4 space-y-3">
                {isPricingLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--halcyon-teal))]" />
                  </div>
                ) : pricing ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-[hsl(var(--muted-foreground))]">Subtotal ({pricing.count} domains)</span>
                      <span>${pricing.subtotal.usd.toFixed(2)} / {pricing.subtotal.flr} {currencySymbol}</span>
                    </div>
                    {pricing.bonusCredits > 0 && (
                      <div className="flex justify-between text-sm text-amber-400">
                        <span className="flex items-center gap-1">
                          <Tag className="h-4 w-4" />
                          Bonus Credits
                        </span>
                        <span>+{pricing.bonusCredits} preview credits</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg border-t border-[hsl(var(--border))] pt-3">
                      <span>Total</span>
                      <span className="text-[hsl(var(--halcyon-green))]">
                        ${pricing.total.usd.toFixed(2)} / {pricing.total.flr} {currencySymbol}
                      </span>
                    </div>
                  </>
                ) : null}

                <div className="flex gap-2">
                  <button
                    onClick={clearCart}
                    className="flex-1 px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    Clear Cart
                  </button>
                  <button
                    onClick={handlePurchase}
                    disabled={!isConnected || !pricing || items.length === 0}
                    className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Purchase All
                  </button>
                </div>

                {!isConnected && (
                  <p className="text-center text-sm text-yellow-400">
                    Connect wallet to purchase
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DomainCart;

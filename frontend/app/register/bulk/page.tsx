"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from "@/lib/web3modal";
import { BrowserProvider, Contract } from "ethers";
import Link from "next/link";
import {
  ArrowLeft,
  Wallet,
  Loader2,
  CheckCircle,
  Trash2,
  Plus,
  AlertCircle,
  Gift,
  Sparkles,
  ChevronDown,
  Globe,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchSubdomain,
  getBulkPricingMultiTLD,
  getTLDs,
  TLD,
  BulkPricingResult,
} from "@/services/api";
import confetti from "canvas-confetti";

// Contract ABI
const ESCROW_ABI = [
  "function purchaseSubdomain(string tld, string subdomain, string metadataURI) payable returns (uint256 escrowId, uint256 tokenId)",
  "function batchPurchaseSubdomain(string tld, string[] subdomainList, string[] metadataURIs) payable returns (uint256[] escrowIds, uint256[] tokenIds)",
  "function getCurrentPriceFLR(string memory subdomain) external view returns (uint256)",
  "function getBatchPrice(string[] subdomainList) external view returns (uint256 totalUSD, uint256 totalFLR, uint256 discountBps)",
];

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ESCROW || "";

const getCurrencySymbol = (chainId: number | undefined) => {
  return chainId === 14 ? "FLR" : "C2FLR";
};

interface CartItem {
  subdomain: string;
  tld: string;
  fqdn: string;
  tier: string;
  priceUSD: number;
  priceFLR: number;
}

type PageStep = "cart" | "processing" | "success";

export default function BulkRegisterPage() {
  const { open } = useWeb3Modal();
  const { address, isConnected, chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  // Page state
  const [pageStep, setPageStep] = useState<PageStep>("cart");
  const [processingStep, setProcessingStep] = useState<"verifying" | "purchasing">("verifying");
  const [currentPurchaseIndex, setCurrentPurchaseIndex] = useState(0);
  const [currentTld, setCurrentTld] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [purchasedDomains, setPurchasedDomains] = useState<string[]>([]);
  const [bonusCreditsAwarded, setBonusCreditsAwarded] = useState(0);

  // TLD state
  const [selectedTld, setSelectedTld] = useState("cryptofans");
  const [availableTLDs, setAvailableTLDs] = useState<TLD[]>([]);
  const [isLoadingTLDs, setIsLoadingTLDs] = useState(true);
  const [showTldDropdown, setShowTldDropdown] = useState(false);
  const tldDropdownRef = useRef<HTMLDivElement>(null);

  // Cart state
  const [items, setItems] = useState<CartItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [pricing, setPricing] = useState<BulkPricingResult | null>(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);

  const currencySymbol = getCurrencySymbol(chainId);

  // Close TLD dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tldDropdownRef.current && !tldDropdownRef.current.contains(event.target as Node)) {
        setShowTldDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch TLDs on mount
  useEffect(() => {
    const fetchTLDs = async () => {
      try {
        const tlds = await getTLDs();
        setAvailableTLDs(tlds);
        if (tlds.length > 0 && !tlds.find((t) => t.name === selectedTld)) {
          setSelectedTld(tlds[0].name);
        }
      } catch {
        console.error("Failed to fetch TLDs");
        setAvailableTLDs([{ id: 1, name: "cryptofans", is_active: true, domain_count: 0 }]);
      } finally {
        setIsLoadingTLDs(false);
      }
    };
    fetchTLDs();
  }, []);

  // Track item FQDNs for pricing dependency (avoids infinite loop when prices update)
  const itemFqdns = items.map(i => i.fqdn).join(',');

  // Fetch pricing when items change
  useEffect(() => {
    if (items.length === 0) {
      setPricing(null);
      return;
    }

    const fetchPricing = async () => {
      setIsPricingLoading(true);
      try {
        const result = await getBulkPricingMultiTLD(items.map(i => ({ subdomain: i.subdomain, tld: i.tld })));
        setPricing(result);
        // Update item prices from bulk pricing
        setItems(prev => prev.map(item => {
          const pricedItem = result.items.find(p => p.subdomain === item.subdomain && p.tld === item.tld);
          if (pricedItem) {
            return { ...item, priceUSD: pricedItem.priceUSD, priceFLR: pricedItem.priceFLR, tier: pricedItem.tier };
          }
          return item;
        }));
      } catch (err) {
        console.error("Failed to fetch bulk pricing:", err);
      } finally {
        setIsPricingLoading(false);
      }
    };

    const timer = setTimeout(fetchPricing, 300);
    return () => clearTimeout(timer);
  }, [itemFqdns]);

  // Add domain to cart
  const addDomain = useCallback(async () => {
    const subdomain = inputValue.trim().toLowerCase();
    if (!subdomain) return;

    const fqdn = `${subdomain}.${selectedTld}`;

    // Check if already in cart (same subdomain AND tld)
    if (items.some(item => item.fqdn === fqdn)) {
      setSearchError("Domain already in cart");
      return;
    }

    // Check cart limit (max 5)
    if (items.length >= 5) {
      setSearchError("Maximum 5 domains per bulk registration");
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const result = await searchSubdomain(subdomain, selectedTld);
      if (!result.available) {
        setSearchError(result.owner ? `Already owned by ${result.owner.slice(0, 8)}...` : (result.error || "Domain not available"));
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
    } catch {
      setSearchError("Failed to check availability");
    } finally {
      setIsSearching(false);
    }
  }, [inputValue, items, selectedTld]);

  const removeDomain = (fqdn: string) => {
    setItems(prev => prev.filter(item => item.fqdn !== fqdn));
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

  // Get tier styling
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "ultra_premium": return "text-yellow-400";
      case "premium": return "text-amber-400";
      case "standard_plus": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case "ultra_premium": return "Ultra Premium";
      case "premium": return "Premium";
      case "standard_plus": return "Standard+";
      default: return "Standard";
    }
  };

  // Get bonus credits for domain count
  const getBonusCredits = (count: number) => {
    if (count >= 5) return 30;
    if (count >= 4) return 25;
    if (count >= 3) return 20;
    if (count >= 2) return 15;
    return 0;
  };

  // Group items by TLD for display
  const itemsByTld = items.reduce((acc, item) => {
    if (!acc[item.tld]) acc[item.tld] = [];
    acc[item.tld].push(item);
    return acc;
  }, {} as Record<string, CartItem[]>);

  // Handle bulk purchase
  const handlePurchase = async () => {
    if (!isConnected || !walletProvider || items.length === 0) {
      open();
      return;
    }

    if (chainId !== 114 && chainId !== 14) {
      setError("Please switch to Flare or Coston2 network");
      return;
    }

    if (!ESCROW_ADDRESS) {
      setError("Contract not deployed. Please check configuration.");
      return;
    }

    if (!pricing) {
      setError("Pricing not loaded. Please try again.");
      return;
    }

    setPageStep("processing");
    setProcessingStep("verifying");
    setError("");

    try {
      // Re-verify all domains are still available before purchase
      const unavailable: string[] = [];
      for (const item of items) {
        const result = await searchSubdomain(item.subdomain, item.tld);
        if (!result.available) {
          unavailable.push(item.fqdn);
        }
      }

      if (unavailable.length > 0) {
        // Remove unavailable items from cart
        setItems(prev => prev.filter(item => !unavailable.includes(item.fqdn)));
        setError(`No longer available: ${unavailable.join(", ")}. Removed from cart.`);
        setPageStep("cart");
        return;
      }

      setProcessingStep("purchasing");
      setCurrentPurchaseIndex(0);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

      const purchased: string[] = [];
      let lastTxHash = "";

      // Group items by TLD for batch purchasing
      const itemsByTldMap = items.reduce((acc, item) => {
        if (!acc[item.tld]) acc[item.tld] = [];
        acc[item.tld].push(item);
        return acc;
      }, {} as Record<string, CartItem[]>);

      const tldGroups = Object.entries(itemsByTldMap);
      let txIndex = 0;

      for (const [tld, tldItems] of tldGroups) {
        txIndex++;
        setCurrentPurchaseIndex(txIndex);
        setCurrentTld(tld);

        const subdomains = tldItems.map(item => item.subdomain);
        const metadataURIs = tldItems.map(item => `pending:bulk:${item.subdomain}.${tld}`);

        // Get batch price from contract
        const [, totalFLR] = await escrow.getBatchPrice(subdomains);
        const priceFLRWithBuffer = (totalFLR * BigInt(1005)) / BigInt(1000);

        // Batch purchase for multiple, single for one
        const tx = tldItems.length > 1
          ? await escrow.batchPurchaseSubdomain(tld, subdomains, metadataURIs, { value: priceFLRWithBuffer })
          : await escrow.purchaseSubdomain(tld, subdomains[0], metadataURIs[0], { value: priceFLRWithBuffer });

        lastTxHash = tx.hash;
        await tx.wait();
        purchased.push(...tldItems.map(item => item.fqdn));
      }

      // Record bonus credits on backend
      const bonusCredits = getBonusCredits(items.length);
      if (bonusCredits > 0 && address) {
        try {
          // Call backend to add bonus credits
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bulk-purchase/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wallet: address,
              domains: items.map(i => i.fqdn),
              bonusCredits,
              txHash: lastTxHash,
            }),
          });
          if (response.ok) {
            setBonusCreditsAwarded(bonusCredits);
          }
        } catch (e) {
          console.warn("Failed to record bonus credits:", e);
          // Don't fail the purchase - credits are a bonus
        }
      }

      setTxHash(lastTxHash);
      setPurchasedDomains(purchased);
      setBonusCreditsAwarded(bonusCredits);
      setPageStep("success");
      setItems([]);
      setPricing(null);

      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    } catch (err: unknown) {
      console.error("Bulk purchase error:", err);
      const message = err instanceof Error ? err.message : "Transaction failed";
      setError(message);
      setPageStep("cart");
    }
  };

  return (
    <div className="min-h-screen">
      {/* Halcyon Background */}
      <div className="halcyon-bg" />

      <div className="container py-8 relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/register-v2"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Single Domain Registration
            </Link>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 mb-4">
                <Layers className="h-5 w-5 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Bulk Registration</span>
              </div>
              <h1 className="text-4xl font-bold mb-2 text-halcyon-gradient">
                Register Multiple Domains
              </h1>
              <p className="text-muted-foreground">
                Register up to 5 domains across any TLDs and earn bonus preview credits
              </p>
            </div>
          </div>

          {/* Cart Step */}
          {pageStep === "cart" && (
            <div className="space-y-6">
              {/* Domain Input with TLD Selector */}
              <div className="glass-card p-6">
                <label className="block text-sm font-medium mb-2">Add Domains (max 5, any TLD)</label>
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
                      placeholder="Enter subdomain..."
                      className="w-full px-4 py-3 rounded-lg bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))] font-mono"
                    />
                  </div>

                  {/* TLD Dropdown */}
                  <div className="relative" ref={tldDropdownRef}>
                    <button
                      onClick={() => setShowTldDropdown(!showTldDropdown)}
                      disabled={isLoadingTLDs}
                      className="flex items-center gap-2 px-4 py-3 rounded-lg bg-muted border border-border hover:border-[hsl(var(--halcyon-teal))]/50 transition-colors min-w-[160px]"
                    >
                      <Globe className="h-4 w-4 text-[hsl(var(--halcyon-teal))]" />
                      <span className="font-mono flex-1 text-left">.{selectedTld}</span>
                      {isLoadingTLDs ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown className={cn("h-4 w-4 transition-transform", showTldDropdown && "rotate-180")} />
                      )}
                    </button>

                    {showTldDropdown && (
                      <div className="absolute top-full right-0 mt-2 py-2 rounded-lg bg-card border border-border shadow-xl z-20 min-w-[180px] max-h-[300px] overflow-y-auto">
                        {availableTLDs.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              setSelectedTld(t.name);
                              setShowTldDropdown(false);
                            }}
                            className={cn(
                              "w-full px-4 py-2 text-left hover:bg-muted transition-colors flex items-center justify-between",
                              selectedTld === t.name && "bg-[hsl(var(--halcyon-teal))]/10"
                            )}
                          >
                            <span className="font-mono">.{t.name}</span>
                            {selectedTld === t.name && <CheckCircle className="h-4 w-4 text-[hsl(var(--halcyon-green))]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={addDomain}
                    disabled={!inputValue || isSearching || items.length >= 5}
                    className="px-6 py-3 rounded-lg bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Mix and match domains from different TLDs in a single purchase
                </p>
              </div>

              {/* Domain List */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Your Domains ({items.length}/5)</h3>

                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No domains added yet</p>
                    <p className="text-sm mt-1">Add 2+ domains to earn bonus credits</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Group by TLD */}
                    {Object.entries(itemsByTld).map(([tld, tldItems]) => (
                      <div key={tld}>
                        <div className="flex items-center gap-2 mb-2">
                          <Globe className="h-4 w-4 text-[hsl(var(--halcyon-teal))]" />
                          <span className="text-sm font-medium text-muted-foreground">.{tld}</span>
                          <span className="text-xs text-muted-foreground">({tldItems.length})</span>
                        </div>
                        <div className="space-y-2 ml-6">
                          {tldItems.map((item) => (
                            <div
                              key={item.fqdn}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                            >
                              <div>
                                <div className="font-mono font-semibold">{item.fqdn}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                  <span className={getTierColor(item.tier)}>
                                    {getTierLabel(item.tier)}
                                  </span>
                                  <span>-</span>
                                  <span>${item.priceUSD.toFixed(2)} / {item.priceFLR} {currencySymbol}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => removeDomain(item.fqdn)}
                                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pricing Summary */}
              {items.length > 0 && (
                <div className="glass-card p-6 space-y-4">
                  <h3 className="font-semibold">Order Summary</h3>

                  {isPricingLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--halcyon-teal))]" />
                    </div>
                  ) : pricing ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {pricing.count} domain{pricing.count > 1 ? "s" : ""}
                            {Object.keys(itemsByTld).length > 1 && ` across ${Object.keys(itemsByTld).length} TLDs`}
                          </span>
                          <span>${pricing.subtotal.usd.toFixed(2)} / {pricing.subtotal.flr} {currencySymbol}</span>
                        </div>
                      </div>

                      {/* Bonus Credits Highlight */}
                      {pricing.bonusCredits > 0 && (
                        <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-pink-500/10 border border-amber-500/30">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/20">
                              <Gift className="h-5 w-5 text-amber-400" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-amber-400">
                                +{pricing.bonusCredits} Bonus Preview Credits!
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Use these to customize your NFT artwork later
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="border-t border-border pt-4">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-lg">Total</span>
                          <span className="font-bold text-xl text-[hsl(var(--halcyon-green))]">
                            ${pricing.total.usd.toFixed(2)} / {pricing.total.flr} {currencySymbol}
                          </span>
                        </div>
                      </div>

                      {error && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                          {error}
                        </div>
                      )}

                      {Object.keys(itemsByTld).length >= 1 && items.length > 1 && (
                        <p className="text-sm text-green-400 text-center">
                          {Object.keys(itemsByTld).length === 1
                            ? "1 batch transaction for all domains"
                            : `${Object.keys(itemsByTld).length} transactions (one per TLD)`}
                        </p>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={clearCart}
                          className="flex-1 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Clear Cart
                        </button>
                        <button
                          onClick={handlePurchase}
                          disabled={!isConnected || items.length === 0}
                          className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="h-5 w-5" />
                          Purchase All ({Object.keys(itemsByTld).length} tx)
                        </button>
                      </div>

                      {!isConnected && (
                        <button
                          onClick={() => open()}
                          className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                          <Wallet className="h-5 w-5" />
                          Connect Wallet to Purchase
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* Bonus Credits Info */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  Bonus Credits System
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { count: 2, credits: 15 },
                    { count: 3, credits: 20 },
                    { count: 4, credits: 25 },
                    { count: 5, credits: 30 },
                  ].map(({ count, credits }) => (
                    <div
                      key={count}
                      className={cn(
                        "p-4 rounded-lg border text-center transition-all",
                        items.length >= count
                          ? "bg-amber-500/10 border-amber-500/30"
                          : "bg-muted/30 border-border"
                      )}
                    >
                      <div className="text-2xl font-bold text-amber-400">{credits}</div>
                      <div className="text-sm text-muted-foreground">credits</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {count} domain{count > 1 ? "s" : ""}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Bulk registrations use default NFT artwork. Use your bonus credits to generate custom AI artwork from your dashboard.
                </p>
              </div>
            </div>
          )}

          {/* Processing Step */}
          {pageStep === "processing" && (
            <div className="glass-card p-12 text-center">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] animate-spin" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-[hsl(var(--halcyon-teal))] animate-spin" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {processingStep === "verifying" ? "Verifying Availability" : "Processing Your Purchase"}
              </h2>
              <p className="text-muted-foreground mb-4">
                {processingStep === "verifying"
                  ? "Checking all domains are still available..."
                  : `Confirm transaction ${currentPurchaseIndex} of ${Object.keys(itemsByTld).length} in your wallet...`}
              </p>
              {processingStep === "purchasing" && currentPurchaseIndex > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">
                    Registering <span className="font-mono text-[hsl(var(--halcyon-teal))]">.{currentTld}</span> domains
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] h-2 rounded-full transition-all"
                      style={{ width: `${(currentPurchaseIndex / Object.keys(itemsByTld).length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Batch {currentPurchaseIndex} of {Object.keys(itemsByTld).length}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Success Step */}
          {pageStep === "success" && (
            <div className="glass-card p-12 text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-2 text-halcyon-gradient">
                Congratulations!
              </h2>
              <p className="text-muted-foreground mb-6">
                You&apos;ve successfully registered {purchasedDomains.length} domain{purchasedDomains.length > 1 ? "s" : ""}!
              </p>

              {/* Purchased Domains */}
              <div className="bg-muted/30 rounded-lg p-4 mb-6">
                <div className="space-y-2">
                  {purchasedDomains.map((domain) => (
                    <div key={domain} className="font-mono text-lg">{domain}</div>
                  ))}
                </div>
              </div>

              {/* Bonus Credits */}
              {bonusCreditsAwarded > 0 && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-pink-500/10 border border-amber-500/30 mb-6">
                  <div className="flex items-center justify-center gap-3">
                    <Gift className="h-6 w-6 text-amber-400" />
                    <span className="text-lg font-semibold text-amber-400">
                      +{bonusCreditsAwarded} Preview Credits Added!
                    </span>
                  </div>
                </div>
              )}

              {txHash && (
                <p className="text-sm text-muted-foreground mb-6">
                  Transaction:{" "}
                  <a
                    href={`https://${chainId === 14 ? "" : "coston2-"}explorer.flare.network/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--halcyon-teal))] hover:underline"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/dashboard"
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-medium hover:opacity-90 transition-opacity"
                >
                  View in Dashboard
                </Link>
                <button
                  onClick={() => {
                    setPageStep("cart");
                    setPurchasedDomains([]);
                    setBonusCreditsAwarded(0);
                    setTxHash("");
                  }}
                  className="px-6 py-3 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Register More Domains
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

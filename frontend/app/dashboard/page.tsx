"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider, useCurrencySymbol, getPublicProvider } from "@/lib/web3modal";
import { BrowserProvider, Contract } from "ethers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Globe,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Coins,
  LayoutDashboard,
  List,
  Layers,
  Settings,
  Crown,
} from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import {
  batchResolveAddresses,
  getNotifications,
  getNotificationCount,
  type Notification,
} from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useMyDomains } from "@/hooks/useMyDomains";
import { useMyTlds } from "@/hooks/useMyTlds";
import { useCredits } from "@/hooks/useCredits";
import { NFTCustomizeModal } from "@/components/NFTCustomizeModal";

import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { DomainsTab, type DomainWithDNS } from "@/components/dashboard/DomainsTab";
import { BulkTab } from "@/components/dashboard/BulkTab";
import { SettingsTab } from "@/components/dashboard/SettingsTab";
import { RewardsTab } from "@/components/dashboard/RewardsTab";
import { MyTldsTab } from "@/components/dashboard/MyTldsTab";

// Marketplace Contract (for checking listing status)
const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE;
const MARKETPLACE_ABI = [
  "function isTokenListed(uint256 tokenId) view returns (bool)",
  "function tokenToListing(uint256 tokenId) view returns (uint256)",
  "function listings(uint256 listingId) view returns (uint256 listingId, uint256 tokenId, address seller, uint256 price, uint256 endTime, uint8 listingType, uint8 status, address highestBidder, uint256 highestBid, uint256 createdAt)",
];

export default function DashboardPage() {
  const { open } = useWeb3Modal();
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { getAuthCredentials, refreshCredentials, isAuthenticating } = useAuth();
  const currencySymbol = useCurrencySymbol();

  const { credits, total: creditsTotal, refresh: refreshCredits, isLoading: isLoadingCredits } = useCredits(address);
  const { completedTldCount: ownedTldCount } = useMyTlds(address, getAuthCredentials);

  const [customizingDomain, setCustomizingDomain] = useState<DomainWithDNS | null>(null);
  const [domains, setDomains] = useState<DomainWithDNS[]>([]);
  const [copied, setCopied] = useState(false);

  // V2 domains hook — replaces the old V1 loadDomains callback
  const {
    domains: v2DomainsList,
    isLoading: isLoadingV2,
    error,
    refresh: refreshDomains,
  } = useMyDomains(address, getAuthCredentials, refreshCredentials);

  const isLoading = isLoadingV2;

  // Sync V2 hook output into DomainWithDNS state (augmented with DNS, marketplace, etc.)
  // Preserve existing augmented fields (dnsEntries, resolvedAddress, etc.) if domain already exists
  useEffect(() => {
    setDomains((prev) => {
      return v2DomainsList.map((d) => {
        const existing = prev.find((p) => p.id === d.id);
        if (existing) {
          // Merge: update base domain fields from V2, keep augmented fields
          return { ...existing, ...d };
        }
        // New domain: initialize with defaults
        return { ...d, dnsRecords: undefined, isLoadingDNS: false, dnsError: undefined };
      });
    });
  }, [v2DomainsList]);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);

  // Refs to prevent duplicate API calls
  const isLoadingListingsRef = useRef(false);
  const isLoadingAddressesRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (!address) return;
    try {
      const [notifs, count] = await Promise.all([getNotifications(address), getNotificationCount(address)]);
      setNotifications(notifs);
      setNotificationCount(count);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadNotifications();
    } else {
      setDomains([]);
      setNotifications([]);
      setNotificationCount(0);
    }
  }, [isConnected, address]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isConnected || !address) return;
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [isConnected, address, loadNotifications]);

  // Check marketplace listings
  const checkMarketplaceListings = useCallback(async (domainsToCheck: DomainWithDNS[]) => {
    if (!MARKETPLACE_ADDRESS || domainsToCheck.length === 0) return;
    if (isLoadingListingsRef.current) return;
    isLoadingListingsRef.current = true;
    try {
      const provider = getPublicProvider();
      const marketplace = new Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);
      const listingResults = await Promise.all(
        domainsToCheck.map(async (domain) => {
          try {
            const isListed = await marketplace.isTokenListed(domain.token_id);
            if (isListed) {
              const listingId = await marketplace.tokenToListing(domain.token_id);
              const listing = await marketplace.listings(listingId);
              return { id: domain.id, isListed: true, listingId: BigInt(listingId), listingPrice: (Number(listing.price) / 1e18).toFixed(2) };
            }
            return { id: domain.id, isListed: false };
          } catch { return { id: domain.id, isListed: false }; }
        })
      );
      setDomains((prev) => prev.map((d) => {
        const data = listingResults.find((r) => r.id === d.id);
        return data ? { ...d, isListed: data.isListed, listingId: data.listingId, listingPrice: data.listingPrice } : d;
      }));
    } catch (err) {
      console.error("Failed to check marketplace listings:", err);
    } finally {
      isLoadingListingsRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (domains.length > 0 && !isLoading) {
      checkMarketplaceListings(domains);
    }
  }, [domains.length, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load resolved addresses — uses batch endpoint + sessionStorage cache
  const loadAllResolvedAddresses = useCallback(async (domainsToCheck: DomainWithDNS[], forceRefresh = false) => {
    if (domainsToCheck.length === 0) return;
    if (isLoadingAddressesRef.current) return;
    const domainsNeedingResolution = domainsToCheck.filter((d) => d.resolvedAddress === undefined);
    if (domainsNeedingResolution.length === 0) return;

    // Check sessionStorage cache first
    const CACHE_KEY = "halcyon_resolved_addrs";
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    let cache: Record<string, { address: string | null; source?: string; ts: number }> = {};
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) cache = JSON.parse(raw);
    } catch { /* ignore */ }

    const now = Date.now();
    const uncached: DomainWithDNS[] = [];
    const cachedResults: { id: number; resolvedAddress: string | null }[] = [];

    for (const d of domainsNeedingResolution) {
      const entry = cache[d.fqdn];
      if (!forceRefresh && entry && (now - entry.ts) < CACHE_TTL) {
        cachedResults.push({ id: d.id, resolvedAddress: entry.address });
      } else {
        uncached.push(d);
      }
    }

    // Apply cached results immediately
    if (cachedResults.length > 0) {
      setDomains((prev) => prev.map((d) => {
        const result = cachedResults.find((r) => r.id === d.id);
        return result ? { ...d, resolvedAddress: result.resolvedAddress } : d;
      }));
    }

    // Fetch only uncached domains via batch endpoint
    if (uncached.length === 0) return;
    isLoadingAddressesRef.current = true;
    try {
      const fqdns = uncached.map((d) => d.fqdn);
      const batchResults = await batchResolveAddresses(fqdns);

      // Update cache
      for (const r of batchResults) {
        cache[r.fqdn] = { address: r.address, ts: now };
      }
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* full */ }

      // Apply to state
      setDomains((prev) => prev.map((d) => {
        const result = batchResults.find((r) => r.fqdn === d.fqdn);
        return result ? { ...d, resolvedAddress: result.address } : d;
      }));
    } catch (err) {
      console.error("Failed to load resolved addresses:", err);
    } finally {
      isLoadingAddressesRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (domains.length > 0 && !isLoading) {
      loadAllResolvedAddresses(domains);
    }
  }, [domains.length, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = () => {
    isLoadingListingsRef.current = false;
    isLoadingAddressesRef.current = false;
    try { sessionStorage.removeItem("halcyon_resolved_addrs"); } catch { /* ignore */ }
    refreshDomains(true);
    refreshCredits();
  };

  // Stats
  const stats = {
    total: domains.length,
    active: domains.filter((d) => d.status === "active").length,
    dnsConfigured: domains.filter((d) => d.dns_active).length,
    walletResolved: domains.filter((d) => d.resolvedAddress).length,
    tldCount: Math.max(ownedTldCount, new Set(domains.map((d) => d.fqdn.split(".").slice(1).join("."))).size),
  };

  if (!isConnected) {
    return (
      <div className="container py-12">
        <div className="max-w-2xl mx-auto text-center">
          <Card>
            <CardContent className="py-12">
              <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
              <p className="text-muted-foreground mb-6">Connect your wallet to view your registered domains</p>
              <Button onClick={() => open()}>Connect Wallet</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-mono text-sm">{truncateAddress(address || "", 6)}</span>
              <button onClick={copyAddress} className="p-1 hover:bg-secondary rounded transition-colors">
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{isLoadingCredits ? "..." : creditsTotal}</span>
              <span className="text-xs text-muted-foreground">credits</span>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/register-v2">
              <Button><Plus className="h-4 w-4 mr-2" />Register New</Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex overflow-x-auto mb-6">
            <TabsTrigger value="overview" className="gap-2 flex-1 min-w-[44px]">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="tlds" className="gap-2 flex-1 min-w-[44px]">
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">My TLDs</span>
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-2 flex-1 min-w-[44px]">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">My Domains</span>
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2 flex-1 min-w-[44px]">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Ops</span>
            </TabsTrigger>
            <TabsTrigger value="rewards" className="gap-2 flex-1 min-w-[44px]">
              <Coins className="h-4 w-4" />
              <span className="hidden sm:inline">Rewards</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 flex-1 min-w-[44px]">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              domains={domains}
              stats={stats}
              notifications={notifications}
              notificationCount={notificationCount}
              credits={creditsTotal}
              isLoadingCredits={isLoadingCredits}
              address={address || ""}
              onDomainClick={(domainId) => {
                // Switch to domains tab and scroll
                const trigger = document.querySelector('[data-state="active"][value="domains"]') as HTMLElement;
                if (!trigger) {
                  // Click the domains tab
                  const domainsTrigger = document.querySelector('[value="domains"]') as HTMLElement;
                  domainsTrigger?.click();
                }
                setTimeout(() => {
                  document.getElementById(`domain-${domainId}`)?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }}
              onRefresh={handleRefresh}
              onNotificationsChange={setNotifications}
              onNotificationCountChange={setNotificationCount}
            />
          </TabsContent>

          <TabsContent value="tlds">
            <MyTldsTab
              wallet={address || ""}
              walletProvider={walletProvider}
              getAuthCredentials={getAuthCredentials}
            />
          </TabsContent>

          <TabsContent value="domains">
            <DomainsTab
              domains={domains}
              setDomains={setDomains}
              wallet={address || ""}
              walletProvider={walletProvider}
              getAuthCredentials={getAuthCredentials}
              refreshCredentials={refreshCredentials}
              isAuthenticating={isAuthenticating}
              currencySymbol={currencySymbol}
              credits={credits}
              onRefresh={handleRefresh}
              onCustomizeDomain={setCustomizingDomain}
              isLoading={isLoading}
              error={error}
            />
          </TabsContent>

          <TabsContent value="bulk">
            <BulkTab
              domains={domains}
              wallet={address || ""}
              walletProvider={walletProvider}
              getAuthCredentials={getAuthCredentials}
              currencySymbol={currencySymbol}
              onRefresh={handleRefresh}
            />
          </TabsContent>

          <TabsContent value="rewards">
            <RewardsTab
              wallet={address || ""}
              walletProvider={walletProvider}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              wallet={address || ""}
              notifications={notifications}
              notificationCount={notificationCount}
              onMarkAllRead={() => {}}
              onNotificationsChange={setNotifications}
              onNotificationCountChange={setNotificationCount}
              currencySymbol={currencySymbol}
              getAuthCredentials={getAuthCredentials}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* NFT Customize Modal */}
      {customizingDomain && (
        <NFTCustomizeModal
          domain={customizingDomain}
          credits={credits}
          onClose={() => setCustomizingDomain(null)}
          onSuccess={() => {
            setCustomizingDomain(null);
            refreshDomains(true);
            refreshCredits();
          }}
          onCreditsChange={refreshCredits}
        />
      )}
    </div>
  );
}

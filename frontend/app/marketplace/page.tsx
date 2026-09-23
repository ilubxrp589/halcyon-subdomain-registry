"use client";

import { useState, useEffect, useCallback } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { useCurrencySymbol } from "@/lib/web3modal";
import { BrowserProvider, Contract, parseEther } from "ethers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListingCard,
  ListingCardSkeleton,
  EmptyState,
} from "@/components/marketplace";
import {
  Search,
  Filter,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE;
const NFT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_NFT;

const MARKETPLACE_ABI = [
  "function buyNow(uint256 listingId) payable",
  "function placeBid(uint256 listingId) payable",
];

interface Listing {
  listingId: number;
  tokenId: string;
  seller: string;
  price: number;
  endTime: number;
  listingType: number;  // 0 = FixedPrice, 1 = Auction
  status: number;       // 0 = Active, 1 = Sold, 2 = Cancelled
  highestBidder: string;
  highestBid: number;
  createdAt: number;
  fullDomain?: string;
  subdomain?: string;
  tld?: string;
  imageUrl?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

type SortOption = "recent" | "price-low" | "price-high" | "ending-soon";
type FilterOption = "all" | "fixed" | "auction";

export default function MarketplacePage() {
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const currencySymbol = useCurrencySymbol();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [buying, setBuying] = useState<number | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  // Marketplace stats from backend
  const [stats, setStats] = useState({
    totalVolume: 0,
    volume24h: 0,
    totalSales: 0,
    floorPrice: 0,
    avgSalePrice: 0,
    activeListings: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<{ fqdn: string; price: number; buyer: string; seller: string; soldAt: string; tokenId: string }[]>([]);

  const fetchListings = useCallback(async (page = 1) => {
    try {
      setLoading(true);

      // Build query string
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        sort: sortBy,
        filter: filterBy,
      });
      if (searchTerm) {
        params.set("search", searchTerm);
      }

      // Fetch from backend API (much faster than RPC calls)
      const res = await fetch(`/api/proxy/marketplace/listings?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch listings");
      }

      const data = await res.json();
      setListings(data.listings || []);
      setPagination(data.pagination || {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasMore: false,
      });
    } catch (error) {
      console.error("Error fetching listings:", error);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, filterBy, searchTerm]);

  useEffect(() => {
    fetchListings(1);
  }, [fetchListings]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    fetchListings(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch marketplace stats from backend
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const [statsRes, recentRes] = await Promise.all([
        fetch('/api/proxy/marketplace/stats'),
        fetch('/api/proxy/marketplace/recent?limit=5'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (recentRes.ok) {
        const data = await recentRes.json();
        setRecentSales(data.sales || []);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleBuyNow = async (listing: Listing) => {
    if (!walletProvider || !isConnected) return;

    try {
      setBuying(listing.listingId);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      // Convert price to wei
      const priceWei = parseEther(listing.price.toString());
      const tx = await marketplace.buyNow(listing.listingId, { value: priceWei });
      await tx.wait();

      // Refresh listings
      await fetchListings(pagination.page);
    } catch (error: unknown) {
      console.error("Buy error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900/20 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Page Title - Compact */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">NFT Marketplace</h1>
          <p className="text-gray-400 text-sm">Browse and trade subdomain NFTs</p>
        </div>

        {/* Filters - Tighter layout */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search domains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white"
            />
          </div>

          <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
            <SelectTrigger className="w-full md:w-[180px] bg-white/5 border-white/10 text-white">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Listings</SelectItem>
              <SelectItem value="fixed">Fixed Price</SelectItem>
              <SelectItem value="auction">Auctions</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full md:w-[180px] bg-white/5 border-white/10 text-white">
              <TrendingUp className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="ending-soon">Ending Soon</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => fetchListings(1)} className="border-white/10 text-white">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Compact Stats Bar - replaces 6-card grid */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-6 p-3 rounded-lg bg-white/5 border border-white/10">
          {statsLoading ? (
            <div className="flex items-center gap-6 flex-1">
              <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
              <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
              <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {/* Primary stats - always visible */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Floor:</span>
                <span className="text-white font-semibold">
                  {stats.floorPrice > 0 ? `${stats.floorPrice.toFixed(2)} ${currencySymbol}` : '-'}
                </span>
              </div>
              <div className="h-4 w-px bg-white/20 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">24h Vol:</span>
                <span className="text-white font-semibold">{stats.volume24h.toFixed(1)} {currencySymbol}</span>
              </div>
              <div className="h-4 w-px bg-white/20 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Listed:</span>
                <span className="text-white font-semibold">{stats.activeListings}</span>
              </div>

              {/* Secondary stats - pushed right on desktop */}
              <div className="hidden lg:flex items-center gap-4 ml-auto text-sm text-gray-400">
                <span>Total: {stats.totalVolume.toFixed(0)} {currencySymbol}</span>
                <span className="text-white/20">•</span>
                <span>{stats.totalSales} sales</span>
              </div>

              {/* Recent sale inline - desktop only */}
              {recentSales.length > 0 && (
                <div className="hidden xl:flex items-center gap-2 ml-auto lg:ml-0 pl-4 border-l border-white/10">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-gray-500 text-sm">Recent:</span>
                  <span className="text-white font-medium truncate max-w-[140px]">{recentSales[0].fqdn}</span>
                  <span className="text-emerald-400 font-medium">{recentSales[0].price.toFixed(2)} {currencySymbol}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mobile Recent Sales - collapsible row */}
        {recentSales.length > 0 && (
          <div className="xl:hidden flex items-center gap-3 mb-6 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <TrendingUp className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {recentSales.slice(0, 3).map((sale, i) => (
                <div key={i} className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <span className="text-white font-medium truncate max-w-[100px]">{sale.fqdn}</span>
                  <span className="text-emerald-400">{sale.price.toFixed(2)}</span>
                  {i < 2 && <span className="text-white/20">•</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "animate-fadeInUp opacity-0",
                  i === 1 && "animation-delay-100",
                  i === 2 && "animation-delay-200",
                  i === 3 && "animation-delay-300",
                  i === 4 && "animation-delay-400",
                  i === 5 && "animation-delay-500",
                  i === 6 && "animation-delay-600",
                  i === 7 && "animation-delay-700"
                )}
              >
                <ListingCardSkeleton />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            searchTerm={searchTerm}
            filterBy={filterBy}
            onClearSearch={() => setSearchTerm("")}
            onClearFilters={() => setFilterBy("all")}
            onRefresh={() => fetchListings(1)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing, index) => (
              <ListingCard
                key={listing.listingId?.toString() || `listing-${index}`}
                listing={listing}
                currencySymbol={currencySymbol}
                nftAddress={NFT_ADDRESS || ""}
                currentAddress={address}
                isConnected={isConnected}
                isBuying={buying === listing.listingId}
                onBuyNow={handleBuyNow}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && listings.length > 0 && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="border-white/10 text-white disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === pagination.page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className={
                      pageNum === pagination.page
                        ? "bg-amber-600 text-white"
                        : "border-white/10 text-white"
                    }
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="border-white/10 text-white disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>

            <span className="text-gray-400 text-sm ml-4">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} listings)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

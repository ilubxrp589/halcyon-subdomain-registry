"use client";

import { useState, useEffect, useRef } from "react";
import { useMarketplace } from "@/hooks/useMarketplace";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  delistName,
  updateListingPrice,
  type MarketplaceListing,
} from "@/services/auctionHouseApi";
import MarketplaceCard from "./MarketplaceCard";
import BuyDialog from "./BuyDialog";
import ListForSaleDialog from "./ListForSaleDialog";
import BulkListDialog from "./BulkListDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Plus,
  Search,
  X,
  Clock,
  Upload,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export default function MarketplaceTab() {
  const { isConnected, address } = useWeb3ModalAccount();
  const { getAuthCredentials } = useAuth();
  const {
    listings,
    pagination,
    recentSales,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  } = useMarketplace();

  const [searchInput, setSearchInput] = useState("");
  const [buyTarget, setBuyTarget] = useState<MarketplaceListing | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== (filters.q || "")) {
        setFilters({ q: searchInput || undefined });
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const handleBuy = (listing: MarketplaceListing) => {
    if (!isConnected) return;
    setBuyTarget(listing);
    setBuyOpen(true);
  };

  const handleDelist = async (listing: MarketplaceListing) => {
    if (!isConnected) return;
    setActionLoading(listing.id);
    try {
      const creds = await getAuthCredentials();
      await delistName(creds, { listingId: listing.id });
      toast.success(`${listing.name}/ has been delisted`);
      refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delist";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditPrice = async (listing: MarketplaceListing) => {
    if (!isConnected) return;
    // If not currently editing this listing, enter edit mode
    if (editingPrice !== listing.id) {
      setEditingPrice(listing.id);
      setEditPriceValue(String(listing.priceHns));
      return;
    }
    // Already editing — submit the new price
    const priceNum = parseFloat(editPriceValue);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error("Please enter a valid price greater than 0");
      return;
    }

    setActionLoading(listing.id);
    try {
      const creds = await getAuthCredentials();
      await updateListingPrice(creds, { listingId: listing.id, newPriceHns: priceNum });
      toast.success(`Price updated to ${priceNum} HNS`);
      setEditingPrice(null);
      setEditPriceValue("");
      refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to update price";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const isMine = (listing: MarketplaceListing) =>
    isConnected && address && listing.sellerAddress.toLowerCase() === address.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Marketplace Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  setFilters({ q: searchInput || undefined });
                }
              }}
              placeholder="Search listings..."
              className="pl-9 pr-9 h-10 rounded-xl bg-background/50 backdrop-blur-sm border-halcyon-teal/20 focus:shadow-[0_0_0_2px_hsl(var(--halcyon-teal)/0.3)] transition-shadow"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-4 rounded-xl border-halcyon-teal/20 hover:bg-halcyon-teal/10"
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              setFilters({ q: searchInput || undefined });
            }}
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="w-36">
            <Select
              value={filters.sort || "newest"}
              onValueChange={(v) => setFilters({ sort: v })}
            >
              <SelectTrigger className="h-10 text-xs rounded-lg bg-background/50 border-halcyon-teal/15">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price-low">Price: Low</SelectItem>
                <SelectItem value="price-high">Price: High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isConnected && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-10 rounded-lg text-xs"
                onClick={() => setBulkOpen(true)}
              >
                <Upload className="w-4 h-4 mr-1" />
                Bulk List
              </Button>
              <Button
                size="sm"
                className="h-10 btn-halcyon rounded-lg font-semibold"
                onClick={() => setListOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                List Name
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* Listings Grid */}
      {loading && listings.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-40 rounded-xl" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="glass-card text-center py-16 px-6">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-halcyon-teal/40" />
          <p className="text-lg font-semibold text-foreground">No listings found</p>
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setListOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Be the first to list
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auction-grid-enter">
            {listings.map((listing) => (
              <MarketplaceCard
                key={listing.id}
                listing={listing}
                onBuy={handleBuy}
                isMine={isMine(listing)}
                onDelist={handleDelist}
                onEditPrice={handleEditPrice}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setFilters({ page: pagination.page - 1 })}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters({ page: pagination.page + 1 })}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Recent Sales */}
      {recentSales.length > 0 && (
        <div className="pt-4 border-t border-halcyon-teal/10">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Clock className="w-4 h-4 text-green-400" />
            Recent Sales
          </h2>
          <div className="space-y-2">
            {recentSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2 text-xs"
              >
                <span className="font-mono font-medium">{sale.name}/</span>
                <span className="text-amber-400 font-bold">
                  {sale.priceHns.toLocaleString()} HNS
                </span>
                {sale.soldAt && (
                  <span className="text-muted-foreground">
                    {new Date(sale.soldAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <BuyDialog
        listing={buyTarget}
        open={buyOpen}
        onOpenChange={setBuyOpen}
        getAuthCredentials={getAuthCredentials}
        onSuccess={refresh}
      />
      <ListForSaleDialog
        open={listOpen}
        onOpenChange={setListOpen}
        getAuthCredentials={getAuthCredentials}
        onSuccess={refresh}
      />
      {bulkOpen && (
        <BulkListDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          getAuthCredentials={getAuthCredentials}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}

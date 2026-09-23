"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useHnsWallet } from "@/hooks/useHnsWallet";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  delistName,
  updateListingPrice,
  getMarketplaceListings,
  type MarketplaceListing,
} from "@/services/auctionHouseApi";
import {
  getWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
  type AuctionEntry,
} from "@/services/hnsWalletApi";
import { decodePunycode, displayName } from "@/lib/punycode";
import TransferDialog from "./TransferDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Gavel,
  RefreshCw,
  Loader2,
  Eye,
  Star,
  Trophy,
  Tag,
  Trash2,
  Wallet,
  ArrowRight,
  Send,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

function AuctionBidRow({ bid }: { bid: AuctionEntry }) {
  const stateColor: Record<string, string> = {
    OPENING: "secondary",
    BIDDING: "success",
    REVEAL: "warning",
    CLOSED: "destructive",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/auction-house/${encodeURIComponent(bid.name)}`}
          className="font-mono text-sm font-medium hover:text-amber-400 truncate"
        >
          {displayName(bid.name)}/
          {decodePunycode(bid.name) && (
            <span className="text-[9px] text-muted-foreground/50 ml-1">{bid.name}</span>
          )}
        </Link>
        <Badge
          variant={(stateColor[bid.state] as "success" | "warning" | "secondary" | "destructive") || "default"}
          className="text-[10px]"
        >
          {bid.state}
        </Badge>
      </div>
      <Link href={`/auction-house/${encodeURIComponent(bid.name)}`}>
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
          {bid.state === "BIDDING" ? "Bid" : bid.state === "REVEAL" ? "Reveal" : "View"}
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

export default function ActivityTab() {
  const { isConnected, address } = useWeb3ModalAccount();
  const { getAuthCredentials } = useAuth();
  const { auctions, names, loading: walletLoading, refresh: refreshWallet } = useHnsWallet();

  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");

  const fetchMyData = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoadingExtra(true);
    try {
      const creds = await getAuthCredentials();

      const [listingsRes, watchRes] = await Promise.all([
        getMarketplaceListings({ limit: 100 }).catch(() => ({ listings: [] as MarketplaceListing[], pagination: { page: 1, limit: 100, total: 0, pages: 0 } })),
        getWatchlist(creds).catch(() => ({ success: false, entries: [] as WatchlistEntry[] })),
      ]);

      setMyListings(
        listingsRes.listings.filter(
          (l) => l.sellerAddress.toLowerCase() === address.toLowerCase()
        )
      );
      setWatchlist(watchRes.success && Array.isArray(watchRes.entries) ? watchRes.entries : []);
    } catch {
      // Silently fail — sections show empty
    } finally {
      setLoadingExtra(false);
    }
  }, [isConnected, address, getAuthCredentials]);

  useEffect(() => {
    fetchMyData();
  }, [fetchMyData]);

  const refreshAll = () => {
    refreshWallet();
    fetchMyData();
  };

  if (!isConnected) {
    return (
      <div className="glass-card text-center py-16 px-6">
        <Wallet className="w-12 h-12 mx-auto mb-3 text-halcyon-teal/40" />
        <h2 className="text-lg font-semibold mb-1">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your Flare wallet to see your auction activity
        </p>
        <w3m-button />
      </div>
    );
  }

  const loading = walletLoading || loadingExtra;

  // Split auctions into active bids vs won — exclude OPENING since no bids yet
  const activeBids = (auctions || []).filter(
    (a) => a.state !== "CLOSED" && a.state !== "REGISTER" && a.state !== "OPENING"
  );
  const wonAuctions = (names || []).filter(
    (n) => n.state === "closed" || n.phase === "REGISTER" || n.nextAction === "finalize"
  );

  const handleRemoveWatch = async (name: string) => {
    try {
      const creds = await getAuthCredentials();
      await removeFromWatchlist(creds, name);
      setWatchlist((prev) => prev.filter((w) => w.name !== name));
      toast.success(`Removed ${name}/ from watchlist`);
    } catch {
      toast.error("Failed to remove from watchlist");
    }
  };

  const handleDelist = async (listing: MarketplaceListing) => {
    try {
      const creds = await getAuthCredentials();
      await delistName(creds, { listingId: listing.id });
      toast.success(`${listing.name}/ has been delisted`);
      fetchMyData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delist";
      toast.error(msg);
    }
  };

  const handleEditPrice = async (listing: MarketplaceListing) => {
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
    try {
      const creds = await getAuthCredentials();
      await updateListingPrice(creds, { listingId: listing.id, newPriceHns: priceNum });
      toast.success(`Price updated to ${priceNum} HNS`);
      setEditingPrice(null);
      setEditPriceValue("");
      fetchMyData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to update price";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Your auction bids, marketplace listings, and watchlist
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
            <Send className="w-4 h-4 mr-1" />
            Transfer
          </Button>
          <Button variant="ghost" size="sm" onClick={refreshAll} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={["bids", "listings", "watchlist"]}>
          {/* My Bids */}
          <AccordionItem value="bids" className="border-border/50">
            <AccordionTrigger className="hover:no-underline">
              <span className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-amber-400" />
                My Bids
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {activeBids.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {activeBids.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No active bids. Browse the Discover tab to find names to bid on.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeBids.map((bid) => (
                    <AuctionBidRow key={bid.name} bid={bid} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* My Listings */}
          <AccordionItem value="listings" className="border-border/50">
            <AccordionTrigger className="hover:no-underline">
              <span className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-pink-400" />
                My Listings
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {myListings.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {myListings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No active listings. Go to the Marketplace tab to list a name for sale.
                </p>
              ) : (
                <div className="space-y-2">
                  {myListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Link
                          href={`/auction-house/${encodeURIComponent(listing.name)}`}
                          className="font-mono text-sm font-medium hover:text-amber-400 truncate"
                        >
                          {displayName(listing.name)}/
                          {decodePunycode(listing.name) && (
                            <span className="text-[9px] text-muted-foreground/50 ml-1">{listing.name}</span>
                          )}
                        </Link>
                        {editingPrice === listing.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleEditPrice(listing);
                                if (e.key === "Escape") { setEditingPrice(null); setEditPriceValue(""); }
                              }}
                              className="h-6 w-24 text-xs px-2 rounded bg-background/50 border-halcyon-teal/20"
                              autoFocus
                            />
                            <span className="text-[10px] text-muted-foreground">HNS</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleEditPrice(listing)}
                            >
                              <Check className="w-3 h-3 text-green-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => { setEditingPrice(null); setEditPriceValue(""); }}
                            >
                              <X className="w-3 h-3 text-red-400" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="warning" className="shrink-0 text-[10px]">
                            {listing.priceHns.toLocaleString()} HNS
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {editingPrice !== listing.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleEditPrice(listing)}
                          >
                            Edit Price
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-[10px] px-2"
                          onClick={() => handleDelist(listing)}
                        >
                          Delist
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Won Auctions */}
          <AccordionItem value="won" className="border-border/50">
            <AccordionTrigger className="hover:no-underline">
              <span className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-green-400" />
                Won Auctions
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {wonAuctions.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {wonAuctions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No won auctions pending finalization.
                </p>
              ) : (
                <div className="space-y-2">
                  {wonAuctions.map((name) => (
                    <div
                      key={name.name}
                      className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Link
                          href={`/auction-house/${encodeURIComponent(name.name)}`}
                          className="font-mono text-sm font-medium hover:text-amber-400 truncate"
                        >
                          {name.name}/
                        </Link>
                        <Badge
                          variant={name.nextAction === "finalize" ? "warning" : "success"}
                          className="text-[10px]"
                        >
                          {name.nextAction || name.phase}
                        </Badge>
                      </div>
                      {name.nextAction === "finalize" && (
                        <Link href="/wallet">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
                            Finalize
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Watchlist */}
          <AccordionItem value="watchlist" className="border-border/50">
            <AccordionTrigger className="hover:no-underline">
              <span className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                Watchlist
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {(watchlist || []).length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {!watchlist || watchlist.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Your watchlist is empty. Add names from the Discover tab or name detail pages.
                </p>
              ) : (
                <div className="space-y-2">
                  {watchlist.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Link
                          href={`/auction-house/${encodeURIComponent(entry.name)}`}
                          className="font-mono text-sm font-medium hover:text-amber-400 truncate"
                        >
                          {displayName(entry.name)}/
                          {decodePunycode(entry.name) && (
                            <span className="text-[9px] text-muted-foreground/50 ml-1">{entry.name}</span>
                          )}
                        </Link>
                        {entry.phase && (
                          <Badge variant="secondary" className="text-[10px]">
                            {entry.phase}
                          </Badge>
                        )}
                        {entry.timeRemainingHuman && (
                          <span className="text-[10px] text-muted-foreground">
                            {entry.timeRemainingHuman}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Link href={`/auction-house/${encodeURIComponent(entry.name)}`}>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2">
                            <Eye className="w-3 h-3" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
                          onClick={() => handleRemoveWatch(entry.name)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {transferOpen && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          getAuthCredentials={getAuthCredentials}
          onSuccess={refreshAll}
        />
      )}
    </div>
  );
}

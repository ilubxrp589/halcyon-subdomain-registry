"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { useCurrencySymbol, getPublicProvider } from "@/lib/web3modal";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Clock,
  Tag,
  Gavel,
  User,
  Calendar,
  DollarSign,
  RefreshCw,
  CheckCircle,
  XCircle,
  Send,
} from "lucide-react";
import { WalletButton } from "@/components/WalletButton";
import { DomainShareButton } from "@/components/DomainShareButton";

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE;
const NFT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_NFT;

const MARKETPLACE_ABI = [
  "function getListing(uint256 listingId) view returns (tuple(uint256 listingId, uint256 tokenId, address seller, uint256 price, uint256 endTime, uint8 listingType, uint8 status, address highestBidder, uint256 highestBid, uint256 createdAt))",
  "function getOffer(uint256 offerId) view returns (tuple(uint256 offerId, uint256 tokenId, address offerer, uint256 amount, uint256 expiresAt, bool accepted, bool cancelled))",
  "function getTokenOffers(uint256 tokenId) view returns (uint256[])",
  "function buyNow(uint256 listingId) payable",
  "function placeBid(uint256 listingId) payable",
  "function settleAuction(uint256 listingId)",
  "function makeOffer(uint256 tokenId, uint256 expiresIn) payable returns (uint256)",
  "function cancelListing(uint256 listingId)",
  "function minBidIncrementBps() view returns (uint256)",
];

const NFT_ABI = [
  "function getFullDomain(uint256 tokenId) view returns (string)",
  "function subdomains(uint256 tokenId) view returns (string tld, string subdomain, uint256 registeredAt, uint256 expiresAt, bool dnsActive, uint256 pricePaidFLR, uint256 pricePaidUSD)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getDomainStatus(uint256 tokenId) view returns (uint8)",
];

interface Listing {
  listingId: bigint;
  tokenId: bigint;
  seller: string;
  price: bigint;
  endTime: bigint;
  listingType: number;
  status: number;
  highestBidder: string;
  highestBid: bigint;
  createdAt: bigint;
}

interface DomainMeta {
  tld: string;
  subdomain: string;
  registeredAt: bigint;
  expiresAt: bigint;
  dnsActive: boolean;
  pricePaidFLR: bigint;
  pricePaidUSD: bigint;
}

interface Offer {
  offerId: bigint;
  tokenId: bigint;
  offerer: string;
  amount: bigint;
  expiresAt: bigint;
  accepted: boolean;
  cancelled: boolean;
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const currencySymbol = useCurrencySymbol();

  const [listing, setListing] = useState<Listing | null>(null);
  const [domainMeta, setDomainMeta] = useState<DomainMeta | null>(null);
  const [fullDomain, setFullDomain] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [minBidIncrement, setMinBidIncrement] = useState(BigInt(500));

  const fetchListing = useCallback(async () => {
    if (!listingId) return;

    try {
      setLoading(true);
      // Use public provider for reading - doesn't require wallet connection
      const provider = getPublicProvider();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, provider);
      const nft = new Contract(NFT_ADDRESS!, NFT_ABI, provider);

      const listingData = await marketplace.getListing(listingId);
      setListing(listingData);

      const domain = await nft.getFullDomain(listingData.tokenId);
      setFullDomain(domain);

      const meta = await nft.subdomains(listingData.tokenId);
      setDomainMeta(meta);

      // Fetch min bid increment
      const increment = await marketplace.minBidIncrementBps();
      setMinBidIncrement(increment);

      // Fetch offers for this token
      const offerIds = await marketplace.getTokenOffers(listingData.tokenId);
      const offerData: Offer[] = [];
      for (const offerId of offerIds) {
        const offer = await marketplace.getOffer(offerId);
        if (!offer.accepted && !offer.cancelled && offer.expiresAt > BigInt(Date.now() / 1000)) {
          offerData.push(offer);
        }
      }
      setOffers(offerData.sort((a, b) => Number(b.amount - a.amount)));
    } catch (error) {
      console.error("Error fetching listing:", error);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const handleBuyNow = async () => {
    if (!walletProvider || !listing) return;

    try {
      setActionLoading(true);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      const tx = await marketplace.buyNow(listing.listingId, { value: listing.price });
      await tx.wait();

      router.push("/dashboard");
    } catch (error: unknown) {
      console.error("Buy error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!walletProvider || !listing || !bidAmount) return;

    try {
      setActionLoading(true);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      const tx = await marketplace.placeBid(listing.listingId, {
        value: parseEther(bidAmount),
      });
      await tx.wait();

      await fetchListing();
      setBidAmount("");
    } catch (error: unknown) {
      console.error("Bid error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettleAuction = async () => {
    if (!walletProvider || !listing) return;

    try {
      setActionLoading(true);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      const tx = await marketplace.settleAuction(listing.listingId);
      await tx.wait();

      router.push("/marketplace");
    } catch (error: unknown) {
      console.error("Settle error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMakeOffer = async () => {
    if (!walletProvider || !listing || !offerAmount) return;

    try {
      setActionLoading(true);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      const expiresIn = 7 * 24 * 60 * 60; // 7 days
      const tx = await marketplace.makeOffer(listing.tokenId, expiresIn, {
        value: parseEther(offerAmount),
      });
      await tx.wait();

      setShowOfferDialog(false);
      setOfferAmount("");
      await fetchListing();
    } catch (error: unknown) {
      console.error("Offer error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelListing = async () => {
    if (!walletProvider || !listing) return;

    try {
      setActionLoading(true);
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS!, MARKETPLACE_ABI, signer);

      const tx = await marketplace.cancelListing(listing.listingId);
      await tx.wait();

      router.push("/dashboard");
    } catch (error: unknown) {
      console.error("Cancel error:", error);
      const message = error instanceof Error ? (error as Error & { reason?: string }).reason || error.message : "Transaction failed";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const getMinBid = () => {
    if (!listing) return BigInt(0);
    if (listing.highestBid === BigInt(0)) return listing.price;
    return listing.highestBid + (listing.highestBid * minBidIncrement) / BigInt(10000);
  };

  const formatTimeRemaining = (endTime: bigint) => {
    if (endTime === BigInt(0)) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (endTime <= now) return "Ended";

    const diff = Number(endTime - now);
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const isAuctionEnded = Number(listing?.listingType) === 1 && (listing?.endTime ?? BigInt(0)) <= BigInt(Math.floor(Date.now() / 1000));
  const isSeller = listing?.seller?.toLowerCase() === address?.toLowerCase();
  const isHighestBidder = listing?.highestBidder?.toLowerCase() === address?.toLowerCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900/20 to-slate-900 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!listing || Number(listing.status) !== 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900/20 to-slate-900 flex items-center justify-center">
        <Card className="p-8 bg-white/5 border-white/10 text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Listing Not Found</h2>
          <p className="text-gray-400 mb-4">This listing may have been sold or cancelled.</p>
          <Link href="/marketplace">
            <Button>Back to Marketplace</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900/20 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Link href="/marketplace" className="inline-flex items-center text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Marketplace
        </Link>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Domain Preview */}
          <Card className="bg-white/5 border-white/10 overflow-hidden">
            <div className="aspect-[4/5] min-h-[500px] bg-gradient-to-br from-amber-600/30 to-amber-600/30 relative">
              {fullDomain ? (
                <Image
                  src={`/api/proxy/nft/image/${fullDomain}`}
                  alt={fullDomain}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-white mb-2">{domainMeta?.subdomain}</div>
                    <div className="text-2xl text-amber-400">.{domainMeta?.tld}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Domain Info */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Full Domain</span>
                <span className="text-white font-mono">{fullDomain}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">DNS Status</span>
                <Badge className={domainMeta?.dnsActive ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}>
                  {domainMeta?.dnsActive ? "Active" : "Pending"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Original Price</span>
                <span className="text-white">{formatEther(domainMeta?.pricePaidFLR || BigInt(0))} {currencySymbol}</span>
              </div>
              {/* Share Button */}
              {fullDomain && (
                <div className="pt-2 border-t border-white/10">
                  <DomainShareButton
                    domain={fullDomain}
                    variant="outline"
                    size="default"
                    showLabel
                    className="w-full border-white/10 text-white hover:bg-white/5"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Listing Details & Actions */}
          <div className="space-y-6">
            {/* Listing Type Badge */}
            <div className="flex items-center gap-3">
              <Badge
                className={
                  Number(listing.listingType) === 0
                    ? "bg-emerald-500/20 text-emerald-400 text-lg px-4 py-1"
                    : "bg-amber-500/20 text-amber-400 text-lg px-4 py-1"
                }
              >
                {Number(listing.listingType) === 0 ? (
                  <>
                    <Tag className="h-4 w-4 mr-2" />
                    Fixed Price
                  </>
                ) : (
                  <>
                    <Gavel className="h-4 w-4 mr-2" />
                    Auction
                  </>
                )}
              </Badge>
              {isAuctionEnded && (
                <Badge className="bg-red-500/20 text-red-400">Ended</Badge>
              )}
            </div>

            {/* Price Card */}
            <Card className="p-6 bg-white/5 border-white/10">
              <div className="text-gray-400 mb-1">
                {Number(listing.listingType) === 0 ? "Price" : listing.highestBid > BigInt(0) ? "Current Bid" : "Starting Price"}
              </div>
              <div className="text-4xl font-bold text-white mb-4">
                {formatEther(Number(listing.listingType) === 1 && listing.highestBid > BigInt(0) ? listing.highestBid : listing.price)} {currencySymbol}
              </div>

              {/* Auction Timer */}
              {Number(listing.listingType) === 1 && (
                <div className="flex items-center text-gray-400 mb-4">
                  <Clock className="h-5 w-5 mr-2" />
                  {isAuctionEnded ? "Auction ended" : `Ends in ${formatTimeRemaining(listing.endTime)}`}
                </div>
              )}

              {/* Highest Bidder */}
              {Number(listing.listingType) === 1 && listing.highestBidder !== "0x0000000000000000000000000000000000000000" && (
                <div className="flex items-center text-gray-400 mb-4">
                  <User className="h-5 w-5 mr-2" />
                  Highest Bidder: {listing.highestBidder.slice(0, 6)}...{listing.highestBidder.slice(-4)}
                  {isHighestBidder && <Badge className="ml-2 bg-emerald-500/20 text-emerald-400">You</Badge>}
                </div>
              )}

              {/* Fee Breakdown */}
              {listing && (
                <div className="bg-zinc-800/50 rounded-lg p-4 mb-4 text-sm">
                  <h4 className="text-zinc-300 font-medium mb-2">Fee Breakdown</h4>
                  {(() => {
                    const price = Number(formatEther(listing.price));
                    const royalty = price * 0.025;
                    const platformFee = price * 0.025;
                    const sellerReceives = price - royalty - platformFee;
                    return (
                      <div className="space-y-1 text-zinc-400 font-mono text-xs">
                        <div className="flex justify-between">
                          <span>Creator Royalty (2.5%)</span>
                          <span>{royalty.toFixed(2)} FLR</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Platform Fee (2.5%)</span>
                          <span>{platformFee.toFixed(2)} FLR</span>
                        </div>
                        <div className="border-t border-zinc-700 pt-1 flex justify-between text-zinc-200">
                          <span>Seller Receives</span>
                          <span>{sellerReceives.toFixed(2)} FLR</span>
                        </div>
                        <p className="text-zinc-500 mt-2 font-sans text-xs">
                          2.5% royalty contributes to FTSO delegation rewards for all domain holders.
                          Part of HSR&apos;s 8.5% community payback commitment.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Actions */}
              {!isSeller && isConnected && (
                <div className="space-y-3">
                  {Number(listing.listingType) === 0 ? (
                    <Button
                      className="w-full bg-amber-600 hover:bg-amber-700 text-lg py-6"
                      onClick={handleBuyNow}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : "Buy Now"}
                    </Button>
                  ) : isAuctionEnded ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-lg py-6"
                      onClick={handleSettleAuction}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : "Settle Auction"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <Input
                          type="number"
                          placeholder={`Min: ${formatEther(getMinBid())} ${currencySymbol}`}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="bg-white/5 border-white/10 text-white"
                        />
                        <Button
                          className="bg-amber-600 hover:bg-amber-700"
                          onClick={handlePlaceBid}
                          disabled={actionLoading || !bidAmount}
                        >
                          {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Place Bid"}
                        </Button>
                      </div>
                      <p className="text-sm text-gray-400">
                        Minimum bid: {formatEther(getMinBid())} {currencySymbol} ({Number(minBidIncrement) / 100}% increment)
                      </p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full border-white/10 text-white"
                    onClick={() => setShowOfferDialog(true)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Make Offer
                  </Button>
                </div>
              )}

              {/* Seller Actions */}
              {isSeller && (
                <div className="space-y-3">
                  {Number(listing.listingType) === 0 || (Number(listing.listingType) === 1 && listing.highestBidder === "0x0000000000000000000000000000000000000000") ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleCancelListing}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Cancel Listing"}
                    </Button>
                  ) : isAuctionEnded ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleSettleAuction}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Settle Auction"}
                    </Button>
                  ) : (
                    <p className="text-center text-gray-400">Auction in progress with bids</p>
                  )}
                </div>
              )}

              {!isConnected && (
                <div className="text-center">
                  <p className="text-gray-400 mb-4">Connect your wallet to purchase</p>
                  <WalletButton />
                </div>
              )}
            </Card>

            {/* Seller Info */}
            <Card className="p-6 bg-white/5 border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">Seller</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-500" />
                <div>
                  <div className="text-white font-mono">
                    {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
                  </div>
                  <div className="text-gray-400 text-sm">
                    Listed {new Date(Number(listing.createdAt) * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Card>

            {/* Active Offers */}
            {offers.length > 0 && (
              <Card className="p-6 bg-white/5 border-white/10">
                <h3 className="text-lg font-semibold text-white mb-4">Active Offers</h3>
                <div className="space-y-3">
                  {offers.slice(0, 5).map((offer) => (
                    <div key={offer.offerId.toString()} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <div className="text-white font-medium">{formatEther(offer.amount)} {currencySymbol}</div>
                        <div className="text-gray-400 text-sm">
                          {offer.offerer.slice(0, 6)}...{offer.offerer.slice(-4)}
                        </div>
                      </div>
                      <div className="text-gray-400 text-sm">
                        Expires {new Date(Number(offer.expiresAt) * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Make Offer Dialog */}
      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Make an Offer</DialogTitle>
            <DialogDescription className="text-gray-400">
              Your offer will be valid for 7 days. The seller can accept at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Offer Amount ({currencySymbol})</label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowOfferDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={handleMakeOffer}
                disabled={actionLoading || !offerAmount}
              >
                {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Submit Offer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

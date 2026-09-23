"use client";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  Tag,
  Gavel,
  ExternalLink,
  Eye,
  ShoppingCart,
  Flame,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DomainShareButton } from "@/components/DomainShareButton";

interface Listing {
  listingId: number;
  tokenId: string;
  seller: string;
  price: number;
  endTime: number;
  listingType: number;
  status: number;
  highestBidder: string;
  highestBid: number;
  createdAt: number;
  fullDomain?: string;
  subdomain?: string;
  tld?: string;
  imageUrl?: string | null;
}

interface ListingCardProps {
  listing: Listing;
  currencySymbol: string;
  nftAddress: string;
  currentAddress?: string;
  isConnected: boolean;
  isBuying: boolean;
  onBuyNow: (listing: Listing) => void;
}

export function ListingCard({
  listing,
  currencySymbol,
  nftAddress,
  currentAddress,
  isConnected,
  isBuying,
  onBuyNow,
}: ListingCardProps) {
  const isOwner = listing.seller === currentAddress;
  const isAuction = listing.listingType === 1;
  const currentPrice = isAuction && listing.highestBid > 0
    ? listing.highestBid
    : listing.price;

  // Check if listing has recent activity (created within last 24 hours or has bids)
  const isHot = listing.highestBid > listing.price ||
    // eslint-disable-next-line react-hooks/purity -- Date.now needed for time-based UI
    (listing.createdAt > Date.now() / 1000 - 86400);

  // Calculate price increase percentage for auctions with bids
  const priceIncreasePercent = isAuction && listing.highestBid > listing.price
    ? ((listing.highestBid - listing.price) / listing.price) * 100
    : 0;

  const getTimeRemaining = (endTime: number) => {
    if (endTime === 0) return null;
    // eslint-disable-next-line react-hooks/purity -- Date.now needed for countdown
    const now = Math.floor(Date.now() / 1000);
    if (endTime <= now) return { text: "Ended", status: "ended" as const };

    const diff = endTime - now;
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    let text: string;
    let status: "safe" | "warning" | "critical";

    if (hours > 24) {
      text = `${Math.floor(hours / 24)}d ${hours % 24}h`;
      status = "safe";
    } else if (hours >= 1) {
      text = `${hours}h ${minutes}m`;
      status = hours > 1 ? "safe" : "warning";
    } else if (minutes >= 15) {
      text = `${minutes}m`;
      status = "warning";
    } else {
      text = `${minutes}m`;
      status = "critical";
    }

    return { text, status };
  };

  const timeInfo = isAuction ? getTimeRemaining(listing.endTime) : null;

  const getTimeColorClass = (status: "safe" | "warning" | "critical" | "ended") => {
    switch (status) {
      case "safe":
        return "time-safe";
      case "warning":
        return "time-warning";
      case "critical":
        return "time-critical";
      case "ended":
        return "text-gray-500";
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl",
        "bg-gradient-to-br from-white/5 to-white/0",
        "border border-white/10 hover:border-amber-500/50",
        "transition-all duration-300",
        "card-hover-lift"
      )}
    >
      {/* Status Badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {isHot && (
          <Badge className="bg-orange-500/90 text-white border-0 shadow-lg">
            <Flame className="h-3 w-3 mr-1" />
            Hot
          </Badge>
        )}
      </div>

      {/* Listing Type Badge */}
      <div className="absolute top-3 right-3 z-10">
        <Badge
          className={cn(
            "shadow-lg border-0",
            isAuction
              ? "bg-amber-500/90 text-white"
              : "bg-emerald-500/90 text-white"
          )}
        >
          {isAuction ? (
            <>
              <Gavel className="h-3 w-3 mr-1" />
              Auction
            </>
          ) : (
            <>
              <Tag className="h-3 w-3 mr-1" />
              Fixed
            </>
          )}
        </Badge>
      </div>

      {/* NFT Image */}
      <div className="relative aspect-square overflow-hidden rounded-t-xl">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.fullDomain || "NFT"}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            className={cn(
              "object-cover transition-transform duration-500",
              "group-hover:scale-105"
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full p-6 bg-gradient-to-br from-amber-600/20 to-amber-600/20">
            <div className="text-center">
              <div className="text-2xl font-bold text-white break-all">
                {listing.subdomain}
              </div>
              <div className="text-amber-400">.{listing.tld}</div>
            </div>
          </div>
        )}

        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Listing Info */}
      <div className="p-4">
        {/* Domain Name */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white font-medium truncate flex-1">
            {listing.fullDomain}
          </span>
        </div>

        {/* Price Section */}
        <div className="mb-3">
          <div className="text-gray-400 text-sm">
            {isAuction ? "Current Bid" : "Price"}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">
              {currentPrice.toFixed(2)}
            </span>
            <span className="text-sm text-amber-400">{currencySymbol}</span>
            {/* Price change indicator for auctions with bids above starting price */}
            {priceIncreasePercent > 0 && (
              <span className="text-emerald-400 text-sm flex items-center ml-1">
                <TrendingUp className="h-3 w-3 mr-0.5" />
                +{priceIncreasePercent.toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* Auction Timer with Color Coding */}
        {isAuction && timeInfo && (
          <div
            className={cn(
              "flex items-center text-sm mb-3 font-medium",
              getTimeColorClass(timeInfo.status)
            )}
          >
            <Clock className="h-4 w-4 mr-1" />
            {timeInfo.text}
            {timeInfo.status === "critical" && (
              <span className="ml-2 text-xs bg-red-500/20 px-2 py-0.5 rounded">
                Ending soon!
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isAuction ? (
            <Link href={`/marketplace/${listing.listingId}`} className="flex-1">
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                disabled={!isConnected || timeInfo?.status === "ended"}
              >
                {!isConnected
                  ? "Connect to Bid"
                  : timeInfo?.status === "ended"
                  ? "Auction Ended"
                  : "Place Bid"}
              </Button>
            </Link>
          ) : (
            <>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={() => onBuyNow(listing)}
                disabled={isBuying || isOwner || !isConnected}
              >
                {isBuying ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing
                  </span>
                ) : !isConnected ? (
                  "Connect to Buy"
                ) : isOwner ? (
                  "Your Listing"
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    Buy Now
                  </>
                )}
              </Button>
              <Link href={`/marketplace/${listing.listingId}`}>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-white/10 hover:bg-white/10"
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
            </>
          )}
          {listing.fullDomain && (
            <DomainShareButton
              domain={listing.fullDomain}
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 border-white/10 hover:bg-white/10"
            />
          )}
          <a
            href={`https://coston2-explorer.flare.network/token/${nftAddress}/instance/${listing.tokenId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="icon"
              className="border-white/10 hover:bg-white/10"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

// Skeleton Loading Card
export function ListingCardSkeleton() {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
      {/* Image Skeleton */}
      <Skeleton className="aspect-square" />

      {/* Content Skeleton */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>

        {/* Price */}
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
        </div>

        {/* Button */}
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

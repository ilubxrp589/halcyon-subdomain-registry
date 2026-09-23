"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MarketplaceListing } from "@/services/auctionHouseApi";
import { ShoppingBag, Clock } from "lucide-react";
import { decodePunycode, displayName } from "@/lib/punycode";

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MarketplaceCard({
  listing,
  onBuy,
  isMine,
  onDelist,
  onEditPrice,
}: {
  listing: MarketplaceListing;
  onBuy?: (listing: MarketplaceListing) => void;
  isMine?: boolean;
  onDelist?: (listing: MarketplaceListing) => void;
  onEditPrice?: (listing: MarketplaceListing) => void;
}) {
  return (
    <div className="auction-card p-5">
      {/* Name + Price */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-mono font-bold text-lg text-foreground truncate">
            {displayName(listing.name)}/
          </h3>
          {decodePunycode(listing.name) && (
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate block">
              {listing.name}
            </span>
          )}
        </div>
        <Badge className="shrink-0 border-halcyon-teal/30 bg-halcyon-teal/10 text-halcyon-teal font-bold">
          {listing.priceHns.toLocaleString()} HNS
        </Badge>
      </div>

      {/* Description */}
      {listing.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {listing.description}
        </p>
      )}

      {/* Seller + time */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3">
        <span className="truncate">
          by {listing.sellerAddress.slice(0, 10)}...
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          <Clock className="w-3 h-3" />
          {timeAgo(listing.listedAt)}
        </span>
      </div>

      {/* Actions */}
      <div className="border-t border-halcyon-teal/10 pt-3">
        {isMine ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => onEditPrice?.(listing)}
            >
              Edit Price
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 h-8 text-xs"
              onClick={() => onDelist?.(listing)}
            >
              Delist
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="default"
            className="w-full h-8 text-xs btn-halcyon rounded-lg font-semibold"
            onClick={() => onBuy?.(listing)}
          >
            <ShoppingBag className="w-3 h-3 mr-1" />
            Buy Now
          </Button>
        )}
      </div>
    </div>
  );
}

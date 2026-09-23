"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CountdownTimer from "@/app/wallet/components/CountdownTimer";
import type { Auction } from "@/services/auctionHouseApi";
import { Gavel, Eye, Users, ArrowRight } from "lucide-react";
import { decodePunycode } from "@/lib/punycode";
import { BLOCK_TIME_MS } from "@/lib/constants";

/** Returns true if this auction's current phase timer has expired */
export function isAuctionExpired(auction: Auction): boolean {
  const target = getTargetHeight(auction);
  if (!target) return auction.state === "CLOSED" || auction.state === "TRANSFER" || auction.state === "REVOKE";
  return auction.currentHeight >= target;
}

function getTargetHeight(auction: Auction): number | null {
  switch (auction.state) {
    case "OPENING":
      return auction.biddingEndsHeight ? auction.biddingEndsHeight - 720 : null;
    case "BIDDING":
      return auction.biddingEndsHeight;
    case "REVEAL":
      return auction.revealEndsHeight;
    default:
      return null;
  }
}

function getPhaseLabel(state: string): string {
  switch (state) {
    case "OPENING":
      return "Opening";
    case "BIDDING":
      return "Bidding";
    case "REVEAL":
      return "Reveal";
    case "CLOSED":
      return "Closed";
    default:
      return state;
  }
}

function getStateBadgeVariant(state: string): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (state) {
    case "OPENING":
      return "secondary";
    case "BIDDING":
      return "success";
    case "REVEAL":
      return "warning";
    case "CLOSED":
      return "destructive";
    default:
      return "default";
  }
}

function getStateCardClass(state: string): string {
  switch (state) {
    case "BIDDING": return "auction-card-bidding";
    case "REVEAL": return "auction-card-reveal";
    case "OPENING": return "auction-card-opening";
    case "CLOSED": return "auction-card-closed";
    default: return "";
  }
}

export default function AuctionCard({ auction, variant = "grid" }: { auction: Auction; variant?: "grid" | "list" }) {
  const targetHeight = getTargetHeight(auction);
  const blocksRemaining = targetHeight ? targetHeight - auction.currentHeight : 0;
  const elapsedSinceUpdate = auction.updatedAt ? Date.now() - new Date(auction.updatedAt).getTime() : 0;
  const timeRemainingMs = Math.max(0, blocksRemaining * BLOCK_TIME_MS - elapsedSinceUpdate);
  const phase = getPhaseLabel(auction.state);
  const unicodeName = decodePunycode(auction.name);

  if (variant === "list") {
    const accentColor =
      auction.state === "BIDDING" ? "bg-amber-500" :
      auction.state === "REVEAL" ? "bg-orange-400" :
      auction.state === "OPENING" ? "bg-blue-400/60" :
      "bg-muted-foreground/30";

    return (
      <Link
        href={`/auction-house/${encodeURIComponent(auction.name)}`}
        className="block group"
      >
        <div className={`auction-card ${getStateCardClass(auction.state)} flex items-center gap-0 overflow-hidden`}>
          {/* Left accent bar */}
          <div className={`w-1 self-stretch shrink-0 ${accentColor}`} />

          <div className="flex items-center gap-4 px-4 py-3 flex-1 min-w-0">
            {/* Name */}
            <div className="min-w-0 w-36 sm:w-48 shrink-0">
              <h3 className="font-mono font-bold text-foreground group-hover:text-halcyon-teal transition-colors truncate">
                {unicodeName ? `${unicodeName}/` : `${auction.name}/`}
              </h3>
              {unicodeName && (
                <span className="text-[10px] text-muted-foreground/60 font-mono truncate block">
                  {auction.name}
                </span>
              )}
            </div>

            {/* Badge */}
            <Badge variant={getStateBadgeVariant(auction.state)} className="shrink-0 text-[10px]">
              {phase}
            </Badge>

            {/* Countdown */}
            <div className="hidden sm:block flex-1 min-w-0">
              {targetHeight && auction.state !== "CLOSED" ? (
                <CountdownTimer
                  timeRemainingMs={timeRemainingMs}
                  phase={phase}
                />
              ) : auction.state === "CLOSED" && auction.winnerAddress ? (
                <span className="text-xs text-muted-foreground truncate block">
                  Won by {auction.winnerAddress.slice(0, 12)}...
                </span>
              ) : null}
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
              <span className="flex items-center gap-1" title="Bids">
                <Users className="w-3.5 h-3.5" />
                {auction.bidCount}
              </span>
              {auction.highestLockupHns > 0 && (
                <span className="flex items-center gap-1 text-amber-400/80 font-medium" title="Highest lockup">
                  <Gavel className="w-3.5 h-3.5" />
                  {auction.highestLockupHns < 0.01 ? '<0.01' : auction.highestLockupHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HNS
                </span>
              )}
            </div>

            {/* Action */}
            <div className="shrink-0 ml-auto">
              {auction.state === "BIDDING" ? (
                <Button size="sm" variant="default" className="h-7 text-xs btn-halcyon rounded-lg font-semibold px-3">
                  Bid
                </Button>
              ) : auction.state === "REVEAL" ? (
                <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-3">
                  Reveal
                </Button>
              ) : (
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-halcyon-teal transition-colors" />
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/auction-house/${encodeURIComponent(auction.name)}`}
      className="block group"
    >
      <div className={`auction-card ${getStateCardClass(auction.state)} p-5`}>
        {/* Name + Badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-mono font-bold text-lg text-foreground group-hover:text-halcyon-teal transition-colors truncate">
              {unicodeName ? `${unicodeName}/` : `${auction.name}/`}
            </h3>
            {unicodeName && (
              <span className="text-[10px] text-muted-foreground/60 font-mono truncate block">
                {auction.name}
              </span>
            )}
          </div>
          <Badge variant={getStateBadgeVariant(auction.state)}>
            {phase}
          </Badge>
        </div>

        {/* Countdown */}
        {targetHeight && auction.state !== "CLOSED" ? (
          <div className="mb-3 rounded-lg bg-background/40 px-3 py-2">
            <CountdownTimer
              timeRemainingMs={timeRemainingMs}
              phase={phase}
            />
          </div>
        ) : auction.state === "CLOSED" && auction.winnerAddress ? (
          <p className="text-xs text-muted-foreground mb-3 truncate">
            Won by {auction.winnerAddress.slice(0, 12)}...
          </p>
        ) : null}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {auction.bidCount} bid{auction.bidCount !== 1 ? "s" : ""}
          </span>
          {auction.state === "REVEAL" && auction.revealCount > 0 ? (
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {auction.revealCount} reveal{auction.revealCount !== 1 ? "s" : ""}
            </span>
          ) : auction.highestLockupHns > 0 ? (
            <span className="flex items-center gap-1">
              <Gavel className="w-3 h-3" />
              {auction.highestLockupHns < 0.01 ? '<0.01' : auction.highestLockupHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HNS
            </span>
          ) : null}
        </div>

        {/* Action hint */}
        <div className="mt-3 pt-3 border-t border-halcyon-teal/10">
          {auction.state === "BIDDING" ? (
            <Button size="sm" variant="default" className="w-full h-8 text-xs btn-halcyon rounded-lg font-semibold">
              Place Bid
            </Button>
          ) : auction.state === "REVEAL" ? (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
              View Reveals
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="w-full h-8 text-xs">
              View Details
            </Button>
          )}
        </div>
      </div>
    </Link>
  );
}

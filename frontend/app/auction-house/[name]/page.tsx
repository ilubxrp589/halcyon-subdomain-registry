"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  getNameDetail,
  getNameBids,
  buyListing,
  type AuctionDetail,
  type BidEntry,
} from "@/services/auctionHouseApi";
import { toast } from "sonner";
import {
  placeBid,
  revealBid,
  redeemBid,
  finalizeAuction,
  openAuction,
  addToWatchlist,
} from "@/services/hnsWalletApi";
import CountdownTimer from "@/app/wallet/components/CountdownTimer";
import BuyDialog from "../components/BuyDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Gavel,
  Loader2,
  RefreshCw,
  Star,
  CheckCircle,
  AlertTriangle,
  Globe,
  ShoppingBag,
  Eye,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { displayName } from "@/lib/punycode";
import { BLOCK_TIME_MS } from "@/lib/constants";

function getTargetHeight(state: string, biddingEnds: number | null, revealEnds: number | null, openHeight: number | null): number | null {
  switch (state) {
    case "OPENING":
      return biddingEnds ? biddingEnds - 720 : null;
    case "BIDDING":
      return biddingEnds;
    case "REVEAL":
      return revealEnds;
    default:
      return null;
  }
}

function getPhaseLabel(state: string): string {
  switch (state) {
    case "OPENING": return "Opening";
    case "BIDDING": return "Bidding";
    case "REVEAL": return "Reveal";
    case "CLOSED": return "Closed";
    case "TRANSFER": return "Transfer";
    default: return state;
  }
}

function getStateBadgeVariant(state: string): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (state) {
    case "OPENING": return "secondary";
    case "BIDDING": return "success";
    case "REVEAL": return "warning";
    case "CLOSED": return "destructive";
    default: return "default";
  }
}

export default function NameDetailPage() {
  const params = useParams();
  const nameParam = decodeURIComponent(params.name as string);
  const { isConnected } = useWeb3ModalAccount();
  const { getAuthCredentials } = useAuth();

  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [lockupAmount, setLockupAmount] = useState("");
  const [watchAdded, setWatchAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    action: "open" | "bid" | "reveal" | "redeem" | "finalize";
    title: string;
    description: string;
    details?: { label: string; value: string }[];
  }>({ open: false, action: "bid", title: "", description: "" });

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const [detailRes, bidsRes] = await Promise.all([
        getNameDetail(nameParam),
        getNameBids(nameParam, 100),
      ]);
      setDetail(detailRes);
      setBids(bidsRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load name details");
    } finally {
      setLoading(false);
    }
  }, [nameParam]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Auction action handler
  const handleAction = async (
    action: "open" | "bid" | "reveal" | "redeem" | "finalize"
  ) => {
    if (!isConnected) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const creds = await getAuthCredentials();
      let result: { success: boolean; txHash?: string; error?: string };

      switch (action) {
        case "open":
          result = await openAuction(creds, nameParam);
          break;
        case "bid": {
          const bid = parseFloat(bidAmount);
          const lockup = parseFloat(lockupAmount);
          if (isNaN(bid) || bid <= 0 || isNaN(lockup) || lockup < bid) {
            setActionResult({ success: false, message: "Lockup must be >= bid amount" });
            setActionLoading(false);
            return;
          }
          result = await placeBid(creds, nameParam, bid, lockup);
          break;
        }
        case "reveal":
          result = await revealBid(creds, nameParam);
          break;
        case "redeem":
          result = await redeemBid(creds, nameParam);
          break;
        case "finalize":
          result = await finalizeAuction(creds, nameParam);
          break;
      }

      if (result.success) {
        const msg = action === "open"
          ? `Auction opened! ${result.txHash?.slice(0, 16)}... — added to your watchlist so you'll be notified when bidding begins.`
          : `Transaction sent: ${result.txHash?.slice(0, 16)}...`;
        setActionResult({ success: true, message: msg });
        setBidAmount("");
        setLockupAmount("");
        // Auto-watchlist on open so user gets notified when bidding starts
        if (action === "open") {
          try {
            const watchCreds = await getAuthCredentials();
            await addToWatchlist(watchCreds, nameParam);
            setWatchAdded(true);
          } catch { /* best-effort */ }
        }
        setTimeout(fetchDetail, 3000);
      } else {
        setActionResult({ success: false, message: result.error || "Action failed" });
      }
    } catch (err) {
      setActionResult({ success: false, message: err instanceof Error ? err.message : "Action failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const requestConfirm = (action: typeof confirmAction.action) => {
    const bid = parseFloat(bidAmount);
    const lockup = parseFloat(lockupAmount);
    const configs: Record<string, { title: string; description: string; details?: { label: string; value: string }[] }> = {
      open: {
        title: "Open Auction",
        description: `This will open a Handshake name auction for "${nameParam}". A small network fee will be deducted from your HNS wallet. Once opened, the auction enters a ~37-hour opening phase before bidding begins.`,
        details: [
          { label: "Name", value: `${nameParam}/` },
          { label: "Network Fee", value: "~0.02 HNS" },
        ],
      },
      bid: {
        title: "Confirm Bid",
        description: `You are placing a sealed bid on "${nameParam}". The lockup amount is sent to the blockchain — only you know how much is your actual bid vs. blind.`,
        details: [
          { label: "Name", value: `${nameParam}/` },
          { label: "Actual Bid", value: `${bidAmount} HNS` },
          { label: "Blind Amount", value: `${lockup > bid ? (lockup - bid).toFixed(2) : "0"} HNS` },
          { label: "Total Lockup", value: `${lockupAmount} HNS` },
          ...(lockup > bid ? [{ label: "Note", value: "Blind portion returned after reveal" }] : []),
        ],
      },
      reveal: {
        title: "Reveal Bid",
        description: `Reveal your bid on "${nameParam}". Your actual bid amount will become public. You must reveal before the reveal period ends or you will lose your lockup.`,
      },
      redeem: {
        title: "Redeem Bid",
        description: `Redeem your losing bid on "${nameParam}" to reclaim your locked HNS coins.`,
      },
      finalize: {
        title: "Finalize Auction",
        description: `Finalize the auction for "${nameParam}" to claim ownership of the name.`,
      },
    };
    setConfirmAction({ open: true, action, ...configs[action] });
  };

  const executeConfirmedAction = () => {
    setConfirmAction((prev) => ({ ...prev, open: false }));
    handleAction(confirmAction.action);
  };

  const handleAddWatchlist = async () => {
    if (!isConnected) return;
    try {
      const creds = await getAuthCredentials();
      const res = await addToWatchlist(creds, nameParam);
      if (res.success) setWatchAdded(true);
    } catch {
      // Silent
    }
  };

  const copyName = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(nameParam);
    } else {
      const ta = document.createElement("textarea");
      ta.value = nameParam;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl relative">
        <div className="halcyon-bg" />
        <div className="skeleton-halcyon h-8 w-48 rounded-xl mb-6" />
        <div className="skeleton-halcyon h-32 rounded-xl mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton-halcyon h-64 rounded-xl" />
          <div className="skeleton-halcyon h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/auction-house" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Auction House
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchDetail}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const auction = detail?.auction;
  const liveState = detail?.liveState;
  const records = detail?.records || [];
  const listing = detail?.listing;

  // Compute state from auction or liveState
  const state = auction?.state || liveState?.state?.toUpperCase() || "UNKNOWN";
  const currentHeight = auction?.currentHeight || liveState?.height || 0;
  const targetHeight = auction
    ? getTargetHeight(state, auction.biddingEndsHeight, auction.revealEndsHeight, auction.openHeight)
    : null;
  const blocksRemaining = targetHeight ? Math.max(0, targetHeight - currentHeight) : 0;
  // Subtract elapsed time since current_height was last updated for accurate countdown
  const elapsedSinceUpdate = auction?.updatedAt ? Date.now() - new Date(auction.updatedAt).getTime() : 0;
  const timeRemainingMs = Math.max(0, blocksRemaining * BLOCK_TIME_MS - elapsedSinceUpdate);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl relative">
      <div className="halcyon-bg" />
      {/* Back link */}
      <Link
        href="/auction-house"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Auction House
      </Link>

      {/* Hero */}
      <div className="glass-card p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-mono font-bold text-halcyon-gradient">
              {displayName(nameParam)}/
            </h1>
            {nameParam.startsWith("xn--") && (
              <span className="text-xs text-muted-foreground/60 font-mono">{nameParam}</span>
            )}
            <button onClick={copyName} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <Badge variant={getStateBadgeVariant(state)} className="text-sm">
              {getPhaseLabel(state)}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {targetHeight && state !== "CLOSED" && (
              <CountdownTimer timeRemainingMs={timeRemainingMs} phase={getPhaseLabel(state)} />
            )}
            <Button variant="ghost" size="sm" onClick={fetchDetail}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

      </div>

      {/* Info Cards Grid */}
      {auction && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="stat-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
            <Badge variant={getStateBadgeVariant(state)} className="text-xs">{getPhaseLabel(state)}</Badge>
          </div>
          <div className="stat-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Bids</p>
            <p className="text-lg font-bold tabular-nums">{auction.bidCount}</p>
          </div>
          <div className="stat-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Highest Lockup</p>
            <p className="text-lg font-bold tabular-nums">
              {auction.highestLockupHns > 0
                ? auction.highestLockupHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
            </p>
          </div>
          {state === "REVEAL" || state === "CLOSED" ? (
            <div className="stat-card p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reveals</p>
              <p className="text-lg font-bold tabular-nums">{auction.revealCount}</p>
            </div>
          ) : (
            <div className="stat-card p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Blocks Left</p>
              <p className="text-lg font-bold tabular-nums">{blocksRemaining > 0 ? blocksRemaining : "—"}</p>
            </div>
          )}
          <div className="stat-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Time Left</p>
            <p className="text-lg font-bold tabular-nums">
              {(() => {
                const mins = Math.round(timeRemainingMs / 60000);
                if (mins <= 0) return "—";
                if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                return `${mins}m`;
              })()}
            </p>
          </div>
          {auction.winnerAddress ? (
            <div className="stat-card p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Winner</p>
              <p className="text-xs font-mono truncate">{auction.winnerAddress.slice(0, 14)}...</p>
            </div>
          ) : (
            <div className="stat-card p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Block Height</p>
              <p className="text-lg font-bold tabular-nums">{currentHeight.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Two-column: Actions + Bid History */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Action Panel (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contextual action based on state */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-halcyon-teal" />
              {state === "BIDDING" ? "Place a Bid" :
               state === "REVEAL" ? "Reveal Your Bid" :
               state === "OPENING" ? "Auction Opening" :
               state === "CLOSED" ? "Auction Closed" :
               state === "UNKNOWN" || (!auction && !liveState) ? "Open Auction" :
               "Name Actions"}
            </h2>

            {state === "BIDDING" && isConnected && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bid" className="text-xs">Actual Bid (HNS)</Label>
                  <Input
                    id="bid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="What you're willing to pay"
                    className="h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Your real bid — only revealed after the bidding phase ends.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lockup" className="text-xs">Total Lockup (HNS)</Label>
                  <Input
                    id="lockup"
                    type="number"
                    min="0"
                    step="0.01"
                    value={lockupAmount}
                    onChange={(e) => setLockupAmount(e.target.value)}
                    placeholder="Must be >= actual bid"
                    className="h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Total sent on-chain. The difference (blind) hides your real bid and is returned after reveal.
                  </p>
                </div>
                {bidAmount && lockupAmount && parseFloat(lockupAmount) > parseFloat(bidAmount) && (
                  <div className="rounded-lg bg-halcyon-teal/5 border border-halcyon-teal/15 px-3 py-2 text-[11px] space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Actual bid</span><span className="font-mono">{bidAmount} HNS</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Blind (returned)</span><span className="font-mono">{(parseFloat(lockupAmount) - parseFloat(bidAmount)).toFixed(2)} HNS</span></div>
                    <div className="flex justify-between font-semibold border-t border-halcyon-teal/10 pt-1 mt-1"><span>Total lockup</span><span className="font-mono">{lockupAmount} HNS</span></div>
                  </div>
                )}
                <Button
                  className="w-full btn-halcyon rounded-lg font-semibold"
                  onClick={() => requestConfirm("bid")}
                  disabled={actionLoading || !bidAmount || !lockupAmount}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Place Bid
                </Button>
              </div>
            )}

            {state === "REVEAL" && isConnected && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Reveal your bid to participate in the auction. Your actual bid amount will be shown.
                </p>
                <Button
                  className="w-full btn-halcyon rounded-lg font-semibold"
                  onClick={() => requestConfirm("reveal")}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  Reveal Bid
                </Button>
              </div>
            )}

            {state === "CLOSED" && isConnected && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Auction is closed. Finalize to claim or redeem your bid.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => requestConfirm("finalize")}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Finalize
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => requestConfirm("redeem")}
                    disabled={actionLoading}
                  >
                    Redeem Bid
                  </Button>
                </div>
              </div>
            )}

            {state === "OPENING" && isConnected && (
              <p className="text-xs text-muted-foreground">
                This auction is in the opening phase. Bidding will begin once the opening period ends.
              </p>
            )}

            {(state === "UNKNOWN" || (!auction && !liveState)) && isConnected && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  This name is available. Open an auction to start the bidding process.
                </p>
                <Button
                  className="w-full btn-halcyon rounded-lg font-semibold"
                  onClick={() => requestConfirm("open")}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Gavel className="w-4 h-4 mr-1" />}
                  Open Auction
                </Button>
              </div>
            )}

            {!isConnected && (
              <p className="text-xs text-muted-foreground">
                Connect your wallet to participate in this auction.
              </p>
            )}

            {/* Action result */}
            {actionResult && (
              <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                actionResult.success
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}>
                {actionResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {actionResult.message}
              </div>
            )}
          </div>

          {/* Watchlist button */}
          {isConnected && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddWatchlist}
              disabled={watchAdded}
            >
              <Star className={`w-4 h-4 mr-1 ${watchAdded ? "text-yellow-400 fill-yellow-400" : ""}`} />
              {watchAdded ? "Added to Watchlist" : "Add to Watchlist"}
            </Button>
          )}

          {/* Marketplace listing */}
          {listing && (
            <div className="glass-card border-halcyon-teal/30 bg-halcyon-teal/5 p-5">
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-halcyon-teal" />
                For Sale
              </h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-bold text-halcyon-teal">{listing.priceHns.toLocaleString()} HNS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seller</span>
                  <span className="font-mono text-xs">{listing.sellerAddress.slice(0, 14)}...</span>
                </div>
                {listing.description && (
                  <p className="text-xs text-muted-foreground pt-1">{listing.description}</p>
                )}
              </div>
              {isConnected && (
                <Button
                  className="w-full mt-3 btn-halcyon rounded-lg font-semibold"
                  size="sm"
                  onClick={async () => {
                    try {
                      const fresh = await getNameDetail(nameParam);
                      if (!fresh.listing || fresh.listing.status !== "active") {
                        toast.error("This listing is no longer available");
                        setDetail(fresh);
                        return;
                      }
                      setDetail(fresh);
                      setBuyOpen(true);
                    } catch {
                      toast.error("Failed to verify listing status");
                    }
                  }}
                >
                  Buy Now
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Bid History Table (3/5) */}
        <div className="lg:col-span-3">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Bid History
              <Badge variant="secondary" className="text-[10px]">{bids.filter(b => b.covenantType === "BID").length} bids</Badge>
            </h2>

            {(() => {
              const bidOnly = bids.filter(b => b.covenantType === "BID");
              const revealPhase = state === "REVEAL" || state === "CLOSED";
              if (bidOnly.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No bids recorded yet
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  {bidOnly.map((bid, idx) => {
                    const bidNumber = bidOnly.length - idx;
                    const dateStr = bid.createdAt
                      ? new Date(bid.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—";
                    return (
                      <div key={bid.id} className="flex items-center gap-3 bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 rounded-lg px-4 py-3">
                        <span className="text-sm font-bold text-muted-foreground w-6 shrink-0 text-right tabular-nums">{bidNumber}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-muted-foreground">{dateStr}</span>
                            <span className="text-[10px] text-muted-foreground/50 font-mono">Block {bid.blockHeight.toLocaleString()}</span>
                          </div>
                          {revealPhase && bid.revealHns != null ? (
                            <p className="text-sm font-bold tabular-nums">
                              {bid.revealHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-muted-foreground font-normal">HNS revealed</span>
                            </p>
                          ) : (
                            <p className="text-xs text-amber-400/70 italic flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              hidden until reveal
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold tabular-nums">
                            {bid.lockupHns
                              ? bid.lockupHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">lockup</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Other covenant activity (OPEN, REVEAL, REGISTER, etc.) */}
            {bids.filter(b => b.covenantType !== "BID").length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  All covenant activity ({bids.length} total)
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Block</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Value</TableHead>
                        <TableHead className="text-xs">Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bids.map((bid) => (
                        <TableRow key={bid.id}>
                          <TableCell className="font-mono text-xs">
                            {bid.blockHeight.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                bid.covenantType === "BID" ? "success" :
                                bid.covenantType === "REVEAL" ? "warning" :
                                bid.covenantType === "OPEN" ? "secondary" :
                                "default"
                              }
                              className="text-[10px]"
                            >
                              {bid.covenantType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {bid.lockupHns
                              ? bid.lockupHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : bid.revealHns
                                ? bid.revealHns.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-muted-foreground">
                            {bid.address ? `${bid.address.slice(0, 12)}...` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* DNS Records */}
      {records.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            DNS Records
          </h2>
          <div className="space-y-1.5">
            {(records as Array<{ type?: string; address?: string; ns?: string; txt?: string[]; value?: string }>).map((rec, i) => {
              const type = rec.type?.toUpperCase() || "UNKNOWN";
              const value = rec.address || rec.ns || rec.txt?.join(", ") || rec.value || JSON.stringify(rec);
              return (
                <div key={i} className="flex items-center gap-3 text-xs font-mono bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 rounded-lg px-3 py-1.5">
                  <Badge variant="secondary" className="text-[10px] w-12 justify-center shrink-0">
                    {type}
                  </Badge>
                  <span className="text-muted-foreground truncate">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buy Dialog */}
      {listing && (
        <BuyDialog
          listing={listing}
          open={buyOpen}
          onOpenChange={setBuyOpen}
          getAuthCredentials={getAuthCredentials}
          onSuccess={fetchDetail}
        />
      )}

      {/* Confirm Action Dialog */}
      <Dialog open={confirmAction.open} onOpenChange={(open) => setConfirmAction((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {confirmAction.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{confirmAction.description}</p>
            {confirmAction.details && confirmAction.details.length > 0 && (
              <div className="rounded-xl bg-background/40 backdrop-blur-sm border border-halcyon-teal/10 p-4 space-y-2">
                {confirmAction.details.map((d) => (
                  <div key={d.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-mono font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-amber-500/80">
              This transaction cannot be reversed once confirmed.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmAction((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button className="btn-halcyon rounded-lg font-semibold" onClick={executeConfirmedAction}>
              Confirm {confirmAction.title}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

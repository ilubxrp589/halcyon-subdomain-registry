"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { buyListing, type MarketplaceListing, type AuthCredentials } from "@/services/auctionHouseApi";

export default function BuyDialog({
  listing,
  open,
  onOpenChange,
  getAuthCredentials,
  onSuccess,
}: {
  listing: MarketplaceListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getAuthCredentials: () => Promise<AuthCredentials>;
  onSuccess: () => void;
}) {
  const [buying, setBuying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; note?: string; error?: string } | null>(null);

  const handleBuy = async () => {
    if (!listing) return;
    setBuying(true);
    setResult(null);
    try {
      const creds = await getAuthCredentials();
      const res = await buyListing(creds, { listingId: listing.id });
      setResult(res);
      if (res.success) {
        setTimeout(() => {
          onOpenChange(false);
          setResult(null);
          onSuccess();
        }, 2000);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; required?: number; available?: number } } };
      const backendMsg = axiosErr?.response?.data?.error;
      const detail = axiosErr?.response?.data?.required
        ? ` (need ${axiosErr.response.data.required} HNS, have ${axiosErr.response.data.available})`
        : "";
      setResult({
        success: false,
        error: backendMsg
          ? `${backendMsg}${detail}`
          : err instanceof Error ? err.message : "Purchase failed",
      });
    } finally {
      setBuying(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!buying) {
      onOpenChange(v);
      setResult(null);
    }
  };

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Purchase</DialogTitle>
        </DialogHeader>

        {result?.success ? (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
            <p className="font-semibold">Purchase Complete</p>
            <p className="text-sm text-muted-foreground mt-1">
              {listing.name}/ is now yours
            </p>
            {result.note && (
              <p className="text-xs text-amber-400 mt-2">{result.note}</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-background/40 backdrop-blur-sm border border-halcyon-teal/10 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-mono font-bold">{listing.name}/</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-bold text-amber-400">
                    {listing.priceHns.toLocaleString()} HNS
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Seller</span>
                  <span className="font-mono text-xs">
                    {listing.sellerAddress.slice(0, 14)}...
                  </span>
                </div>
              </div>

              {result?.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {result.error}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                This will transfer {listing.priceHns.toLocaleString()} HNS from your wallet to the seller
                and initiate the name transfer to your wallet.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={buying}>
                Cancel
              </Button>
              <Button
                onClick={handleBuy}
                disabled={buying}
                className="btn-halcyon rounded-lg font-semibold"
              >
                {buying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    Buying...
                  </>
                ) : (
                  `Buy for ${listing.priceHns.toLocaleString()} HNS`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

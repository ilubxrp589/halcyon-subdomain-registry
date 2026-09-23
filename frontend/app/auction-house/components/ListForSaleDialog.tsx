"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertTriangle, Search } from "lucide-react";
import { listForSale, type AuthCredentials } from "@/services/auctionHouseApi";
import { getOwnedNames } from "@/services/hnsWalletApi";

export default function ListForSaleDialog({
  open,
  onOpenChange,
  getAuthCredentials,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getAuthCredentials: () => Promise<AuthCredentials>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [ownedNames, setOwnedNames] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch owned names when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingNames(true);
      try {
        const creds = await getAuthCredentials();
        const res = await getOwnedNames(creds);
        if (!cancelled && res.success) {
          setOwnedNames(res.names.map((n) => n.name.toLowerCase()));
        }
      } catch {
        // Non-critical — user can still type manually, backend validates
      } finally {
        if (!cancelled) setLoadingNames(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, getAuthCredentials]);

  const filteredNames = useMemo(() => {
    if (!name.trim()) return ownedNames.slice(0, 10);
    const q = name.trim().toLowerCase();
    return ownedNames.filter((n) => n.includes(q)).slice(0, 10);
  }, [name, ownedNames]);

  const nameOwned = !name.trim() || ownedNames.length === 0 || ownedNames.includes(name.trim().toLowerCase());

  const handleSubmit = async () => {
    const priceNum = parseFloat(price);
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) return;

    setSubmitting(true);
    setResult(null);
    try {
      const creds = await getAuthCredentials();
      const res = await listForSale(creds, {
        name: name.trim().toLowerCase(),
        priceHns: priceNum,
        description: description.trim() || undefined,
      });
      setResult(res);
      if (res.success) {
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
          onSuccess();
        }, 1500);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const backendMsg = axiosErr?.response?.data?.error;
      setResult({ success: false, error: backendMsg || (err instanceof Error ? err.message : "Failed to list") });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setDescription("");
    setResult(null);
    setOwnedNames([]);
  };

  const handleClose = (v: boolean) => {
    if (!submitting) {
      onOpenChange(v);
      if (!v) resetForm();
    }
  };

  const canSubmit = name.trim() && parseFloat(price) > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>List Name For Sale</DialogTitle>
        </DialogHeader>

        {result?.success ? (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
            <p className="font-semibold">Listed Successfully</p>
            <p className="text-sm text-muted-foreground mt-1">
              {name}/ is now for sale at {parseFloat(price).toLocaleString()} HNS
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2 relative">
                <Label htmlFor="list-name">Name</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="list-name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder={loadingNames ? "Loading your names..." : "Search your names..."}
                    className="font-mono pl-9"
                    autoComplete="off"
                  />
                </div>
                {/* Dropdown of owned names */}
                {showDropdown && filteredNames.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 max-h-40 overflow-y-auto rounded-lg border border-halcyon-teal/20 bg-background/95 backdrop-blur-sm shadow-lg">
                    {filteredNames.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-halcyon-teal/10 transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); setName(n); setShowDropdown(false); }}
                      >
                        {n}/
                      </button>
                    ))}
                  </div>
                )}
                {/* Ownership warning */}
                {name.trim() && !nameOwned && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    You don&apos;t appear to own &quot;{name.trim()}&quot;
                  </p>
                )}
                {!name.trim() && (
                  <p className="text-[10px] text-muted-foreground">
                    {loadingNames ? "Loading..." : ownedNames.length > 0 ? `${ownedNames.length} names available` : "Enter a Handshake TLD you own"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="list-price">Price (HNS)</Label>
                <Input
                  id="list-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="list-desc">Description (optional)</Label>
                <Input
                  id="list-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short, memorable TLD"
                />
              </div>

              {result?.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {result.error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-halcyon rounded-lg font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    Listing...
                  </>
                ) : (
                  "List For Sale"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

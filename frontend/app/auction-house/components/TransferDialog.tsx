"use client";

import { useState, useEffect } from "react";
import {
  transferNameOut,
  getDepositAddress,
} from "@/services/auctionHouseApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Send,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function TransferDialog({
  open,
  onOpenChange,
  getAuthCredentials,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  getAuthCredentials: () => Promise<{ wallet: string; signature: string; nonce: string }>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [depositAddr, setDepositAddr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; txHash?: string; error?: string } | null>(null);

  const fetchDepositAddr = async () => {
    try {
      const creds = await getAuthCredentials();
      const res = await getDepositAddress(creds);
      if (res.success && res.address) setDepositAddr(res.address);
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    if (open) fetchDepositAddr();
  }, [open]);

  const handleTransfer = async () => {
    if (!name.trim() || !toAddress.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const creds = await getAuthCredentials();
      const res = await transferNameOut(creds, { name: name.trim(), toAddress: toAddress.trim() });
      setResult(res);
      if (res.success) {
        toast.success(`Transfer initiated for ${name.trim()}/`);
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Transfer failed";
      setResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-md mx-4 rounded-2xl border border-halcyon-teal/20 bg-background/95 backdrop-blur-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="w-5 h-5 text-halcyon-teal" />
            Transfer Name
          </h2>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Deposit address */}
        {depositAddr && (
          <div className="mb-4 p-3 rounded-lg bg-halcyon-teal/5 border border-halcyon-teal/15">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1">Your HNS Deposit Address</span>
            <code className="text-xs font-mono break-all select-all">{depositAddr}</code>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name to Transfer</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. myname"
              className="mt-1 h-10 rounded-lg bg-background/50 border-halcyon-teal/15"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Destination HNS Address</label>
            <Input
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="hs1..."
              className="mt-1 h-10 rounded-lg bg-background/50 border-halcyon-teal/15"
            />
          </div>
        </div>

        {result && (
          <div className={`mt-3 p-2 rounded-lg text-xs ${result.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            {result.success ? (
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Transfer initiated. TX: {result.txHash?.slice(0, 16)}...</span>
            ) : (
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> {result.error}</span>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            className="btn-halcyon"
            onClick={handleTransfer}
            disabled={loading || !name.trim() || !toAddress.trim()}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}

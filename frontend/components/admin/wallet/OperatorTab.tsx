"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Key, RefreshCw, Loader2, Wallet, ArrowRightLeft,
  Users, Gift, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface WalletInfo {
  index: number;
  address: string;
  flr: string;
  wflr: string;
}

interface BatchResult {
  index: number;
  address?: string;
  hash?: string;
  success: boolean;
  error?: string;
  message?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function OperatorTab() {
  const { getAdminCredentials } = useAdminAuth();

  // Mnemonic state
  const [mnemonic, setMnemonic] = useState("");
  const [walletCount, setWalletCount] = useState("5");
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch operation state
  const [batchOp, setBatchOp] = useState<"wrap" | "delegate" | "claim" | null>(null);
  const [batchAmount, setBatchAmount] = useState("");
  const [delegateProvider, setDelegateProvider] = useState("");
  const [delegateBips, setDelegateBips] = useState("10000");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const fetchWallets = async () => {
    if (!mnemonic.trim()) {
      setError("Enter a mnemonic phrase");
      return;
    }
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError("Mnemonic must be 12 or 24 words");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const creds = await getAdminCredentials();
      const res = await fetch(`${API_URL}/admin/operator/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...creds,
          mnemonic: mnemonic.trim(),
          count: parseInt(walletCount) || 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch wallets");
      setWallets(data.wallets || []);
      // Select all by default
      setSelectedIndices(new Set((data.wallets || []).map((w: WalletInfo) => w.index)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch wallets");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIndices.size === wallets.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(wallets.map((w) => w.index)));
    }
  };

  const startBatchOp = (op: "wrap" | "delegate" | "claim") => {
    if (selectedIndices.size === 0) {
      setError("Select at least one wallet");
      return;
    }
    setBatchOp(op);
    setBatchResults([]);
    setShowConfirm(true);
  };

  const executeBatch = async () => {
    if (confirmText !== "CONFIRM") return;
    setShowConfirm(false);
    setConfirmText("");
    setBatchLoading(true);
    setBatchResults([]);

    try {
      const creds = await getAdminCredentials();
      const indices = Array.from(selectedIndices);
      let endpoint = "";
      let body: Record<string, unknown> = { ...creds, mnemonic: mnemonic.trim() };

      if (batchOp === "wrap") {
        endpoint = "/admin/operator/batch-wrap";
        body.operations = indices.map((idx) => ({
          index: idx,
          amount: batchAmount,
        }));
      } else if (batchOp === "delegate") {
        endpoint = "/admin/operator/batch-delegate";
        body.operations = indices.map((idx) => ({
          index: idx,
          provider: delegateProvider,
          bips: parseInt(delegateBips),
        }));
      } else if (batchOp === "claim") {
        endpoint = "/admin/operator/batch-claim";
        body.indices = indices;
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch operation failed");
      setBatchResults(data.results || []);
      // Refresh balances
      fetchWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch operation failed");
    } finally {
      setBatchLoading(false);
      setBatchOp(null);
    }
  };

  const totalFlr = wallets.reduce((sum, w) => sum + parseFloat(w.flr || "0"), 0);
  const totalWflr = wallets.reduce((sum, w) => sum + parseFloat(w.wflr || "0"), 0);

  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-600">Operator Wallet — Server-Side Batch Operations</p>
            <p className="text-muted-foreground mt-1">
              This tab uses a mnemonic phrase to derive multiple HD wallets and execute batch operations
              server-side. The mnemonic is sent to the backend for each operation and is never stored.
              Use for managing the HSR operator wallet fleet (batch wrap, delegate, claim).
            </p>
          </div>
        </div>
      </div>

      {/* Mnemonic Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" /> Operator Mnemonic
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mnemonic Phrase (12 or 24 words)</Label>
            <Input
              type="password"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="Enter mnemonic phrase..."
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Wallet Count</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={walletCount}
                onChange={(e) => setWalletCount(e.target.value)}
                className="w-24 h-8"
              />
            </div>
            <Button onClick={fetchWallets} disabled={loading || !mnemonic.trim()} className="mt-5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
              Load Wallets
            </Button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Wallets Table */}
      {wallets.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Wallets</p>
                <p className="text-2xl font-bold">{wallets.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-2xl font-bold text-blue-500">{selectedIndices.size}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total FLR</p>
                <p className="text-2xl font-bold">{totalFlr.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total WFLR</p>
                <p className="text-2xl font-bold text-green-500">{totalWflr.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Derived Wallets
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={fetchWallets} disabled={loading}>
                    <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedIndices.size === wallets.length}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">FLR</TableHead>
                    <TableHead className="text-right">WFLR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((w) => (
                    <TableRow key={w.index}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(w.index)}
                          onChange={() => toggleSelect(w.index)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{w.index}</TableCell>
                      <TableCell className="font-mono text-xs">{w.address}</TableCell>
                      <TableCell className="text-right">{parseFloat(w.flr).toFixed(4)}</TableCell>
                      <TableCell className="text-right">{parseFloat(w.wflr).toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Batch Operations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Batch Wrap */}
              <div className="flex items-end gap-4 p-4 rounded-lg border">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3" /> Batch Wrap FLR → WFLR
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Amount per wallet"
                    value={batchAmount}
                    onChange={(e) => setBatchAmount(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => startBatchOp("wrap")}
                  disabled={batchLoading || !batchAmount}
                >
                  {batchLoading && batchOp === "wrap" ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <ArrowRightLeft className="w-3 h-3 mr-1" />
                  )}
                  Wrap ({selectedIndices.size})
                </Button>
              </div>

              {/* Batch Delegate */}
              <div className="flex items-end gap-4 p-4 rounded-lg border">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Users className="w-3 h-3" /> Batch Delegate WFLR
                  </Label>
                  <Input
                    placeholder="FTSO provider address (0x...)"
                    value={delegateProvider}
                    onChange={(e) => setDelegateProvider(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Bips</Label>
                  <Input
                    type="number"
                    max="10000"
                    value={delegateBips}
                    onChange={(e) => setDelegateBips(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => startBatchOp("delegate")}
                  disabled={batchLoading || !delegateProvider}
                >
                  {batchLoading && batchOp === "delegate" ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Users className="w-3 h-3 mr-1" />
                  )}
                  Delegate ({selectedIndices.size})
                </Button>
              </div>

              {/* Batch Claim */}
              <div className="flex items-end gap-4 p-4 rounded-lg border">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Batch Claim FTSO Rewards
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Claims unclaimed FTSO rewards for all selected wallets.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => startBatchOp("claim")}
                  disabled={batchLoading}
                >
                  {batchLoading && batchOp === "claim" ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Gift className="w-3 h-3 mr-1" />
                  )}
                  Claim ({selectedIndices.size})
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Batch Results */}
          {batchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Batch Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {batchResults.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 p-2 rounded border text-sm ${
                        r.success ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
                      }`}
                    >
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span className="font-mono text-xs">Wallet #{r.index}</span>
                      {r.address && (
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {r.address.slice(0, 10)}...
                        </span>
                      )}
                      {r.hash && (
                        <a
                          href={`https://coston2-explorer.flare.network/tx/${r.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline"
                        >
                          {r.hash.slice(0, 10)}...
                        </a>
                      )}
                      {r.error && <span className="text-xs text-red-500 truncate">{r.error}</span>}
                      {r.message && <span className="text-xs text-muted-foreground">{r.message}</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {batchResults.filter((r) => r.success).length} / {batchResults.length} succeeded
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm Batch {batchOp === "wrap" ? "Wrap" : batchOp === "delegate" ? "Delegate" : "Claim"}
            </DialogTitle>
            <DialogDescription>
              This will execute {batchOp === "wrap" ? "wrap" : batchOp === "delegate" ? "delegate" : "claim"}{" "}
              on {selectedIndices.size} wallet{selectedIndices.size !== 1 ? "s" : ""}.
              {batchOp === "wrap" && ` Each wallet will wrap ${batchAmount} FLR → WFLR.`}
              {batchOp === "delegate" && ` Each wallet will delegate ${(parseInt(delegateBips) / 100).toFixed(0)}% to ${delegateProvider.slice(0, 10)}...`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="border-t pt-3">
              <Label>Type CONFIRM to proceed</Label>
              <Input
                className="mt-2"
                placeholder="CONFIRM"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowConfirm(false); setConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "CONFIRM" || batchLoading}
              onClick={executeBatch}
            >
              {batchLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Execute Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Operator wallets are derived from a BIP-39 mnemonic using the standard Ethereum derivation path (m/44&apos;/60&apos;/0&apos;/0/N).</p>
        <p>The mnemonic is sent to the backend for each operation and is never stored. All operations are executed sequentially to avoid nonce conflicts.</p>
      </div>
    </div>
  );
}

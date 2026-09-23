"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getHNSTLDs,
  getHNSWalletInfo,
  setTLDFlrRecord,
  batchSetTLDFlrRecords,
  HNSTLDDetail,
} from "@/services/adminApi";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  KeyRound,
  Clock,
  Layers,
  Wallet,
} from "lucide-react";
import Link from "next/link";

type PendingState = Record<string, { txHash: string; timestamp: number }>;

export default function HNSManagerPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const { address } = useWeb3ModalAccount();

  const [tlds, setTlds] = useState<HNSTLDDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Selection state for batch operations
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Per-TLD action state
  const [settingFlr, setSettingFlr] = useState<string | null>(null);
  const [batchSetting, setBatchSetting] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingState>({});

  // Custom address override
  const [customAddress, setCustomAddress] = useState("");

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;
  const getAdminCredentialsRef = useRef(getAdminCredentials);
  getAdminCredentialsRef.current = getAdminCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [tldsResult, walletResult] = await Promise.all([
        getHNSTLDs(credentials),
        getHNSWalletInfo(credentials),
      ]);

      if (tldsResult.success) {
        setTlds(tldsResult.tlds);
      }
      if (walletResult) {
        setWalletBalance(walletResult.balance);
        setWalletAddress(walletResult.address);
      }
    } catch (err) {
      console.error("Failed to fetch HNS data:", err);
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Determine the Flare address to use
  const effectiveFlareAddress = customAddress.trim() || address || "";
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(effectiveFlareAddress);

  // Summary stats
  const totalTlds = tlds.length;
  const readyToStake = tlds.filter(
    (t) =>
      t.flrAddress &&
      /^0x[a-fA-F0-9]{40}$/.test(t.flrAddress) &&
      !t.expired
  ).length;
  const needFlrRecord = tlds.filter((t) => !t.flrAddress && !t.expired).length;
  const expiredCount = tlds.filter((t) => t.expired).length;

  const handleSetFlr = async (tldName: string) => {
    if (!isValidAddress) return;
    setSettingFlr(tldName);
    try {
      const credentials = await getAdminCredentialsRef.current();
      const result = await setTLDFlrRecord(tldName, effectiveFlareAddress, credentials);
      if (result.success && result.txHash) {
        setPendingTxs((prev) => ({
          ...prev,
          [tldName]: { txHash: result.txHash!, timestamp: Date.now() },
        }));
      }
    } catch (err) {
      console.error(`Failed to set FLR for ${tldName}:`, err);
    } finally {
      setSettingFlr(null);
    }
  };

  const handleBatchSetFlr = async () => {
    if (!isValidAddress || selected.size === 0) return;
    setBatchSetting(true);
    try {
      const credentials = await getAdminCredentialsRef.current();
      const result = await batchSetTLDFlrRecords(
        Array.from(selected),
        effectiveFlareAddress,
        credentials
      );
      // Mark successful ones as pending
      const newPending: PendingState = {};
      for (const r of result.results) {
        if (r.success && r.txHash) {
          newPending[r.tld] = { txHash: r.txHash, timestamp: Date.now() };
        }
      }
      setPendingTxs((prev) => ({ ...prev, ...newPending }));
      setSelected(new Set());
    } catch (err) {
      console.error("Batch set FLR failed:", err);
    } finally {
      setBatchSetting(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const eligible = tlds.filter((t) => !t.expired).map((t) => t.name);
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getFlrBadge = (tld: HNSTLDDetail) => {
    if (pendingTxs[tld.name]) {
      return (
        <Badge variant="outline" className="text-amber-400 border-amber-500/50 bg-amber-500/10">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }
    if (tld.flrAddress && /^0x[a-fA-F0-9]{40}$/.test(tld.flrAddress)) {
      if (effectiveFlareAddress && tld.flrAddress.toLowerCase() === effectiveFlareAddress.toLowerCase()) {
        return (
          <Badge variant="outline" className="text-green-400 border-green-500/50 bg-green-500/10">
            <CheckCircle className="w-3 h-3 mr-1" />
            Set
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="text-amber-400 border-amber-500/50 bg-amber-500/10">
          <AlertCircle className="w-3 h-3 mr-1" />
          Different Address
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-red-400 border-red-500/50 bg-red-500/10">
        <XCircle className="w-3 h-3 mr-1" />
        Not Set
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6" />
            HNS Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage Handshake TLDs in the local hsd wallet. Set <code className="bg-muted px-1 rounded">flr:0x...</code> TXT records for staking.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Layers className="w-4 h-4" />
              Total TLDs
            </div>
            <p className="text-2xl font-bold mt-1">{totalTlds}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Ready to Stake
            </div>
            <p className="text-2xl font-bold mt-1 text-green-400">{readyToStake}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Need FLR Record
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-400">{needFlrRecord}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Wallet className="w-4 h-4" />
              HNS Balance
            </div>
            <p className="text-2xl font-bold mt-1">
              {walletBalance ? `${parseFloat(walletBalance).toFixed(2)}` : "..."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Flare Address Config */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            Flare Address for TXT Records
          </div>
          <div className="flex gap-2 items-center">
            <Input
              placeholder={address || "0x..."}
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              className="font-mono text-sm"
            />
            {!customAddress && address && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Using connected wallet
              </span>
            )}
          </div>
          {effectiveFlareAddress && !isValidAddress && (
            <p className="text-xs text-red-400">Invalid address format</p>
          )}
          {effectiveFlareAddress && isValidAddress && (
            <p className="text-xs text-muted-foreground font-mono">
              Will set: <code className="bg-muted px-1 rounded">flr:{effectiveFlareAddress}</code>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Batch Action Bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.size === tlds.filter((t) => !t.expired).length && tlds.length > 0}
            onChange={toggleSelectAll}
            className="rounded"
          />
          Select All ({tlds.filter((t) => !t.expired).length})
        </label>
        {selected.size > 0 && (
          <Button
            size="sm"
            onClick={handleBatchSetFlr}
            disabled={batchSetting || !isValidAddress}
          >
            {batchSetting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4 mr-2" />
            )}
            Set FLR on {selected.size} Selected
          </Button>
        )}
      </div>

      {/* Info Panel */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4 text-sm space-y-1 text-muted-foreground">
          <p>
            <strong className="text-foreground">How this works:</strong>{" "}
            <code>sendUpdate</code> writes a TXT record to the Handshake blockchain.
            This preserves all existing DNS records (NS, GLUE, etc.) on the TLD.
          </p>
          <p>
            After the transaction confirms (~10 min), FDC verifiers can see the record.
            Allow <strong>~15 minutes</strong> total propagation before staking.
          </p>
        </CardContent>
      </Card>

      {/* TLD Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Owned TLDs</CardTitle>
        </CardHeader>
        <CardContent>
          {tlds.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No TLDs found in the local hsd wallet.
            </p>
          ) : (
            <div className="divide-y">
              {tlds.map((tld) => {
                const isPending = !!pendingTxs[tld.name];
                const isSettingThis = settingFlr === tld.name;

                return (
                  <div
                    key={tld.name}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selected.has(tld.name)}
                      onChange={() => toggleSelect(tld.name)}
                      disabled={tld.expired}
                      className="rounded"
                    />

                    {/* Name + state */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">.{tld.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            tld.expired
                              ? "text-red-400 border-red-500/50"
                              : tld.state === "CLOSED"
                                ? "text-green-400 border-green-500/50"
                                : "text-muted-foreground"
                          }
                        >
                          {tld.expired ? "Expired" : tld.state}
                        </Badge>
                      </div>
                      {/* FLR address display */}
                      {tld.flrAddress && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                            flr:{tld.flrAddress}
                          </span>
                          <button
                            onClick={() => copyToClipboard(tld.flrAddress!)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {/* Pending TX */}
                      {isPending && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span className="text-xs text-amber-400 font-mono">
                            TX: {pendingTxs[tld.name].txHash.slice(0, 12)}...
                          </span>
                        </div>
                      )}
                    </div>

                    {/* FLR Record badge */}
                    <div className="hidden sm:block">{getFlrBadge(tld)}</div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetFlr(tld.name)}
                        disabled={
                          isSettingThis ||
                          tld.expired ||
                          !isValidAddress ||
                          isPending
                        }
                      >
                        {isSettingThis ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Set FLR"
                        )}
                      </Button>
                      <Link href={`/stake?tld=${tld.name}`}>
                        <Button variant="ghost" size="sm" className="text-amber-400">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Stake
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

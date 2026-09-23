"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Send,
  Fuel,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
} from "lucide-react";
import { WrapUnwrapTab } from "@/components/admin/wallet/WrapUnwrapTab";
import { DelegateTab } from "@/components/admin/wallet/DelegateTab";
import { RewardsTab } from "@/components/admin/wallet/RewardsTab";
import { StakingTab } from "@/components/admin/wallet/StakingTab";
import { TldPortfolioTab } from "@/components/admin/wallet/TldPortfolioTab";
import { DomainsQuickTab } from "@/components/admin/wallet/DomainsQuickTab";
import { OperatorTab } from "@/components/admin/wallet/OperatorTab";
import {
  getWalletOverview,
  getWalletTransactions,
  getGasSummary,
  getContractLog,
  getNonceStatus,
  getBalanceAlerts,
  sendFLR,
  sendHNS,
  type WalletOverview,
  type WalletTransaction,
  type GasSummary as GasSummaryType,
  type ContractInteraction,
  type NonceStatus,
  type BalanceAlert,
} from "@/services/adminApi";

const EXPLORER_URL = "https://coston2-explorer.flare.network/tx/";

function truncateAddress(addr: string) {
  if (!addr || addr === "N/A") return addr;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function balanceColor(walletId: string, balance: number): string {
  const thresholds: Record<string, number> = { backend: 50, operator: 10, treasury: 10 };
  const t = thresholds[walletId];
  if (!t) return "text-green-500";
  if (balance < t / 2) return "text-red-500";
  if (balance < t) return "text-yellow-500";
  return "text-green-500";
}

export default function WalletsPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const getCredentialsRef = useRef(getReadAuthCredentials);
  useEffect(() => { getCredentialsRef.current = getReadAuthCredentials; }, [getReadAuthCredentials]);

  // Overview
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const [alerts, setAlerts] = useState<BalanceAlert[]>([]);

  // Transactions
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);

  // Gas
  const [gas, setGas] = useState<GasSummaryType | null>(null);
  const [gasPeriod, setGasPeriod] = useState("7d");
  const [nonce, setNonce] = useState<NonceStatus | null>(null);

  // Contract log
  const [contractLog, setContractLog] = useState<ContractInteraction[]>([]);
  const [clPage, setClPage] = useState(1);
  const [clTotal, setClTotal] = useState(0);
  const [clAction, setClAction] = useState("");

  // Send
  const [sendType, setSendType] = useState<"flr" | "hns">("flr");
  const [fromWallet, setFromWallet] = useState("backend");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; txHash?: string | null; error?: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const creds = await getCredentialsRef.current();
      if (!creds?.wallet || !creds?.signature) return; // Auth not ready yet
      const [ov, al] = await Promise.all([
        getWalletOverview(creds),
        getBalanceAlerts(creds),
      ]);
      setOverview(ov);
      setAlerts(al);
    } catch (err) {
      // Suppress 401 during initial auth flow — will retry on interval
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) {
        console.error("Wallet overview fetch error:", err);
      }
    }
  }, []);

  const fetchTransactions = useCallback(async (page: number) => {
    try {
      const creds = await getCredentialsRef.current();
      const result = await getWalletTransactions(creds, page, 20);
      setTxs(result.data);
      setTxTotal(result.pagination.total);
    } catch (err) {
      console.error("Wallet transactions fetch error:", err);
    }
  }, []);

  const fetchGas = useCallback(async (period: string) => {
    try {
      const creds = await getCredentialsRef.current();
      const [g, n] = await Promise.all([
        getGasSummary(creds, period),
        getNonceStatus(creds),
      ]);
      setGas(g);
      setNonce(n);
    } catch (err) {
      console.error("Gas summary fetch error:", err);
    }
  }, []);

  const fetchContractLog = useCallback(async (page: number, action: string) => {
    try {
      const creds = await getCredentialsRef.current();
      const result = await getContractLog(creds, page, 20, action || undefined);
      setContractLog(result.data);
      setClTotal(result.pagination.total);
    } catch (err) {
      console.error("Contract log fetch error:", err);
    }
  }, []);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const initialLoad = async () => {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchTransactions(1), fetchGas("7d"), fetchContractLog(1, "")]);
      setLoading(false);
      // If overview is still null (auth wasn't ready), retry once after 2s
      setOverview((prev) => {
        if (!prev) {
          retryTimer = setTimeout(() => {
            fetchOverview();
            fetchTransactions(1);
            fetchGas("7d");
            fetchContractLog(1, "");
          }, 2000);
        }
        return prev;
      });
    };

    initialLoad();
    const interval = setInterval(fetchOverview, 30000);
    return () => {
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [fetchOverview, fetchTransactions, fetchGas, fetchContractLog]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOverview();
    setRefreshing(false);
  };

  const handleSendConfirm = async () => {
    if (confirmText !== "CONFIRM") return;
    setSending(true);
    setSendResult(null);
    try {
      const creds = await getAdminCredentials();
      const result = sendType === "flr"
        ? await sendFLR(sendTo, parseFloat(sendAmount), creds, fromWallet)
        : await sendHNS(sendTo, parseFloat(sendAmount), creds);
      setSendResult({ success: true, txHash: result.txHash });
      setSendTo("");
      setSendAmount("");
      fetchOverview();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Send failed";
      // Extract API error message
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSendResult({ success: false, error: apiMsg || msg });
    } finally {
      setSending(false);
      setShowConfirm(false);
      setConfirmText("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wallet Management</h1>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className={`rounded-lg border p-4 ${alerts.some(a => a.severity === "critical") ? "border-red-500 bg-red-500/10" : "border-yellow-500 bg-yellow-500/10"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`w-5 h-5 ${alerts.some(a => a.severity === "critical") ? "text-red-500" : "text-yellow-500"}`} />
            <span className="font-semibold">Low Balance Alerts</span>
          </div>
          <div className="space-y-1">
            {alerts.map(a => (
              <p key={a.walletId} className="text-sm">
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="mr-2">
                  {a.severity}
                </Badge>
                <span className="font-medium">{a.name}</span>: {a.balance.toFixed(4)} FLR (threshold: {a.threshold} FLR)
              </p>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="gas">Gas & Nonce</TabsTrigger>
          <TabsTrigger value="contract-log">Contract Log</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="wrap-unwrap" className="flex items-center gap-1">
            <ArrowRightLeft className="w-3 h-3" /> Wrap/Unwrap
          </TabsTrigger>
          <TabsTrigger value="delegate">Delegate</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="staking">Staking</TabsTrigger>
          <TabsTrigger value="tld-portfolio">TLD Portfolio</TabsTrigger>
          <TabsTrigger value="domains-dns">Domains & DNS</TabsTrigger>
          <TabsTrigger value="operator">Operator</TabsTrigger>
        </TabsList>

        {/* ==================== OVERVIEW TAB ==================== */}
        <TabsContent value="overview" className="mt-4">
          {overview && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                FLR Price: ${overview.flrPriceUSD.toFixed(4)} USD | Last updated: {new Date(overview.timestamp).toLocaleTimeString()}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {overview.wallets.map(w => (
                  <Card key={w.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{w.name}</CardTitle>
                        <Badge variant="outline">{w.network}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <span>{truncateAddress(w.address)}</span>
                        {w.address !== "N/A" && <CopyButton text={w.address} />}
                      </div>
                      <div className={`text-2xl font-bold ${balanceColor(w.id, w.balance)}`}>
                        {w.balance.toFixed(4)} {w.network}
                      </div>
                      {w.network === "FLR" && (
                        <p className="text-sm text-muted-foreground">${w.balanceUSD.toFixed(2)} USD</p>
                      )}
                      <p className="text-xs text-muted-foreground">{w.role}</p>
                      {w.error && <p className="text-xs text-red-500">{w.error}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ==================== TRANSACTIONS TAB ==================== */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>TX Hash</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Gas Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No transactions found</TableCell></TableRow>
                  ) : txs.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">{new Date(tx.timestamp).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {tx.hash ? (
                          <a href={`${EXPLORER_URL}${tx.hash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                            {truncateAddress(tx.hash)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{truncateAddress(tx.to || "—")}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{tx.method || tx.action}</Badge></TableCell>
                      <TableCell className="text-right text-xs">{tx.gasCostFLR != null ? `${tx.gasCostFLR.toFixed(6)} FLR` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{tx.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {txTotal > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Page {txPage} of {Math.ceil(txTotal / 20)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => { setTxPage(p => p - 1); fetchTransactions(txPage - 1); }}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={txPage >= Math.ceil(txTotal / 20)} onClick={() => { setTxPage(p => p + 1); fetchTransactions(txPage + 1); }}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== GAS & NONCE TAB ==================== */}
        <TabsContent value="gas" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Label>Period:</Label>
            <Select value={gasPeriod} onValueChange={(v) => { setGasPeriod(v); fetchGas(v); }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24h</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {gas && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Gas Spent</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{gas.totalGasSpentFLR.toFixed(6)} FLR</p>
                    <p className="text-sm text-muted-foreground">${gas.totalGasCostUSD.toFixed(4)} USD</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Period</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{gas.period}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Methods</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{Object.keys(gas.byMethod).length}</p></CardContent>
                </Card>
              </div>

              {Object.keys(gas.byMethod).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Gas by Method</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Total Gas (FLR)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(gas.byMethod).map(([method, data]) => (
                          <TableRow key={method}>
                            <TableCell className="font-mono text-sm">{method}</TableCell>
                            <TableCell className="text-right">{data.count}</TableCell>
                            <TableCell className="text-right">{data.totalGasFLR.toFixed(6)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {nonce && (
            <Card>
              <CardHeader><CardTitle className="text-base">Nonce Status</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-mono text-sm">{truncateAddress(nonce.address)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Nonce</p>
                    <p className="font-bold">{nonce.currentNonce}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Nonce</p>
                    <p className="font-bold">{nonce.pendingNonce}</p>
                  </div>
                  <div>
                    {nonce.stuck ? (
                      <Badge variant="destructive">STUCK</Badge>
                    ) : nonce.hasPendingTx ? (
                      <Badge variant="secondary">Pending TX</Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-500 text-green-500">OK</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== CONTRACT LOG TAB ==================== */}
        <TabsContent value="contract-log" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Contract Interactions</CardTitle>
                <Select value={clAction} onValueChange={(v) => { setClAction(v); setClPage(1); fetchContractLog(1, v); }}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="All actions" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All actions</SelectItem>
                    <SelectItem value="dns_confirmed">dns_confirmed</SelectItem>
                    <SelectItem value="dns_failed">dns_failed</SelectItem>
                    <SelectItem value="price_updated">price_updated</SelectItem>
                    <SelectItem value="domain_registered">domain_registered</SelectItem>
                    <SelectItem value="nft_minted">nft_minted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>TX Hash</TableHead>
                    <TableHead className="text-right">Gas Used</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractLog.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No contract interactions found</TableCell></TableRow>
                  ) : contractLog.map(cl => (
                    <TableRow key={cl.id}>
                      <TableCell className="text-xs">{new Date(cl.timestamp).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{cl.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">
                        {cl.txHash ? (
                          <a href={`${EXPLORER_URL}${cl.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                            {truncateAddress(cl.txHash)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">{cl.gasUsed ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{JSON.stringify(cl.details)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {clTotal > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Page {clPage} of {Math.ceil(clTotal / 20)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={clPage <= 1} onClick={() => { setClPage(p => p - 1); fetchContractLog(clPage - 1, clAction); }}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={clPage >= Math.ceil(clTotal / 20)} onClick={() => { setClPage(p => p + 1); fetchContractLog(clPage + 1, clAction); }}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== SEND TAB ==================== */}
        <TabsContent value="send" className="mt-4">
          {sendResult && (
            <div className={`rounded-lg border p-4 mb-4 ${sendResult.success ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"}`}>
              {sendResult.success ? (
                <div>
                  <p className="font-semibold text-green-600">Transaction sent successfully</p>
                  {sendResult.txHash && (
                    <a href={`${EXPLORER_URL}${sendResult.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm flex items-center gap-1 mt-1">
                      View on Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-red-600">{sendResult.error}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Send FLR */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" /> Send FLR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>From Wallet</Label>
                  <Select value={fromWallet} onValueChange={(v) => { setFromWallet(v); setSendType("flr"); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {overview?.wallets.filter(w => w.network === "FLR" && ["backend", "operator", "treasury", "royalties"].includes(w.id)).map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} — {w.balance.toFixed(4)} FLR
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Recipient Address</Label>
                  <Input placeholder="0x..." value={sendType === "flr" ? sendTo : ""} onChange={e => { setSendType("flr"); setSendTo(e.target.value); }} />
                </div>
                <div className="space-y-2">
                  <Label>Amount (FLR)</Label>
                  <Input type="number" placeholder="0.0" value={sendType === "flr" ? sendAmount : ""} onChange={e => { setSendType("flr"); setSendAmount(e.target.value); }} />
                  <p className="text-xs text-muted-foreground">Max: 1000 FLR per send. 5 FLR reserve maintained.</p>
                </div>
                <Button
                  onClick={() => { setSendType("flr"); setShowConfirm(true); }}
                  disabled={sendType !== "flr" || !sendTo || !sendAmount}
                >
                  <Send className="w-4 h-4 mr-2" /> Send FLR
                </Button>
              </CardContent>
            </Card>

            {/* Send HNS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" /> Send HNS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {overview && (
                  <p className="text-sm text-muted-foreground">
                    HNS balance: {overview.wallets.find(w => w.id === "hns")?.balance.toFixed(6) ?? "—"} HNS
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Recipient Address</Label>
                  <Input placeholder="hs1..." value={sendType === "hns" ? sendTo : ""} onChange={e => { setSendType("hns"); setSendTo(e.target.value); }} />
                </div>
                <div className="space-y-2">
                  <Label>Amount (HNS)</Label>
                  <Input type="number" placeholder="0.0" value={sendType === "hns" ? sendAmount : ""} onChange={e => { setSendType("hns"); setSendAmount(e.target.value); }} />
                </div>
                <Button
                  onClick={() => { setSendType("hns"); setShowConfirm(true); }}
                  disabled={sendType !== "hns" || !sendTo || !sendAmount}
                >
                  <Send className="w-4 h-4 mr-2" /> Send HNS
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Confirmation Dialog */}
          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Send</DialogTitle>
                <DialogDescription>Review the transaction details before confirming.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium">{sendType === "flr" ? "Flare (FLR)" : "Handshake (HNS)"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-mono text-xs">{sendType === "flr" ? `${overview?.wallets.find(w => w.id === fromWallet)?.name || fromWallet} (${truncateAddress(overview?.wallets.find(w => w.id === fromWallet)?.address || "")})` : "HNS Primary Wallet"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-mono text-xs">{truncateAddress(sendTo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">{sendAmount} {sendType.toUpperCase()}</span>
                </div>
                <div className="border-t pt-3 mt-3">
                  <Label>Type CONFIRM to proceed</Label>
                  <Input
                    className="mt-2"
                    placeholder="CONFIRM"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowConfirm(false); setConfirmText(""); }}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={confirmText !== "CONFIRM" || sending}
                  onClick={handleSendConfirm}
                >
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {sending ? "Sending..." : "Confirm Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ==================== WRAP/UNWRAP TAB ==================== */}
        <TabsContent value="wrap-unwrap" className="mt-4">
          <WrapUnwrapTab />
        </TabsContent>

        {/* ==================== DELEGATE TAB ==================== */}
        <TabsContent value="delegate" className="mt-4">
          <DelegateTab />
        </TabsContent>

        {/* ==================== REWARDS TAB ==================== */}
        <TabsContent value="rewards" className="mt-4">
          <RewardsTab />
        </TabsContent>

        {/* ==================== STAKING TAB ==================== */}
        <TabsContent value="staking" className="mt-4">
          <StakingTab />
        </TabsContent>

        {/* ==================== TLD PORTFOLIO TAB ==================== */}
        <TabsContent value="tld-portfolio" className="mt-4">
          <TldPortfolioTab />
        </TabsContent>

        {/* ==================== DOMAINS & DNS TAB ==================== */}
        <TabsContent value="domains-dns" className="mt-4">
          <DomainsQuickTab />
        </TabsContent>

        {/* ==================== OPERATOR TAB ==================== */}
        <TabsContent value="operator" className="mt-4">
          <OperatorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

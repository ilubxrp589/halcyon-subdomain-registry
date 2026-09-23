"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useWeb3ModalAccount,
  useWeb3ModalProvider,
} from "@/lib/web3modal";
import { BrowserProvider, parseEther } from "ethers";
import { useAuth } from "@/hooks/useAuth";
import { useHnsWallet } from "@/hooks/useHnsWallet";
import { useHnsSwap } from "@/hooks/useHnsSwap";
import {
  setFlareAddress,
  transferName,
  renewName,
  sendHns,
  batchRenew,
  batchFinalize,
  batchReveal,
  getNodeInfo as fetchNodeInfo,
  exportWallet,
  updateDnsRecords,
} from "@/services/hnsWalletApi";
import type { NodeInfo, ExpiringName, BatchResult, NameState, AuctionEntry } from "@/services/hnsWalletApi";
import { listForSale } from "@/services/auctionHouseApi";
import { QRCodeSVG } from "qrcode.react";
import CountdownTimer from "./components/CountdownTimer";
import DnsRecordEditor from "./components/DnsRecordEditor";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet,
  ArrowUpDown,
  RefreshCw,
  Copy,
  Check,
  Send,
  Download,
  Globe,
  ArrowRight,
  Loader2,
  ExternalLink,
  Server,
  AlertTriangle,
  Shield,
  Search,
  ArrowRightLeft,
  Clock,
  Settings2,
  ChevronDown,
  ChevronRight,
  Tag,
  Flame,
  RotateCcw,
} from "lucide-react";

type Tab = "names" | "overview" | "swap" | "send" | "node";

export default function WalletPage() {
  const { isConnected, address } = useWeb3ModalAccount();
  const { getAuthCredentials, isAuthenticating, authError, clearAuth } = useAuth();
  const {
    wallet,
    names,
    auctions,
    history,
    receiveAddress,
    expiringNames,
    loading,
    error: walletError,
    refresh,
  } = useHnsWallet();
  const {
    rate,
    quote,
    swapHistory,
    rateLoading,
    quoteLoading,
    executing,
    error: swapError,
    fetchQuote,
    execute,
    refreshRate,
    refreshHistory,
    clearQuote,
  } = useHnsSwap();

  const [activeTab, setActiveTab] = useState<Tab>("names");
  const [copied, setCopied] = useState(false);

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <Wallet className="w-16 h-16 mx-auto mb-4 text-amber-500" />
        <h1 className="text-2xl font-bold mb-2">HNS Wallet</h1>
        <p className="text-muted-foreground mb-6">
          Connect your Flare wallet to manage your Handshake TLDs, participate
          in auctions, and swap HNS for FLR.
        </p>
        <w3m-button />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md text-center">
        {authError ? (
          <>
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-lg font-bold mb-2">Wallet Authentication Failed</h2>
            <p className="text-sm text-muted-foreground mb-4">{authError}</p>
            <Button
              variant="outline"
              onClick={() => {
                clearAuth();
                window.location.reload();
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reconnect Wallet
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-amber-500" />
            <p className="text-muted-foreground">
              {isAuthenticating
                ? "Waiting for signature approval in your wallet app..."
                : "Loading your HNS wallet..."}
            </p>
            {isAuthenticating && (
              <p className="text-xs text-muted-foreground mt-2">
                Open your wallet app (Bifrost) to approve the sign request
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "names", label: "My Names" },
    { id: "overview", label: "Overview" },
    { id: "swap", label: "Swap" },
    { id: "send", label: "Send / Receive" },
    { id: "node", label: "HSD Node" },
  ];

  const copyAddress = () => {
    if (receiveAddress) {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(receiveAddress);
      } else {
        const ta = document.createElement("textarea");
        ta.value = receiveAddress;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-8 h-8 text-amber-500" />
        <h1 className="text-2xl font-bold">HNS Wallet</h1>
        <button
          onClick={refresh}
          className="ml-auto p-2 rounded-lg hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {walletError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {walletError}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "names" && (
        <NamesTab
          names={names}
          auctions={auctions}
          expiringNames={expiringNames}
          getAuthCredentials={getAuthCredentials}
          onRefresh={refresh}
          flareAddress={address || ""}
        />
      )}
      {activeTab === "overview" && (
        <OverviewTab
          wallet={wallet}
          receiveAddress={receiveAddress}
          names={names}
          history={history}
          onCopy={copyAddress}
          copied={copied}
        />
      )}
      {activeTab === "swap" && (
        <SwapTab
          rate={rate}
          quote={quote}
          swapHistory={swapHistory}
          rateLoading={rateLoading}
          quoteLoading={quoteLoading}
          executing={executing}
          error={swapError}
          onFetchQuote={fetchQuote}
          onExecute={execute}
          onRefreshRate={refreshRate}
          onClearQuote={clearQuote}
          walletProvider={undefined}
          hnsBalance={wallet?.balance?.confirmed || 0}
        />
      )}
      {activeTab === "send" && (
        <SendReceiveTab
          receiveAddress={receiveAddress}
          hnsBalance={wallet?.balance?.confirmed || 0}
          getAuthCredentials={getAuthCredentials}
          onRefresh={refresh}
          onCopy={copyAddress}
          copied={copied}
        />
      )}
      {activeTab === "node" && (
        <NodeTab getAuthCredentials={getAuthCredentials} />
      )}
    </div>
  );
}

// =============================================================
//                     OVERVIEW TAB
// =============================================================

function OverviewTab({
  wallet,
  receiveAddress,
  names,
  history,
  onCopy,
  copied,
}: {
  wallet: ReturnType<typeof useHnsWallet>["wallet"];
  receiveAddress: string | null;
  names: ReturnType<typeof useHnsWallet>["names"];
  history: ReturnType<typeof useHnsWallet>["history"];
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-amber-500">
            {wallet?.balance?.confirmed?.toFixed(6) || "0.000000"}{" "}
            <span className="text-lg text-muted-foreground">HNS</span>
          </div>
          {(wallet?.balance?.unconfirmed || 0) > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              + {wallet?.balance?.unconfirmed?.toFixed(6) || "0"} unconfirmed
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Info */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{names.length}</div>
            <p className="text-sm text-muted-foreground">TLDs Owned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{wallet?.txCount || 0}</div>
            <p className="text-sm text-muted-foreground">Transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold truncate text-sm font-mono">
              {wallet?.walletId || "—"}
            </div>
            <p className="text-sm text-muted-foreground">Wallet ID</p>
          </CardContent>
        </Card>
      </div>

      {/* Receive Address */}
      {receiveAddress && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Receive Address</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg shrink-0">
                <QRCodeSVG value={receiveAddress} size={96} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded-lg truncate">
                    {receiveAddress}
                  </code>
                  <Button variant="outline" size="sm" onClick={onCopy}>
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Send HNS to this address to deposit into your wallet.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(0, 5).map((tx) => (
                <div
                  key={tx.hash}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <code className="font-mono text-xs truncate max-w-[200px]">
                    {tx.hash}
                  </code>
                  <span className="text-muted-foreground">
                    {tx.confirmations > 0
                      ? `${tx.confirmations} conf`
                      : "pending"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================
//                     MY NAMES TAB
// =============================================================

function NamesTab({
  names,
  auctions,
  expiringNames,
  getAuthCredentials,
  onRefresh,
  flareAddress,
}: {
  names: NameState[];
  auctions: AuctionEntry[];
  expiringNames: ExpiringName[];
  getAuthCredentials: () => Promise<any>;
  onRefresh: () => Promise<void>;
  flareAddress: string;
}) {
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dnsEditorName, setDnsEditorName] = useState<string | null>(null);
  const [transferDialog, setTransferDialog] = useState<{
    name: string;
    address: string;
  } | null>(null);
  const [listDialog, setListDialog] = useState<{
    name: string;
    price: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleRenew = async (name: string) => {
    setActionLoading(name);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await renewName(creds, name);
      if (res.success) {
        showFeedback("success", `Renewed ${name}`);
        onRefresh();
      } else {
        showFeedback("error", res.error || `Failed to renew ${name}`);
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Renewal failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchRenew = async (namesList: string[]) => {
    setActionLoading("batch-renew");
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await batchRenew(creds, namesList);
      if (res.success) {
        const count = res.results?.filter((r: BatchResult) => r.success).length || 0;
        showFeedback("success", `Renewed ${count}/${namesList.length} names`);
        onRefresh();
      } else {
        showFeedback("error", "Batch renew failed");
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Batch renew failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetFlareAddress = async (name: string) => {
    setActionLoading(name);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await setFlareAddress(creds, name);
      if (res.success) {
        showFeedback("success", `Set flr:${flareAddress.slice(0, 8)}... on ${name}`);
        onRefresh();
      } else {
        showFeedback("error", res.error || `Failed to set Flare address on ${name}`);
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to set Flare address");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransfer = async () => {
    if (!transferDialog) return;
    setActionLoading(transferDialog.name);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await transferName(creds, transferDialog.name, transferDialog.address);
      if (res.success) {
        showFeedback("success", `Transfer initiated for ${transferDialog.name}`);
        setTransferDialog(null);
        onRefresh();
      } else {
        showFeedback("error", res.error || `Failed to transfer ${transferDialog.name}`);
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleListForSale = async () => {
    if (!listDialog) return;
    const price = parseFloat(listDialog.price);
    if (!price || price <= 0) {
      showFeedback("error", "Enter a valid price");
      return;
    }
    setActionLoading(listDialog.name);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await listForSale(creds, { name: listDialog.name, priceHns: price });
      if (res.success) {
        showFeedback("success", `Listed ${listDialog.name} for ${price} HNS`);
        setListDialog(null);
        onRefresh();
      } else {
        showFeedback("error", res.error || `Failed to list ${listDialog.name}`);
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Listing failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchReveal = async (namesList: string[]) => {
    setActionLoading("batch-reveal");
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await batchReveal(creds, namesList);
      if (res.success) {
        const count = res.results?.filter((r: BatchResult) => r.success).length || 0;
        showFeedback("success", `Revealed ${count}/${namesList.length} bids`);
        onRefresh();
      } else {
        showFeedback("error", "Batch reveal failed");
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Batch reveal failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchFinalize = async (namesList: string[]) => {
    setActionLoading("batch-finalize");
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await batchFinalize(creds, namesList);
      if (res.success) {
        const count = res.results?.filter((r: BatchResult) => r.success).length || 0;
        showFeedback("success", `Finalized ${count}/${namesList.length} names`);
        onRefresh();
      } else {
        showFeedback("error", "Batch finalize failed");
      }
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Batch finalize failed");
    } finally {
      setActionLoading(null);
    }
  };

  const getStateBadge = (state: string) => {
    switch (state.toUpperCase()) {
      case "CLOSED":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Owned</span>;
      case "TRANSFER":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Transferring</span>;
      case "REVOKE":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Revoking</span>;
      case "RENEW":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Renewing</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{state}</span>;
    }
  };

  // Pending actions from auctions
  const needsReveal = auctions.filter((a) => a.state.toUpperCase() === "REVEAL");
  const needsFinalize = auctions.filter(
    (a) => a.state.toUpperCase() === "CLOSED" && names.every((n) => n.name !== a.name)
  );

  return (
    <div className="space-y-4">
      {/* Global Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Section 1: Expiring Names Alert */}
      {expiringNames.length > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">
                {expiringNames.length} name{expiringNames.length > 1 ? "s" : ""} approaching renewal
              </span>
            </div>
            <div className="space-y-2">
              {expiringNames.map((en) => (
                <div
                  key={en.name}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm font-bold">{en.name}/</code>
                    <span className={`text-xs ${
                      en.urgency === "critical" ? "text-red-400" :
                      en.urgency === "warning" ? "text-amber-400" : "text-muted-foreground"
                    }`}>
                      {en.daysLeft}d left
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRenew(en.name)}
                    disabled={actionLoading === en.name}
                  >
                    {actionLoading === en.name ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Renew
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
            {expiringNames.length > 1 && (
              <Button
                className="w-full mt-3"
                variant="outline"
                size="sm"
                onClick={() => handleBatchRenew(expiringNames.map((e) => e.name))}
                disabled={actionLoading === "batch-renew"}
              >
                {actionLoading === "batch-renew" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-3 h-3 mr-2" />
                )}
                Renew All ({expiringNames.length})
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 2: Owned Names List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Owned Names ({names.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {names.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No TLDs owned yet. Bid on names in the Auction House to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {names.map((n) => (
                <div key={n.name} className="border border-border rounded-lg">
                  {/* Collapsed Row */}
                  <button
                    onClick={() =>
                      setExpandedName(expandedName === n.name ? null : n.name)
                    }
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-sm font-bold">{n.name}/</code>
                      {getStateBadge(n.state)}
                      {n.timeRemainingHuman && n.actionUrgency !== "none" && (
                        <span className="text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {n.timeRemainingHuman}
                        </span>
                      )}
                    </div>
                    {expandedName === n.name ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded Actions */}
                  {expandedName === n.name && (
                    <div className="px-4 pb-4 pt-1 border-t border-border">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDnsEditorName(n.name)}
                          className="justify-start"
                        >
                          <Globe className="w-3.5 h-3.5 mr-2" />
                          DNS Records
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetFlareAddress(n.name)}
                          disabled={actionLoading === n.name}
                          className="justify-start"
                        >
                          {actionLoading === n.name ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          ) : (
                            <Flame className="w-3.5 h-3.5 mr-2" />
                          )}
                          Set Flare Addr
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTransferDialog({ name: n.name, address: "" })
                          }
                          className="justify-start"
                        >
                          <Send className="w-3.5 h-3.5 mr-2" />
                          Transfer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRenew(n.name)}
                          disabled={actionLoading === n.name}
                          className="justify-start"
                        >
                          {actionLoading === n.name ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5 mr-2" />
                          )}
                          Renew
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setListDialog({ name: n.name, price: "" })
                          }
                          className="justify-start"
                        >
                          <Tag className="w-3.5 h-3.5 mr-2" />
                          List for Sale
                        </Button>
                      </div>

                      {/* Name details */}
                      <div className="mt-3 text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                        <span>Phase: {n.phase}</span>
                        <span>Height: {n.height.toLocaleString()}</span>
                        {n.renewalHeight > 0 && (
                          <span>Renewal at: {n.renewalHeight.toLocaleString()}</span>
                        )}
                        {n.expiryHeight > 0 && (
                          <span>Expires at: {n.expiryHeight.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Pending Actions */}
      {(needsReveal.length > 0 || needsFinalize.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {needsReveal.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Needs Reveal ({needsReveal.length})
                </p>
                <div className="space-y-1">
                  {needsReveal.map((a) => (
                    <div
                      key={a.name}
                      className="flex items-center justify-between py-1.5"
                    >
                      <code className="font-mono text-sm">{a.name}/</code>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                        Reveal
                      </span>
                    </div>
                  ))}
                </div>
                {needsReveal.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() =>
                      handleBatchReveal(needsReveal.map((a) => a.name))
                    }
                    disabled={actionLoading === "batch-reveal"}
                  >
                    {actionLoading === "batch-reveal" ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : null}
                    Reveal All ({needsReveal.length})
                  </Button>
                )}
              </div>
            )}

            {needsFinalize.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Needs Finalize ({needsFinalize.length})
                </p>
                <div className="space-y-1">
                  {needsFinalize.map((a) => (
                    <div
                      key={a.name}
                      className="flex items-center justify-between py-1.5"
                    >
                      <code className="font-mono text-sm">{a.name}/</code>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                        Finalize
                      </span>
                    </div>
                  ))}
                </div>
                {needsFinalize.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() =>
                      handleBatchFinalize(needsFinalize.map((a) => a.name))
                    }
                    disabled={actionLoading === "batch-finalize"}
                  >
                    {actionLoading === "batch-finalize" ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : null}
                    Finalize All ({needsFinalize.length})
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DNS Record Editor Modal */}
      <Dialog
        open={!!dnsEditorName}
        onOpenChange={(open) => {
          if (!open) setDnsEditorName(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              DNS Records — {dnsEditorName}/
            </DialogTitle>
          </DialogHeader>
          {dnsEditorName && (
            <DnsRecordEditor
              name={dnsEditorName}
              getAuthCredentials={getAuthCredentials}
              onClose={() => setDnsEditorName(null)}
              onRefresh={onRefresh}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog
        open={!!transferDialog}
        onOpenChange={(open) => {
          if (!open) setTransferDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Transfer {transferDialog?.name}/
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Transfers have a ~2 day lockup period. The name will be unusable
                during this time.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Destination HNS Address
              </label>
              <Input
                placeholder="hs1..."
                value={transferDialog?.address || ""}
                onChange={(e) =>
                  setTransferDialog((prev) =>
                    prev ? { ...prev, address: e.target.value } : null
                  )
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={
                actionLoading === transferDialog?.name ||
                !transferDialog?.address
              }
            >
              {actionLoading === transferDialog?.name ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List for Sale Dialog */}
      <Dialog
        open={!!listDialog}
        onOpenChange={(open) => {
          if (!open) setListDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              List {listDialog?.name}/ for Sale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Price (HNS)
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={listDialog?.price || ""}
                onChange={(e) =>
                  setListDialog((prev) =>
                    prev ? { ...prev, price: e.target.value } : null
                  )
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your name will be listed on the HSR marketplace. You retain
              ownership until a buyer completes the purchase.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleListForSale}
              disabled={
                actionLoading === listDialog?.name ||
                !listDialog?.price ||
                parseFloat(listDialog?.price || "0") <= 0
              }
            >
              {actionLoading === listDialog?.name ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              List for Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
//                     SWAP TAB
// =============================================================

function SwapTab({
  rate,
  quote,
  swapHistory,
  rateLoading,
  quoteLoading,
  executing,
  error,
  onFetchQuote,
  onExecute,
  onRefreshRate,
  onClearQuote,
  walletProvider,
  hnsBalance,
}: {
  rate: ReturnType<typeof useHnsSwap>["rate"];
  quote: ReturnType<typeof useHnsSwap>["quote"];
  swapHistory: ReturnType<typeof useHnsSwap>["swapHistory"];
  rateLoading: boolean;
  quoteLoading: boolean;
  executing: boolean;
  error: string | null;
  onFetchQuote: (dir: "buy_hns" | "sell_hns", amount: number) => Promise<void>;
  onExecute: (
    quoteId: string,
    flrTxHash?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onRefreshRate: () => Promise<void>;
  onClearQuote: () => void;
  walletProvider: any;
  hnsBalance: number;
}) {
  const [direction, setDirection] = useState<"buy_hns" | "sell_hns">("buy_hns");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flip = () => {
    setDirection((d) => (d === "buy_hns" ? "sell_hns" : "buy_hns"));
    setAmount("");
    onClearQuote();
  };

  // Debounced quote fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      onClearQuote();
      return;
    }
    debounceRef.current = setTimeout(() => {
      onFetchQuote(direction, num);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirmSwap = async () => {
    if (!quote) return;
    const result = await onExecute(quote.quoteId);
    if (result.success) {
      setConfirmOpen(false);
      setAmount("");
    }
  };

  const fromToken = direction === "buy_hns" ? "FLR" : "HNS";
  const toToken = direction === "buy_hns" ? "HNS" : "FLR";
  const fromAmount =
    direction === "buy_hns" ? quote?.flrAmount : quote?.hnsAmount;
  const toAmount =
    direction === "buy_hns" ? quote?.hnsAmount : quote?.flrAmount;

  return (
    <div className="space-y-4">
      <Card className="relative">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Swap HNS / FLR</CardTitle>
            <button
              onClick={onRefreshRate}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Refresh rate"
            >
              <RefreshCw
                className={`w-4 h-4 ${rateLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* From */}
          <div className="p-4 rounded-lg bg-muted opacity-60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {direction === "buy_hns" ? "You Pay" : "You Send"}
              </span>
              <span className="text-xs text-muted-foreground">{fromToken}</span>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              disabled
              className="text-2xl font-bold bg-transparent border-0 p-0 h-auto focus-visible:ring-0 cursor-not-allowed"
            />
            {direction === "sell_hns" && (
              <p className="text-xs text-muted-foreground mt-1">
                Balance: {hnsBalance.toFixed(2)} HNS
              </p>
            )}
          </div>

          {/* Flip Button */}
          <div className="flex justify-center">
            <button
              disabled
              className="p-2 rounded-full bg-muted opacity-60 cursor-not-allowed"
            >
              <ArrowUpDown className="w-5 h-5" />
            </button>
          </div>

          {/* To */}
          <div className="p-4 rounded-lg bg-muted opacity-60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">You Receive</span>
              <span className="text-xs text-muted-foreground">{toToken}</span>
            </div>
            <div className="text-2xl font-bold">
              <span className="text-muted-foreground">0.00</span>
            </div>
          </div>

          {/* Rate Info */}
          {rate && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Rate</span>
                <span>
                  1 HNS = {rate.flrPerHns.toFixed(4)} FLR
                </span>
              </div>
              <div className="flex justify-between">
                <span>Fee</span>
                <span>{rate.feePct}%</span>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled
          >
            Coming Soon
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            HNS/FLR swaps are not yet available. Rates shown are live from FTSO + CoinGecko.
          </p>
        </CardContent>
      </Card>

      {/* Swap History */}
      {swapHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Swap History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {swapHistory.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <div>
                    <span
                      className={
                        s.direction === "buy_hns"
                          ? "text-green-400"
                          : "text-amber-400"
                      }
                    >
                      {s.direction === "buy_hns" ? "Buy" : "Sell"}
                    </span>{" "}
                    {s.hnsAmount.toFixed(2)} HNS
                  </div>
                  <div className="text-muted-foreground">
                    {s.status} | {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Swap</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {direction === "buy_hns" ? "You pay" : "You send"}
              </span>
              <span className="font-bold">
                {fromAmount?.toFixed(6)} {fromToken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-bold">
                {toAmount?.toFixed(6)} {toToken}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rate</span>
              <span>
                1 HNS = {rate?.flrPerHns.toFixed(4)} FLR
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fee</span>
              <span>{rate?.feePct}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Rate locked for 60 seconds.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSwap} disabled={executing}>
              {executing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Swap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
//                   SEND / RECEIVE TAB
// =============================================================

function SendReceiveTab({
  receiveAddress,
  hnsBalance,
  getAuthCredentials,
  onRefresh,
  onCopy,
  copied,
}: {
  receiveAddress: string | null;
  hnsBalance: number;
  getAuthCredentials: () => Promise<any>;
  onRefresh: () => Promise<void>;
  onCopy: () => void;
  copied: boolean;
}) {
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [confirmSend, setConfirmSend] = useState(false);

  // Export wallet state
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<{
    mnemonic: string | null;
    masterKey: string | null;
  } | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setConfirmExport(false);
    setExporting(true);
    setExportError(null);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await exportWallet(creds);
      if (res.success) {
        setExportData({
          mnemonic: res.mnemonic || null,
          masterKey: res.masterKey || null,
        });
      } else {
        setExportError(res.error || "Failed to export wallet");
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const copyExportData = () => {
    const text = exportData?.mnemonic
      ? `Mnemonic: ${exportData.mnemonic}`
      : `Master Key: ${exportData?.masterKey || ""}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleSend = async () => {
    setConfirmSend(false);
    if (!sendAddress || !sendAmount) return;
    setSending(true);
    setResult(null);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const res = await sendHns(creds, sendAddress, parseFloat(sendAmount));
      setResult({
        success: res.success,
        message: res.success
          ? `Sent ${sendAmount} HNS (tx: ${res.txHash?.slice(0, 16)}...)`
          : res.error || "Send failed",
      });
      if (res.success) {
        setSendAddress("");
        setSendAmount("");
        onRefresh();
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Send failed",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Receive */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="w-5 h-5" />
            Receive HNS
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receiveAddress ? (
            <div className="space-y-3">
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg">
                  <QRCodeSVG value={receiveAddress} size={160} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded-lg truncate">
                  {receiveAddress}
                </code>
                <Button variant="outline" size="sm" onClick={onCopy}>
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Send HNS from Bob Wallet, ShakeStation, or any Handshake wallet
                to this address. Your Flare address will be auto-linked to any
                TLDs transferred in.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading receive address...</p>
          )}
        </CardContent>
      </Card>

      {/* Send */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5" />
            Send HNS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Balance: {hnsBalance.toFixed(6)} HNS
          </p>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Recipient Address
            </label>
            <Input
              placeholder="hs1..."
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Amount (HNS)
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
            />
          </div>

          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.success
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}
            >
              {result.message}
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => setConfirmSend(true)}
            disabled={
              sending ||
              !sendAddress ||
              !sendAmount ||
              parseFloat(sendAmount) <= 0
            }
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send HNS
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Send Confirmation Dialog (hsd-018) */}
      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Confirm Send
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                This action is irreversible. Double-check the address.
              </p>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold">{sendAmount} HNS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">To</span>
              <code className="text-sm font-mono truncate max-w-[250px]">
                {sendAddress}
              </code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span>
                {(hnsBalance - parseFloat(sendAmount || "0")).toFixed(6)} HNS
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export / Backup Wallet */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Backup Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Export your HNS wallet seed phrase or master key for backup and
            self-custody.
          </p>
          {exportError && (
            <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
              {exportError}
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setConfirmExport(true)}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export Wallet Keys
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export Confirmation Dialog */}
      <Dialog open={confirmExport} onOpenChange={setConfirmExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Export Wallet Keys
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">
                Your seed phrase gives full access to all HNS in this wallet.
                Never share it with anyone.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Store your backup in a safe, offline location. Anyone with these
              keys can spend your HNS and control your TLDs.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExport(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleExport}>
              I Understand, Show Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Data Display Dialog */}
      <Dialog
        open={!!exportData}
        onOpenChange={(open) => {
          if (!open) setExportData(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Wallet Backup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {exportData?.mnemonic && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Seed Phrase
                </label>
                <div className="p-3 rounded-lg bg-muted font-mono text-sm break-all select-all">
                  {exportData.mnemonic}
                </div>
              </div>
            )}
            {exportData?.masterKey && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Master Key (xpriv)
                </label>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs break-all select-all">
                  {exportData.masterKey}
                </div>
              </div>
            )}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-amber-400">
                Write this down and store it offline. Close this dialog when
                done &mdash; it won&apos;t be shown again automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyExportData}>
              {exportCopied ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {exportCopied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => setExportData(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
//                     HSD NODE TAB (hsd-016)
// =============================================================

function NodeTab({
  getAuthCredentials,
}: {
  getAuthCredentials: () => Promise<any>;
}) {
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const info = await fetchNodeInfo(creds);
      if (info.success) {
        setNodeInfo(info);
        setError(null);
      } else {
        setError("Failed to fetch node info");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [getAuthCredentials]);

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 15000);
    return () => clearInterval(interval);
  }, [fetchInfo]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-amber-500" />
        <p className="text-muted-foreground">Connecting to HSD node...</p>
      </div>
    );
  }

  if (error || !nodeInfo) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Server className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <p className="text-red-400">{error || "Node unavailable"}</p>
        </CardContent>
      </Card>
    );
  }

  const syncPct = ((nodeInfo.chain.progress || 0) * 100).toFixed(2);
  const isSynced = parseFloat(syncPct) >= 99.9;

  return (
    <div className="space-y-4">
      {/* Chain Status */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="w-5 h-5" />
              Chain Status
            </CardTitle>
            <span
              className={`text-sm px-2 py-1 rounded-full ${
                isSynced
                  ? "bg-green-500/10 text-green-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {isSynced ? "Synced" : "Syncing..."}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Block Height</div>
              <div className="text-xl font-bold font-mono">
                {nodeInfo.chain.height.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Sync Progress</div>
              <div className="text-xl font-bold">{syncPct}%</div>
            </div>
          </div>
          {!isSynced && (
            <div className="mt-3 w-full bg-muted rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${syncPct}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Network Info */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Peers</div>
            <div className="text-2xl font-bold">{nodeInfo.peers.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Mempool</div>
            <div className="text-2xl font-bold">{nodeInfo.mempool.size}</div>
            <div className="text-xs text-muted-foreground">
              {(nodeInfo.mempool.bytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Version & Uptime */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">HSD Version</div>
              <div className="font-mono">{nodeInfo.version}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Uptime</div>
              <div className="font-mono">
                {Math.floor(nodeInfo.uptime / 3600)}h{" "}
                {Math.floor((nodeInfo.uptime % 3600) / 60)}m
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Peers List */}
      {nodeInfo.peers.list.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Connected Peers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nodeInfo.peers.list.map((peer, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <code className="font-mono text-xs">{peer.addr}</code>
                  <span className="text-muted-foreground">
                    h:{peer.height}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


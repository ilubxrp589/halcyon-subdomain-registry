"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSystemStatus,
  getReservedWords,
  addReservedWord,
  removeReservedWord,
  getHNSWalletInfo,
  getSystemAddresses,
  startHNSNode,
  stopHNSNode,
  getCaddyStatus,
  getDnsCheck,
  getServerStats,
  getSSLCerts,
  SystemStatus,
  ReservedWord,
  SystemAddresses,
  CaddyStatus,
  DnsCheckResult,
  ServerStats,
  SSLCert,
} from "@/services/adminApi";
import {
  RefreshCw,
  Database,
  Server,
  Wallet,
  Shield,
  Plus,
  X,
  Loader2,
  HardDrive,
  CheckCircle,
  XCircle,
  FileCode,
  ExternalLink,
  Globe,
  Radio,
  Lock,
  Zap,
} from "lucide-react";

export default function SystemPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [reservedWords, setReservedWords] = useState<ReservedWord[]>([]);
  const [hnsWallet, setHnsWallet] = useState<{ address: string; balance: string; unconfirmed: string; txCount: number; ownedTLDs: { name: string }[] } | null>(null);
  const [addresses, setAddresses] = useState<SystemAddresses | null>(null);
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null);
  const [dnsCheck, setDnsCheck] = useState<DnsCheckResult | null>(null);
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [sslCerts, setSslCerts] = useState<SSLCert[]>([]);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add word modal
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  // Remove word state
  const [removingWord, setRemovingWord] = useState<string | null>(null);

  // HNS node control state
  const [hnsActionLoading, setHnsActionLoading] = useState<string | null>(null);

  // Use ref to avoid dependency issues with getReadAuthCredentials
  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [statusData, wordsData, hnsWalletData, addressesData, caddyData, serverData, sslData] = await Promise.all([
        getSystemStatus(credentials),
        getReservedWords(credentials),
        getHNSWalletInfo(credentials).catch(() => null),
        getSystemAddresses(credentials).catch(() => null),
        getCaddyStatus(credentials).catch(() => null),
        getServerStats(credentials).catch(() => null),
        getSSLCerts(credentials).catch(() => null),
      ]);
      setStatus(statusData);
      setReservedWords(wordsData);
      setHnsWallet(hnsWalletData);
      setAddresses(addressesData);
      if (caddyData) setCaddyStatus(caddyData);
      if (serverData) setServerStats(serverData);
      if (sslData) setSslCerts(sslData.certs);
    } catch (err) {
      console.error("Failed to fetch system data:", err);
    }
  }, []); // No dependencies - uses ref

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;

    setAdding(true);
    try {
      const credentials = await getAdminCredentials();
      await addReservedWord(newWord.toLowerCase().trim(), newReason.trim() || "", credentials);
      await fetchData();
      setShowAddWord(false);
      setNewWord("");
      setNewReason("");
    } catch (err) {
      console.error("Failed to add word:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveWord = async (word: string) => {
    setRemovingWord(word);
    try {
      const credentials = await getAdminCredentials();
      await removeReservedWord(word, credentials);
      await fetchData();
    } catch (err) {
      console.error("Failed to remove word:", err);
    } finally {
      setRemovingWord(null);
    }
  };

  const handleHNSAction = async (action: "start" | "stop") => {
    setHnsActionLoading(action);
    try {
      const credentials = await getAdminCredentials();
      if (action === "start") {
        await startHNSNode(credentials);
      } else {
        await stopHNSNode(credentials);
      }
      // Wait a moment then refresh to get new status
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchData();
    } catch (err) {
      console.error(`Failed to ${action} HNS node:`, err);
    } finally {
      setHnsActionLoading(null);
    }
  };

  const handleDnsCheck = async () => {
    setDnsChecking(true);
    try {
      const credentials = await getReadAuthCredentials();
      const result = await getDnsCheck(credentials);
      setDnsCheck(result);
    } catch (err) {
      console.error("DNS check failed:", err);
    } finally {
      setDnsChecking(false);
    }
  };

  const dbStats = status?.database || {};

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System</h1>
          <p className="text-muted-foreground">System health and configuration</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Wallets Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Wallets
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* HNS Wallet */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">HNS Wallet</CardTitle>
              <CardDescription>Handshake operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Address</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {hnsWallet?.address || "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono font-medium">
                  {hnsWallet?.balance ? `${hnsWallet.balance} HNS` : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Backend Wallet (FLR) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Backend Wallet</CardTitle>
              <CardDescription>Signs FLR transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Address</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {addresses?.wallets?.backend?.address || "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono font-medium">
                  {addresses?.wallets?.backend?.balance ? `${addresses.wallets.backend.balance} FLR` : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Platform Wallet */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Platform Wallet</CardTitle>
              <CardDescription>Receives escrow payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Address</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {addresses?.wallets?.platform?.address || "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono font-medium">
                  {addresses?.wallets?.platform?.balance ? `${addresses.wallets.platform.balance} FLR` : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Contracts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Smart Contracts</CardTitle>
          </div>
          <CardDescription>Deployed contract addresses on Flare</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "NFT Contract", address: addresses?.contracts?.nft, desc: "ERC-721 subdomain ownership" },
              { name: "Escrow Contract", address: addresses?.contracts?.escrow, desc: "Payment processing" },
              { name: "Price Oracle", address: addresses?.contracts?.priceOracle, desc: "FLR/USD price feed" },
              { name: "DNS Oracle", address: addresses?.contracts?.dnsOracle, desc: "DNS verification" },
            ].map((contract) => (
              <div key={contract.name} className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{contract.name}</span>
                  {contract.address && (
                    <a
                      href={`https://coston2-explorer.flare.network/address/${contract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{contract.desc}</p>
                <code className="text-xs font-mono break-all">
                  {contract.address || "Not configured"}
                </code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* HNS Node */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">HNS Node</CardTitle>
              </div>
              {status?.hns?.connected ? (
                <Badge variant="outline" className="text-green-600 border-green-500">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-600 border-red-500">
                  <XCircle className="w-3 h-3 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Block Height</span>
              <span className="font-mono">{status?.hns?.height?.toLocaleString() || "N/A"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sync Status</span>
              <span className={status?.hns?.synced ? "text-green-500" : "text-yellow-500"}>
                {status?.hns?.synced ? "Synced" : "Syncing"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network</span>
              <span className="font-mono">main</span>
            </div>
            <div className="flex gap-2 pt-3 border-t mt-3">
              {status?.hns?.connected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleHNSAction("stop")}
                  disabled={hnsActionLoading !== null}
                >
                  {hnsActionLoading === "stop" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Stop Node
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleHNSAction("start")}
                  disabled={hnsActionLoading !== null}
                >
                  {hnsActionLoading === "start" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Start Node
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Flare Network */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-lg">Flare Network</CardTitle>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                Coston2
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Chain ID</span>
              <span className="font-mono">114</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">RPC</span>
              <span className="font-mono text-xs truncate max-w-[200px]">coston2-api.flare.network</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">FTSO Price</span>
              <span className="font-mono">
                {status?.ftsoPrice?.price ? `$${status.ftsoPrice.price.toFixed(6)}` : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Infrastructure Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Caddy Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Caddy Web Server</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              {caddyStatus ? (
                <Badge variant="outline" className={caddyStatus.active === "active" ? "text-green-600 border-green-500" : "text-red-600 border-red-500"}>
                  {caddyStatus.active}
                </Badge>
              ) : (
                <span className="text-muted-foreground">Loading...</span>
              )}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">{caddyStatus?.version || "N/A"}</span>
            </div>
          </CardContent>
        </Card>

        {/* DNS Resolver */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">DNS Resolver</CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={handleDnsCheck} disabled={dnsChecking}>
                {dnsChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span className="ml-1">Test</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              {dnsCheck ? (
                <Badge variant="outline" className={dnsCheck.working ? "text-green-600 border-green-500" : "text-red-600 border-red-500"}>
                  {dnsCheck.working ? "Working" : "Down"}
                </Badge>
              ) : (
                <span className="text-muted-foreground">Click Test</span>
              )}
            </div>
            {dnsCheck?.latencyMs != null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Latency</span>
                <span className="font-mono">{dnsCheck.latencyMs}ms</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remote Server */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Remote Server (192.0.2.67)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {serverStats ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">CPU Load</span>
                    <span className="font-mono">{serverStats.load.load1} / {serverStats.load.load5} / {serverStats.load.load15}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-mono">{serverStats.memory.used}MB / {serverStats.memory.total}MB</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${serverStats.memory.total > 0 ? (serverStats.memory.used / serverStats.memory.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Disk</span>
                    <span className="font-mono">{serverStats.disk.used} / {serverStats.disk.size} ({serverStats.disk.usePct})</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: serverStats.disk.usePct }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uptime</span>
                  <span>{serverStats.uptime}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to connect</p>
            )}
          </CardContent>
        </Card>

        {/* SSL Certificates */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">SSL Certificates</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {sslCerts.length > 0 ? (
              <div className="space-y-3">
                {sslCerts.map((cert) => {
                  const color = cert.daysRemaining == null ? "text-muted-foreground"
                    : cert.daysRemaining > 30 ? "text-green-500"
                    : cert.daysRemaining > 7 ? "text-yellow-500"
                    : "text-red-500";
                  return (
                    <div key={cert.domain} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{cert.domain}</span>
                      {cert.daysRemaining != null ? (
                        <Badge variant="outline" className={color}>
                          {cert.daysRemaining}d remaining
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{cert.error || "Unknown"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Database Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Database Statistics</CardTitle>
          </div>
          <CardDescription>PostgreSQL table counts and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(dbStats).map(([table, count]) => {
              if (table === "pendingByStatus") return null;
              const displayCount = typeof count === "number" ? count : "Error";
              return (
                <div key={table} className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground capitalize">
                    {table.replace(/_/g, " ")}
                  </p>
                  <p className="text-2xl font-bold font-mono">{displayCount}</p>
                </div>
              );
            })}
          </div>

          {/* Pending by status breakdown */}
          {dbStats.pendingByStatus && typeof dbStats.pendingByStatus === "object" && !("error" in dbStats.pendingByStatus) && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Pending Purchases by Status</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(dbStats.pendingByStatus as Record<string, number>).map(([statusKey, count]) => (
                  <Badge key={statusKey} variant="outline">
                    {statusKey}: {typeof count === "number" ? count : 0}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reserved Words */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Reserved Words</CardTitle>
            </div>
            <Button size="sm" onClick={() => setShowAddWord(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Word
            </Button>
          </div>
          <CardDescription>
            Words blocked from subdomain registration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reservedWords.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No reserved words configured
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {reservedWords.map((word) => (
                <Badge
                  key={word.word}
                  variant="secondary"
                  className="text-sm py-1.5 px-3 gap-2"
                >
                  {word.word}
                  <button
                    onClick={() => handleRemoveWord(word.word)}
                    disabled={removingWord === word.word}
                    className="hover:text-destructive"
                  >
                    {removingWord === word.word ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">System Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Environment</p>
              <p className="text-lg font-medium">
                {process.env.NODE_ENV || "development"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">API URL</p>
              <p className="text-sm font-mono truncate">
                {process.env.NEXT_PUBLIC_API_URL || "localhost:4000"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Network</p>
              <p className="text-lg font-medium">Coston2</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm">
                {status?.timestamp
                  ? new Date(status.timestamp).toLocaleTimeString()
                  : "N/A"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Word Modal */}
      <Dialog open={showAddWord} onOpenChange={setShowAddWord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Reserved Word</DialogTitle>
            <DialogDescription>
              This word will be blocked from subdomain registration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Word</label>
              <Input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                placeholder="admin"
              />
              <p className="text-xs text-muted-foreground">
                Only letters, numbers, and hyphens allowed
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="System reserved"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWord(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWord} disabled={adding || !newWord.trim()}>
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Word
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ServiceCard } from "@/components/admin/ServiceCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSystemStatus,
  startWatcher,
  stopWatcher,
  startPriceSync,
  stopPriceSync,
  forcePriceSync,
  startListener,
  stopListener,
  getListenerStats,
  resetAllPreviewCredits,
  SystemStatus,
} from "@/services/adminApi";
import {
  RefreshCw,
  Eye,
  DollarSign,
  Radio,
  Zap,
  Loader2,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Gift,
  Image,
} from "lucide-react";

interface ListenerStats {
  isRunning: boolean;
  lastProcessedBlock: number;
  eventsProcessed: number;
  startedAt?: string;
}

export default function ServicesPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [listenerStats, setListenerStats] = useState<ListenerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catchupBlock, setCatchupBlock] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Use ref to avoid dependency issues with getReadAuthCredentials
  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [statusData, statsData] = await Promise.all([
        getSystemStatus(credentials),
        getListenerStats(credentials).catch(() => null),
      ]);
      setStatus(statusData);
      setListenerStats(statsData as ListenerStats);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  }, []); // No dependencies - uses ref

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
    const interval = setInterval(fetchData, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleServiceAction = async (service: string, action: string) => {
    setActionLoading(`${service}:${action}`);
    try {
      const credentials = await getAdminCredentials();

      switch (`${service}:${action}`) {
        case "watcher:start":
          await startWatcher(credentials);
          break;
        case "watcher:stop":
          await stopWatcher(credentials);
          break;
        case "priceSync:start":
          await startPriceSync(credentials);
          break;
        case "priceSync:stop":
          await stopPriceSync(credentials);
          break;
        case "priceSync:force":
          await forcePriceSync(credentials);
          break;
        case "listener:start":
          await startListener(credentials);
          break;
        case "listener:stop":
          await stopListener(credentials);
          break;
      }

      await fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCatchup = async () => {
    if (!catchupBlock) return;
    setActionLoading("listener:catchup");
    try {
      const credentials = await getAdminCredentials();
      const { catchupEvents } = await import("@/services/adminApi");
      await catchupEvents(parseInt(catchupBlock), credentials);
      setCatchupBlock("");
      await fetchData();
    } catch (err) {
      console.error("Catchup failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const watcherStatus = status?.services?.watcher;
  const priceSyncStatus = status?.services?.priceSync;
  const listenerStatus = status?.services?.contractListener;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services</h1>
          <p className="text-muted-foreground">
            Manage background services and their configurations
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DNS Watcher - Detailed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Eye className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">DNS Watcher</CardTitle>
                  <CardDescription>
                    Monitors HNS DNS propagation for pending domain purchases
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {watcherStatus?.status === "running" ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-green-500 font-medium">Running</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-gray-500" />
                    <span className="text-gray-500 font-medium">Stopped</span>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Phase</div>
                <div className="text-lg font-medium">
                  {String(watcherStatus?.currentPhase || "Idle")}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Pending Checks</div>
                <div className="text-lg font-medium">
                  {typeof status?.database?.pending_purchases === "number" ? status.database.pending_purchases : 0}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Interval</div>
                <div className="text-lg font-medium">30s</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Last Run</div>
                <div className="text-lg font-medium">
                  {watcherStatus?.lastRunTime
                    ? new Date(watcherStatus.lastRunTime as string).toLocaleTimeString()
                    : "Never"}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {watcherStatus?.status === "running" ? (
                <Button
                  variant="destructive"
                  onClick={() => handleServiceAction("watcher", "stop")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "watcher:stop" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Stop Watcher
                </Button>
              ) : (
                <Button
                  onClick={() => handleServiceAction("watcher", "start")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "watcher:start" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Start Watcher
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Price Sync - Detailed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Price Sync</CardTitle>
                  <CardDescription>FTSO to contract price sync</CardDescription>
                </div>
              </div>
              {priceSyncStatus?.status === "running" ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">FTSO Price</span>
                <span className="font-mono">
                  ${status?.ftsoPrice?.price?.toFixed(6) || "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">On-Chain Price</span>
                <span className="font-mono">
                  ${typeof priceSyncStatus?.currentOnChainPrice === "number" ? priceSyncStatus.currentOnChainPrice.toFixed(6) : "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Sync</span>
                <span>
                  {priceSyncStatus?.lastSyncTime
                    ? new Date(priceSyncStatus.lastSyncTime as string).toLocaleTimeString()
                    : "Never"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sync Count</span>
                <span>{priceSyncStatus?.syncCount as number || 0}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {priceSyncStatus?.status === "running" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleServiceAction("priceSync", "stop")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "priceSync:stop" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleServiceAction("priceSync", "start")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "priceSync:start" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Start
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServiceAction("priceSync", "force")}
                disabled={actionLoading !== null}
              >
                {actionLoading === "priceSync:force" && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                <Zap className="w-4 h-4 mr-2" />
                Force Sync
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contract Listener - Detailed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Radio className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Contract Listener</CardTitle>
                  <CardDescription>Blockchain event processor</CardDescription>
                </div>
              </div>
              {listenerStatus?.status === "running" ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Block</span>
                <span className="font-mono">
                  {listenerStats?.lastProcessedBlock?.toLocaleString() ||
                    (listenerStatus?.lastProcessedBlock as number)?.toLocaleString() ||
                    "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Events Processed</span>
                <span>{listenerStats?.eventsProcessed || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started At</span>
                <span>
                  {listenerStats?.startedAt
                    ? new Date(listenerStats.startedAt).toLocaleTimeString()
                    : "N/A"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {listenerStatus?.status === "running" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleServiceAction("listener", "stop")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "listener:stop" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleServiceAction("listener", "start")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "listener:start" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Start
                </Button>
              )}
            </div>

            {/* Catchup Section */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-medium">Block Catchup</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Process events from a specific block number
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Block number"
                  value={catchupBlock}
                  onChange={(e) => setCatchupBlock(e.target.value)}
                  className="w-40"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCatchup}
                  disabled={!catchupBlock || actionLoading !== null}
                >
                  {actionLoading === "listener:catchup" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Catchup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admin Actions</CardTitle>
          <CardDescription>Special administrative operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[250px] p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-5 h-5 text-primary" />
                <span className="font-medium">Preview Credits</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Reset all users&apos; preview credits to 10 free generations. Use this when releasing major image generation upgrades.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!confirm("Reset preview credits for ALL users? This will give everyone 10 new free previews.")) return;
                  setActionLoading("resetCredits");
                  try {
                    const credentials = await getAdminCredentials();
                    const result = await resetAllPreviewCredits(credentials);
                    alert(`Success! Reset credits for ${result.resetCount} wallet(s).`);
                  } catch (err) {
                    console.error("Reset credits error:", err);
                    alert("Failed to reset credits");
                  } finally {
                    setActionLoading(null);
                  }
                }}
                disabled={actionLoading !== null}
              >
                {actionLoading === "resetCredits" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4 mr-2" />
                )}
                Reset All Preview Credits
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Health Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service Health Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg ${watcherStatus?.status === "running" ? "bg-green-500/10" : "bg-gray-500/10"}`}>
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                <span className="font-medium">DNS Watcher</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {watcherStatus?.status === "running"
                  ? "Actively monitoring DNS propagation"
                  : "Service is stopped"}
              </p>
            </div>
            <div className={`p-4 rounded-lg ${priceSyncStatus?.status === "running" ? "bg-green-500/10" : "bg-gray-500/10"}`}>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <span className="font-medium">Price Sync</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {priceSyncStatus?.status === "running"
                  ? "Syncing FTSO prices to contract"
                  : "Service is stopped"}
              </p>
            </div>
            <div className={`p-4 rounded-lg ${listenerStatus?.status === "running" ? "bg-green-500/10" : "bg-gray-500/10"}`}>
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5" />
                <span className="font-medium">Contract Listener</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {listenerStatus?.status === "running"
                  ? "Processing blockchain events"
                  : "Service is stopped"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timestamp */}
      <div className="text-center text-sm text-muted-foreground">
        Auto-refreshing every 15 seconds
      </div>
    </div>
  );
}

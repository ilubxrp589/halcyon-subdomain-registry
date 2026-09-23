"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { StatsCard } from "@/components/admin/StatsCard";
import { SystemHealthBar } from "@/components/admin/SystemHealthBar";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { QuickActions } from "@/components/admin/QuickActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getSystemStatus,
  getPM2List,
  getAuditLog,
  getGPUMonitor,
  getAnalyticsRevenue,
  getAnalyticsRegistrations,
  forcePriceSync,
  restartAllGPUs,
  syncTLDsFromWallet,
  getRemoteGPUs,
  PM2Process,
  SystemStatus,
  AuditLogEntry,
  GPUMonitorData,
  GPUMachineStats,
} from "@/services/adminApi";
import {
  RefreshCw,
  Globe,
  DollarSign,
  Users,
  Loader2,
  Cpu,
  Server,
  Radio,
  Link2,
  RotateCcw,
  RefreshCw as Sync,
} from "lucide-react";

export default function AdminDashboardPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditLogEntry[]>([]);
  const [gpuData, setGpuData] = useState<GPUMonitorData | null>(null);
  const [totalDomains, setTotalDomains] = useState(0);
  const [periodRevenue, setPeriodRevenue] = useState("0");
  const [activeUsers, setActiveUsers] = useState(0);
  const [flrPrice, setFlrPrice] = useState<number | null>(null);
  const [remoteGpus, setRemoteGpus] = useState<GPUMachineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchAll = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [statusData, pm2Data, auditData, gpuResult, regData, revData, remoteGpuData] = await Promise.allSettled([
        getSystemStatus(credentials),
        getPM2List(credentials),
        getAuditLog({ page: 1, limit: 10 }, credentials),
        getGPUMonitor(credentials).catch(() => null),
        getAnalyticsRegistrations(credentials, "30d"),
        getAnalyticsRevenue(credentials, "30d"),
        getRemoteGPUs(credentials).catch(() => null),
      ]);

      if (statusData.status === "fulfilled") setStatus(statusData.value);
      if (pm2Data.status === "fulfilled") setProcesses(pm2Data.value.processes);
      if (auditData.status === "fulfilled") setAuditEvents(auditData.value.data || []);
      if (gpuResult.status === "fulfilled" && gpuResult.value) setGpuData(gpuResult.value);
      if (remoteGpuData.status === "fulfilled" && remoteGpuData.value) setRemoteGpus(remoteGpuData.value);
      if (regData.status === "fulfilled") {
        setTotalDomains(regData.value.totals?.total || 0);
        setActiveUsers(regData.value.totals?.today || 0);
      }
      if (revData.status === "fulfilled") {
        setPeriodRevenue(revData.value.totals?.period_usd || "0");
        setFlrPrice(revData.value.flrPrice);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // Health calculation — only count PM2 processes and core services
  const onlinePM2 = processes.filter(p => p.status === "online").length;
  const servicesHealthy = [
    status?.services?.watcher?.status === "running" || status?.services?.watcher?.status === "stopped",
    status?.services?.priceSync?.status === "running",
    status?.services?.contractListener?.status === "running",
    status?.hns?.connected,
  ].filter(Boolean).length;
  const totalHealth = onlinePM2 + servicesHealthy;
  const totalPossible = processes.length + 4;

  // Quick actions
  const quickActions = [
    {
      label: "Restart All PM2",
      icon: <RotateCcw className="w-4 h-4" />,
      action: async () => {
        const creds = await getAdminCredentials();
        for (const proc of processes.filter(p => p.status === "online")) {
          try {
            const { pm2Restart } = await import("@/services/adminApi");
            await pm2Restart(proc.name, creds);
          } catch {}
        }
        await fetchAll();
      },
    },
    {
      label: "Force Price Sync",
      icon: <DollarSign className="w-4 h-4" />,
      action: async () => {
        const creds = await getAdminCredentials();
        await forcePriceSync(creds);
        await fetchAll();
      },
    },
    {
      label: "Restart All GPUs",
      icon: <Cpu className="w-4 h-4" />,
      action: async () => {
        const creds = await getAdminCredentials();
        await restartAllGPUs(creds);
        await fetchAll();
      },
    },
    {
      label: "Sync TLDs from Wallet",
      icon: <Globe className="w-4 h-4" />,
      action: async () => {
        const creds = await getAdminCredentials();
        await syncTLDsFromWallet(creds);
        await fetchAll();
      },
    },
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Command Center</h1>
          <p className="text-muted-foreground">System overview and quick controls</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* 1. Health Bar */}
      <SystemHealthBar healthy={totalHealth} total={totalPossible} />

      {/* 2. Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Domains"
          value={totalDomains}
          icon={<Globe className="w-4 h-4" />}
        />
        <StatsCard
          title="Period Revenue"
          value={`$${parseFloat(periodRevenue).toFixed(2)}`}
          description="Last 30 days"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <StatsCard
          title="Active Today"
          value={activeUsers}
          description="Unique registrants"
          icon={<Users className="w-4 h-4" />}
        />
        <StatsCard
          title="FLR Price"
          value={flrPrice ? `$${flrPrice.toFixed(4)}` : "N/A"}
          description="FLR/USD"
          icon={<DollarSign className="w-4 h-4" />}
        />
      </div>

      {/* 3. PM2 Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" />
              PM2 Processes
            </CardTitle>
            <Link href="/admin/pm2" className="text-sm text-primary hover:underline">
              Manage →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {processes.map((proc) => {
              const dotColor = proc.status === "online" ? "bg-green-500" : proc.status === "stopped" ? "bg-gray-400" : "bg-red-500";
              return (
                <Link
                  key={proc.name}
                  href="/admin/pm2"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-sm font-medium flex-1 truncate">{proc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {proc.uptime ? formatUptime(proc.uptime) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {(proc.memory / 1024 / 1024).toFixed(0)}MB
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 4. Infrastructure Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Local GPUs (3060s)</p>
            <p className="text-lg font-bold">
              {gpuData?.comfyui ? `${gpuData.comfyui.onlineCount}/${gpuData.comfyui.totalCount}` : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              {remoteGpus ? `+ ${remoteGpus.gpus.length}x 3080 remote` : "ComfyUI online"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">DNS Resolver</p>
            <p className="text-lg font-bold">
              {status?.hns?.connected ? (
                <span className="text-green-500">Up</span>
              ) : (
                <span className="text-red-500">Down</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Unbound DoH</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Contract Listener</p>
            <p className="text-lg font-bold">
              {status?.services?.contractListener?.status === "running" ? (
                <span className="text-green-500">Active</span>
              ) : (
                <span className="text-red-500">Inactive</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Block {(status?.services?.contractListener as Record<string, unknown>)?.lastProcessedBlock as number || "N/A"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">HNS Sync</p>
            <p className="text-lg font-bold">
              {status?.hns?.synced ? (
                <span className="text-green-500">Synced</span>
              ) : (
                <span className="text-yellow-500">Syncing</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {status?.hns?.height?.toLocaleString() || "N/A"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 5. Two-column bottom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ActivityFeed events={auditEvents} />
        <QuickActions actions={quickActions} />
      </div>

      {/* Timestamp */}
      <div className="text-center text-xs text-muted-foreground">
        Auto-refreshes every 15s · Last: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : "N/A"}
      </div>
    </div>
  );
}

function formatUptime(uptime: number): string {
  const ms = Date.now() - uptime;
  const hours = Math.floor(ms / 3600000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h${mins}m`;
}

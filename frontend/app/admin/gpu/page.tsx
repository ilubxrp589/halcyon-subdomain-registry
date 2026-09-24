"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import {
  getGPUMonitor,
  restartGPU,
  restartAllGPUs,
  setGPUFanSpeed,
  GPUMonitorData,
} from "@/services/adminApi";
import {
  RefreshCw,
  Loader2,
  Cpu,
  Power,
  Activity,
  Zap,
} from "lucide-react";

// Machine display names and order
const MACHINE_CONFIG: Record<string, { label: string; order: number; color: string }> = {
  "3080": { label: "192.0.2.67 (3080)", order: 0, color: "#4488ff" },
  "3080x2": { label: "192.0.2.220 (3080x2)", order: 1, color: "#44aaff" },
  "3060x2": { label: "192.0.2.249 (3060x2)", order: 2, color: "#44ddaa" },
  "3060x2-97": { label: "192.0.2.97 (3060x2)", order: 3, color: "#88dd44" },
};

interface GPUData {
  index: number;
  name: string;
  temperature: number;
  utilization: number;
  memory_used: number;
  memory_total: number;
  power_draw: number;
  power_limit: number;
  clock_graphics: number;
  clock_memory: number;
  fan_rpm: number | null;
  fan_speed_pct: number;
}

interface MachineData {
  gpus: GPUData[];
}

function tempColor(t: number): string {
  if (t < 50) return "#44dd88";
  if (t < 65) return "#dddd44";
  if (t < 75) return "#ff9944";
  return "#ff4444";
}

function tempBgClass(t: number): string {
  if (t < 50) return "bg-green-500";
  if (t < 65) return "bg-yellow-500";
  if (t < 75) return "bg-orange-500";
  return "bg-red-500";
}

function utilColor(u: number): string {
  if (u < 10) return "#666";
  if (u < 50) return "#4488ff";
  if (u < 90) return "#ff9944";
  return "#ff4444";
}

function GPUCard({ gpu, machineColor }: { gpu: GPUData; machineColor: string }) {
  const vramPct = gpu.memory_total > 0 ? (gpu.memory_used / gpu.memory_total) * 100 : 0;
  const vramGB = (gpu.memory_used / 1024).toFixed(1);
  const vramTotalGB = (gpu.memory_total / 1024).toFixed(1);

  return (
    <div className="bg-[#12121a] border border-[#2a2a3a] rounded-xl overflow-hidden hover:border-[#3a3a5a] transition-all">
      {/* Gradient accent bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${machineColor}, ${machineColor}88)` }} />

      <div className="p-4">
        {/* GPU Name */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-bold text-sm">{gpu.name}</span>
          <span className="text-[#666] text-xs">GPU {gpu.index}</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-4">
          {/* Temperature */}
          <div>
            <span className="text-[#666] block mb-1">Temperature</span>
            <span
              className="font-mono font-bold text-lg"
              style={{ color: tempColor(gpu.temperature) }}
            >
              {gpu.temperature}°C
            </span>
          </div>

          {/* Fan */}
          <div>
            <span className="text-[#666] block mb-1">Fan</span>
            <span className="text-[#aaccee] font-mono font-bold text-lg">
              {gpu.fan_speed_pct}%
            </span>
            {gpu.fan_rpm !== null && (
              <span className="text-[#666] text-[10px] ml-1">
                ({gpu.fan_rpm} RPM)
              </span>
            )}
          </div>

          {/* Power */}
          <div>
            <span className="text-[#666] block mb-1">Power</span>
            <span className="text-[#aaccee] font-mono">
              {gpu.power_draw.toFixed(0)}W
            </span>
            <span className="text-[#555]"> / {gpu.power_limit.toFixed(0)}W</span>
          </div>

          {/* Clocks */}
          <div>
            <span className="text-[#666] block mb-1">Clocks</span>
            <span className="text-[#aaccee] font-mono text-[11px]">
              {gpu.clock_graphics} MHz
            </span>
          </div>
        </div>

        {/* Utilization */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#666]">Utilization</span>
            <span className="font-mono" style={{ color: utilColor(gpu.utilization) }}>
              {gpu.utilization}%
            </span>
          </div>
          <div className="h-2 bg-[#1a1a2a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${gpu.utilization}%`,
                background: gpu.utilization > 0
                  ? "linear-gradient(90deg, #4466ff, #aa44ff)"
                  : "#333",
              }}
            />
          </div>
        </div>

        {/* VRAM */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#666]">VRAM</span>
            <span className="text-[#aaccee] font-mono">
              {vramGB} / {vramTotalGB} GB
            </span>
          </div>
          <div className="h-2 bg-[#1a1a2a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${vramPct}%`,
                background: "linear-gradient(90deg, #44aa88, #eeaa44)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MachineCard({
  machineKey,
  data,
  fanSpeed,
  onFanSpeedChange,
  onApplyFan,
  onAutoFan,
  settingFan
}: {
  machineKey: string;
  data: MachineData;
  fanSpeed: number;
  onFanSpeedChange: (speed: number) => void;
  onApplyFan: () => void;
  onAutoFan: () => void;
  settingFan: boolean;
}) {
  const config = MACHINE_CONFIG[machineKey] || { label: machineKey, order: 99, color: "#666" };

  return (
    <div className="bg-[#0d0d14] border border-[#1a1a2a] rounded-2xl overflow-hidden">
      {/* Machine Header */}
      <div
        className="px-5 py-3 border-b border-[#1a1a2a] flex items-center justify-between"
        style={{ background: `linear-gradient(90deg, ${config.color}15, transparent)` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: config.color }} />
          <span className="text-white font-semibold">{config.label}</span>
          <span className="text-[#555] text-sm">({data.gpus.length} GPU{data.gpus.length !== 1 ? "s" : ""})</span>
        </div>
      </div>

      {/* GPU Cards Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {data.gpus.map((gpu) => (
            <GPUCard key={gpu.index} gpu={gpu} machineColor={config.color} />
          ))}
        </div>

        {/* Fan Controls */}
        <div className="flex items-center gap-3 pt-3 border-t border-[#1a1a2a]">
          <Zap className="h-4 w-4 text-[#666]" />
          <span className="text-[#888] text-sm">Fan:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={fanSpeed}
            onChange={(e) => onFanSpeedChange(parseInt(e.target.value))}
            className="flex-1 accent-[#4488ff] h-2 bg-[#1a1a2a] rounded-full cursor-pointer"
          />
          <span className="text-[#aaccee] font-mono text-sm min-w-[42px] text-right">
            {fanSpeed}%
          </span>
          <button
            onClick={onApplyFan}
            disabled={settingFan}
            className="px-3 py-1.5 bg-[#4488ff] text-white rounded-lg text-xs font-semibold hover:bg-[#5599ff] disabled:opacity-50 transition-colors"
          >
            {settingFan ? "..." : "Apply"}
          </button>
          <button
            onClick={onAutoFan}
            disabled={settingFan}
            className="px-3 py-1.5 bg-[#2a2a3a] text-[#aaa] rounded-lg text-xs font-semibold hover:bg-[#3a3a4a] hover:text-white disabled:opacity-50 transition-colors"
          >
            Auto
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveActivityCard({ activity }: { activity: Array<{ gpu: string; status: string; prompt?: string }> }) {
  if (!activity || activity.length === 0) return null;

  return (
    <div className="bg-[#0d0d14] border border-[#1a1a2a] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1a1a2a] flex items-center gap-3">
        <Activity className="h-4 w-4 text-[#4488ff]" />
        <span className="text-white font-semibold">Live GPU Activity</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
          {activity.map((entry, i) => {
            const isGenerating = entry.status === "generating";
            const isOffline = entry.status === "offline";
            return (
              <div
                key={i}
                className={`rounded-xl p-3 text-center transition-all ${
                  isGenerating
                    ? "bg-[#1a2a4a] border border-[#4488ff] shadow-[0_0_12px_rgba(68,136,255,.3)]"
                    : isOffline
                    ? "bg-[#2a1a1a] border border-[#553333] opacity-50"
                    : "bg-[#1a1a2a] border border-[#2a2a3a] opacity-70"
                }`}
              >
                <div className="text-white font-bold text-xs mb-2">{entry.gpu}</div>
                <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isGenerating
                    ? "bg-blue-500/20 text-blue-400 animate-pulse"
                    : isOffline
                    ? "bg-red-500/20 text-red-400"
                    : "bg-[#2a2a3a] text-[#666]"
                }`}>
                  {entry.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JobQueueCard({ jobs, error }: { jobs: Array<{ id?: string; fqdn?: string; wallet?: string; status: string; gpu_assigned?: string; gpu?: string; image_count?: number; created_at?: string }>; error?: string }) {
  return (
    <div className="bg-[#0d0d14] border border-[#1a1a2a] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1a1a2a] flex items-center gap-3">
        <Activity className="h-4 w-4 text-[#44aa88]" />
        <span className="text-white font-semibold">NFT Generation Queue</span>
        <span className="text-[#666] text-sm">({jobs?.length || 0} jobs)</span>
      </div>
      {error && (
        <div className="px-5 py-3 bg-[#2a1a1a] border-b border-[#3a2a2a] text-red-400 text-sm">
          {error}
        </div>
      )}
      {(!jobs || jobs.length === 0) ? (
        <div className="px-5 py-8 text-center text-[#555]">
          No jobs in queue
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a2a] text-[#666] text-left text-xs">
              <th className="py-3 px-4 font-semibold">FQDN</th>
              <th className="py-3 px-4 font-semibold">Wallet</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">GPU</th>
              <th className="py-3 px-4 font-semibold">Images</th>
              <th className="py-3 px-4 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, i) => (
              <tr key={job.id || i} className="border-b border-[#1a1a2a] hover:bg-[#1a1a2a] transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-[#aaccee]">{job.fqdn || "—"}</td>
                <td className="py-3 px-4 font-mono text-xs text-[#888]">
                  {job.wallet ? `${job.wallet.slice(0, 8)}...` : "—"}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    job.status === "completed" ? "bg-green-500/20 text-green-400" :
                    job.status === "processing" || job.status === "generating" ? "bg-blue-500/20 text-blue-400 animate-pulse" :
                    job.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {job.status}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-[#aaccee]">
                  {job.gpu_assigned || job.gpu || "—"}
                </td>
                <td className="py-3 px-4 font-mono text-xs text-[#aaccee]">
                  {job.image_count ?? "—"}
                </td>
                <td className="py-3 px-4 text-xs text-[#888]">
                  {job.created_at ? new Date(job.created_at).toLocaleTimeString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

export default function GPUMonitorPage() {
  const { getAdminCredentials, getReadAuthCredentials } = useAdminAuth();
  const [data, setData] = useState<GPUMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartingAll, setRestartingAll] = useState(false);
  const [fanSpeeds, setFanSpeeds] = useState<Record<string, number>>({});
  const [settingFan, setSettingFan] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getReadAuthCredentials();
      const result = await getGPUMonitor(credentials);
      setData(result);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch GPU data";
      if (!data) setError(msg);
      console.error("GPU monitor fetch error:", msg);
    }
  }, [data]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleRestartAll = async () => {
    setRestartingAll(true);
    try {
      const credentials = await getAdminCredentials();
      await restartAllGPUs(credentials);
      await fetchData();
    } catch (err) {
      console.error("GPU restart all error:", err);
    } finally {
      setRestartingAll(false);
    }
  };

  const handleSetFan = async (machine: string) => {
    setSettingFan(machine);
    try {
      const credentials = await getAdminCredentials();
      // Map machine key to target
      const target = machine === "3080" || machine === "3080x2" ? "remote" : "local";
      await setGPUFanSpeed(fanSpeeds[machine] ?? 50, target, credentials);
      await fetchData();
    } catch (err) {
      console.error("Fan speed error:", err);
    } finally {
      setSettingFan(null);
    }
  };

  const handleFanAuto = async (machine: string) => {
    setSettingFan(machine);
    try {
      const credentials = await getAdminCredentials();
      const target = machine === "3080" || machine === "3080x2" ? "remote" : "local";
      await setGPUFanSpeed("auto", target, credentials);
      await fetchData();
    } catch (err) {
      console.error("Fan auto error:", err);
    } finally {
      setSettingFan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-[#0a0a0f]">
        <Loader2 className="h-8 w-8 animate-spin text-[#4488ff]" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-[#0a0a0f] min-h-screen">
        <div className="bg-[#2a1a1a] border border-[#553333] rounded-2xl p-6">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={handleRefresh} className="border-[#553333] text-red-400">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Get hardware data organized by machine
  const hardwareData = data?.hardware as Record<string, MachineData> | undefined;
  const machines = hardwareData
    ? Object.entries(hardwareData)
        .filter(([_, v]) => v && typeof v === "object" && Array.isArray(v.gpus))
        .sort((a, b) => {
          const orderA = MACHINE_CONFIG[a[0]]?.order ?? 99;
          const orderB = MACHINE_CONFIG[b[0]]?.order ?? 99;
          return orderA - orderB;
        })
    : [];

  // Live activity from jobQueue
  const liveActivity = data?.jobQueue?.live || [];
  const nftJobs = data?.jobQueue?.nft || [];

  // Count total GPUs
  const totalGpus = machines.reduce((acc, [_, m]) => acc + (m.gpus?.length || 0), 0);
  const activeGpus = machines.reduce((acc, [_, m]) =>
    acc + (m.gpus?.filter(g => g.utilization > 10).length || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Cpu className="h-6 w-6 text-[#4488ff]" />
            GPU Dashboard
          </h1>
          <p className="text-[#666] text-sm mt-1">
            {totalGpus} GPUs across {machines.length} machines
            {activeGpus > 0 && <span className="text-[#44aa88] ml-2">({activeGpus} active)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-[#1a1a2a] border border-[#2a2a3a] rounded-lg px-3 py-1.5 text-sm">
            <span className="text-[#666]">ComfyUI: </span>
            <span className="text-[#44aa88] font-bold">
              {data?.comfyui?.onlineCount ?? 0}
            </span>
            <span className="text-[#666]">/{data?.comfyui?.totalCount ?? 0}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-[#2a2a3a] bg-[#1a1a2a] text-[#aaa] hover:text-white hover:bg-[#2a2a3a]"
            onClick={handleRestartAll}
            disabled={restartingAll}
          >
            {restartingAll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Power className="h-4 w-4 mr-1" />}
            Restart All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[#2a2a3a] bg-[#1a1a2a] text-[#aaa] hover:text-white hover:bg-[#2a2a3a]"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Active Model */}
      {data?.activeModel && (
        <div className="bg-[#0d0d14] border border-[#1a1a2a] rounded-xl px-5 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-[#4488ff] font-semibold">Active Model</span>
          <span className="text-white font-bold">{data.activeModel.config?.name || data.activeModel.type}</span>
          <span className="text-[#666]">
            Checkpoint: <span className="text-[#aaccee] font-mono">{data.activeModel.config?.checkpoint}</span>
          </span>
          {data.activeModel.config?.vram && (
            <span className="text-[#666]">
              VRAM: <span className="text-[#aaccee] font-mono">{data.activeModel.config.vram}</span>
            </span>
          )}
        </div>
      )}

      {/* Machine Cards Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        {machines.map(([machineKey, machineData]) => (
          <MachineCard
            key={machineKey}
            machineKey={machineKey}
            data={machineData}
            fanSpeed={fanSpeeds[machineKey] ?? 50}
            onFanSpeedChange={(speed) => setFanSpeeds(prev => ({ ...prev, [machineKey]: speed }))}
            onApplyFan={() => handleSetFan(machineKey)}
            onAutoFan={() => handleFanAuto(machineKey)}
            settingFan={settingFan === machineKey}
          />
        ))}
      </div>

      {/* Live Activity */}
      <div className="mb-6">
        <LiveActivityCard activity={liveActivity} />
      </div>

      {/* NFT Generation Queue */}
      <div className="mb-6">
        <JobQueueCard jobs={nftJobs} error={data?.jobQueue?.error ?? undefined} />
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[#444]">
        Auto-refreshing every 3s · Last update: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

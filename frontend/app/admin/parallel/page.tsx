"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getParallelDemoPrompts,
  startParallelDemo,
  getParallelDemoStatus,
  getParallelDemoGPUStats,
  stopParallelDemo,
  ParallelDemoSession,
  GPUDashboardStats,
  GPUDashboardJobs,
} from "@/services/adminApi";
import {
  Zap,
  Loader2,
  Play,
  Square,
  RefreshCw,
  Flame,
  Moon,
  Clock,
  CheckCircle,
  XCircle,
  ImageIcon,
} from "lucide-react";

// GPU machine configuration - keys match dashboard API response
const GPU_MACHINES = [
  { key: "3080", ip: "10.0.0.67", label: "3080 x2", gpuNames: ["GPU0", "GPU1"] },
  { key: "3080x2", ip: "10.0.0.220", label: "3080 x2", gpuNames: ["GPU2", "GPU3"] },
  { key: "3060x2", ip: "10.0.0.249", label: "3060 x2", gpuNames: ["GPU4", "GPU5"] },
  { key: "3060x2-97", ip: "10.0.0.97", label: "3060 x2", gpuNames: ["GPU6", "GPU7"] },
];

function GPUStatusCard({
  name,
  machine,
  temp,
  util,
  fan,
  status,
  imageUrl,
  duration,
}: {
  name: string;
  machine: string;
  temp: number;
  util: number;
  fan: number;
  status: "idle" | "generating" | "completed" | "failed" | "pending";
  imageUrl?: string | null;
  duration?: number;
}) {
  const isWorking = status === "generating";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div
      className={`bg-[#1a1a2e] border rounded-xl p-3 transition-all ${
        isWorking
          ? "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)] animate-pulse"
          : isCompleted
          ? "border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
          : isFailed
          ? "border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
          : "border-[#333]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-white text-sm">{name}</span>
        {isWorking && <Flame className="h-4 w-4 text-orange-400 animate-pulse" />}
        {!isWorking && util === 0 && <Moon className="h-4 w-4 text-gray-500" />}
        {isCompleted && <CheckCircle className="h-4 w-4 text-green-400" />}
        {isFailed && <XCircle className="h-4 w-4 text-red-400" />}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
        <div>
          <span className="text-[#666]">Temp</span>
          <div
            className={`font-mono font-semibold ${
              temp > 70 ? "text-red-400" : temp > 50 ? "text-yellow-400" : "text-green-400"
            }`}
          >
            {temp}°C
          </div>
        </div>
        <div>
          <span className="text-[#666]">Util</span>
          <div className={`font-mono font-semibold ${util > 50 ? "text-blue-400" : "text-[#888]"}`}>
            {util}%
          </div>
        </div>
        <div>
          <span className="text-[#666]">Fan</span>
          <div className="font-mono font-semibold text-[#cde]">{fan}%</div>
        </div>
      </div>

      {/* Status badge */}
      <div className="text-center">
        <Badge
          className={`text-[10px] ${
            isWorking
              ? "bg-blue-900/50 text-blue-400 border-blue-700 animate-pulse"
              : isCompleted
              ? "bg-green-900/50 text-green-400 border-green-700"
              : isFailed
              ? "bg-red-900/50 text-red-400 border-red-700"
              : status === "pending"
              ? "bg-yellow-900/50 text-yellow-400 border-yellow-700"
              : "bg-[#222] text-[#888] border-[#444]"
          }`}
        >
          {status === "generating" ? "generating..." : status}
        </Badge>
        {duration !== undefined && (
          <div className="text-[10px] text-[#888] mt-1">{duration.toFixed(1)}s</div>
        )}
      </div>
    </div>
  );
}

function MachineGroup({
  ip,
  label,
  gpuNames,
  gpuData,
  sessionGpuStatus,
}: {
  ip: string;
  label: string;
  gpuNames: string[];
  gpuData: Record<string, { temp: number; util: number; fan: number }>;
  sessionGpuStatus: Record<string, { status: string; imageUrl?: string | null; duration?: number }>;
}) {
  return (
    <div className="bg-[#151520] border border-[#2a2a3a] rounded-xl p-3">
      <div className="text-[#8af] font-semibold text-xs mb-2 flex items-center gap-2">
        <span>{ip}</span>
        <Badge className="bg-[#222] text-[#aaa] border-[#333] text-[10px]">{label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {gpuNames.map((name) => {
          const gpu = gpuData[name] || { temp: 0, util: 0, fan: 0 };
          const sessionStatus = sessionGpuStatus[name] || { status: "idle" };
          return (
            <GPUStatusCard
              key={name}
              name={name}
              machine={ip}
              temp={gpu.temp}
              util={gpu.util}
              fan={gpu.fan}
              status={sessionStatus.status as "idle" | "generating" | "completed" | "failed" | "pending"}
              imageUrl={sessionStatus.imageUrl}
              duration={sessionStatus.duration}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImageGallery({
  generations,
  gpuStatus,
  count,
}: {
  generations: Array<{
    gpu: string;
    server: string;
    imageUrl?: string;
    error?: string;
    duration?: number;
    success: boolean;
  }>;
  gpuStatus: Record<string, { status: string; imageUrl?: string | null; duration?: number }>;
  count: number;
}) {
  // Create slots for all expected images
  const slots = Array.from({ length: count }, (_, idx) => {
    const gpuName = `GPU${idx}`;
    const status = gpuStatus[gpuName];
    const gen = generations.find((g) => g.gpu === gpuName);

    return {
      gpuName,
      status: status?.status || "pending",
      imageUrl: status?.imageUrl || gen?.imageUrl,
      duration: status?.duration || gen?.duration,
      error: gen?.error,
      success: gen?.success,
    };
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {slots.map((slot, idx) => (
        <div
          key={idx}
          className={`bg-[#1a1a2e] border rounded-xl overflow-hidden ${
            slot.status === "generating"
              ? "border-blue-500 animate-pulse"
              : slot.status === "completed"
              ? "border-green-500"
              : slot.status === "failed"
              ? "border-red-500"
              : "border-[#333]"
          }`}
        >
          {/* Image area */}
          <div className="aspect-square bg-[#111] flex items-center justify-center relative">
            {slot.imageUrl ? (
              <img
                src={slot.imageUrl}
                alt={`Generated by ${slot.gpuName}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : slot.status === "generating" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                <span className="text-[11px] text-[#888]">Generating...</span>
              </div>
            ) : slot.status === "failed" ? (
              <div className="flex flex-col items-center gap-2 p-2 text-center">
                <XCircle className="h-8 w-8 text-red-400" />
                <span className="text-[10px] text-red-400 line-clamp-2">{slot.error || "Failed"}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ImageIcon className="h-8 w-8 text-[#444]" />
                <span className="text-[11px] text-[#666]">Pending</span>
              </div>
            )}
          </div>

          {/* Info bar */}
          <div className="p-2 border-t border-[#333] text-center">
            <div className="font-bold text-white text-xs">{slot.gpuName}</div>
            {slot.duration !== undefined && (
              <div className="text-[10px] text-green-400 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                {slot.duration.toFixed(1)}s
              </div>
            )}
            {slot.status === "generating" && (
              <div className="text-[10px] text-blue-400">working...</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ParallelDemoPage() {
  const { getAdminCredentials, getReadAuthCredentials } = useAdminAuth();

  // State
  const [prompts, setPrompts] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [gpuCount, setGpuCount] = useState<4 | 8>(8);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<ParallelDemoSession | null>(null);

  // GPU stats from dashboard
  const [gpuData, setGpuData] = useState<Record<string, { temp: number; util: number; fan: number }>>({});

  const getAdminCredentialsRef = useRef(getAdminCredentials);
  const getReadCredentialsRef = useRef(getReadAuthCredentials);

  useEffect(() => {
    getAdminCredentialsRef.current = getAdminCredentials;
    getReadCredentialsRef.current = getReadAuthCredentials;
  }, [getAdminCredentials, getReadAuthCredentials]);

  // Load prompts on mount
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const credentials = await getReadCredentialsRef.current();
        const result = await getParallelDemoPrompts(credentials);
        if (result.success && result.prompts.length > 0) {
          setPrompts(result.prompts);
          setSelectedPrompt(result.prompts[0]);
        }
      } catch (err) {
        console.error("Failed to load prompts:", err);
        // Use fallback prompts
        const fallback = [
          "A cyberpunk dragon breathing neon fire over a futuristic Tokyo skyline",
          "An ancient wizard's library with floating magical books and glowing runes",
        ];
        setPrompts(fallback);
        setSelectedPrompt(fallback[0]);
      } finally {
        setLoading(false);
      }
    };
    loadPrompts();
  }, []);

  // Poll GPU stats
  useEffect(() => {
    const pollGPUStats = async () => {
      try {
        const credentials = await getReadCredentialsRef.current();
        const result = await getParallelDemoGPUStats(credentials);
        if (result.success && result.stats) {
          const newGpuData: Record<string, { temp: number; util: number; fan: number }> = {};

          // Map machine data to GPU names using the key from dashboard API
          let gpuIndex = 0;
          for (const machine of GPU_MACHINES) {
            // Stats come back with keys like "3080", "3080x2", "3060x2", "3060x2-97"
            const machineData = (result.stats as unknown as Record<string, { gpus?: Array<{ temp: string; util: string; fan_pct: string }> }>)[machine.key];
            if (machineData?.gpus) {
              for (const gpu of machineData.gpus) {
                const gpuName = `GPU${gpuIndex}`;
                newGpuData[gpuName] = {
                  temp: parseInt(gpu.temp) || 0,
                  util: parseInt(gpu.util) || 0,
                  fan: parseInt(gpu.fan_pct) || 0,
                };
                gpuIndex++;
              }
            } else {
              // No data for this machine, fill with zeros
              for (let i = 0; i < machine.gpuNames.length; i++) {
                const gpuName = `GPU${gpuIndex}`;
                newGpuData[gpuName] = { temp: 0, util: 0, fan: 0 };
                gpuIndex++;
              }
            }
          }

          setGpuData(newGpuData);
        }
      } catch (err) {
        console.error("GPU stats poll error:", err);
      }
    };

    pollGPUStats();
    const interval = setInterval(pollGPUStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll session status when running
  useEffect(() => {
    if (!sessionId) return;

    const pollSession = async () => {
      try {
        const credentials = await getReadCredentialsRef.current();
        const result = await getParallelDemoStatus(sessionId, credentials);
        if (result.success) {
          setSession(result.session);

          // Stop polling if completed
          if (result.session.status === "completed" || result.session.status === "stopped") {
            return false;
          }
        }
        return true;
      } catch (err) {
        console.error("Session poll error:", err);
        return true;
      }
    };

    let active = true;
    const poll = async () => {
      if (!active) return;
      const shouldContinue = await pollSession();
      if (shouldContinue && active) {
        setTimeout(poll, 500);
      }
    };

    poll();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleStartDemo = async () => {
    setStarting(true);
    try {
      const creds = await getAdminCredentialsRef.current();
      const result = await startParallelDemo(
        gpuCount,
        selectedPrompt,
        customPrompt || undefined,
        creds
      );

      if (result.success) {
        setSessionId(result.sessionId);
        setSession(null);
      }
    } catch (err) {
      console.error("Failed to start demo:", err);
    } finally {
      setStarting(false);
    }
  };

  const handleStopDemo = async () => {
    if (!sessionId) return;
    setStopping(true);
    try {
      const creds = await getAdminCredentialsRef.current();
      await stopParallelDemo(sessionId, creds);
    } catch (err) {
      console.error("Failed to stop demo:", err);
    } finally {
      setStopping(false);
    }
  };

  const handleReset = () => {
    setSessionId(null);
    setSession(null);
  };

  const isRunning = session?.status === "running";
  const isCompleted = session?.status === "completed" || session?.status === "stopped";

  // Build GPU status from session
  const sessionGpuStatus: Record<string, { status: string; imageUrl?: string | null; duration?: number }> = {};
  if (session?.gpuStatus) {
    for (const [name, status] of Object.entries(session.gpuStatus)) {
      sessionGpuStatus[name] = {
        status: status.status,
        imageUrl: status.imageUrl,
        duration: status.duration,
      };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-[#111] min-h-screen rounded-lg">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#8af] flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Parallel GPU Demo
          </h1>
          <p className="text-[#888] text-sm">
            Generate images across all 8 GPUs simultaneously
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <Badge className="bg-blue-900/50 text-blue-400 border-blue-700 animate-pulse">
              Running: {session?.completed || 0}/{session?.count || gpuCount} complete
            </Badge>
          )}
          {isCompleted && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-1" />
              New Demo
            </Button>
          )}
        </div>
      </div>

      {/* Demo Controls */}
      {!sessionId && (
        <Card className="bg-[#1a1a2e] border-[#333]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-white">Demo Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Prompt Selection */}
            <div>
              <label className="text-sm text-[#888] block mb-2">Select Demo Prompt</label>
              <select
                value={selectedPrompt}
                onChange={(e) => setSelectedPrompt(e.target.value)}
                className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-white text-sm focus:border-[#58a] focus:outline-none"
              >
                {prompts.map((p, idx) => (
                  <option key={idx} value={p}>
                    {p.length > 70 ? p.substring(0, 70) + "..." : p}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="text-sm text-[#888] block mb-2">
                Or Custom Prompt <span className="text-[#666]">(optional, overrides selection)</span>
              </label>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your own prompt..."
                className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-white text-sm focus:border-[#58a] focus:outline-none placeholder:text-[#555]"
              />
            </div>

            {/* GPU Count */}
            <div>
              <label className="text-sm text-[#888] block mb-2">GPU Count</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGpuCount(4)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    gpuCount === 4
                      ? "bg-[#58a] text-white"
                      : "bg-[#222] text-[#888] hover:bg-[#333] hover:text-white"
                  }`}
                >
                  4 GPUs
                </button>
                <button
                  onClick={() => setGpuCount(8)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    gpuCount === 8
                      ? "bg-[#58a] text-white"
                      : "bg-[#222] text-[#888] hover:bg-[#333] hover:text-white"
                  }`}
                >
                  8 GPUs
                </button>
              </div>
            </div>

            {/* Start Button */}
            <div className="pt-2">
              <Button
                onClick={handleStartDemo}
                disabled={starting}
                className="w-full bg-gradient-to-r from-blue-600 to-amber-600 hover:from-blue-700 hover:to-amber-700 text-white font-bold py-3"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start Demo ({gpuCount} images)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Running/Completed - Show Stop button */}
      {sessionId && isRunning && (
        <div className="flex justify-center">
          <Button
            variant="destructive"
            onClick={handleStopDemo}
            disabled={stopping}
            className="px-8"
          >
            {stopping ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Square className="h-4 w-4 mr-2" />
            )}
            Stop Demo
          </Button>
        </div>
      )}

      {/* Prompt Display */}
      {session && (
        <div className="bg-[#1a1a2e] border border-[#333] rounded-lg px-4 py-3">
          <span className="text-[#888] text-sm">Prompt: </span>
          <span className="text-white text-sm">{session.prompt}</span>
        </div>
      )}

      {/* Live GPU Status */}
      <div>
        <div className="text-[#adf] font-semibold text-base border-b border-[#333] pb-2 mb-4">
          Live GPU Status
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {GPU_MACHINES.map((machine) => (
            <MachineGroup
              key={machine.ip}
              ip={machine.ip}
              label={machine.label}
              gpuNames={machine.gpuNames}
              gpuData={gpuData}
              sessionGpuStatus={sessionGpuStatus}
            />
          ))}
        </div>
      </div>

      {/* Generated Images */}
      {session && (
        <div>
          <div className="text-[#adf] font-semibold text-base border-b border-[#333] pb-2 mb-4 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Generated Images
            <Badge className="bg-[#222] text-[#aaa] border-[#333] ml-2">
              {session.completed} / {session.count} complete
            </Badge>
            {session.failed > 0 && (
              <Badge className="bg-red-900/50 text-red-400 border-red-700">
                {session.failed} failed
              </Badge>
            )}
          </div>
          <ImageGallery
            generations={session.generations}
            gpuStatus={sessionGpuStatus}
            count={session.count}
          />
        </div>
      )}

      {/* Stats */}
      {session?.status === "completed" && session.totalDuration && (
        <div className="bg-[#1a1a2e] border border-[#333] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{session.completed}</div>
              <div className="text-[#888] text-sm">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{session.failed}</div>
              <div className="text-[#888] text-sm">Failed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">{session.totalDuration.toFixed(1)}s</div>
              <div className="text-[#888] text-sm">Total Time</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">
                {session.completed > 0 ? (session.totalDuration / session.completed).toFixed(1) : 0}s
              </div>
              <div className="text-[#888] text-sm">Avg per Image</div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-[#555]">
        GPU stats refresh every 2s | Session polls every 0.5s during generation
      </div>
    </div>
  );
}

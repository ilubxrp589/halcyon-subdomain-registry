"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import {
  getPM2List,
  pm2Restart,
  pm2Stop,
  pm2Start,
  getRemoteProcesses,
  restartRemoteProcess,
  controlRemoteService,
  PM2Process,
  RemoteMachine,
  RemoteProcess,
  RemoteService,
} from "@/services/adminApi";
import { PM2ProcessCard } from "@/components/admin/PM2ProcessCard";
import { PM2LogViewer } from "@/components/admin/PM2LogViewer";
import {
  RefreshCw,
  Loader2,
  RotateCcw,
  Server,
  Cpu,
  Activity,
  Wifi,
  WifiOff,
  Play,
  Square,
  Cog,
} from "lucide-react";

function RemoteProcessCard({
  process,
  ip,
  onRestart,
  restarting,
}: {
  process: RemoteProcess;
  ip: string;
  onRestart: (ip: string, pid: string, type: string) => void;
  restarting: boolean;
}) {
  const typeColors: Record<string, string> = {
    comfyui: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    dashboard: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    python: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    other: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <div className="bg-card border rounded-lg p-3 hover:border-primary/50 transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColors[process.type]}`}>
            {process.type}
          </span>
          <span className="font-medium text-sm truncate max-w-[150px]">{process.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRestart(ip, process.pid, process.type)}
          disabled={restarting}
          className="h-7 px-2"
        >
          {restarting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-mono">PID: {process.pid}</span>
        <span className={process.cpu > 50 ? "text-orange-400" : ""}>
          CPU: {process.cpu.toFixed(1)}%
        </span>
        <span className={process.mem > 50 ? "text-orange-400" : ""}>
          MEM: {process.mem.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function RemoteServiceCard({
  service,
  ip,
  onControl,
  controlling,
}: {
  service: RemoteService;
  ip: string;
  onControl: (ip: string, service: string, action: 'start' | 'stop' | 'restart') => void;
  controlling: boolean;
}) {
  const statusColors: Record<string, string> = {
    running: "bg-green-500/20 text-green-400 border-green-500/30",
    stopped: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="bg-card border rounded-lg p-3 hover:border-primary/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Cog className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">{service.name}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[service.status]}`}>
            {service.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {service.status !== 'running' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onControl(ip, service.name, 'start')}
              disabled={controlling}
              className="h-7 px-2"
              title="Start"
            >
              <Play className="w-3 h-3" />
            </Button>
          )}
          {service.status === 'running' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onControl(ip, service.name, 'stop')}
              disabled={controlling}
              className="h-7 px-2"
              title="Stop"
            >
              <Square className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onControl(ip, service.name, 'restart')}
            disabled={controlling}
            className="h-7 px-2"
            title="Restart"
          >
            {controlling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-mono">{service.unit}</span>
        {service.subState && <span className="ml-2">({service.subState})</span>}
      </div>
    </div>
  );
}

function RemoteMachineCard({
  ip,
  machine,
  onRestart,
  onServiceControl,
  restartingPid,
  controllingService,
}: {
  ip: string;
  machine: RemoteMachine;
  onRestart: (ip: string, pid: string, type: string) => void;
  onServiceControl: (ip: string, service: string, action: 'start' | 'stop' | 'restart') => void;
  restartingPid: string | null;
  controllingService: string | null;
}) {
  const isOnline = machine.status === "online";
  const comfyProcesses = machine.processes
    .filter(p => p.type === "comfyui")
    .sort((a, b) => a.name.localeCompare(b.name));
  const otherProcesses = machine.processes
    .filter(p => p.type !== "comfyui")
    .sort((a, b) => a.name.localeCompare(b.name));
  const services = (machine.services || [])
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bg-card border rounded-xl overflow-hidden min-h-[200px]">
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        isOnline ? "bg-green-500/5" : "bg-red-500/5"
      }`}>
        <div className="flex items-center gap-3">
          <Server className={`w-5 h-5 ${isOnline ? "text-green-500" : "text-red-500"}`} />
          <div>
            <div className="font-semibold">{machine.label}</div>
            <div className="text-xs text-muted-foreground font-mono">{ip}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <Wifi className="w-3 h-3" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <WifiOff className="w-3 h-3" />
              Offline
            </span>
          )}
          <span className="text-xs bg-muted px-2 py-0.5 rounded">
            {machine.processes.length} proc
          </span>
          {services.length > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded">
              {services.length} svc
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 min-h-[120px]">
        {!isOnline ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {machine.error || "Cannot connect to machine"}
          </div>
        ) : (
          <>
            {/* Systemd Services */}
            {services.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Cog className="w-3 h-3" />
                  SYSTEMD SERVICES
                </div>
                <div className="space-y-2">
                  {services.map((svc) => (
                    <RemoteServiceCard
                      key={svc.name}
                      service={svc}
                      ip={ip}
                      onControl={onServiceControl}
                      controlling={controllingService === svc.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ComfyUI processes */}
            {comfyProcesses.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  COMFYUI INSTANCES
                </div>
                <div className="space-y-2">
                  {comfyProcesses.map((proc) => (
                    <RemoteProcessCard
                      key={proc.pid}
                      process={proc}
                      ip={ip}
                      onRestart={onRestart}
                      restarting={restartingPid === proc.pid}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other processes */}
            {otherProcesses.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  OTHER PROCESSES
                </div>
                <div className="space-y-2">
                  {otherProcesses.map((proc) => (
                    <RemoteProcessCard
                      key={proc.pid}
                      process={proc}
                      ip={ip}
                      onRestart={onRestart}
                      restarting={restartingPid === proc.pid}
                    />
                  ))}
                </div>
              </div>
            )}

            {machine.processes.length === 0 && services.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No processes or services found
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PM2Page() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [remoteMachines, setRemoteMachines] = useState<Record<string, RemoteMachine>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restartingAll, setRestartingAll] = useState(false);
  const [logProcess, setLogProcess] = useState<string | null>(null);
  const [restartingPid, setRestartingPid] = useState<string | null>(null);
  const [controllingService, setControllingService] = useState<string | null>(null);

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchProcesses = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [pm2Data, remoteData] = await Promise.allSettled([
        getPM2List(credentials),
        getRemoteProcesses(credentials),
      ]);

      if (pm2Data.status === "fulfilled") {
        setProcesses(pm2Data.value.processes);
      }
      if (remoteData.status === "fulfilled") {
        setRemoteMachines(remoteData.value.machines);
      }
    } catch (err) {
      console.error("Failed to fetch processes:", err);
    }
  }, []);

  useEffect(() => {
    fetchProcesses().finally(() => setLoading(false));
    const interval = setInterval(fetchProcesses, 10000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProcesses();
    setRefreshing(false);
  };

  const handleRestart = async (name: string) => {
    const credentials = await getAdminCredentials();
    await pm2Restart(name, credentials);
    await fetchProcesses();
  };

  const handleStop = async (name: string) => {
    const credentials = await getAdminCredentials();
    await pm2Stop(name, credentials);
    await fetchProcesses();
  };

  const handleStart = async (name: string) => {
    const credentials = await getAdminCredentials();
    await pm2Start(name, credentials);
    await fetchProcesses();
  };

  const handleRestartAll = async () => {
    setRestartingAll(true);
    try {
      const credentials = await getAdminCredentials();
      for (const proc of processes) {
        if (proc.status === "online") {
          await pm2Restart(proc.name, credentials);
        }
      }
      await fetchProcesses();
    } finally {
      setRestartingAll(false);
    }
  };

  const handleRemoteRestart = async (ip: string, pid: string, type: string) => {
    setRestartingPid(pid);
    try {
      const credentials = await getAdminCredentials();
      await restartRemoteProcess(ip, pid, type, credentials);
      await fetchProcesses();
    } catch (err) {
      console.error("Remote restart error:", err);
    } finally {
      setRestartingPid(null);
    }
  };

  const handleServiceControl = async (ip: string, service: string, action: 'start' | 'stop' | 'restart') => {
    setControllingService(service);
    try {
      const credentials = await getAdminCredentials();
      await controlRemoteService(ip, service, action, credentials);
      await fetchProcesses();
    } catch (err) {
      console.error("Service control error:", err);
    } finally {
      setControllingService(null);
    }
  };

  const onlineCount = processes.filter(p => p.status === "online").length;
  const remoteOnlineCount = Object.values(remoteMachines).filter(m => m.status === "online").length;
  const totalRemoteProcesses = Object.values(remoteMachines).reduce(
    (acc, m) => acc + m.processes.length,
    0
  );
  const totalRemoteServices = Object.values(remoteMachines).reduce(
    (acc, m) => acc + (m.services?.length || 0),
    0
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Process Manager</h1>
          <p className="text-muted-foreground">
            {onlineCount}/{processes.length} local · {remoteOnlineCount}/{Object.keys(remoteMachines).length} remote machines
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleRestartAll} disabled={restartingAll}>
            {restartingAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Restart All Local
          </Button>
        </div>
      </div>

      {/* Local PM2 Processes */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Local Services (PM2)</h2>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
            .39
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processes.map((proc) => (
            <PM2ProcessCard
              key={proc.name}
              process={proc}
              onRestart={handleRestart}
              onStop={handleStop}
              onStart={handleStart}
              onViewLogs={setLogProcess}
            />
          ))}
        </div>
        {processes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            No PM2 processes found
          </div>
        )}
      </div>

      {/* Remote GPU Machines */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Remote GPU Machines</h2>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {totalRemoteProcesses} processes
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(remoteMachines)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ip, machine]) => (
              <RemoteMachineCard
                key={ip}
                ip={ip}
                machine={machine}
                onRestart={handleRemoteRestart}
                onServiceControl={handleServiceControl}
                restartingPid={restartingPid}
                controllingService={controllingService}
              />
            ))}
        </div>
        {Object.keys(remoteMachines).length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            No remote machines configured
          </div>
        )}
      </div>

      {/* Log Viewer Modal */}
      <PM2LogViewer
        processName={logProcess}
        onClose={() => setLogProcess(null)}
        getCredentials={getReadAuthCredentials}
      />
    </div>
  );
}

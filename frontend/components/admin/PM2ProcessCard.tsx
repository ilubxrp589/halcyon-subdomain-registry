"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PM2Process } from "@/services/adminApi";
import {
  Play,
  Square,
  RefreshCw,
  FileText,
  Loader2,
  Cpu,
  Clock,
  RotateCcw,
} from "lucide-react";

interface PM2ProcessCardProps {
  process: PM2Process;
  onRestart: (name: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onStart: (name: string) => Promise<void>;
  onViewLogs: (name: string) => void;
}

function formatUptime(uptime: number | null): string {
  if (!uptime) return "N/A";
  const ms = Date.now() - uptime;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function PM2ProcessCard({ process: proc, onRestart, onStop, onStart, onViewLogs }: PM2ProcessCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: string, fn: (name: string) => Promise<void>) => {
    setLoading(action);
    try {
      await fn(proc.name);
    } finally {
      setLoading(null);
    }
  };

  const isOnline = proc.status === "online";
  const statusColor = isOnline ? "text-green-500" : proc.status === "stopped" ? "text-gray-400" : "text-red-500";
  const dotColor = isOnline ? "bg-green-500" : proc.status === "stopped" ? "bg-gray-400" : "bg-red-500";

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
            <span className="font-semibold text-sm">{proc.name}</span>
          </div>
          <Badge variant="outline" className={statusColor}>
            {proc.status}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu className="w-3.5 h-3.5" />
            <span>{proc.cpu}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-xs font-mono">{formatMemory(proc.memory)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatUptime(proc.uptime)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{proc.restarts} restarts</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 flex-wrap">
          {isOnline ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("restart", onRestart)}
                disabled={loading !== null}
                className="flex-1"
              >
                {loading === "restart" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="ml-1">Restart</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("stop", onStop)}
                disabled={loading !== null}
                className="text-red-500 hover:text-red-600"
              >
                {loading === "stop" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("start", onStart)}
              disabled={loading !== null}
              className="flex-1"
            >
              {loading === "start" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span className="ml-1">Start</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewLogs(proc.name)}
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PM2ProcessCard;

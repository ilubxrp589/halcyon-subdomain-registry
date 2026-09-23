"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface SystemHealthBarProps {
  healthy: number;
  total: number;
  label?: string;
}

export function SystemHealthBar({ healthy, total, label }: SystemHealthBarProps) {
  const pct = total > 0 ? (healthy / total) * 100 : 0;
  const status = pct === 100 ? "healthy" : pct >= 70 ? "degraded" : "unhealthy";

  const colors = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-500",
    unhealthy: "bg-red-500",
  };

  const textColors = {
    healthy: "text-green-600",
    degraded: "text-yellow-600",
    unhealthy: "text-red-600",
  };

  const icons = {
    healthy: <CheckCircle className="w-5 h-5" />,
    degraded: <AlertTriangle className="w-5 h-5" />,
    unhealthy: <XCircle className="w-5 h-5" />,
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={textColors[status]}>{icons[status]}</span>
          <span className="font-semibold">
            {label || `${healthy}/${total} services healthy`}
          </span>
        </div>
        <span className={cn("text-sm font-medium", textColors[status])}>
          {status === "healthy" ? "All Systems Go" : status === "degraded" ? "Degraded" : "Issues Detected"}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={cn("h-2 rounded-full transition-all", colors[status])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default SystemHealthBar;

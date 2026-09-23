"use client";

import { cn } from "@/lib/utils";

type Status = "running" | "stopped" | "error" | "warning" | "unknown";

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
  running: { color: "bg-green-500", label: "Running" },
  stopped: { color: "bg-gray-500", label: "Stopped" },
  error: { color: "bg-red-500", label: "Error" },
  warning: { color: "bg-yellow-500", label: "Warning" },
  unknown: { color: "bg-gray-400", label: "Unknown" },
};

const sizeConfig = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

export function StatusIndicator({
  status,
  label,
  size = "md",
  showLabel = true,
}: StatusIndicatorProps) {
  const config = statusConfig[status] || statusConfig.unknown;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={cn(
          "rounded-full",
          config.color,
          sizeConfig[size]
        )} />
        {status === "running" && (
          <div className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-75",
            config.color,
            sizeConfig[size]
          )} />
        )}
      </div>
      {showLabel && (
        <span className="text-sm">{label || config.label}</span>
      )}
    </div>
  );
}

export default StatusIndicator;

"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  timeRemainingMs: number;
  phase?: string;
  compact?: boolean;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

function getUrgencyColor(ms: number): string {
  const days = ms / 86400000;
  if (days > 2) return "text-muted-foreground";
  if (days > 1) return "text-amber-400";
  return "text-orange-400";
}

function getProgressPercent(ms: number, phase?: string): number {
  // Estimate total duration based on phase
  const totalMs =
    phase === "Bidding"
      ? 720 * 10 * 60 * 1000 // ~5 days
      : phase === "Reveal"
        ? 1440 * 10 * 60 * 1000 // ~10 days
        : phase === "Opening"
          ? 37 * 10 * 60 * 1000 // ~6 hours
          : phase === "Transfer Lockup"
            ? 288 * 10 * 60 * 1000 // ~2 days
            : 0;

  if (totalMs === 0) return 0;
  const elapsed = totalMs - ms;
  return Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
}

export default function CountdownTimer({
  timeRemainingMs,
  phase,
  compact = false,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(timeRemainingMs);

  useEffect(() => {
    setRemaining(timeRemainingMs);
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemainingMs]);

  const colorClass = getUrgencyColor(remaining);
  const progress = getProgressPercent(remaining, phase);

  if (compact) {
    return (
      <span className={`font-mono text-xs ${colorClass}`}>
        {formatDuration(remaining)}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`font-mono text-xs font-medium ${colorClass}`}>
        {formatDuration(remaining)}
      </div>
      {false && progress > 0 && (
        <div className="w-24 h-0.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              remaining / 86400000 > 2
                ? "bg-halcyon-teal/60"
                : remaining / 86400000 > 1
                  ? "bg-amber-500/70"
                  : "bg-orange-400/70"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

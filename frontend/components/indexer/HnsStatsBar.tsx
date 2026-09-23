"use client";

import { useState, useEffect, useRef } from "react";
import { getIndexerStats, type IndexerStats } from "@/services/indexer";

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Soon...";
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface StatBoxProps {
  value: string;
  label: string;
}

function StatBox({ value, label }: StatBoxProps) {
  return (
    <div className="flex-1 min-w-[120px] bg-muted/20 border border-border/30 rounded-lg px-4 py-3 text-center">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function HnsStatsBar() {
  const [stats, setStats] = useState<IndexerStats | null>(null);
  const [countdown, setCountdown] = useState<string>("\u2014");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getIndexerStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!stats?.domains.last_scan) return;

    const nextScanTime =
      new Date(stats.domains.last_scan).getTime() + SCAN_INTERVAL_MS;

    const tick = () => {
      const remaining = nextScanTime - Date.now();
      setCountdown(formatCountdown(remaining));
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stats?.domains.last_scan]);

  const placeholder = "\u2014";

  return (
    <div className="flex flex-wrap gap-3">
      <StatBox
        value={stats ? formatNum(parseInt(stats.domains.total)) : placeholder}
        label="Indexed Domains"
      />
      <StatBox
        value={stats ? formatNum(parseInt(stats.domains.alive)) : placeholder}
        label="Have DNS"
      />
      <StatBox
        value={stats ? formatNum(parseInt(stats.domains.real)) : placeholder}
        label="Active Sites"
      />
      <StatBox
        value={stats ? formatNum(parseInt(stats.domains.https)) : placeholder}
        label="HTTPS Enabled"
      />
      <StatBox
        value={countdown}
        label="Next Scan"
      />
    </div>
  );
}

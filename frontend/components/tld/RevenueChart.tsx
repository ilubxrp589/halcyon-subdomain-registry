"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp } from "lucide-react";

interface MonthlyData {
  month: string;
  registrations: number;
  revenueFlr: number;
  revenueUsd: number;
}

interface RevenueChartProps {
  tldLabel: string;
}

export function RevenueChart({ tldLabel }: RevenueChartProps) {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"6m" | "12m" | "all">("6m");

  const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_V2}/tld/${encodeURIComponent(tldLabel)}/revenue/chart?period=${period}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json.months ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tldLabel, period, API_V2]);

  const maxRevenue = Math.max(...data.map((d) => d.revenueUsd), 1);
  const maxRegs = Math.max(...data.map((d) => d.registrations), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenueUsd, 0);
  const totalRegs = data.reduce((s, d) => s + d.registrations, 0);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-amber-400" />
          <h3 className="font-semibold">Revenue History</h3>
        </div>
        <div className="flex gap-1">
          {(["6m", "12m", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                period === p
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "all" ? "All" : p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No revenue data yet. Revenue will appear here as users register subdomains.
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">Total Revenue</div>
              <div className="text-lg font-bold text-green-400">${totalRevenue.toFixed(2)}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">Total Registrations</div>
              <div className="text-lg font-bold flex items-center justify-center gap-1">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                {totalRegs}
              </div>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="space-y-2">
            {data.map((d) => (
              <div key={d.month} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-xs text-muted-foreground shrink-0">{d.month}</span>
                <div className="flex-1 flex items-center gap-2">
                  {/* Revenue bar */}
                  <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-green-500/60 to-green-400/60 rounded transition-all"
                      style={{ width: `${(d.revenueUsd / maxRevenue) * 100}%` }}
                    />
                    {d.revenueUsd > 0 && (
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-mono">
                        ${d.revenueUsd.toFixed(0)}
                      </span>
                    )}
                  </div>
                  {/* Registrations count */}
                  <span className="w-12 text-right text-xs text-muted-foreground shrink-0">
                    {d.registrations} reg{d.registrations !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

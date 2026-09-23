"use client";

import { useEffect, useState } from "react";
import { getPlatformStats, type PlatformStats as PlatformStatsType } from "@/services/tldBrowse";
import { Globe, Users, Layers, TrendingUp } from "lucide-react";

export function PlatformStats() {
  const [stats, setStats] = useState<PlatformStatsType | null>(null);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: "TLDs Available", value: stats.totalTlds, icon: Globe },
    { label: "Official TLDs", value: stats.officialTlds, icon: Layers },
    { label: "Domains Registered", value: stats.totalSlds, icon: TrendingUp },
    { label: "TLD Stakers", value: stats.activeTldOwners, icon: Users },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
          <item.icon className="h-4 w-4 text-amber-400" />
          <span className="font-bold text-foreground">{item.value.toLocaleString()}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

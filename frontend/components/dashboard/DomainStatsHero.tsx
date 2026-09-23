"use client";

import { Globe, CheckCircle, Wifi, Wallet, Layers } from "lucide-react";

interface DomainStats {
  total: number;
  active: number;
  dnsConfigured: number;
  walletResolved: number;
  tldCount: number;
}

interface DomainStatsHeroProps {
  stats: DomainStats;
}

export function DomainStatsHero({ stats }: DomainStatsHeroProps) {
  const statItems = [
    {
      label: "Total Domains",
      value: stats.total,
      icon: Globe,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Active",
      value: stats.active,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "DNS Configured",
      value: stats.dnsConfigured,
      icon: Wifi,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Wallet Resolved",
      value: stats.walletResolved,
      icon: Wallet,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Owned TLDs",
      value: stats.tldCount,
      icon: Layers,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-border transition-colors"
        >
          <div className={`p-2 rounded-lg ${item.bgColor}`}>
            <item.icon className={`h-5 w-5 ${item.color}`} />
          </div>
          <div>
            <div className="text-2xl font-bold">{item.value}</div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

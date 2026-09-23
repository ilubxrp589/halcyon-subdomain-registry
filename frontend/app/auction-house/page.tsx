"use client";

import { useState } from "react";
import { useAuctionHouse } from "@/hooks/useAuctionHouse";
import { Button } from "@/components/ui/button";
import {
  Gavel,
  RefreshCw,
  Loader2,
  ShoppingBag,
  User,
  Clock,
  BarChart3,
  Hourglass,
} from "lucide-react";
import DiscoverTab from "./components/DiscoverTab";
import MarketplaceTab from "./components/MarketplaceTab";
import ActivityTab from "./components/ActivityTab";
import HistoryTab from "./components/HistoryTab";
import ExpiringTab from "./components/ExpiringTab";
import NotificationBell from "./components/NotificationBell";
import AnalyticsTab from "./components/AnalyticsTab";

type Tab = "discover" | "expiring" | "marketplace" | "activity" | "history" | "analytics";

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "discover", label: "Discover", icon: Gavel },
  { id: "expiring", label: "Expiring", icon: Hourglass },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { id: "activity", label: "My Activity", icon: User },
  { id: "history", label: "History", icon: Clock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export default function AuctionHousePage() {
  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const {
    auctions,
    pagination,
    stats,
    trending,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  } = useAuctionHouse();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl relative">
      <div className="halcyon-bg" />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gavel className="w-7 h-7 text-halcyon-teal" />
            <span className="text-halcyon-gradient">Auction House</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover, bid on, and trade Handshake names
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-background/40 backdrop-blur-sm border border-halcyon-teal/10 rounded-xl p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-halcyon-teal to-halcyon-green text-white shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "discover" && (
        <DiscoverTab
          auctions={auctions}
          pagination={pagination}
          stats={stats}
          trending={trending}
          loading={loading}
          error={error}
          filters={filters}
          setFilters={setFilters}
        />
      )}
      {activeTab === "expiring" && <ExpiringTab />}
      {activeTab === "marketplace" && <MarketplaceTab />}
      {activeTab === "activity" && <ActivityTab />}
      {activeTab === "history" && <HistoryTab />}
      {activeTab === "analytics" && <AnalyticsTab />}
    </div>
  );
}

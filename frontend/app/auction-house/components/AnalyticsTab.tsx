"use client";

import { useAuctionAnalytics, type AnalyticsErrors } from "@/hooks/useAuctionAnalytics";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Loader2,
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Coins,
  Activity,
  PieChart as PieChartIcon,
  ShoppingBag,
  Hash,
  Eye,
  AlertTriangle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Halcyon color palette
const COLORS = {
  teal: "#14b8a6",
  green: "#22c55e",
  amber: "#f59e0b",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  red: "#ef4444",
  cyan: "#06b6d4",
};

const PIE_COLORS = [COLORS.teal, COLORS.green, COLORS.amber, COLORS.blue, COLORS.purple, COLORS.pink, COLORS.red, COLORS.cyan];

const STATE_COLORS: Record<string, string> = {
  OPENING: COLORS.cyan,
  BIDDING: COLORS.green,
  REVEAL: COLORS.amber,
  CLOSED: COLORS.purple,
  REGISTER: COLORS.pink,
  EXPIRED: COLORS.red,
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatHns(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "Unknown";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/90 backdrop-blur-sm border border-halcyon-teal/20 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="text-xs font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

const AXIS_TICK = { fill: "#888", fontSize: 11 };
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#333" };

function SectionError({ label, error, onRetry }: { label: string; error: string; onRetry: () => void }) {
  return (
    <div className="glass-card flex flex-col items-center justify-center py-10 px-6 text-center">
      <AlertTriangle className="w-8 h-8 mb-2 text-amber-400/60" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">{error}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3 h-3 mr-1" />
        Retry
      </Button>
    </div>
  );
}

export default function AnalyticsTab() {
  const { overview, participants, marketplace, loading, error, errors, refresh } = useAuctionAnalytics();

  if (loading && !overview && !participants && !marketplace) {
    return (
      <div className="space-y-6">
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-halcyon h-24 rounded-xl" />
          ))}
        </div>
        {/* Chart skeletons */}
        <div className="skeleton-halcyon h-80 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton-halcyon h-72 rounded-xl" />
          <div className="skeleton-halcyon h-72 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton-halcyon h-72 rounded-xl" />
          <div className="skeleton-halcyon h-72 rounded-xl" />
        </div>
        <div className="skeleton-halcyon h-80 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card text-center py-16 px-6">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-red-400/60" />
        <p className="text-lg font-semibold">Failed to load analytics</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">All analytics endpoints are unreachable</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const kpis = overview?.kpis;
  const revealRate = participants?.revealRate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-halcyon-teal" />
          <h2 className="text-lg font-semibold">Auction Analytics</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Row 1: KPI Cards */}
      {errors.overview && !overview && (
        <SectionError label="Auction Overview" error={errors.overview} onRetry={refresh} />
      )}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard icon={Target} label="Avg Bids / Auction" value={kpis.avgBids.toFixed(1)} color="text-amber-400" />
          <KpiCard icon={Coins} label="Total Lockup" value={`${formatHns(kpis.totalLockupHns)} HNS`} color="text-halcyon-teal" />
          <KpiCard icon={Users} label="Unique Bidders" value={kpis.uniqueBidders.toLocaleString()} color="text-blue-400" />
          <KpiCard icon={Activity} label="Avg Lockup / Auction" value={`${formatHns(kpis.avgLockupHns)} HNS`} color="text-purple-400" />
        </div>
      )}

      {/* Row 2: Activity Over Time */}
      {overview && overview.activity.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-halcyon-teal" />
            <h3 className="text-sm font-semibold">Activity Over Time</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">Last 30 days</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={overview.activity.map(d => ({ ...d, date: formatDate(d.date) }))}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" tick={AXIS_TICK} stroke="#333" />
              <YAxis tick={AXIS_TICK} stroke="#333" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="opens" name="Opens" stackId="1" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={0.3} />
              <Area type="monotone" dataKey="bids" name="Bids" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.3} />
              <Area type="monotone" dataKey="closes" name="Closes" stackId="1" stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 3: State Distribution + Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* State Distribution - Bar rows */}
        {overview && overview.states.length > 0 && (() => {
          const total = overview.states.reduce((s, r) => s + r.count, 0);
          return (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-halcyon-teal" />
                  <h3 className="text-sm font-semibold">State Distribution</h3>
                </div>
                <span className="text-xs text-muted-foreground">{total.toLocaleString()} total</span>
              </div>
              <div className="space-y-3">
                {overview.states.map((entry) => {
                  const pct = total > 0 ? (entry.count / total) * 100 : 0;
                  const color = STATE_COLORS[entry.state] || COLORS.teal;
                  return (
                    <div key={entry.state}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs font-medium">{entry.state}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                          <span className="font-semibold w-16 text-right">{entry.count.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Conversion Funnel */}
        {marketplace && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-halcyon-teal" />
              <h3 className="text-sm font-semibold">Conversion Funnel</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                layout="vertical"
                data={[
                  { stage: "Total Auctions", count: marketplace.funnel.totalAuctions, pct: 100 },
                  { stage: "With Bids", count: marketplace.funnel.withBids, pct: marketplace.funnel.withBidsRate },
                  { stage: "With Reveals", count: marketplace.funnel.withReveals, pct: marketplace.funnel.withRevealsRate },
                  { stage: "Completed", count: marketplace.funnel.completed, pct: marketplace.funnel.completedRate },
                ]}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={AXIS_TICK} stroke="#333" />
                <YAxis type="category" dataKey="stage" tick={AXIS_TICK} stroke="#333" width={100} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-background/90 backdrop-blur-sm border border-halcyon-teal/20 rounded-lg px-3 py-2 shadow-lg">
                        <p className="text-xs font-medium">{d.stage}</p>
                        <p className="text-xs text-muted-foreground">{d.count.toLocaleString()} ({d.pct}%)</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" fill={COLORS.teal} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Row 4: Bid Value Distribution + Name Length vs Bids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bid Value Distribution */}
        {overview && overview.bidValueDistribution.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Coins className="w-4 h-4 text-halcyon-teal" />
              <h3 className="text-sm font-semibold">Bid Value Distribution</h3>
              <span className="text-[10px] text-muted-foreground">(HNS ranges)</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={overview.bidValueDistribution}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="range" tick={AXIS_TICK} stroke="#333" />
                <YAxis tick={AXIS_TICK} stroke="#333" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Bids" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Name Length vs Bids */}
        {participants && participants.nameLengthVsBids.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Hash className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-semibold">Name Length vs Avg Bids</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={participants.nameLengthVsBids}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="length" tick={AXIS_TICK} stroke="#333" label={{ value: "chars", position: "insideBottomRight", offset: -5, fill: "#666", fontSize: 10 }} />
                <YAxis tick={AXIS_TICK} stroke="#333" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgBids" name="Avg Bids" fill={COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Row 5: Top 10 Contested Names */}
      {overview && overview.topContested.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Hottest Active Auctions</h3>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(300, overview.topContested.length * 35)}>
            <BarChart layout="vertical" data={overview.topContested} margin={{ left: 20 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={AXIS_TICK} stroke="#333" />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#ccc", fontSize: 11 }}
                stroke="#333"
                width={120}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background/90 backdrop-blur-sm border border-halcyon-teal/20 rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-xs font-medium font-mono">{d.name}/</p>
                      <p className="text-xs text-muted-foreground">Bids: {d.bidCount} | Lockup: {formatHns(d.highestLockupHns)} HNS</p>
                      <p className="text-xs text-muted-foreground">Reveals: {d.revealCount} | State: {d.state}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="bidCount" name="Bids" fill={COLORS.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 6: Bidder Leaderboard + Reveal Rate */}
      {errors.participants && !participants && (
        <SectionError label="Participant Data" error={errors.participants} onRetry={refresh} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bidder Leaderboard */}
        {participants && participants.leaderboard.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold">Top Bidders</h3>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {participants.leaderboard.map((bidder, i) => (
                <div
                  key={bidder.address}
                  className="flex items-center justify-between rounded-lg bg-background/30 backdrop-blur-sm border border-halcyon-teal/8 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                    <span className="font-mono text-xs truncate">{truncateAddress(bidder.address)}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className="text-amber-400 font-semibold">{bidder.bidCount} bids</span>
                    <span className="text-muted-foreground">{bidder.namesBidOn} names</span>
                    <span className="text-halcyon-teal font-medium">{formatHns(bidder.totalLockupHns)} HNS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reveal Rate */}
        {revealRate && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold">Reveal Rate</h3>
            </div>
            <div className="flex flex-col items-center justify-center h-[250px]">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Revealed", value: revealRate.totalReveals },
                      { name: "Unrevealed", value: Math.max(0, revealRate.totalBids - revealRate.totalReveals) },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                  >
                    <Cell fill={COLORS.green} />
                    <Cell fill="#333" />
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center -mt-4">
                <p className="text-3xl font-bold text-halcyon-gradient">{revealRate.rate}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {revealRate.totalReveals.toLocaleString()} reveals / {revealRate.totalBids.toLocaleString()} bids
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 7: Marketplace Price Trends */}
      {errors.marketplace && !marketplace && (
        <SectionError label="Marketplace Data" error={errors.marketplace} onRetry={refresh} />
      )}
      {marketplace && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="w-4 h-4 text-pink-400" />
            <h3 className="text-sm font-semibold">Marketplace Price Trends</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">Last 30 days</span>
          </div>
          {marketplace.priceTrends.some(d => d.listingCount > 0 || d.saleCount > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={marketplace.priceTrends.map(d => ({ ...d, date: formatDate(d.date) }))}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={AXIS_TICK} stroke="#333" />
                <YAxis tick={AXIS_TICK} stroke="#333" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="avgPrice" name="Avg Listing Price" stroke={COLORS.pink} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="avgSalePrice" name="Avg Sale Price" stroke={COLORS.green} strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No marketplace data yet</p>
              <p className="text-xs mt-1">Marketplace activity will appear here once listings are created</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========== KPI CARD ========== */

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

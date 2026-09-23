"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Globe,
  DollarSign,
  Users,
  ShoppingCart,
  TrendingUp,
  Loader2,
  Download,
  Calendar,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getAnalyticsRegistrations,
  getAnalyticsRevenue,
  getAnalyticsMarketplace,
  getAnalyticsUsers,
  AnalyticsRegistrations,
  AnalyticsRevenue,
  AnalyticsMarketplace,
  AnalyticsUsers,
} from "@/services/adminApi";

const PIE_COLORS = ["#f59e0b", "#06b6d4", "#22c55e", "#d97706", "#ef4444", "#ec4899", "#f59e0b", "#14b8a6"];

function formatFLR(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toFixed(1);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function truncateWallet(w: string): string {
  return w ? `${w.slice(0, 6)}...${w.slice(-4)}` : "";
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        return typeof val === "string" && val.includes(",") ? `"${val}"` : String(val ?? "");
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const { getReadAuthCredentials } = useAdminAuth();
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"registrations" | "revenue" | "marketplace" | "users">("registrations");

  const [registrations, setRegistrations] = useState<AnalyticsRegistrations | null>(null);
  const [revenue, setRevenue] = useState<AnalyticsRevenue | null>(null);
  const [marketplace, setMarketplace] = useState<AnalyticsMarketplace | null>(null);
  const [users, setUsers] = useState<AnalyticsUsers | null>(null);

  const getCredentialsRef = useRef(getReadAuthCredentials);
  useEffect(() => {
    getCredentialsRef.current = getReadAuthCredentials;
  }, [getReadAuthCredentials]);

  const fetchAll = useCallback(async (r?: string) => {
    try {
      const credentials = await getCredentialsRef.current();
      const currentRange = r || range;
      const [reg, rev, mkt, usr] = await Promise.all([
        getAnalyticsRegistrations(credentials, currentRange),
        getAnalyticsRevenue(credentials, currentRange),
        getAnalyticsMarketplace(credentials, currentRange),
        getAnalyticsUsers(credentials, currentRange),
      ]);
      setRegistrations(reg);
      setRevenue(rev);
      setMarketplace(mkt);
      setUsers(usr);
      setError(null);
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch analytics");
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <p className="text-red-500">{error}</p>
            <Button variant="outline" className="mt-4" onClick={handleRefresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Platform metrics and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={handleRangeChange}>
            <SelectTrigger className="w-32">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Globe className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Domains</p>
                <p className="text-2xl font-bold">{registrations?.totals.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  +{registrations?.totals.period_count ?? 0} this period
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Period Revenue</p>
                <p className="text-2xl font-bold">{formatFLR(revenue?.totals.period_flr ?? 0)} FLR</p>
                {revenue?.flrPrice && typeof revenue.flrPrice === "number" && (
                  <p className="text-xs text-muted-foreground">
                    ~${(parseFloat(String(revenue.totals.period_flr)) * revenue.flrPrice).toFixed(2)} USD
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Listings</p>
                <p className="text-2xl font-bold">{marketplace?.listings.active_listings ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  Floor: {formatFLR(marketplace?.listings.floor_price ?? 0)} FLR
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Owners</p>
                <p className="text-2xl font-bold">{users?.wallets.total_owners ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  +{users?.wallets.new_owners ?? 0} new this period
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b pb-2">
        {(["registrations", "revenue", "marketplace", "users"] as const).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className="capitalize"
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* Registrations Tab */}
      {activeTab === "registrations" && registrations && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Daily Registrations</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(registrations.daily as unknown as Record<string, unknown>[], "registrations")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={registrations.daily.map((d) => ({ ...d, date: formatDate(d.date) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Registrations" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By TLD</CardTitle>
              </CardHeader>
              <CardContent>
                {registrations.byTld.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={registrations.byTld}
                        dataKey="count"
                        nameKey="tld"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(props) => `${(props as any).tld} (${(props as any).count})`}
                      >
                        {registrations.byTld.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">No data for this period</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total (all time)</span>
                  <span className="font-semibold">{registrations.totals.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">This period</span>
                  <span className="font-semibold">{registrations.totals.period_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Today</span>
                  <span className="font-semibold">{registrations.totals.today}</span>
                </div>
                {registrations.daily.length >= 2 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg/day</span>
                    <span className="font-semibold">
                      {(registrations.totals.period_count / registrations.daily.length).toFixed(1)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === "revenue" && revenue && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Revenue</h2>
            <div className="flex items-center gap-3">
              {revenue.flrPrice && typeof revenue.flrPrice === "number" && (
                <Badge variant="outline">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  FLR = ${revenue.flrPrice.toFixed(4)}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCSV(revenue.daily as unknown as Record<string, unknown>[], "revenue")}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenue.daily.map((d) => ({
                  date: formatDate(d.date),
                  flr: parseFloat(d.flr_total),
                  count: d.count,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="flr" stroke="#22c55e" name="FLR Revenue" strokeWidth={2} />
                  <Line type="monotone" dataKey="count" stroke="#f59e0b" name="Registrations" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Tier</CardTitle>
              </CardHeader>
              <CardContent>
                {revenue.byTier.length > 0 ? (
                  <div className="space-y-3">
                    {revenue.byTier.map((tier) => (
                      <div key={tier.tier} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{tier.tier}</Badge>
                          <span className="text-sm text-muted-foreground">{tier.count} domains</span>
                        </div>
                        <span className="font-mono font-semibold">{formatFLR(tier.flr_total)} FLR</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data for this period</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">All-time FLR</span>
                  <span className="font-semibold">{formatFLR(revenue.totals.total_flr)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period FLR</span>
                  <span className="font-semibold">{formatFLR(revenue.totals.period_flr)}</span>
                </div>
                {revenue.totals.total_usd && parseFloat(revenue.totals.total_usd) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">All-time USD</span>
                    <span className="font-semibold">${parseFloat(revenue.totals.total_usd).toFixed(2)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Marketplace Tab */}
      {activeTab === "marketplace" && marketplace && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Marketplace</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(marketplace.dailyVolume as unknown as Record<string, unknown>[], "marketplace-volume")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Volume</CardTitle>
            </CardHeader>
            <CardContent>
              {marketplace.dailyVolume.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={marketplace.dailyVolume.map((d) => ({
                    date: formatDate(d.date),
                    volume: parseFloat(d.volume),
                    transactions: d.transactions,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="volume" fill="#06b6d4" name="Volume (FLR)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm py-12 text-center">No marketplace activity in this period</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {marketplace.byType.length > 0 ? (
                  <div className="space-y-3">
                    {marketplace.byType.map((t) => (
                      <div key={t.event_type} className="flex justify-between items-center">
                        <Badge variant="outline">{t.event_type}</Badge>
                        <div className="text-right">
                          <span className="font-semibold">{t.count}</span>
                          {parseFloat(t.total_amount) > 0 && (
                            <span className="text-sm text-muted-foreground ml-2">
                              ({formatFLR(t.total_amount)} FLR)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No activity</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Sales</CardTitle>
              </CardHeader>
              <CardContent>
                {marketplace.topSales.length > 0 ? (
                  <div className="space-y-3">
                    {marketplace.topSales.map((sale, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="font-mono">{sale.fqdn}</span>
                        <span className="font-semibold">{formatFLR(sale.amount)} FLR</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No sales in this period</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && users && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Users</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(users.topHolders as unknown as Record<string, unknown>[], "top-holders")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Unique Users</CardTitle>
            </CardHeader>
            <CardContent>
              {users.dailyUsers.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={users.dailyUsers.map((d) => ({
                    date: formatDate(d.date),
                    wallets: d.unique_wallets,
                    registrations: d.registrations,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="wallets" stroke="#f59e0b" name="Unique Wallets" strokeWidth={2} />
                    <Line type="monotone" dataKey="registrations" stroke="#f59e0b" name="Registrations" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm py-12 text-center">No user data in this period</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Retention</CardTitle>
              </CardHeader>
              <CardContent>
                {users.retention && (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Single reg", value: Number(users.retention.single_reg) },
                          { name: "Returning", value: Number(users.retention.returning) },
                          { name: "Power (5+)", value: Number(users.retention.power_users) },
                        ].filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        <Cell fill="#6b7280" />
                        <Cell fill="#22c55e" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Top Holders</CardTitle>
              </CardHeader>
              <CardContent>
                {users.topHolders.length > 0 ? (
                  <div className="space-y-2">
                    {users.topHolders.map((holder, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="font-mono">{truncateWallet(holder.owner_wallet)}</span>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline">{holder.domain_count} domains</Badge>
                          <span className="text-muted-foreground">{formatFLR(holder.total_spent_flr)} FLR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No holders</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

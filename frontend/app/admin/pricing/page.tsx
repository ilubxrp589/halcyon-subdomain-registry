"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { DataTable, Column } from "@/components/admin/DataTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getPriceComparison,
  getPriceHistory,
  forcePriceSync,
  PriceComparison,
  PriceSyncHistory,
} from "@/services/adminApi";
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Zap,
  Loader2,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

export default function PricingPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [comparison, setComparison] = useState<PriceComparison | null>(null);
  const [history, setHistory] = useState<PriceSyncHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Use ref to avoid dependency issues with getReadAuthCredentials
  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const [compData, histData] = await Promise.all([
        getPriceComparison(credentials),
        getPriceHistory(pageSize, credentials),
      ]);
      setComparison(compData);
      setHistory(histData);
      setTotal(histData.length);
    } catch (err) {
      console.error("Failed to fetch pricing data:", err);
    }
  }, [pageSize]); // Removed getReadAuthCredentials, kept pageSize

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const credentials = await getAdminCredentials();
      await forcePriceSync(credentials);
      await fetchData();
    } catch (err) {
      console.error("Failed to force sync:", err);
    } finally {
      setSyncing(false);
    }
  };

  const priceDifference = comparison && comparison.ftso && comparison.onChain && comparison.onChain.price
    ? ((comparison.ftso.price - comparison.onChain.price) / comparison.onChain.price) * 100
    : 0;

  const columns: Column<PriceSyncHistory>[] = [
    {
      key: "synced_at",
      header: "Time",
      render: (item) => (
        <span className="text-sm">
          {item.synced_at ? new Date(item.synced_at).toLocaleString() : "N/A"}
        </span>
      ),
    },
    {
      key: "old_price",
      header: "Old Price",
      render: (item) => (
        <span className="font-mono text-sm">
          ${Number(item.old_price).toFixed(6)}
        </span>
      ),
    },
    {
      key: "change",
      header: "",
      render: () => <ArrowRight className="w-4 h-4 text-muted-foreground" />,
      className: "w-8",
    },
    {
      key: "new_price",
      header: "New Price",
      render: (item) => (
        <span className="font-mono text-sm">
          ${Number(item.new_price).toFixed(6)}
        </span>
      ),
    },
    {
      key: "difference",
      header: "Change",
      render: (item) => {
        const oldPrice = Number(item.old_price);
        const newPrice = Number(item.new_price);
        const diff = oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
        return (
          <span className={`font-mono text-sm ${diff >= 0 ? "text-green-500" : "text-red-500"}`}>
            {diff >= 0 ? "+" : ""}{diff.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "tx_hash",
      header: "Transaction",
      render: (item) => (
        <a
          href={`https://coston2-explorer.flare.network/tx/${item.tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-primary hover:underline"
        >
          {item.tx_hash ? `${item.tx_hash.slice(0, 10)}...` : "N/A"}
        </a>
      ),
    },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pricing</h1>
          <p className="text-muted-foreground">FTSO price oracle management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleForceSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Force Sync
          </Button>
        </div>
      </div>

      {/* Price Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>FTSO Price (Live)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <span className="text-3xl font-bold font-mono">
                {comparison?.ftso?.price?.toFixed(6) || "Loading..."}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Source: {comparison?.ftso?.source || "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On-Chain Price</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              <span className="text-3xl font-bold font-mono">
                {comparison?.onChain?.price?.toFixed(6) || "Loading..."}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Last sync: {comparison?.onChain?.lastUpdate
                ? new Date(comparison.onChain.lastUpdate).toLocaleTimeString()
                : "Never"}
            </p>
          </CardContent>
        </Card>

        <Card className={Math.abs(priceDifference) > 5 ? "border-yellow-500" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Difference</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {priceDifference >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
              <span className={`text-3xl font-bold font-mono ${
                priceDifference >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                {priceDifference >= 0 ? "+" : ""}{priceDifference.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1">
              {Math.abs(priceDifference) > 5 ? (
                <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Significant Deviation
                </Badge>
              ) : (
                <Badge variant="outline" className="text-green-600 border-green-500">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Within Tolerance
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sync Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Sync Interval</p>
              <p className="text-lg font-medium">5 minutes</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Price Threshold</p>
              <p className="text-lg font-medium">0.1%</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Syncs</p>
              <p className="text-lg font-medium">{total}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Feed ID</p>
              <p className="text-lg font-mono text-sm">FLR/USD</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sync History</CardTitle>
          <CardDescription>Recent price synchronization events</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={history}
            loading={loading}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
            emptyMessage="No sync history found"
          />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { DataTable, Column } from "@/components/admin/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAuditLog, exportAuditLog, AuditLogEntry } from "@/services/adminApi";
import { RefreshCw, Download, Loader2, Clock, FileText } from "lucide-react";

export default function AuditPage() {
  const { getReadAuthCredentials } = useAdminAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Filter state
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [walletSearch, setWalletSearch] = useState<string>("");
  const [dateRange, setDateRange] = useState<string>("all"); // all, today, week, month

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // Helper to safely get details object (handles string/object)
  const getDetailsObject = (log: AuditLogEntry | null): Record<string, unknown> => {
    if (!log?.details) return {};
    if (typeof log.details === 'string') {
      try {
        return JSON.parse(log.details);
      } catch {
        return { _raw: log.details };
      }
    }
    return log.details as Record<string, unknown>;
  };

  // Calculate date filters
  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case "today":
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { startDate: today.toISOString() };
      case "week":
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { startDate: weekAgo.toISOString() };
      case "month":
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { startDate: monthAgo.toISOString() };
      default:
        return {};
    }
  };

  // Use ref to avoid dependency issues with getReadAuthCredentials
  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchLogs = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const dateFilter = getDateFilter();
      const result = await getAuditLog({
        page,
        limit: pageSize,
        action: actionFilter !== "all" ? actionFilter : undefined,
        entityType: entityFilter !== "all" ? entityFilter : undefined,
        ...dateFilter,
      }, credentials);

      // Client-side wallet filter (API doesn't support it yet)
      let filteredData = result.data;
      if (walletSearch) {
        const search = walletSearch.toLowerCase();
        filteredData = result.data.filter(
          (log: AuditLogEntry) => log.actor_wallet?.toLowerCase().includes(search)
        );
      }

      setLogs(filteredData);
      setTotal(walletSearch ? filteredData.length : result.pagination.total);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
  }, [page, pageSize, actionFilter, entityFilter, dateRange, walletSearch]);

  useEffect(() => {
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const credentials = await getReadAuthCredentials();
      const blob = await exportAuditLog({
        action: actionFilter !== "all" ? actionFilter : undefined,
        entityType: entityFilter !== "all" ? entityFilter : undefined,
      }, credentials);

      // exportAuditLog already returns a Blob, use it directly
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export:", err);
    } finally {
      setExporting(false);
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      create: "default",
      update: "secondary",
      delete: "destructive",
      start: "default",
      stop: "outline",
    };
    return <Badge variant={colors[action] || "outline"}>{action}</Badge>;
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Time",
      render: (log) => (
        <span className="text-sm">
          {log.created_at ? new Date(log.created_at).toLocaleString() : "N/A"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (log) => getActionBadge(log.action),
    },
    {
      key: "entity_type",
      header: "Entity",
      render: (log) => (
        <span className="font-mono text-sm">{log.entity_type}</span>
      ),
    },
    {
      key: "entity_id",
      header: "Entity ID",
      render: (log) => (
        <span className="font-mono text-sm truncate max-w-[120px] block">
          {log.entity_id || "N/A"}
        </span>
      ),
    },
    {
      key: "actor_wallet",
      header: "Actor",
      render: (log) => (
        <span className="font-mono text-sm">
          {log.actor_wallet
            ? `${log.actor_wallet.slice(0, 6)}...${log.actor_wallet.slice(-4)}`
            : "System"}
        </span>
      ),
    },
    {
      key: "details",
      header: "",
      render: (log) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLog(log);
          }}
        >
          View
        </Button>
      ),
      className: "text-right",
    },
  ];

  // Get unique actions and entities for filters
  const actions = [
    "service_start",
    "service_stop",
    "tld_created",
    "tld_activated",
    "tld_deactivated",
    "tld_sync",
    "domain_status_update",
    "reserved_word_added",
    "reserved_word_removed",
    "gpu_restart",
    "gpu_restart_all",
    "gpu_counter_reset",
    "gpu_reset_counters",
    "price_sync_forced",
  ];
  const entities = [
    "service",
    "domain",
    "tld",
    "reserved_word",
    "gpu",
    "api",
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">Track all admin actions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entities.map((entity) => (
                  <SelectItem key={entity} value={entity}>
                    {entity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <Clock className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search wallet address..."
              value={walletSearch}
              onChange={(e) => { setWalletSearch(e.target.value); setPage(1); }}
              className="w-64"
            />

            {(actionFilter !== "all" || entityFilter !== "all" || dateRange !== "all" || walletSearch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionFilter("all");
                  setEntityFilter("all");
                  setDateRange("all");
                  setWalletSearch("");
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={logs}
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
            emptyMessage="No audit logs found"
            onRowClick={(log) => setSelectedLog(log)}
          />
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              {selectedLog?.created_at
                ? new Date(selectedLog.created_at).toLocaleString()
                : "N/A"}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Action</span>
                  <div>{getActionBadge(selectedLog.action)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Entity Type</span>
                  <p className="font-mono">{selectedLog.entity_type}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Entity ID</span>
                  <p className="font-mono break-all">{selectedLog.entity_id || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Actor Wallet</span>
                  <p className="font-mono break-all">
                    {selectedLog.actor_wallet || "System"}
                  </p>
                </div>
              </div>

              {((): React.ReactNode => {
                const details = getDetailsObject(selectedLog);
                if (Object.keys(details).length === 0) return null;

                return (
                  <div className="space-y-4">
                    {Boolean(details.ip || details.path) && (
                      <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                        {Boolean(details.method && details.path) && (
                          <div className="col-span-2 space-y-1">
                            <span className="text-xs text-muted-foreground">Endpoint</span>
                            <p className="font-mono text-sm">
                              <span className="text-blue-400">{String(details.method)}</span>{" "}
                              {String(details.path)}
                            </p>
                          </div>
                        )}
                        {Boolean(details.ip) && (
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">IP Address</span>
                            <p className="font-mono text-sm">{String(details.ip)}</p>
                          </div>
                        )}
                        {Boolean(details.duration) && (
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Duration</span>
                            <p className="font-mono text-sm">{String(details.duration)}</p>
                          </div>
                        )}
                        {Boolean(details.statusCode) && (
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Status</span>
                            <p className={`font-mono text-sm ${
                              Number(details.statusCode) >= 400 ? 'text-red-400' : 'text-green-400'
                            }`}>
                              {String(details.statusCode)}
                            </p>
                          </div>
                        )}
                        {Boolean(details.userAgent) && (
                          <div className="col-span-2 space-y-1">
                            <span className="text-xs text-muted-foreground">User Agent</span>
                            <p className="font-mono text-xs text-muted-foreground truncate">
                              {String(details.userAgent)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Request body */}
                    {Boolean(details.request) && (
                      <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">Request Body</span>
                        <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32">
                          {JSON.stringify(details.request, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Response or error */}
                    {Boolean(details.response) && (
                      <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">Response</span>
                        <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32">
                          {JSON.stringify(details.response, null, 2)}
                        </pre>
                      </div>
                    )}

                    {Boolean(details.error) && (
                      <div className="space-y-2">
                        <span className="text-sm text-red-400">Error</span>
                        <pre className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-xs text-red-300">
                          {String(details.error)}
                        </pre>
                      </div>
                    )}

                    {/* Legacy details (for old entries without structured data) */}
                    {!Boolean(details.ip) && !Boolean(details.request) && (
                      <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">Details</span>
                        <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-64">
                          {JSON.stringify(details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

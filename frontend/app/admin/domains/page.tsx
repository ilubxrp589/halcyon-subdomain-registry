"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { DataTable, Column } from "@/components/admin/DataTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listDomains, updateDomainStatus, listTLDs, Domain, TLD } from "@/services/adminApi";
import { RefreshCw, Globe, ExternalLink, Loader2 } from "lucide-react";

export default function DomainsPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [tlds, setTlds] = useState<TLD[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tldFilter, setTldFilter] = useState<string>("all");

  // Modal state
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  // Use ref to avoid dependency issues with getReadAuthCredentials
  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchDomains = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const result = await listDomains({
        page,
        limit: pageSize,
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        tld: tldFilter !== "all" ? tldFilter : undefined,
      }, credentials);
      setDomains(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error("Failed to fetch domains:", err);
    }
  }, [page, pageSize, search, statusFilter, tldFilter]); // Removed getReadAuthCredentials

  const fetchTLDs = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const result = await listTLDs(credentials);
      setTlds(result);
    } catch (err) {
      console.error("Failed to fetch TLDs:", err);
    }
  }, []); // No dependencies - uses ref

  // Fetch TLDs only once on mount
  useEffect(() => {
    fetchTLDs();
  }, [fetchTLDs]);

  // Fetch domains when filters change
  useEffect(() => {
    fetchDomains().finally(() => setLoading(false));
  }, [fetchDomains]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDomains();
    setRefreshing(false);
  };

  const handleStatusUpdate = async () => {
    if (!selectedDomain || !newStatus) return;

    setUpdating(true);
    try {
      const credentials = await getAdminCredentials();
      await updateDomainStatus(selectedDomain.id, newStatus, credentials);
      await fetchDomains();
      setSelectedDomain(null);
      setNewStatus("");
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      pending: "secondary",
      suspended: "destructive",
      expired: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const columns: Column<Domain>[] = [
    {
      key: "subdomain",
      header: "Domain",
      render: (domain) => (
        <div className="font-medium">
          {domain.subdomain}
          <span className="text-muted-foreground">.{domain.tld_name}</span>
        </div>
      ),
    },
    {
      key: "tld_name",
      header: "TLD",
      render: (domain) => <span className="font-mono text-sm">{domain.tld_name}</span>,
    },
    {
      key: "owner_wallet",
      header: "Owner",
      render: (domain) => (
        <span className="font-mono text-sm">
          {domain.owner_wallet ? `${domain.owner_wallet.slice(0, 6)}...${domain.owner_wallet.slice(-4)}` : "N/A"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (domain) => getStatusBadge(domain.status),
    },
    {
      key: "created_at",
      header: "Created",
      render: (domain) =>
        domain.created_at ? new Date(domain.created_at).toLocaleDateString() : "N/A",
    },
    {
      key: "actions",
      header: "",
      render: (domain) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDomain(domain);
            setNewStatus(domain.status);
          }}
        >
          Edit
        </Button>
      ),
      className: "text-right",
    },
  ];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchDomains();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Domains</h1>
          <p className="text-muted-foreground">Manage registered subdomains</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tldFilter} onValueChange={(v) => { setTldFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="TLD" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All TLDs</SelectItem>
                {tlds.map((tld) => (
                  <SelectItem key={tld.id} value={tld.name}>
                    {tld.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Domains Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={domains}
            loading={loading}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search domains...",
            }}
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
            emptyMessage="No domains found"
            onRowClick={(domain) => {
              setSelectedDomain(domain);
              setNewStatus(domain.status);
            }}
          />
        </CardContent>
      </Card>

      {/* Edit Domain Modal */}
      <Dialog open={!!selectedDomain} onOpenChange={() => setSelectedDomain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Domain</DialogTitle>
            <DialogDescription>
              {selectedDomain?.subdomain}.{selectedDomain?.tld_name}
            </DialogDescription>
          </DialogHeader>

          {selectedDomain && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Owner</span>
                  <p className="font-mono">
                    {selectedDomain.owner_wallet
                      ? `${selectedDomain.owner_wallet.slice(0, 10)}...${selectedDomain.owner_wallet.slice(-8)}`
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Token ID</span>
                  <p className="font-mono">{selectedDomain.token_id || "N/A"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p>
                    {selectedDomain.created_at
                      ? new Date(selectedDomain.created_at).toLocaleString()
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">FQDN</span>
                  <p>{selectedDomain.fqdn || "N/A"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDomain(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={updating || newStatus === selectedDomain?.status}
            >
              {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

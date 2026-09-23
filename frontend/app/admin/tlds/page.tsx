"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { DataTable, Column } from "@/components/admin/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listTLDs, createTLD, updateTLD, syncTLDsFromWallet, TLD, SyncTLDsResult, TLDCreateOptions, TLDUpdateOptions } from "@/services/adminApi";
import { RefreshCw, Plus, Loader2, Database, Scan, CheckCircle, XCircle, AlertCircle, DollarSign, Star, Settings } from "lucide-react";

export default function TLDsPage() {
  const { getReadAuthCredentials, getAdminCredentials } = useAdminAuth();
  const [tlds, setTlds] = useState<TLD[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newTldName, setNewTldName] = useState("");
  const [newTldOptions, setNewTldOptions] = useState<TLDCreateOptions>({
    base_price_usd: 10,
    price_multiplier_ultra: 50,
    price_multiplier_premium: 20,
    price_multiplier_standard_plus: 8,
    renewal_price_multiplier: 0.8,
    display_order: 100,
    featured: false,
    registration_open: true,
  });
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [selectedTld, setSelectedTld] = useState<TLD | null>(null);
  const [editOptions, setEditOptions] = useState<TLDUpdateOptions>({});
  const [updating, setUpdating] = useState(false);

  // Scan wallet state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SyncTLDsResult | null>(null);
  const [showScanResult, setShowScanResult] = useState(false);

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchTLDs = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      const result = await listTLDs(credentials);
      setTlds(result);
    } catch (err) {
      console.error("Failed to fetch TLDs:", err);
    }
  }, []);

  useEffect(() => {
    fetchTLDs().finally(() => setLoading(false));
  }, [fetchTLDs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTLDs();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!newTldName.trim()) return;

    setCreating(true);
    try {
      const credentials = await getAdminCredentials();
      await createTLD(newTldName.toLowerCase().trim(), credentials, newTldOptions);
      await fetchTLDs();
      setShowCreate(false);
      setNewTldName("");
      setNewTldOptions({
        base_price_usd: 10,
        price_multiplier_ultra: 50,
        price_multiplier_premium: 20,
        price_multiplier_standard_plus: 8,
        renewal_price_multiplier: 0.8,
        display_order: 100,
        featured: false,
        registration_open: true,
      });
    } catch (err) {
      console.error("Failed to create TLD:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTld) return;

    setUpdating(true);
    try {
      const credentials = await getAdminCredentials();
      await updateTLD(selectedTld.id, editOptions, credentials);
      await fetchTLDs();
      setSelectedTld(null);
      setEditOptions({});
    } catch (err) {
      console.error("Failed to update TLD:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleScanWallet = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const credentials = await getAdminCredentials();
      const result = await syncTLDsFromWallet(credentials);
      setScanResult(result);
      setShowScanResult(true);
      await fetchTLDs();
    } catch (err) {
      console.error("Failed to scan wallet:", err);
      setScanResult({
        success: false,
        scanned: 0,
        added: [],
        existing: [],
        failed: [],
        message: err instanceof Error ? err.message : "Failed to scan wallet",
      });
      setShowScanResult(true);
    } finally {
      setScanning(false);
    }
  };

  const openEditModal = (tld: TLD) => {
    setSelectedTld(tld);
    setEditOptions({
      is_active: tld.is_active,
      registration_open: tld.registration_open,
      description: tld.description || "",
      base_price_usd: Number(tld.base_price_usd) || 10,
      price_multiplier_ultra: Number(tld.price_multiplier_ultra) || 50,
      price_multiplier_premium: Number(tld.price_multiplier_premium) || 20,
      price_multiplier_standard_plus: Number(tld.price_multiplier_standard_plus) || 8,
      renewal_price_multiplier: Number(tld.renewal_price_multiplier) || 0.8,
      display_order: Number(tld.display_order) || 100,
      featured: tld.featured || false,
    });
  };

  const columns: Column<TLD>[] = [
    {
      key: "name",
      header: "TLD",
      render: (tld) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-medium">.{tld.name}</span>
          {tld.featured && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
        </div>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (tld) => (
        <div className="flex gap-1">
          <Badge variant={tld.is_active ? "default" : "secondary"}>
            {tld.is_active ? "Active" : "Inactive"}
          </Badge>
          {tld.is_active && !tld.registration_open && (
            <Badge variant="outline">Closed</Badge>
          )}
        </div>
      ),
    },
    {
      key: "pricing",
      header: "Base Price",
      render: (tld) => (
        <span className="font-mono">${Number(tld.base_price_usd || 10).toFixed(2)}</span>
      ),
    },
    {
      key: "domain_count",
      header: "Domains",
      render: (tld) => (
        <span className="font-mono">{tld.domain_count || 0}</span>
      ),
    },
    {
      key: "display_order",
      header: "Order",
      render: (tld) => (
        <span className="font-mono text-muted-foreground">{tld.display_order || 100}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (tld) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openEditModal(tld);
          }}
        >
          <Settings className="w-4 h-4 mr-1" />
          Edit
        </Button>
      ),
      className: "text-right",
    },
  ];

  // Summary stats
  const activeTlds = tlds.filter((t) => t.is_active).length;
  const totalDomains = tlds.reduce((sum, t) => sum + (t.domain_count || 0), 0);
  const featuredTlds = tlds.filter((t) => t.featured).length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">TLDs</h1>
          <p className="text-muted-foreground">Manage top-level domains and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Manual
          </Button>
          <Button onClick={handleScanWallet} disabled={scanning}>
            {scanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Scan className="w-4 h-4 mr-2" />
            )}
            Scan Wallet
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tlds.length}</p>
                <p className="text-sm text-muted-foreground">Total TLDs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeTlds}</p>
                <p className="text-sm text-muted-foreground">Active TLDs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{featuredTlds}</p>
                <p className="text-sm text-muted-foreground">Featured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDomains}</p>
                <p className="text-sm text-muted-foreground">Total Domains</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TLDs Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={tlds}
            loading={loading}
            emptyMessage="No TLDs configured"
            onRowClick={(tld) => openEditModal(tld)}
          />
        </CardContent>
      </Card>

      {/* Create TLD Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New TLD</DialogTitle>
            <DialogDescription>
              Create a new top-level domain with pricing configuration
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="tld-name">TLD Name</Label>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-muted-foreground">.</span>
                  <Input
                    id="tld-name"
                    value={newTldName}
                    onChange={(e) => setNewTldName(e.target.value.replace(/[^a-z0-9]/gi, ""))}
                    placeholder="example"
                    className="lowercase"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={newTldOptions.description || ""}
                  onChange={(e) => setNewTldOptions({ ...newTldOptions, description: e.target.value })}
                  placeholder="Description for this TLD..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label>Registration Open</Label>
                    <p className="text-xs text-muted-foreground">Allow new registrations</p>
                  </div>
                  <Switch
                    checked={newTldOptions.registration_open}
                    onCheckedChange={(v) => setNewTldOptions({ ...newTldOptions, registration_open: v })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label>Featured</Label>
                    <p className="text-xs text-muted-foreground">Show prominently</p>
                  </div>
                  <Switch
                    checked={newTldOptions.featured}
                    onCheckedChange={(v) => setNewTldOptions({ ...newTldOptions, featured: v })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={newTldOptions.display_order}
                  onChange={(e) => setNewTldOptions({ ...newTldOptions, display_order: parseInt(e.target.value) || 100 })}
                />
                <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Pricing Configuration (USD)</span>
                </div>

                <div className="space-y-2">
                  <Label>Base Price (4+ chars)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={newTldOptions.base_price_usd}
                      onChange={(e) => setNewTldOptions({ ...newTldOptions, base_price_usd: parseFloat(e.target.value) || 10 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>1-char Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newTldOptions.price_multiplier_ultra}
                      onChange={(e) => setNewTldOptions({ ...newTldOptions, price_multiplier_ultra: parseFloat(e.target.value) || 50 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      = ${((newTldOptions.base_price_usd || 10) * (newTldOptions.price_multiplier_ultra || 50)).toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>2-char Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newTldOptions.price_multiplier_premium}
                      onChange={(e) => setNewTldOptions({ ...newTldOptions, price_multiplier_premium: parseFloat(e.target.value) || 20 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      = ${((newTldOptions.base_price_usd || 10) * (newTldOptions.price_multiplier_premium || 20)).toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>3-char Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newTldOptions.price_multiplier_standard_plus}
                      onChange={(e) => setNewTldOptions({ ...newTldOptions, price_multiplier_standard_plus: parseFloat(e.target.value) || 8 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      = ${((newTldOptions.base_price_usd || 10) * (newTldOptions.price_multiplier_standard_plus || 8)).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Renewal Multiplier</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newTldOptions.renewal_price_multiplier}
                    onChange={(e) => setNewTldOptions({ ...newTldOptions, renewal_price_multiplier: parseFloat(e.target.value) || 0.8 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Renewals at {((newTldOptions.renewal_price_multiplier || 0.8) * 100).toFixed(0)}% of registration price
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newTldName.trim()}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create TLD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit TLD Modal */}
      <Dialog open={!!selectedTld} onOpenChange={() => setSelectedTld(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit TLD
              {selectedTld?.featured && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
            </DialogTitle>
            <DialogDescription>.{selectedTld?.name}</DialogDescription>
          </DialogHeader>

          {selectedTld && (
            <Tabs defaultValue="settings" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="text-base">Active Status</Label>
                      <p className="text-sm text-muted-foreground">
                        {editOptions.is_active ? "Visible to users" : "Hidden from users"}
                      </p>
                    </div>
                    <Switch
                      checked={editOptions.is_active}
                      onCheckedChange={(v) => setEditOptions({ ...editOptions, is_active: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="text-base">Registration Open</Label>
                      <p className="text-sm text-muted-foreground">
                        {editOptions.registration_open ? "Accepting registrations" : "Registration closed"}
                      </p>
                    </div>
                    <Switch
                      checked={editOptions.registration_open}
                      onCheckedChange={(v) => setEditOptions({ ...editOptions, registration_open: v })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-base">Featured</Label>
                    <p className="text-sm text-muted-foreground">Show prominently in TLD list</p>
                  </div>
                  <Switch
                    checked={editOptions.featured}
                    onCheckedChange={(v) => setEditOptions({ ...editOptions, featured: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editOptions.description || ""}
                    onChange={(e) => setEditOptions({ ...editOptions, description: e.target.value })}
                    placeholder="Description for this TLD..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={editOptions.display_order}
                    onChange={(e) => setEditOptions({ ...editOptions, display_order: parseInt(e.target.value) || 100 })}
                  />
                </div>

                {selectedTld.is_active && !editOptions.is_active && (selectedTld.domain_count || 0) > 0 && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600">
                    Warning: Disabling this TLD will hide it from new registrations.
                    Existing {selectedTld.domain_count} domain(s) will remain active.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 mt-4">
                <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Pricing Configuration (USD)</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Base Price (4+ chars)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={editOptions.base_price_usd}
                        onChange={(e) => setEditOptions({ ...editOptions, base_price_usd: parseFloat(e.target.value) || 10 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>1-char Multiplier</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editOptions.price_multiplier_ultra}
                        onChange={(e) => setEditOptions({ ...editOptions, price_multiplier_ultra: parseFloat(e.target.value) || 50 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        = ${((editOptions.base_price_usd || 10) * (editOptions.price_multiplier_ultra || 50)).toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>2-char Multiplier</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editOptions.price_multiplier_premium}
                        onChange={(e) => setEditOptions({ ...editOptions, price_multiplier_premium: parseFloat(e.target.value) || 20 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        = ${((editOptions.base_price_usd || 10) * (editOptions.price_multiplier_premium || 20)).toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>3-char Multiplier</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editOptions.price_multiplier_standard_plus}
                        onChange={(e) => setEditOptions({ ...editOptions, price_multiplier_standard_plus: parseFloat(e.target.value) || 8 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        = ${((editOptions.base_price_usd || 10) * (editOptions.price_multiplier_standard_plus || 8)).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Renewal Multiplier</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editOptions.renewal_price_multiplier}
                      onChange={(e) => setEditOptions({ ...editOptions, renewal_price_multiplier: parseFloat(e.target.value) || 0.8 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Renewals at {((editOptions.renewal_price_multiplier || 0.8) * 100).toFixed(0)}% of registration price
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Domain Count</span>
                    <p className="font-mono text-lg">{selectedTld.domain_count || 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Display Order</span>
                    <p className="font-mono text-lg">{selectedTld.display_order || 100}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Created</span>
                    <p>
                      {selectedTld.created_at
                        ? new Date(selectedTld.created_at).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Updated</span>
                    <p>
                      {selectedTld.updated_at
                        ? new Date(selectedTld.updated_at).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTld(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Result Modal */}
      <Dialog open={showScanResult} onOpenChange={setShowScanResult}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scanResult?.success ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              Wallet Scan Complete
            </DialogTitle>
            <DialogDescription>
              {scanResult?.message}
            </DialogDescription>
          </DialogHeader>

          {scanResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{scanResult.scanned}</p>
                  <p className="text-xs text-muted-foreground">Scanned</p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-green-500">{scanResult.added.length}</p>
                  <p className="text-xs text-muted-foreground">Added</p>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-blue-500">{scanResult.existing.length}</p>
                  <p className="text-xs text-muted-foreground">Already Exist</p>
                </div>
              </div>

              {scanResult.added.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-500 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Newly Added TLDs
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {scanResult.added.map((tld) => (
                      <Badge key={tld.id} variant="default" className="bg-green-500">
                        .{tld.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {scanResult.existing.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Already in Database
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {scanResult.existing.map((name) => (
                      <Badge key={name} variant="secondary">
                        .{name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {scanResult.failed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-500 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Failed to Add
                  </p>
                  <div className="space-y-1">
                    {scanResult.failed.map((item) => (
                      <div key={item.name} className="text-sm text-red-500">
                        .{item.name}: {item.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowScanResult(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

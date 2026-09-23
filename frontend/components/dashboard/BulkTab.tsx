"use client";

import { useState, useMemo } from "react";
import { BrowserProvider, Contract } from "ethers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Globe,
  Check,
  X,
  Search,
  DollarSign,
  Clock,
  Send,
  CheckSquare,
  Square,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateDNSRecords,
  bulkUpdateDNS,
  bulkTransferDomains,
  type AuthCredentials,
  type Domain,
} from "@/services/api";
import { useDomainFilters } from "@/hooks/useDomainFilters";

const NFT_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
];

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE;
const MARKETPLACE_ABI = [
  "function listFixedPrice(uint256 tokenId, uint256 price) external returns (uint256)",
  "function listAuction(uint256 tokenId, uint256 startingPrice, uint256 duration) external returns (uint256)",
];

interface DomainItem extends Domain {
  isListed?: boolean;
  resolvedAddress?: string | null;
}

interface BulkTabProps {
  domains: DomainItem[];
  wallet: string;
  walletProvider: any;
  getAuthCredentials: () => Promise<AuthCredentials>;
  currencySymbol: string;
  onRefresh: () => void;
}

interface BulkResult {
  fqdn: string;
  success: boolean;
  error?: string;
}

type BulkAction = "dns" | "list" | "transfer" | null;

export function BulkTab({
  domains,
  wallet,
  walletProvider,
  getAuthCredentials,
  currencySymbol,
  onRefresh,
}: BulkTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeAction, setActiveAction] = useState<BulkAction>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<BulkResult[]>([]);
  const [searchFilter, setSearchFilter] = useState("");

  // DNS form
  const [dnsForm, setDnsForm] = useState({ ipv4: "", ipv6: "", cname: "", txt: "" });

  // Listing form
  const [listPrice, setListPrice] = useState("");
  const [listType, setListType] = useState<"fixed" | "auction">("fixed");

  // Transfer form
  const [transferAddress, setTransferAddress] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");

  // Filter domains
  const filteredDomains = useMemo(() => {
    if (!searchFilter) return domains;
    const s = searchFilter.toLowerCase();
    return domains.filter((d) => d.fqdn.toLowerCase().includes(s));
  }, [domains, searchFilter]);

  const selectedDomains = useMemo(
    () => domains.filter((d) => selectedIds.has(d.id)),
    [domains, selectedIds]
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredDomains.map((d) => d.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const resetAction = () => {
    setActiveAction(null);
    setResults([]);
    setProgress({ current: 0, total: 0 });
  };

  // Bulk DNS Update
  const executeBulkDNS = async () => {
    if (selectedDomains.length === 0) return;
    setIsProcessing(true);
    setResults([]);
    const total = selectedDomains.length;
    setProgress({ current: 0, total });

    try {
      const credentials = await getAuthCredentials();
      const fqdns = selectedDomains.map((d) => d.fqdn);
      const records: Record<string, string> = {};
      if (dnsForm.ipv4.trim()) records.ipv4 = dnsForm.ipv4.trim();
      if (dnsForm.ipv6.trim()) records.ipv6 = dnsForm.ipv6.trim();
      if (dnsForm.cname.trim()) records.cname = dnsForm.cname.trim();
      if (dnsForm.txt.trim()) records.txt = dnsForm.txt.trim();

      // Use bulk endpoint if available, fallback to individual calls
      try {
        const response = await bulkUpdateDNS(credentials, fqdns, records);
        setResults(response.results);
        setProgress({ current: total, total });
      } catch {
        // Fallback: individual calls
        const bulkResults: BulkResult[] = [];
        for (let i = 0; i < selectedDomains.length; i++) {
          const domain = selectedDomains[i];
          const parts = domain.fqdn.split(".");
          try {
            await updateDNSRecords(credentials, parts[0], parts.slice(1).join("."), records);
            bulkResults.push({ fqdn: domain.fqdn, success: true });
          } catch (err) {
            bulkResults.push({ fqdn: domain.fqdn, success: false, error: err instanceof Error ? err.message : "Failed" });
          }
          setProgress({ current: i + 1, total });
          setResults([...bulkResults]);
        }
      }
    } catch (err) {
      console.error("Bulk DNS update failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Bulk List for Sale
  const executeBulkList = async () => {
    if (selectedDomains.length === 0 || !walletProvider || !listPrice) return;
    setIsProcessing(true);
    setResults([]);
    const total = selectedDomains.length;
    setProgress({ current: 0, total });

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress || !MARKETPLACE_ADDRESS) throw new Error("Contract addresses not configured");

      const nftContract = new Contract(nftAddress, NFT_ABI, signer);
      const marketplace = new Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      // Approve marketplace once
      const isApproved = await nftContract.isApprovedForAll(await signer.getAddress(), MARKETPLACE_ADDRESS);
      if (!isApproved) {
        const approveTx = await nftContract.setApprovalForAll(MARKETPLACE_ADDRESS, true);
        await approveTx.wait();
      }

      const { parseEther } = await import("ethers");
      const priceWei = parseEther(listPrice);
      const bulkResults: BulkResult[] = [];

      for (let i = 0; i < selectedDomains.length; i++) {
        const domain = selectedDomains[i];
        try {
          const tx = await marketplace.listFixedPrice(domain.token_id, priceWei);
          await tx.wait();
          bulkResults.push({ fqdn: domain.fqdn, success: true });
        } catch (err) {
          bulkResults.push({ fqdn: domain.fqdn, success: false, error: err instanceof Error ? err.message : "Failed" });
        }
        setProgress({ current: i + 1, total });
        setResults([...bulkResults]);
      }
    } catch (err) {
      console.error("Bulk listing failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Bulk Transfer
  const executeBulkTransfer = async () => {
    if (selectedDomains.length === 0 || !walletProvider || !transferAddress) return;
    if (transferConfirm !== `TRANSFER ${selectedDomains.length} DOMAINS`) return;

    setIsProcessing(true);
    setResults([]);
    const total = selectedDomains.length;
    setProgress({ current: 0, total });

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress) throw new Error("NFT contract address not configured");
      const nftContract = new Contract(nftAddress, NFT_ABI, signer);

      const bulkResults: BulkResult[] = [];
      let lastTxHash = "";

      for (let i = 0; i < selectedDomains.length; i++) {
        const domain = selectedDomains[i];
        try {
          const tx = await nftContract.safeTransferFrom(wallet, transferAddress, domain.token_id);
          await tx.wait();
          lastTxHash = tx.hash;
          bulkResults.push({ fqdn: domain.fqdn, success: true });
        } catch (err) {
          bulkResults.push({ fqdn: domain.fqdn, success: false, error: err instanceof Error ? err.message : "Failed" });
        }
        setProgress({ current: i + 1, total });
        setResults([...bulkResults]);
      }

      // Update backend
      if (lastTxHash) {
        try {
          const credentials = await getAuthCredentials();
          const successFqdns = bulkResults.filter((r) => r.success).map((r) => r.fqdn);
          if (successFqdns.length > 0) {
            await bulkTransferDomains(credentials, successFqdns, transferAddress, lastTxHash);
          }
        } catch (err) {
          console.error("Backend bulk transfer update failed:", err);
        }
      }

      // Refresh
      onRefresh();
    } catch (err) {
      console.error("Bulk transfer failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-6">
      {/* Domain Selection Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Select Domains</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedIds.size} selected</Badge>
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search filter */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter domains..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1">
            {filteredDomains.map((domain) => (
              <div
                key={domain.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-secondary/50",
                  selectedIds.has(domain.id) && "bg-primary/10 border border-primary/30"
                )}
                onClick={() => toggleSelect(domain.id)}
              >
                <div className="shrink-0">
                  {selectedIds.has(domain.id) ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-sm truncate">{domain.fqdn}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {domain.dns_active && <Badge variant="success" className="text-xs">DNS</Badge>}
                  <span className="text-xs text-muted-foreground">#{domain.token_id}</span>
                </div>
              </div>
            ))}
            {filteredDomains.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No domains match filter.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && !activeAction && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setActiveAction("dns")} className="gap-2">
            <Globe className="h-4 w-4" />
            Bulk DNS Update ({selectedIds.size})
          </Button>
          <Button onClick={() => setActiveAction("list")} variant="outline" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Bulk List for Sale ({selectedIds.size})
          </Button>
          <Button onClick={() => setActiveAction("transfer")} variant="outline" className="gap-2 text-orange-500 border-orange-500/50 hover:bg-orange-500/10">
            <Send className="h-4 w-4" />
            Bulk Transfer ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Bulk DNS Form */}
      {activeAction === "dns" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bulk DNS Update — {selectedIds.size} domains</CardTitle>
              <Button variant="ghost" size="sm" onClick={resetAction}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>A Record (IPv4)</Label><Input placeholder="192.168.1.1" value={dnsForm.ipv4} onChange={(e) => setDnsForm({ ...dnsForm, ipv4: e.target.value })} /></div>
              <div className="space-y-2"><Label>AAAA Record (IPv6)</Label><Input placeholder="2001:db8::1" value={dnsForm.ipv6} onChange={(e) => setDnsForm({ ...dnsForm, ipv6: e.target.value })} /></div>
              <div className="space-y-2"><Label>CNAME Record</Label><Input placeholder="example.com" value={dnsForm.cname} onChange={(e) => setDnsForm({ ...dnsForm, cname: e.target.value })} /></div>
              <div className="space-y-2"><Label>TXT Record</Label><Input placeholder="v=spf1 include:..." value={dnsForm.txt} onChange={(e) => setDnsForm({ ...dnsForm, txt: e.target.value })} /></div>
            </div>

            {/* Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Processing {progress.current}/{progress.total}...</span></div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && !isProcessing && (
              <div className="space-y-2">
                <div className="flex gap-3 text-sm">
                  <Badge variant="success">{successCount} succeeded</Badge>
                  {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
                </div>
                {results.filter((r) => !r.success).map((r) => (
                  <div key={r.fqdn} className="text-sm text-red-400">{r.fqdn}: {r.error}</div>
                ))}
              </div>
            )}

            <Button onClick={executeBulkDNS} disabled={isProcessing || (!dnsForm.ipv4 && !dnsForm.ipv6 && !dnsForm.cname && !dnsForm.txt)}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : <>Apply to {selectedIds.size} Domains</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bulk List Form */}
      {activeAction === "list" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bulk List for Sale — {selectedIds.size} domains</CardTitle>
              <Button variant="ghost" size="sm" onClick={resetAction}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Price ({currencySymbol})</Label>
              <Input type="number" placeholder={`Price per domain in ${currencySymbol}`} value={listPrice} onChange={(e) => setListPrice(e.target.value)} min="0.01" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Listing Type</Label>
              <div className="flex gap-2">
                <Button variant={listType === "fixed" ? "default" : "outline"} size="sm" onClick={() => setListType("fixed")}><DollarSign className="h-4 w-4 mr-1" />Fixed</Button>
                <Button variant={listType === "auction" ? "default" : "outline"} size="sm" onClick={() => setListType("auction")}><Clock className="h-4 w-4 mr-1" />Auction</Button>
              </div>
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Listing {progress.current}/{progress.total}...</span></div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div>
              </div>
            )}

            {results.length > 0 && !isProcessing && (
              <div className="space-y-2">
                <div className="flex gap-3 text-sm">
                  <Badge variant="success">{successCount} listed</Badge>
                  {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
                </div>
              </div>
            )}

            <Button onClick={executeBulkList} disabled={isProcessing || !listPrice || parseFloat(listPrice) < 0.01}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Listing...</> : <>List {selectedIds.size} Domains</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bulk Transfer Form */}
      {activeAction === "transfer" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bulk Transfer — {selectedIds.size} domains</CardTitle>
              <Button variant="ghost" size="sm" onClick={resetAction}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient Address</Label>
              <Input placeholder="0x..." value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} className="font-mono" />
            </div>

            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
              <p className="text-red-400 font-semibold mb-1">This action is irreversible!</p>
              <p className="text-muted-foreground">All {selectedIds.size} domains will be transferred on-chain.</p>
            </div>

            <div className="space-y-2">
              <Label>Type &quot;TRANSFER {selectedIds.size} DOMAINS&quot; to confirm</Label>
              <Input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} placeholder={`TRANSFER ${selectedIds.size} DOMAINS`} />
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Transferring {progress.current}/{progress.total}...</span></div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div>
              </div>
            )}

            {results.length > 0 && !isProcessing && (
              <div className="space-y-2">
                <div className="flex gap-3 text-sm">
                  <Badge variant="success">{successCount} transferred</Badge>
                  {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
                </div>
                {results.filter((r) => !r.success).map((r) => (
                  <div key={r.fqdn} className="text-sm text-red-400">{r.fqdn}: {r.error}</div>
                ))}
              </div>
            )}

            <Button variant="destructive" onClick={executeBulkTransfer} disabled={isProcessing || transferConfirm !== `TRANSFER ${selectedIds.size} DOMAINS` || !transferAddress.match(/^0x[a-fA-F0-9]{40}$/)}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Transferring...</> : <><Send className="h-4 w-4 mr-2" />Transfer {selectedIds.size} Domains</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {domains.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No domains available for bulk operations.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

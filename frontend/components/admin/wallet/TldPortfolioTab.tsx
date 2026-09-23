"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Globe, RefreshCw, Loader2, Search, ExternalLink, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { getV2Tlds, type V2TldInfo } from "@/services/api";
import { getFlareNetwork, getExplorerAddressUrl } from "@/lib/flareContracts";

type StakingStatus = "staked" | "pending" | "unstaked";

function getStakingStatus(tld: V2TldInfo): StakingStatus {
  if (tld.tokenId !== null && tld.tokenId > 0) return "staked";
  if (tld.owner && tld.owner !== "0x0000000000000000000000000000000000000000") return "pending";
  return "unstaked";
}

function StatusBadge({ status }: { status: StakingStatus }) {
  switch (status) {
    case "staked":
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Staked</Badge>;
    case "pending":
      return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    case "unstaked":
      return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" /> HSD Only</Badge>;
  }
}

function truncateAddress(addr: string) {
  if (!addr || addr.length <= 12) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function TldPortfolioTab() {
  const { isConnected, chainId } = useWeb3ModalAccount();
  const network = getFlareNetwork(chainId);
  const [tlds, setTlds] = useState<V2TldInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchTlds = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getV2Tlds();
      setTlds(result);
    } catch (err) {
      console.error("Failed to fetch TLDs:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch TLDs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTlds(); }, []);

  const filtered = useMemo(() => {
    if (!search) return tlds;
    const q = search.toLowerCase();
    return tlds.filter((t) => t.label.toLowerCase().includes(q));
  }, [tlds, search]);

  // Stats
  const staked = tlds.filter((t) => getStakingStatus(t) === "staked").length;
  const pending = tlds.filter((t) => getStakingStatus(t) === "pending").length;
  const unstaked = tlds.filter((t) => getStakingStatus(t) === "unstaked").length;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total TLDs</p>
            <p className="text-2xl font-bold">{tlds.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Staked (Flare)</p>
            <p className="text-2xl font-bold text-green-500">{staked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-500">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">HSD Only</p>
            <p className="text-2xl font-bold text-muted-foreground">{unstaked}</p>
          </CardContent>
        </Card>
      </div>

      {/* TLD Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" /> TLD Portfolio
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search TLDs..."
                  className="pl-7 h-8 w-48 text-sm"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={fetchTlds} disabled={loading}>
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading TLD portfolio...
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 py-4 text-center">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TLD</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Token ID</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">SLDs</TableHead>
                  <TableHead>Registration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {search ? "No TLDs match your search" : "No TLDs found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((tld) => {
                    const status = getStakingStatus(tld);
                    return (
                      <TableRow key={tld.namehash || tld.label}>
                        <TableCell className="font-medium">.{tld.label}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell className="font-mono text-xs">
                          {tld.tokenId !== null ? `#${tld.tokenId}` : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tld.owner ? (
                            <a
                              href={getExplorerAddressUrl(chainId, tld.owner)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              {truncateAddress(tld.owner)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">{tld.sldCount}</TableCell>
                        <TableCell>
                          <Badge variant={tld.registrationEnabled ? "outline" : "secondary"} className={tld.registrationEnabled ? "border-green-500/50 text-green-500" : ""}>
                            {tld.registrationEnabled ? "Open" : "Closed"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>TLDs start on the HSD node (Handshake). Staking bridges them to Flare, minting an ERC-721 TLD NFT.</p>
        <p>Once staked, SLD registrations can be opened and users can register subdomains under the TLD.</p>
      </div>
    </div>
  );
}

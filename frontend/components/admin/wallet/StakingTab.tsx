"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Shield, RefreshCw, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { useFlareStaking } from "@/hooks/useFlareStaking";
import { getFlareNetwork, getExplorerAddressUrl } from "@/lib/flareContracts";

function truncateNodeId(id: string) {
  if (id.length <= 20) return id;
  return `${id.slice(0, 12)}...${id.slice(-6)}`;
}

function formatStake(amount: string): string {
  const num = parseFloat(amount);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

export function StakingTab() {
  const { isConnected, chainId } = useWeb3ModalAccount();
  const staking = useFlareStaking();
  const network = getFlareNetwork(chainId);

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to view staking</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-600">P-Chain Staking</p>
            <p className="text-muted-foreground mt-1">
              Validator staking on Flare requires a minimum of 50,000 {network.currencySymbol} and
              involves P-chain cross-chain operations. Currently view-only in this dashboard.
              Use the Flare Portal for full staking operations.
            </p>
          </div>
        </div>
      </div>

      {/* Validators List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" /> Network Validators
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={staking.refresh} disabled={staking.loading}>
              <RefreshCw className={`w-3 h-3 ${staking.loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {staking.loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading validators...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Validator</TableHead>
                  <TableHead className="text-right">Total Stake</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Delegators</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staking.validators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No validators found
                    </TableCell>
                  </TableRow>
                ) : (
                  staking.validators.map((v) => (
                    <TableRow key={v.nodeId}>
                      <TableCell className="font-mono text-xs">
                        {truncateNodeId(v.nodeId)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatStake(v.totalStake)} {network.currencySymbol}
                      </TableCell>
                      <TableCell className="text-right">{v.fee}%</TableCell>
                      <TableCell className="text-right">{v.delegators ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={v.isActive ? "outline" : "secondary"} className={v.isActive ? "border-green-500 text-green-500" : ""}>
                          {v.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Validator staking locks {network.currencySymbol} on the P-chain for a chosen duration (14 days minimum).</p>
        <p>Staking rewards are separate from FTSO delegation rewards. Both can be earned simultaneously.</p>
      </div>
    </div>
  );
}

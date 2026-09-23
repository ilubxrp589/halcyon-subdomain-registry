"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Trash2 } from "lucide-react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { useFlareBalances } from "@/hooks/useFlareBalances";
import { useFlareDelegation, bipsToPercent } from "@/hooks/useFlareDelegation";
import { getFlareNetwork, getExplorerAddressUrl } from "@/lib/flareContracts";
import { FtsoProviderPicker } from "./FtsoProviderPicker";
import { TxStatusDisplay, TxProcessing } from "./TxStatusDisplay";
import type { TransactionResult } from "@/services/flareWallet";

function truncateAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function DelegateTab() {
  const { isConnected, chainId } = useWeb3ModalAccount();
  const balances = useFlareBalances();
  const delegation = useFlareDelegation();
  const network = getFlareNetwork(chainId);

  const [provider, setProvider] = useState("");
  const [percent, setPercent] = useState("50");
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);

  const handleDelegate = async () => {
    if (!provider || !percent) return;
    const pct = parseFloat(percent);
    if (pct <= 0 || pct > 100) return;
    const result = await delegation.delegate(provider, pct);
    setTxResult(result);
    if (result.success) {
      setProvider("");
      setPercent("50");
      balances.refresh();
    }
  };

  const handleUndelegateAll = async () => {
    const result = await delegation.undelegateAll();
    setTxResult(result);
    if (result.success) balances.refresh();
  };

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to manage delegations</p>
        </CardContent>
      </Card>
    );
  }

  const info = delegation.delegations;
  const hasDelegations = info && info.count > 0;
  // Total delegated percentage
  const totalBips = info ? info.bips.reduce((a, b) => a + b, 0) : 0;
  const remainingPercent = 100 - bipsToPercent(totalBips);

  return (
    <div className="space-y-4">
      {/* Current Delegations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Current Delegations
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{network.wrappedSymbol}: {balances.wflr}</Badge>
              <Badge variant="outline">Vote Power: {balances.votePower}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {delegation.loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading delegations...
            </div>
          ) : !hasDelegations ? (
            <p className="text-muted-foreground text-sm py-4">
              No active delegations. Delegate your {network.wrappedSymbol} to FTSO data providers to earn rewards.
            </p>
          ) : (
            <div className="space-y-3">
              {info!.providers.map((addr, i) => (
                <div key={addr} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <a
                        href={getExplorerAddressUrl(chainId, addr)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-blue-500 hover:underline"
                      >
                        {truncateAddress(addr)}
                      </a>
                    </div>
                  </div>
                  <Badge>{bipsToPercent(info!.bips[i])}%</Badge>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
                <span>Total delegated: {bipsToPercent(totalBips)}%</span>
                <span>Remaining: {remainingPercent}%</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUndelegateAll}
                disabled={delegation.processing}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Remove All Delegations
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Delegation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Delegation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FtsoProviderPicker
            value={provider}
            onChange={setProvider}
            disabled={delegation.processing}
          />

          <div className="space-y-2">
            <Label>Delegation Percentage</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max={remainingPercent > 0 ? remainingPercent : 100}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                disabled={delegation.processing}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
              {remainingPercent < 100 && (
                <span className="text-xs text-muted-foreground">
                  (max {remainingPercent}% remaining)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              You can delegate to up to 2 providers. Total cannot exceed 100%.
            </p>
          </div>

          {delegation.processing ? (
            <TxProcessing message="Confirm delegation in your wallet..." />
          ) : (
            <Button
              onClick={handleDelegate}
              disabled={!provider || !percent || parseFloat(percent) <= 0 || delegation.processing}
              className="w-full"
            >
              <Users className="w-4 h-4 mr-2" /> Delegate {percent}% to Provider
            </Button>
          )}

          {txResult && (
            <TxStatusDisplay
              hash={txResult.hash}
              success={txResult.success}
              error={txResult.error}
              chainId={chainId}
              label={txResult.success ? "Delegation updated" : undefined}
              onDismiss={() => setTxResult(null)}
            />
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Delegating your {network.wrappedSymbol} vote power to FTSO data providers earns you a share of FTSO rewards each epoch.</p>
        <p>Maximum 2 providers. Changing delegation takes effect at the next reward epoch.</p>
      </div>
    </div>
  );
}

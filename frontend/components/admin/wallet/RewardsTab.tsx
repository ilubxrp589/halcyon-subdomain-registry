"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, RefreshCw, Loader2, Coins, Droplets } from "lucide-react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { useFlareRewards } from "@/hooks/useFlareRewards";
import { getFlareNetwork } from "@/lib/flareContracts";
import { TxStatusDisplay, TxProcessing } from "./TxStatusDisplay";
import type { TransactionResult } from "@/services/flareWallet";

export function RewardsTab() {
  const { isConnected, chainId } = useWeb3ModalAccount();
  const rewardsState = useFlareRewards();
  const network = getFlareNetwork(chainId);
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to view and claim rewards</p>
        </CardContent>
      </Card>
    );
  }

  const rewards = rewardsState.rewards;
  const hasFtsoRewards = rewards && rewards.ftso.unclaimedEpochs.length > 0;
  const hasDropRewards = rewards && rewards.flareDrop.claimableWei > 0n;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4" /> Rewards Summary
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={rewardsState.refresh} disabled={rewardsState.loading}>
              <RefreshCw className={`w-3 h-3 ${rewardsState.loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rewardsState.loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading rewards...
            </div>
          ) : rewards ? (
            <div className="text-center py-4">
              <p className="text-3xl font-bold font-mono">{rewards.totalClaimable}</p>
              <p className="text-sm text-muted-foreground mt-1">Total claimable {network.currencySymbol}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4">Unable to fetch rewards</p>
          )}
        </CardContent>
      </Card>

      {/* FTSO Rewards */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="w-4 h-4" /> FTSO Delegation Rewards
            </CardTitle>
            {rewards && (
              <Badge variant={hasFtsoRewards ? "default" : "outline"}>
                {rewards.ftso.totalRewards} {network.currencySymbol}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rewards ? (
            <>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Current epoch: {rewards.ftso.currentEpoch}</p>
                {hasFtsoRewards && (
                  <p>Unclaimed epochs: {rewards.ftso.unclaimedEpochs.join(", ")}</p>
                )}
              </div>
              {hasFtsoRewards ? (
                rewardsState.processing ? (
                  <TxProcessing message="Claiming FTSO rewards..." />
                ) : (
                  <Button
                    onClick={async () => setTxResult(await rewardsState.claimFtso())}
                    className="w-full"
                  >
                    <Coins className="w-4 h-4 mr-2" />
                    Claim {rewards.ftso.totalRewards} {network.currencySymbol}
                  </Button>
                )
              ) : (
                <p className="text-sm text-muted-foreground">No unclaimed FTSO rewards. Delegate your {network.wrappedSymbol} to earn rewards.</p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* FlareDrop Rewards */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Droplets className="w-4 h-4" /> FlareDrop
            </CardTitle>
            {rewards && (
              <Badge variant={hasDropRewards ? "default" : "outline"}>
                {rewards.flareDrop.claimable} {network.currencySymbol}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rewards ? (
            hasDropRewards ? (
              rewardsState.processing ? (
                <TxProcessing message="Claiming FlareDrop..." />
              ) : (
                <Button
                  onClick={async () => setTxResult(await rewardsState.claimDrop())}
                  className="w-full"
                >
                  <Droplets className="w-4 h-4 mr-2" />
                  Claim {rewards.flareDrop.claimable} {network.currencySymbol}
                </Button>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                No FlareDrop rewards available. FlareDrop distributions are allocated monthly to delegators.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      {/* TX Result */}
      {txResult && (
        <TxStatusDisplay
          hash={txResult.hash}
          success={txResult.success}
          error={txResult.error}
          chainId={chainId}
          label={txResult.success ? "Rewards claimed successfully" : undefined}
          onDismiss={() => setTxResult(null)}
        />
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>FTSO rewards accrue each epoch when you delegate {network.wrappedSymbol} to data providers.</p>
        <p>FlareDrop is distributed monthly to active delegators. Claim before it expires.</p>
      </div>
    </div>
  );
}

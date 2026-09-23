"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ArrowRightLeft, Loader2 } from "lucide-react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { formatEther } from "ethers";
import { useFlareBalances } from "@/hooks/useFlareBalances";
import { useFlareWallet } from "@/hooks/useFlareWallet";
import { getFlareNetwork } from "@/lib/flareContracts";
import { AmountInput } from "./AmountInput";
import { TxStatusDisplay, TxProcessing } from "./TxStatusDisplay";

export function WrapUnwrapTab() {
  const { isConnected, chainId } = useWeb3ModalAccount();
  const balances = useFlareBalances();
  const wallet = useFlareWallet();
  const [mode, setMode] = useState<"wrap" | "unwrap">("wrap");
  const [amount, setAmount] = useState("");

  const network = getFlareNetwork(chainId);
  const nativeSymbol = network.currencySymbol;
  const wrappedSymbol = network.wrappedSymbol;

  const maxAmount = mode === "wrap"
    ? formatEther(balances.flrWei > 1_000_000_000_000_000n ? balances.flrWei - 1_000_000_000_000_000n : 0n) // Keep 0.001 for gas
    : formatEther(balances.wflrWei);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    const result = mode === "wrap"
      ? await wallet.wrap(amount)
      : await wallet.unwrap(amount);
    if (result.success) {
      setAmount("");
      balances.refresh();
    }
  };

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to wrap/unwrap tokens</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">{nativeSymbol} Balance</CardTitle>
              <Button variant="ghost" size="sm" onClick={balances.refresh} disabled={balances.loading}>
                <RefreshCw className={`w-3 h-3 ${balances.loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{balances.flr}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{wrappedSymbol} Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{balances.wflr}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Vote Power</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{balances.votePower}</p>
          </CardContent>
        </Card>
      </div>

      {/* Wrap/Unwrap Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              {mode === "wrap" ? `Wrap ${nativeSymbol}` : `Unwrap ${wrappedSymbol}`}
            </CardTitle>
            <Badge variant="outline">{network.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "wrap" ? "default" : "outline"}
              className="flex-1"
              onClick={() => { setMode("wrap"); setAmount(""); wallet.clearResult(); }}
            >
              {nativeSymbol} → {wrappedSymbol}
            </Button>
            <Button
              variant={mode === "unwrap" ? "default" : "outline"}
              className="flex-1"
              onClick={() => { setMode("unwrap"); setAmount(""); wallet.clearResult(); }}
            >
              {wrappedSymbol} → {nativeSymbol}
            </Button>
          </div>

          <AmountInput
            label={mode === "wrap" ? `Amount to wrap` : `Amount to unwrap`}
            value={amount}
            onChange={setAmount}
            maxAmount={maxAmount}
            symbol={mode === "wrap" ? nativeSymbol : wrappedSymbol}
            disabled={wallet.processing}
          />

          {wallet.processing ? (
            <TxProcessing message="Confirm transaction in your wallet..." />
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!amount || parseFloat(amount) <= 0 || wallet.processing}
              className="w-full"
            >
              {mode === "wrap" ? `Wrap ${nativeSymbol}` : `Unwrap ${wrappedSymbol}`}
            </Button>
          )}

          {wallet.lastResult && (
            <TxStatusDisplay
              hash={wallet.lastResult.hash}
              success={wallet.lastResult.success}
              error={wallet.lastResult.error}
              chainId={chainId}
              label={wallet.lastResult.success
                ? `${mode === "wrap" ? "Wrapped" : "Unwrapped"} ${amount} ${mode === "wrap" ? nativeSymbol : wrappedSymbol}`
                : undefined}
              onDismiss={wallet.clearResult}
            />
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Wrapping converts native {nativeSymbol} to {wrappedSymbol} (ERC-20). This is required for FTSO delegation and earning rewards.</p>
        <p>Vote power equals your {wrappedSymbol} balance. Delegate to FTSO providers to earn rewards.</p>
      </div>
    </div>
  );
}

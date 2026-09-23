"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Globe,
  Layers,
  Wallet,
  RefreshCw,
  ArrowRight,
  Pickaxe,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Contract, BrowserProvider, formatEther } from "ethers";
import Link from "next/link";
import { toast } from "sonner";
import { useMyTlds } from "@/hooks/useMyTlds";
import { useFlrPrice } from "@/hooks/useFlrPrice";
import { getPublicProvider } from "@/lib/web3modal";
import type { AuthCredentials, V2TldInfo, V2StakingClaim } from "@/services/api";

const PAYMENT_MANAGER_ADDRESS = "0xc502b38C93A3B34D5E0BcFD83384678632D0F112";
const PAYMENT_ABI = [
  "function pendingWithdrawals(address account) view returns (uint256)",
  "function withdraw()",
];

interface MyTldsTabProps {
  wallet: string;
  walletProvider: any;
  getAuthCredentials: () => Promise<AuthCredentials>;
}

function ClaimStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-400">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case "fdc_ready":
    case "claiming":
      return (
        <Badge variant="secondary" className="bg-blue-500/10 text-blue-400">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {status === "fdc_ready" ? "FDC Ready" : "Claiming"}
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="secondary" className="bg-red-500/10 text-red-400">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {status}
        </Badge>
      );
  }
}

export function MyTldsTab({ wallet, walletProvider, getAuthCredentials }: MyTldsTabProps) {
  const { tlds, claims, pendingClaims, completedTldCount, totalSlds, activeTldCount, isLoading, error, refresh } =
    useMyTlds(wallet, getAuthCredentials);
  const { flrPerUsd } = useFlrPrice();

  const [pendingRevenue, setPendingRevenue] = useState<bigint>(BigInt(0));
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const loadRevenue = useCallback(async () => {
    if (!wallet) return;
    setLoadingRevenue(true);
    try {
      const provider = getPublicProvider();
      const paymentContract = new Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_ABI, provider);
      const pending = await paymentContract.pendingWithdrawals(wallet);
      setPendingRevenue(pending);
    } catch (err) {
      console.error("Failed to load revenue:", err);
    } finally {
      setLoadingRevenue(false);
    }
  }, [wallet]);

  useEffect(() => {
    loadRevenue();
  }, [loadRevenue]);

  const handleWithdraw = async () => {
    if (!walletProvider || pendingRevenue <= BigInt(0)) return;
    setWithdrawing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const paymentContract = new Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_ABI, signer);
      const tx = await paymentContract.withdraw({ gasLimit: BigInt(100000) });
      toast.info("Withdrawing...");
      await tx.wait();
      setPendingRevenue(BigInt(0));
      toast.success("Withdrawal complete!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Empty state
  if (completedTldCount === 0 && pendingClaims.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="bg-zinc-800/40 border-zinc-700">
          <CardContent className="p-12 text-center">
            <Crown className="h-12 w-12 mx-auto mb-4 text-zinc-500" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Stake Your First TLD
            </h3>
            <p className="text-zinc-400 mb-6 max-w-md mx-auto">
              Own a Handshake TLD? Stake it on Halcyon to earn 95% of subdomain
              registration revenue. You keep control — we handle DNS, payments,
              and the marketplace.
            </p>
            <Link href="/stake">
              <Button className="bg-amber-600 hover:bg-amber-700">
                <Pickaxe className="h-4 w-4 mr-2" />
                Stake a TLD
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const revenueFlr = parseFloat(formatEther(pendingRevenue));
  const revenueUsd =
    flrPerUsd && flrPerUsd > 0 ? revenueFlr / flrPerUsd : null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Crown className="h-4 w-4" />
              Staked TLDs
            </div>
            <div className="text-2xl font-bold text-white">
              {completedTldCount}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Globe className="h-4 w-4 text-emerald-400" />
              Active
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {activeTldCount}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Layers className="h-4 w-4" />
              Total SLDs
            </div>
            <div className="text-2xl font-bold text-white">{totalSlds}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Wallet className="h-4 w-4 text-amber-400" />
              Pending Revenue
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {loadingRevenue ? "..." : `${revenueFlr.toFixed(2)} FLR`}
            </div>
            {revenueUsd != null && revenueFlr > 0 && (
              <p className="text-xs text-zinc-500 mt-0.5">
                ~${revenueUsd.toFixed(2)} USD
              </p>
            )}
            {revenueFlr > 0 && (
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="mt-2 w-full py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {withdrawing ? "Withdrawing..." : "Withdraw"}
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Pending Claims */}
      {pendingClaims.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">
            Pending Staking Claims
          </h3>
          <div className="space-y-2">
            {pendingClaims.map((claim) => (
              <Card
                key={claim.id}
                className="bg-zinc-800/60 border-zinc-700"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-zinc-200 font-medium">
                      .{claim.tldLabel}
                    </div>
                    <div className="text-zinc-500 text-sm">
                      {new Date(claim.createdAt).toLocaleDateString()}
                      {claim.fdcRoundId != null &&
                        ` · FDC round ${claim.fdcRoundId}`}
                    </div>
                  </div>
                  <ClaimStatusBadge status={claim.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TLD Card Grid */}
      {tlds.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">
            Your TLDs
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {tlds.map((tld) => (
              <TldCard key={tld.label} tld={tld} />
            ))}
          </div>
        </div>
      )}

      {/* Stake More CTA */}
      <div className="flex justify-center pt-2">
        <Link href="/stake">
          <Button variant="outline" size="sm" className="border-zinc-600">
            <Pickaxe className="h-4 w-4 mr-2" />
            Stake Another TLD
          </Button>
        </Link>
      </div>
    </div>
  );
}

function TldCard({ tld }: { tld: V2TldInfo }) {
  return (
    <Card className="bg-zinc-800/60 border-zinc-700 hover:border-zinc-600 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-lg font-bold text-white">.{tld.label}</h4>
            {tld.tokenId != null && (
              <span className="text-xs text-zinc-500">
                Token #{tld.tokenId}
              </span>
            )}
          </div>
          <Badge
            variant="secondary"
            className={
              tld.registrationEnabled
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }
          >
            {tld.registrationEnabled ? "Open" : "Closed"}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-zinc-400 mb-4">
          <div className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {tld.sldCount} SLD{tld.sldCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/tld/${tld.label}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-zinc-600"
            >
              Manage <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

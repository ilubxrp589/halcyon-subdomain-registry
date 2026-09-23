"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Coins, CheckCircle2, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { BrowserProvider, Contract } from "ethers";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

const COMMUNITY_TREASURY_ABI = [
  "function claimReward(uint256 epochId, uint256 amount, bytes32[] calldata merkleProof) external",
  "function pendingRewards(uint256 epochId, address user, uint256 amount, bytes32[] calldata proof) external view returns (bool valid, bool alreadyClaimed)",
];

interface ClaimableReward {
  epoch_id: number;
  amount: string;
  merkle_proof: string[];
  total_reward: string;
  total_holders: number;
  finalized_at: string;
}

interface RewardHistory {
  epoch_id: number;
  amount: string;
  claimed: boolean;
  claimed_at: string | null;
  tx_hash: string | null;
  finalized_at: string;
}

interface RewardsTabProps {
  wallet: string;
  walletProvider: any;
}

export function RewardsTab({ wallet, walletProvider }: RewardsTabProps) {
  const [claimable, setClaimable] = useState<ClaimableReward[]>([]);
  const [history, setHistory] = useState<RewardHistory[]>([]);
  const [totalClaimable, setTotalClaimable] = useState("0");
  const [totalEarned, setTotalEarned] = useState("0");
  const [totalClaimed, setTotalClaimed] = useState("0");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimingEpoch, setClaimingEpoch] = useState<number | null>(null);
  const [error, setError] = useState("");

  const treasuryAddress = process.env.NEXT_PUBLIC_COMMUNITY_TREASURY_ADDRESS;

  const fetchRewards = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const [claimRes, histRes] = await Promise.all([
        fetch(`${API_URL}/rewards/claimable?wallet=${wallet}`),
        fetch(`${API_URL}/rewards/history?wallet=${wallet}`),
      ]);

      if (claimRes.ok) {
        const data = await claimRes.json();
        setClaimable(data.claimable || []);
        setTotalClaimable(data.totalClaimable || "0");
      }

      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(data.history || []);
        setTotalEarned(data.totalEarned || "0");
        setTotalClaimed(data.totalClaimed || "0");
      }
    } catch (err) {
      console.error("Failed to fetch rewards:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const handleClaim = async (reward: ClaimableReward) => {
    if (!walletProvider || !treasuryAddress) {
      setError("Missing wallet provider or treasury address");
      return;
    }
    setClaiming(true);
    setClaimingEpoch(reward.epoch_id);
    setError("");

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const contract = new Contract(treasuryAddress, COMMUNITY_TREASURY_ABI, signer);

      const amountWei = BigInt(Math.floor(parseFloat(reward.amount) * 1e18));
      const tx = await contract.claimReward(reward.epoch_id, amountWei, reward.merkle_proof);
      const receipt = await tx.wait();

      // Mark as claimed in backend
      await fetch(`${API_URL}/rewards/mark-claimed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epochId: reward.epoch_id,
          wallet,
          txHash: receipt.hash,
        }),
      });

      await fetchRewards();
    } catch (err: any) {
      console.error("Claim failed:", err);
      setError(err?.reason || err?.message || "Claim transaction failed");
    } finally {
      setClaiming(false);
      setClaimingEpoch(null);
    }
  };

  const handleClaimAll = async () => {
    for (const reward of claimable) {
      await handleClaim(reward);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Coins className="h-4 w-4" />
              Total Earned
            </div>
            <div className="text-2xl font-bold text-white">
              {parseFloat(totalEarned).toFixed(4)} FLR
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Gift className="h-4 w-4 text-amber-400" />
              Claimable Now
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {parseFloat(totalClaimable).toFixed(4)} FLR
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-800/60 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Total Claimed
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {parseFloat(totalClaimed).toFixed(4)} FLR
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Claim All Button */}
      {claimable.length > 0 && (
        <Button
          onClick={handleClaimAll}
          disabled={claiming}
          className="w-full bg-amber-600 hover:bg-amber-700 py-6 text-lg"
        >
          {claiming ? (
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Gift className="h-5 w-5 mr-2" />
          )}
          Claim All ({parseFloat(totalClaimable).toFixed(4)} FLR)
        </Button>
      )}

      {/* Claimable Epochs */}
      {claimable.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Unclaimed Rewards</h3>
          <div className="space-y-2">
            {claimable.map((reward) => (
              <Card key={reward.epoch_id} className="bg-zinc-800/60 border-zinc-700">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-zinc-200 font-medium">Epoch {reward.epoch_id}</div>
                    <div className="text-zinc-500 text-sm">
                      {new Date(reward.finalized_at).toLocaleDateString()} · {reward.total_holders} holders
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-bold">
                      {parseFloat(reward.amount).toFixed(4)} FLR
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleClaim(reward)}
                      disabled={claiming && claimingEpoch === reward.epoch_id}
                    >
                      {claiming && claimingEpoch === reward.epoch_id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        "Claim"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Reward History</h3>
        {history.length === 0 ? (
          <Card className="bg-zinc-800/40 border-zinc-700">
            <CardContent className="p-8 text-center text-zinc-500">
              <Gift className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No reward history yet. Hold domain NFTs to earn FTSO delegation rewards.</p>
              <Link href="/wiki/concepts/community-rewards" className="text-amber-400 text-sm hover:underline mt-2 inline-block">
                Learn how it works
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <Card key={`${item.epoch_id}-${item.claimed}`} className="bg-zinc-800/40 border-zinc-700">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.claimed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Clock className="h-5 w-5 text-zinc-500" />
                    )}
                    <div>
                      <div className="text-zinc-200">Epoch {item.epoch_id}</div>
                      <div className="text-zinc-500 text-xs">
                        {item.claimed_at
                          ? `Claimed ${new Date(item.claimed_at).toLocaleDateString()}`
                          : `Finalized ${new Date(item.finalized_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={item.claimed ? "text-emerald-400" : "text-zinc-300"}>
                      {parseFloat(item.amount).toFixed(4)} FLR
                    </span>
                    {item.claimed ? (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400">Claimed</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-400">Pending</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

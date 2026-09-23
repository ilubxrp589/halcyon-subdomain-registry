"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import {
  useWeb3ModalAccount,
  useWeb3ModalProvider,
  useWeb3Modal,
  useCurrencySymbol,
  getPublicProvider,
} from "@/lib/web3modal";
import { useFlrPrice } from "@/hooks/useFlrPrice";
import { PriceDisplay } from "@/components/PriceDisplay";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { EarningsCalculator } from "@/components/home/EarningsCalculator";

// --- Constants ---

const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

const CLAIM_MANAGER_ADDRESS = "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4";
const CLAIM_MANAGER_ABI = [
  "function requestStake(string calldata tldLabel, bytes calldata abiEncodedRequest) external payable",
  "function stakingFeeUsd() external view returns (uint256)",
  "event StakeRequested(bytes32 indexed namehash, string tldLabel, address indexed claimer, uint256 feePaid)",
];

const FTSO_ORACLE_ADDRESS = "0x08d391c50AE8aa94B031195491Ffa9Df7953200c";
const FTSO_ORACLE_ABI = [
  "function usdCentsToFlr(uint256 usdCents) external view returns (uint256)",
];

const FDC_VERIFIER_URL = "/api/fdc-verifier";
const HSD_API_BASE = "https://hsd.halcyon-names.io";

// Attestation type and source IDs (bytes32 hex-encoded)
const WEB2JSON_TYPE =
  "0x576562324a736f6e000000000000000000000000000000000000000000000000";
const PUBLIC_WEB2_SOURCE =
  "0x5075626c69635765623200000000000000000000000000000000000000000000";

// --- Types ---

type Step = "connect" | "verify" | "stake" | "waiting" | "complete";

interface VerifyResult {
  state: string;
  expired: boolean;
  flareAddress: string | null;
  addressMatch: boolean;
  error?: string;
}

// --- Page ---

export default function StakePage() {
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { open } = useWeb3Modal();
  const symbol = useCurrencySymbol();
  const { usdCentsToFlr, usdCentsToFlrWithBuffer } = useFlrPrice();

  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>(isConnected ? "verify" : "connect");
  const [tldLabel, setTldLabel] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [instructionTab, setInstructionTab] = useState<"shakestation" | "bob" | "hsd">("shakestation");

  // Pre-fill from ?tld= query param
  useEffect(() => {
    const tldParam = searchParams.get("tld");
    if (tldParam && !tldLabel) {
      setTldLabel(tldParam.toLowerCase().trim());
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isVerifying, setIsVerifying] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [stakingFeeUsdCents, setStakingFeeUsdCents] = useState<number>(50); // $0.50 default
  const [txHash, setTxHash] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [pendingTx, setPendingTx] = useState<{ hasPending: boolean; txHash?: string; submittedAt?: string } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for pending TX status when TXT record is missing
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Only poll when: we have a verify result, TXT record doesn't match, and we're on the verify step
    const shouldPoll =
      step === "verify" &&
      verifyResult &&
      !verifyResult.error &&
      !verifyResult.addressMatch &&
      tldLabel.trim();

    if (!shouldPoll) {
      setPendingTx(null);
      return;
    }

    const checkTxStatus = async () => {
      try {
        const res = await fetch(`${API_V2}/tld/tx-status/${tldLabel.toLowerCase().trim()}`);
        if (res.ok) {
          const data = await res.json();
          setPendingTx(data);
          // If TX is no longer pending, re-verify to see if record is now set
          if (pendingTx?.hasPending && !data.hasPending) {
            handleVerify();
          }
        }
      } catch {
        // Silently ignore — non-critical
      }
    };

    // Check immediately, then every 30 seconds
    checkTxStatus();
    pollIntervalRef.current = setInterval(checkTxStatus, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [step, verifyResult, tldLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Step: Connect ---

  const handleConnect = useCallback(async () => {
    await open();
  }, [open]);

  // Advance to verify step when connected
  if (isConnected && step === "connect") {
    setStep("verify");
  }

  // --- Step: Verify TLD ---

  const handleVerify = useCallback(async () => {
    if (!tldLabel.trim() || !address) return;

    const label = tldLabel.toLowerCase().trim();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      toast.error("Invalid TLD label. Use lowercase letters, numbers, and hyphens only.");
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch(
        `${API_V2}/tld/verify/${label}?address=${address}`
      );
      const data = await res.json();

      if (!res.ok) {
        setVerifyResult({
          state: "UNKNOWN",
          expired: true,
          flareAddress: null,
          addressMatch: false,
          error: data.error || "Verification failed",
        });
        return;
      }

      setVerifyResult({
        state: data.state || "UNKNOWN",
        expired: data.expired ?? true,
        flareAddress: data.flareAddress || null,
        addressMatch: data.isOwner ?? false,
      });

      // Fetch staking fee from contract (use proxy provider to avoid CORS)
      try {
        const readProvider = getPublicProvider();
        const contract = new Contract(
          CLAIM_MANAGER_ADDRESS,
          CLAIM_MANAGER_ABI,
          readProvider
        );
        const feeUsd = await contract.stakingFeeUsd();
        console.log("On-chain stakingFeeUsd:", Number(feeUsd));
        setStakingFeeUsdCents(Number(feeUsd));
      } catch (e) {
        console.warn("Failed to read stakingFeeUsd, using default:", e);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setVerifyResult({
        state: "UNKNOWN",
        expired: true,
        flareAddress: null,
        addressMatch: false,
        error: msg,
      });
    } finally {
      setIsVerifying(false);
    }
  }, [tldLabel, address, walletProvider]);

  const canStake =
    verifyResult &&
    !verifyResult.error &&
    verifyResult.state === "CLOSED" &&
    !verifyResult.expired &&
    verifyResult.addressMatch;

  // --- Step: Stake ---

  const handleStake = useCallback(async () => {
    if (!walletProvider || !address || !canStake) return;

    setIsStaking(true);
    setStep("stake");

    try {
      const label = tldLabel.toLowerCase().trim();

      // 1. Prepare FDC attestation request via Verifier API
      toast.info("Preparing attestation request...");
      const verifierRes = await fetch(FDC_VERIFIER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attestationType: WEB2JSON_TYPE,
          sourceId: PUBLIC_WEB2_SOURCE,
          requestBody: {
            url: `${HSD_API_BASE}/api/name/${label}`,
            httpMethod: "GET",
            headers: "",
            queryParams: "",
            body: "",
            postProcessJq: `{flrAddress: (.data.records[] | select(.type == "TXT") | .txt[] | select(startswith("flr:"))), expired: .expired, state: .state}`,
            abiSignature:
              '{"type":"tuple","components":[{"type":"string","name":"flrAddress"},{"type":"bool","name":"expired"},{"type":"string","name":"state"}]}',
          },
        }),
      });

      if (!verifierRes.ok) {
        throw new Error("Failed to prepare attestation request. Please try again.");
      }

      const { abiEncodedRequest } = await verifierRes.json();

      // 2. Get staking fee in FLR from on-chain oracle (read-only via proxy)
      const readProvider = getPublicProvider();
      const oracle = new Contract(FTSO_ORACLE_ADDRESS, FTSO_ORACLE_ABI, readProvider);
      const feeInFlr = await oracle.usdCentsToFlr(stakingFeeUsdCents);

      // Add 2% buffer for price movement
      const feeWithBuffer = (feeInFlr * BigInt(102)) / BigInt(100);

      // 3. Send requestStake transaction
      toast.info("Confirm the transaction in your wallet...");
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const claimManager = new Contract(
        CLAIM_MANAGER_ADDRESS,
        CLAIM_MANAGER_ABI,
        signer
      );
      const tx = await claimManager.requestStake(label, abiEncodedRequest, {
        value: feeWithBuffer,
        gasLimit: BigInt(500000),
      });

      setTxHash(tx.hash);
      toast.success("Transaction submitted!");
      setStep("waiting");

      // 4. Wait for confirmation
      const receipt = await tx.wait(1);
      if (receipt.status === 0) {
        throw new Error("Transaction reverted");
      }

      toast.success(
        "Stake request submitted! The FDC verification will take 2-3 minutes. " +
        "The keeper bot will automatically complete staking once verified."
      );

      // Poll backend for completion
      pollForCompletion(label);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Staking failed";
      toast.error(msg);
      setStep("verify");
    } finally {
      setIsStaking(false);
    }
  }, [walletProvider, address, canStake, tldLabel, stakingFeeUsdCents]);

  // --- Poll for completion ---

  const pollForCompletion = useCallback(
    async (label: string) => {
      const maxAttempts = 60; // 5 minutes at 5s intervals
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const res = await fetch(`${API_V2}/tld/${label}`);
          if (res.ok) {
            const data = await res.json();
            if (data.tokenId) {
              setMintedTokenId(data.tokenId);
              setStep("complete");
              toast.success("TLD staked successfully! NFT minted.");
              return;
            }
          }
        } catch {
          // Continue polling
        }
      }
      // Timeout — keeper bot may still complete later
      toast.info(
        "Verification is taking longer than expected. Check back in a few minutes."
      );
    },
    []
  );

  // --- Render ---

  return (
    <div className="container max-w-2xl mx-auto py-12 px-4 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Stake Your Handshake TLD</h1>
        <p className="text-muted-foreground">
          Bridge your Handshake top-level domain to Flare Network via FDC
          verification. Receive an ERC-721 NFT and start earning from
          subdomain registrations.
        </p>
      </div>

      {/* Coming Soon */}
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            TLD staking via FDC attestation is not yet available. Once live, you&apos;ll be able to
            verify your Handshake TLD ownership, bridge it to Flare, and earn from subdomain registrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center py-6 opacity-60">
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                {(["Connect", "Verify", "Stake", "Complete"] as const).map(
                  (label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      {i > 0 && <div className="w-8 h-px bg-border" />}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border bg-muted text-muted-foreground border-border">
                        {i + 1}
                      </div>
                    </div>
                  )
                )}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Connect</span>
                <span>Verify</span>
                <span>Stake</span>
                <span>Complete</span>
              </div>
            </div>
          </div>
          <button
            disabled
            className="w-full py-3 px-6 rounded-lg bg-amber-500 opacity-50 cursor-not-allowed text-white font-medium"
          >
            Coming Soon
          </button>
          <p className="text-xs text-center text-muted-foreground">
            FDC-verified TLD staking will be available once the HNS wallet integration is complete.
          </p>
        </CardContent>
      </Card>

      {/* Revenue Model + Earnings Calculator */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Model</CardTitle>
            <CardDescription>How you earn from subdomain registrations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <span className="text-muted-foreground">Community TLD owners keep</span>
                <span className="text-lg font-bold text-green-400">80%</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">Platform fee</span>
                <span className="font-medium">20%</span>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              The 20% platform fee covers AI-generated NFT artwork, DNS infrastructure,
              and marketplace operations. Official Halcyon TLDs have a reduced 5% fee.
            </p>
            <div className="pt-2 space-y-2">
              <p className="font-medium">What&apos;s included:</p>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>- AI-generated NFT art for every subdomain</li>
                <li>- DNS hosting &amp; Handshake resolution</li>
                <li>- Marketplace listing &amp; discovery</li>
                <li>- On-chain payment splitting</li>
                <li>- Withdraw earnings anytime</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <EarningsCalculator />
      </div>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <FaqItem
            q="What is TLD staking?"
            a="TLD staking bridges your Handshake top-level domain to Flare Network. You receive an ERC-721 NFT representing ownership, enabling you to sell subdomains and earn revenue on Flare."
          />
          <FaqItem
            q="What is the staking fee?"
            a={`The staking fee is $${(stakingFeeUsdCents / 100).toFixed(0)} USD, paid in ${symbol}. This covers FDC verification costs. Excess ${symbol} sent due to price fluctuations is automatically refunded.`}
          />
          <FaqItem
            q="How long does verification take?"
            a="FDC verification takes approximately 2-3 minutes. Around 100 data providers independently verify your TLD ownership by checking the Handshake blockchain."
          />
          <FaqItem
            q="What if verification fails?"
            a="If verification fails (e.g., TXT record not found), your staking fee is held for 14 days. You can fix the issue and retry, or the fee is automatically refunded after the 14-day expiry."
          />
          <FaqItem
            q="What is Bob Wallet?"
            a='Bob Wallet is a Handshake name manager. Download it from bobwallet.io to manage your TLDs, add DNS records, and set the "flr:" TXT record needed for staking.'
          />
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function CheckItem({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          ok
            ? "bg-green-500/20 text-green-400"
            : "bg-red-500/20 text-red-400"
        }`}
      >
        {ok ? "\u2713" : "\u2717"}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{label}:</span>
          <span className="text-sm font-medium">{value}</span>
        </div>
        {hint && (
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        )}
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-medium text-foreground">{q}</p>
      <p className="text-muted-foreground mt-1">{a}</p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, Sparkles, Wallet, Globe } from "lucide-react";
import { cn, calculatePurchaseCredits } from "@/lib/utils";
import confetti from "canvas-confetti";

interface SearchResult {
  available: boolean;
  subdomain: string;
  tld: string;
  fqdn: string;
  tier?: string;
  priceUSD?: number;
  priceFLR?: number;
}

interface ConfirmPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchResult: SearchResult;
  currencySymbol: string;
  isConnected: boolean;
  onConnectWallet: () => void;
  onConfirmPurchase: () => Promise<void>;
}

type ModalStep = "confirm" | "processing" | "success";

export function ConfirmPurchaseModal({
  isOpen,
  onClose,
  searchResult,
  currencySymbol,
  isConnected,
  onConnectWallet,
  onConfirmPurchase,
}: ConfirmPurchaseModalProps) {
  const [step, setStep] = useState<ModalStep>("confirm");
  const [error, setError] = useState("");

  // Calculate credits earned
  const creditsEarned = calculatePurchaseCredits(1);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
      setError("");
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!isConnected) {
      onConnectWallet();
      return;
    }

    setStep("processing");
    setError("");

    try {
      await onConfirmPurchase();
      setStep("success");
      // Celebration confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setStep("confirm");
    }
  };

  const handleClose = () => {
    if (step === "processing") return; // Don't close during processing
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn overflow-y-auto p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto",
          "animate-fadeInUp"
        )}
      >
        {/* Close button */}
        {step !== "processing" && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        )}

        {/* Confirm Step */}
        {step === "confirm" && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                Confirm Purchase
              </h2>
              <p className="text-muted-foreground text-sm">
                You&apos;re about to register this domain
              </p>
            </div>

            {/* Domain Info */}
            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="font-mono font-bold text-2xl text-halcyon-gradient text-center mb-2">
                {searchResult.fqdn}
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {searchResult.tier?.replace("_", " ")} tier
              </div>
            </div>

            {/* Price */}
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-muted-foreground">Price</span>
              <div className="text-right">
                <div className="font-bold text-white">
                  {searchResult.priceFLR?.toFixed(2)} {currencySymbol}
                </div>
                <div className="text-sm text-muted-foreground">
                  ~${searchResult.priceUSD?.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Credits Earned */}
            <div className="flex justify-between items-center py-3 mb-6">
              <span className="text-muted-foreground">Credits Earned</span>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[hsl(var(--halcyon-green))]" />
                <span className="font-bold text-[hsl(var(--halcyon-green))]">
                  +{creditsEarned} credits
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Community Revenue Note */}
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-zinc-400">
              <p>
                HSR contributes 6% of registration revenue to FTSO delegation rewards,
                redistributed to all domain holders. Combined with 2.5% marketplace
                royalties, 8.5% of all HSR revenue funds community rewards.
                This is not a fee to you — it comes from HSR&apos;s share.{" "}
                <a href="/wiki/concepts/community-rewards" className="text-amber-400 hover:underline">
                  Learn more
                </a>
              </p>
            </div>

            {/* Action Button */}
            {isConnected ? (
              <button
                onClick={handleConfirm}
                className="w-full py-4 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-bold rounded-xl hover:opacity-90 transition-all"
              >
                Confirm Purchase
              </button>
            ) : (
              <button
                onClick={onConnectWallet}
                className="w-full py-4 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <Wallet className="h-5 w-5" />
                Connect Wallet
              </button>
            )}
          </div>
        )}

        {/* Processing Step */}
        {step === "processing" && (
          <div className="p-8 text-center">
            <div className="mb-6">
              <div className="relative w-20 h-20 mx-auto">
                {/* Outer ring */}
                <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="45"
                    fill="none"
                    stroke="url(#processingGradient)"
                    strokeWidth="3"
                    strokeDasharray="30 20"
                  />
                  <defs>
                    <linearGradient id="processingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(43, 80%, 46%)" />
                      <stop offset="100%" stopColor="hsl(40, 76%, 60%)" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-[hsl(var(--halcyon-teal))] animate-spin" />
                </div>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Processing Transaction
            </h2>
            <p className="text-muted-foreground text-sm">
              Please confirm in your wallet and wait for confirmation...
            </p>
            <div className="mt-4 font-mono text-sm text-[hsl(var(--halcyon-teal))]">
              {searchResult.fqdn}
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="p-5 sm:p-8 text-center">
            <div className="mb-4 sm:mb-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Domain Registered!
            </h2>
            <p className="text-muted-foreground mb-4">
              Congratulations! You now own
            </p>
            <div className="font-mono font-bold text-2xl text-halcyon-gradient mb-6">
              {searchResult.fqdn}
            </div>

            {/* Credits Earned Banner */}
            <div className="bg-[hsl(var(--halcyon-teal))]/10 border border-[hsl(var(--halcyon-teal))]/30 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--halcyon-green))]" />
                <span className="text-[hsl(var(--halcyon-green))] font-bold">
                  +{creditsEarned} credits earned!
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Use them to generate custom NFT artwork
              </p>
            </div>

            {/* DNS Setup Tips */}
            <div className="text-left bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-[hsl(var(--halcyon-teal))]" />
                Set Up Your Domain
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Head to <span className="text-white font-medium">My Domains</span> to configure DNS and make your domain live.
              </p>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-[hsl(var(--halcyon-teal))] font-bold mt-px">1.</span>
                  <span><span className="text-white/80">Point to a server</span> — add an IPv4 (A record) to host a website or app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[hsl(var(--halcyon-teal))] font-bold mt-px">2.</span>
                  <span><span className="text-white/80">Set a wallet address</span> — let others send crypto to your domain name</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[hsl(var(--halcyon-teal))] font-bold mt-px">3.</span>
                  <span><span className="text-white/80">Customize your NFT</span> — use your credits to generate unique artwork</span>
                </li>
              </ul>
            </div>

            <a
              href="/dashboard"
              className="block w-full py-3 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-bold rounded-xl hover:opacity-90 transition-all text-center mb-3"
            >
              Go to My Domains
            </a>
            <button
              onClick={handleClose}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfirmPurchaseModal;

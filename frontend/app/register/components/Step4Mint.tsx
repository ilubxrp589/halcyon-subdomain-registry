"use client";

import Link from "next/link";
import { Loader2, ShieldCheck, Sparkles, Coins, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { truncateAddress, calculatePurchaseCredits } from "@/lib/utils";
import { SearchResult } from "./Step1DomainSelect";

interface ProcessingStepProps {
  isPreparingNFT: boolean;
  isCompletingRegistration: boolean;
  isAuthenticating: boolean;
  txHash: string;
  nftImageURL: string;
  className?: string;
}

export function ProcessingStep({
  isPreparingNFT,
  isCompletingRegistration,
  isAuthenticating,
  txHash,
  nftImageURL,
  className,
}: ProcessingStepProps) {
  const getTitle = () => {
    if (isPreparingNFT) return "Preparing Your NFT";
    if (isCompletingRegistration) return "Completing Registration";
    if (isAuthenticating) return "Authenticating Wallet";
    return "Processing Transaction";
  };

  const getDescription = () => {
    if (isPreparingNFT) return "Uploading your artwork to IPFS...";
    if (isCompletingRegistration) return "Setting up your domain...";
    if (isAuthenticating) return "Please sign the message in your wallet...";
    return "Please confirm the transaction in your wallet...";
  };

  return (
    <Card className={className}>
      <CardContent className="py-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h3 className="text-xl font-semibold">{getTitle()}</h3>
          <p className="text-muted-foreground">{getDescription()}</p>

          {isPreparingNFT && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Powered by Flux AI</span>
            </div>
          )}

          {nftImageURL && !isPreparingNFT && (
            <div className="mt-4">
              <img
                src={nftImageURL}
                alt="Your NFT"
                className="w-32 h-32 mx-auto rounded-lg shadow-lg"
              />
            </div>
          )}

          {txHash && (
            <p className="text-sm font-mono text-muted-foreground">
              TX: {truncateAddress(txHash, 8)}
            </p>
          )}

          {isAuthenticating && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span>Secure wallet signature required</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SuccessStepProps {
  searchResult: SearchResult;
  tokenId: string;
  txHash: string;
  onRegisterAnother: () => void;
  creditsEarned?: number;
  explorerBaseUrl?: string;
  className?: string;
}

export function SuccessStep({
  searchResult,
  tokenId,
  txHash,
  onRegisterAnother,
  creditsEarned,
  explorerBaseUrl = "https://coston2-explorer.flare.network",
  className,
}: SuccessStepProps) {
  // Calculate credits if not provided
  const credits = creditsEarned ?? calculatePurchaseCredits(1);

  return (
    <Card className={className}>
      <CardContent className="py-12">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold">Congratulations!</h3>
          <p className="text-muted-foreground">
            You now own{" "}
            <span className="font-mono font-semibold">{searchResult.fqdn}</span>
          </p>

          {/* Credits Earned Banner */}
          <div className="p-4 rounded-lg bg-[hsl(var(--halcyon-teal))]/10 border border-[hsl(var(--halcyon-teal))]/30">
            <div className="flex items-center justify-center gap-2 text-[hsl(var(--halcyon-teal))]">
              <Coins className="h-5 w-5" />
              <span className="font-semibold">+{credits} Preview Credits Earned!</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Use credits to generate custom NFT artwork from your dashboard
            </p>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token ID</span>
              <span>#{tokenId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction</span>
              <a
                href={`${explorerBaseUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {truncateAddress(txHash, 8)}
              </a>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onRegisterAnother}
              className="flex-1"
            >
              Register Another
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button className="w-full flex items-center justify-center gap-2">
                <Palette className="h-4 w-4" />
                Customize NFT
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================
//         CONFIRM PURCHASE (Simplified Registration Flow)
// =============================================================

interface ConfirmPurchaseProps {
  searchResult: SearchResult;
  currencySymbol: string;
  isConnected: boolean;
  onPurchase: () => void;
  onBack: () => void;
  isPurchasing: boolean;
  error?: string;
  className?: string;
}

export function ConfirmPurchase({
  searchResult,
  currencySymbol,
  isConnected,
  onPurchase,
  onBack,
  isPurchasing,
  error,
  className,
}: ConfirmPurchaseProps) {
  const creditsToEarn = calculatePurchaseCredits(1);
  const tierDisplay = searchResult.tier?.replace(/_/g, " ") || "Standard";

  return (
    <Card className={className}>
      <CardContent className="py-8">
        <div className="space-y-6">
          {/* Domain Info */}
          <div className="text-center">
            <h3 className="text-2xl font-bold font-mono text-[hsl(var(--halcyon-gradient))]">
              {searchResult.fqdn}
            </h3>
            <p className="text-muted-foreground mt-1 capitalize">{tierDisplay}</p>
          </div>

          {/* Pricing */}
          <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Price</span>
              <div className="text-right">
                <span className="font-semibold text-lg">
                  {searchResult.priceFLR?.toFixed(2)} {currencySymbol}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  (~${searchResult.priceUSD?.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-[hsl(var(--halcyon-teal))]">
                <Coins className="h-4 w-4" />
                <span>Credits Earned</span>
              </div>
              <span className="font-semibold text-[hsl(var(--halcyon-green))]">
                +{creditsToEarn} credits
              </span>
            </div>
          </div>

          {/* Info Banner */}
          <div className="p-4 rounded-lg bg-[hsl(var(--halcyon-purple))]/10 border border-[hsl(var(--halcyon-purple))]/30">
            <div className="flex items-start gap-3">
              <Palette className="h-5 w-5 text-[hsl(var(--halcyon-purple))] mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-[hsl(var(--halcyon-purple))]">
                  Customize Your NFT Anytime
                </p>
                <p className="text-muted-foreground mt-1">
                  Your domain comes with a placeholder NFT. Use your earned credits
                  to generate unique AI artwork from your dashboard whenever you&apos;re ready.
                </p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/50 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={isPurchasing}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={onPurchase}
              disabled={!isConnected || isPurchasing}
              className="flex-1 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] hover:opacity-90"
            >
              {isPurchasing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Purchase Domain</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import {
  AlertTriangle,
  XCircle,
  Image,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Issue {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  symptoms: string[];
  causes: string[];
  solutions: string[];
}

const issues: Issue[] = [
  {
    title: "Transaction Failed: Insufficient Funds or Gas",
    icon: XCircle,
    iconColor: "text-red-400",
    symptoms: [
      "Wallet shows \"insufficient funds for gas\" error",
      "Transaction reverts immediately after submission",
      "Wallet balance appears sufficient but transaction still fails",
    ],
    causes: [
      "Your wallet does not have enough FLR to cover the subdomain price plus gas fees",
      "Gas limit estimate was too low for the transaction complexity",
      "The FLR price changed between viewing and confirming due to an oracle price update",
    ],
    solutions: [
      "Ensure you have extra FLR beyond the displayed price to cover gas fees.",
      "Request testnet FLR from the Coston2 faucet at faucet.flare.network if your balance is low.",
      "If the transaction reverts, try again. The price oracle fetches a fresh rate on each call, so the exact FLR amount may differ slightly.",
      "In your wallet settings, try increasing the gas limit manually before confirming.",
    ],
  },
  {
    title: "NFT Not Visible in Wallet",
    icon: Image,
    iconColor: "text-amber-400",
    symptoms: [
      "Subdomain purchase succeeded but NFT does not appear in your wallet",
      "NFT shows on the HSR dashboard but not in external tools",
      "Token appears with a blank image or missing metadata",
    ],
    causes: [
      "Your wallet is connected to the wrong network (e.g., Flare Mainnet instead of Coston2)",
      "The wallet or marketplace has not indexed the NFT contract yet",
      "The NFT metadata takes time to populate after minting (the purchase process must complete first)",
    ],
    solutions: [
      "Confirm you are on Flare Coston2 Testnet (Chain ID 114). Check your wallet's network settings and verify the active network.",
      "In your wallet, manually import the NFT using the NFT contract address and your token ID. These can be found on the HSR dashboard.",
      "Allow a few minutes after the purchase completes for metadata indexing. The on-chain SVG is generated at mint time, but external tools may cache slowly.",
      "Check the HSR dashboard at the My Domains page for the authoritative list of your subdomains.",
    ],
  },
  {
    title: "Slow Transaction Confirmations",
    icon: Clock,
    iconColor: "text-blue-400",
    symptoms: [
      "Transaction submitted but still pending after several minutes",
      "Wallet shows transaction as pending with no confirmation",
      "Purchase flow appears stuck after payment",
    ],
    causes: [
      "Coston2 testnet can experience occasional slowdowns during high activity",
      "Gas price was set too low for the current network conditions",
      "The Flare RPC endpoint may be experiencing temporary latency",
    ],
    solutions: [
      "Wait a few minutes. Coston2 transactions typically confirm within 5-10 seconds, but testnet delays can occasionally extend this.",
      "Check the transaction on the Coston2 block explorer (coston2-explorer.flare.network) using the transaction hash from your wallet.",
      "If the transaction has been pending for more than 10 minutes, try resubmitting with a slightly higher gas price.",
      "If the issue persists, the Flare RPC endpoint may be temporarily overloaded. Try again in a few minutes.",
    ],
  },
  {
    title: "Wallet Connection Issues",
    icon: Wallet,
    iconColor: "text-orange-400",
    symptoms: [
      "\"Connect Wallet\" button does nothing or shows an error",
      "Wallet connects but shows wrong address or network",
      "Page continuously prompts to connect even after connecting",
      "Mobile wallet fails to connect via WalletConnect",
    ],
    causes: [
      "Browser does not have a compatible wallet extension installed",
      "Wallet is locked or the user rejected the connection request",
      "The wallet is connected to a different network than Coston2",
      "Browser privacy settings or extensions are blocking the wallet provider",
    ],
    solutions: [
      "Install Bifrost or another EVM-compatible browser wallet. HSR supports Bifrost (recommended for Flare), as well as other WalletConnect-compatible wallets.",
      "Unlock your wallet and approve the connection request when prompted. Check for a pending approval notification in your wallet extension.",
      "Add the Coston2 network to your wallet: RPC URL: https://coston2-api.flare.network/ext/C/rpc, Chain ID: 114, Symbol: C2FLR.",
      "Disable ad blockers or privacy extensions temporarily, as they can interfere with wallet connectivity. Try in an incognito window.",
      "On mobile, open the HSR website from within your wallet app's built-in browser.",
    ],
  },
];

export default function CommonIssuesPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <AlertTriangle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Common Issues</h1>
            <p className="text-muted-foreground">
              Troubleshooting guide for frequent problems
            </p>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          This page covers the most common issues users encounter when
          using HSR, including transaction failures, NFT visibility,
          wallet connectivity, and confirmation delays. Each section
          includes symptoms, causes, and step-by-step solutions.
        </p>
      </div>

      {/* Quick Links */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium mb-3">Jump to Issue</h3>
          <div className="flex flex-wrap gap-2">
            {issues.map((issue) => (
              <Badge
                key={issue.title}
                variant="outline"
                className="cursor-default"
              >
                {issue.title.split(":")[0]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Issues */}
      {issues.map((issue) => {
        const Icon = issue.icon;
        return (
          <section key={issue.title} className="space-y-4">
            <div className="flex items-center gap-3">
              <Icon className={`h-6 w-6 ${issue.iconColor}`} />
              <h2 className="text-xl font-semibold">{issue.title}</h2>
            </div>

            {/* Symptoms */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Symptoms
                </h3>
                <ul className="space-y-2">
                  {issue.symptoms.map((symptom, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-yellow-500" />
                      {symptom}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Causes */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Possible Causes
                </h3>
                <ul className="space-y-2">
                  {issue.causes.map((cause, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                      {cause}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Solutions */}
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Solutions
                </h3>
                <ol className="space-y-3">
                  {issue.solutions.map((solution, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-muted-foreground"
                    >
                      <span className="shrink-0 h-5 w-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      {solution}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        );
      })}

      {/* Still need help */}
      <Card className="border-primary/20">
        <CardContent className="pt-6 text-center space-y-2">
          <RefreshCw className="h-8 w-8 text-primary mx-auto" />
          <h3 className="font-semibold text-lg">Still Having Issues?</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            If none of the above solutions resolve your problem, join the
            HSR community or open a support ticket. Include your wallet
            address, transaction hash, and a description of the issue.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

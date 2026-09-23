"use client";

import {
  DollarSign,
  Star,
  Globe,
  CheckCircle2,
  ArrowRight,
  Info,
  Pickaxe,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function FeeStructurePage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-green-500/20 border border-amber-500/20">
            <DollarSign className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Concepts</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Fee Structure</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Halcyon uses a tiered platform fee model. Official TLDs operated by the
          platform pay a lower fee, while community TLDs pay a higher fee that
          covers AI artwork generation and infrastructure costs.
        </p>
      </div>

      {/* Fee Comparison */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Fee Tiers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-amber-500/5 to-yellow-500/5 border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-5 w-5 text-amber-400" />
                <h3 className="text-white font-semibold">Official TLDs</h3>
              </div>
              <div className="text-center py-4">
                <p className="text-4xl font-bold text-amber-400">5%</p>
                <p className="text-zinc-500 text-sm mt-1">Platform fee</p>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-3 mb-3">
                <p className="text-zinc-400 text-xs">
                  For a <strong className="text-white">100 FLR</strong> registration:
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">TLD owner receives</span>
                    <span className="text-green-400 font-medium">95 FLR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Platform fee</span>
                    <span className="text-zinc-400">5 FLR</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  "~300 TLDs operated by Halcyon",
                  "Lower fee — operator covers own costs",
                  "Featured placement on Explore page",
                  "Batch-staked (no staking fee)",
                ].map((item) => (
                  <p key={item} className="text-zinc-500 text-[10px] flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {item}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/5 to-cyan-500/5 border-blue-500/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-5 w-5 text-blue-400" />
                <h3 className="text-white font-semibold">Community TLDs</h3>
              </div>
              <div className="text-center py-4">
                <p className="text-4xl font-bold text-blue-400">20%</p>
                <p className="text-zinc-500 text-sm mt-1">Platform fee</p>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-3 mb-3">
                <p className="text-zinc-400 text-xs">
                  For a <strong className="text-white">100 FLR</strong> registration:
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">TLD owner receives</span>
                    <span className="text-green-400 font-medium">80 FLR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Platform fee</span>
                    <span className="text-zinc-400">20 FLR</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  "Open to any Handshake TLD owner",
                  "Fee covers AI artwork GPU compute",
                  "Includes DNS infrastructure + hosting",
                  "$10 USD one-time staking fee",
                ].map((item) => (
                  <p key={item} className="text-zinc-500 text-[10px] flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    {item}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What the fee covers */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">What the Platform Fee Covers</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              The platform fee funds the infrastructure that makes Halcyon work.
              For community TLDs, the 20% fee covers everything — there are no
              hidden charges or additional costs for TLD owners.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  title: "AI Artwork Generation",
                  desc: "Every subdomain registration gets unique AI-generated NFT artwork produced on a GPU cluster (RTX 3060/3080). This is the primary cost driver.",
                },
                {
                  title: "DNS Infrastructure",
                  desc: "BIND 9 authoritative DNS, DoH endpoints, Handshake recursive resolution, and zone file management for every registered domain.",
                },
                {
                  title: "IPFS Storage",
                  desc: "Permanent pinning of NFT artwork and metadata JSON on IPFS via Pinata for every subdomain minted.",
                },
                {
                  title: "Smart Contract Gas",
                  desc: "Backend-initiated transactions: FDC attestation processing, keeper bot operations, and event listener infrastructure.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-zinc-800/30 rounded-lg p-3">
                  <h4 className="text-white text-xs font-medium mb-1">{item.title}</h4>
                  <p className="text-zinc-500 text-[10px] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Withdrawals */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Wallet className="h-5 w-5 text-amber-400" />
          Withdrawing Earnings
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5 space-y-3">
            <p className="text-zinc-400 text-sm leading-relaxed">
              Revenue from subdomain registrations accumulates in the{" "}
              <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">PaymentManager</code>{" "}
              contract. TLD owners can withdraw their pending earnings at any time.
            </p>
            <div className="space-y-2">
              {[
                "Revenue accumulates as subdomains are registered under your TLD",
                "Withdraw from Dashboard → My TLDs tab → Withdraw button",
                "On-chain transaction sends accumulated FLR to your wallet",
                "No minimum withdrawal amount — withdraw any balance",
                "Uses pull pattern (you initiate) for security",
              ].map((item) => (
                <p key={item} className="text-zinc-500 text-xs flex items-start gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                  {item}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Staking Fee */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Pickaxe className="h-5 w-5 text-amber-400" />
          Staking Fee
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5 space-y-3">
            <p className="text-zinc-400 text-sm leading-relaxed">
              Community TLD owners pay a one-time <strong className="text-white">$10 USD</strong> staking fee
              (converted to FLR at the current FTSO rate) when they stake their Handshake TLD. This fee covers
              the FDC attestation verification process.
            </p>
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardContent className="p-3 flex gap-2">
                <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-zinc-500 text-xs">
                  If the staking process is not completed within 14 days (e.g., FDC verification fails),
                  the staking fee is fully refundable.
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </section>

      {/* Related */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Related</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { title: "TLD Staking", href: "/wiki/concepts/tld-staking", desc: "How to stake your TLD on Flare" },
            { title: "Pricing Tiers", href: "/wiki/concepts/pricing-tiers", desc: "Default subdomain pricing by length" },
            { title: "Marketplace Guide", href: "/wiki/guides/marketplace", desc: "How the marketplace works" },
          ].map((link) => (
            <Link key={link.title} href={link.href} className="block no-underline">
              <Card className="bg-zinc-900/30 border-zinc-800/40 hover:border-amber-800/30 transition-colors">
                <CardContent className="pt-4 pb-3.5">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-amber-400/70" />
                    <div>
                      <p className="text-zinc-300 text-sm font-medium">{link.title}</p>
                      <p className="text-zinc-600 text-xs">{link.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

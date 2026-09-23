"use client";

import {
  Store,
  Clock,
  Compass,
  Users,
  Star,
  Globe,
  DollarSign,
  Pickaxe,
  ArrowRight,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function MarketplacePage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/10">
            <Store className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">Guide</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Marketplace</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Halcyon is an open marketplace where Handshake TLD owners stake their
          domains and sell subdomains as NFTs. Browse official and community TLDs,
          register domains, and trade on the secondary market.
        </p>
      </div>

      {/* Two-Sided Marketplace */}
      <Card className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3">How the Marketplace Works</h3>
          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            Halcyon serves two types of users: <strong className="text-white">buyers</strong> who register subdomains,
            and <strong className="text-white">TLD owners</strong> who stake their Handshake TLDs to earn revenue from registrations.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
              <Users className="h-5 w-5 text-blue-400 mb-2" />
              <h4 className="text-white text-sm font-medium mb-1">For Buyers</h4>
              <ul className="space-y-1">
                {[
                  "Browse TLDs on the Explore page",
                  "Search for available names across all TLDs",
                  "Register with AI-generated NFT artwork",
                  "Manage domains from your Dashboard",
                ].map((item) => (
                  <li key={item} className="text-zinc-500 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
              <Pickaxe className="h-5 w-5 text-amber-400 mb-2" />
              <h4 className="text-white text-sm font-medium mb-1">For TLD Owners</h4>
              <ul className="space-y-1">
                {[
                  "Stake your Handshake TLD on Flare",
                  "Set custom pricing for your namespace",
                  "Earn 80% of every subdomain sale",
                  "Withdraw earnings anytime",
                ].map((item) => (
                  <li key={item} className="text-zinc-500 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Official vs Community */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-amber-400" />
          Official vs Community TLDs
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-amber-500/5 to-yellow-500/5 border-amber-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">Official TLDs</h4>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">~300 TLDs</Badge>
              </div>
              <p className="text-zinc-400 text-xs mb-3">
                Curated collection managed by the Halcyon platform operator.
                Featured on the homepage and marked with a gold badge.
              </p>
              <div className="space-y-1">
                {[
                  "5% platform fee (operator keeps 95%)",
                  "Batch-staked by operator",
                  "Featured placement on Explore page",
                  "AI artwork included",
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
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-blue-400" />
                <h4 className="text-white text-sm font-medium">Community TLDs</h4>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Open</Badge>
              </div>
              <p className="text-zinc-400 text-xs mb-3">
                Independently staked by Handshake TLD owners. Anyone can
                participate by staking their TLD.
              </p>
              <div className="space-y-1">
                {[
                  "20% platform fee (owner keeps 80%)",
                  "Self-service staking via /stake",
                  "Community section on Explore page",
                  "AI artwork included (covered by fee)",
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

      {/* Buyer Journey */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-amber-400" />
          Buyer Journey
        </h2>
        <div className="space-y-3">
          {[
            {
              step: 1,
              icon: Compass,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              title: "Browse TLDs",
              desc: "Visit the Explore page to browse all available TLDs. Filter by official or community, sort by popularity or price.",
              link: { href: "/explore", label: "Explore TLDs" },
            },
            {
              step: 2,
              icon: Store,
              color: "text-amber-400",
              bg: "bg-amber-500/10",
              title: "Search for a Name",
              desc: "Type your desired name and see availability across multiple TLDs with pricing. Or go to a specific TLD page and search within that namespace.",
              link: { href: "/register-v2", label: "Search Domains" },
            },
            {
              step: 3,
              icon: DollarSign,
              color: "text-green-400",
              bg: "bg-green-500/10",
              title: "Register & Mint",
              desc: "Connect your wallet, pay in FLR, and receive your domain as an ERC-721 NFT with AI-generated artwork. The whole process takes under 2 minutes.",
              link: null,
            },
          ].map((s) => (
            <Card key={s.step} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${s.bg} shrink-0`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[10px]">Step {s.step}</Badge>
                      <h4 className="text-white text-sm font-medium">{s.title}</h4>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">{s.desc}</p>
                    {s.link && (
                      <Link href={s.link.href} className="inline-flex items-center gap-1 mt-2 text-amber-400 text-xs hover:text-amber-300 transition-colors">
                        {s.link.label} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* TLD Owner Journey */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Pickaxe className="h-5 w-5 text-amber-400" />
          TLD Owner Journey
        </h2>
        <div className="space-y-3">
          {[
            {
              step: 1,
              title: "Own a Handshake TLD",
              desc: "You need to own a Handshake top-level domain. Purchase one via Namebase, ShakeDex, or any HNS registrar.",
            },
            {
              step: 2,
              title: "Set flr: TXT Record",
              desc: "Add a TXT record to your HNS TLD in the format \"flr:0xYourFlareWallet\". This links your Handshake domain to your Flare wallet for FDC verification.",
            },
            {
              step: 3,
              title: "Stake on Halcyon",
              desc: "Visit the Stake page, pay the $10 staking fee in FLR, and submit your attestation request. FDC verifies your ownership trustlessly.",
            },
            {
              step: 4,
              title: "Set Pricing & Earn",
              desc: "Configure length-based pricing, premium names, and multi-year discounts. As buyers register subdomains, you earn 80% of every sale. Withdraw earnings anytime.",
            },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="text-amber-400 text-xs font-bold">{s.step}</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">{s.title}</p>
                <p className="text-zinc-500 text-xs leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Link href="/stake" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors border border-amber-500/20">
          <Pickaxe className="h-4 w-4" />
          Stake Your TLD
        </Link>
      </section>

      {/* Secondary Marketplace */}
      <Card className="bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 border-zinc-700/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-400" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold text-lg">Secondary NFT Marketplace</h3>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-xs">Coming Soon</Badge>
              </div>
              <p className="text-zinc-400 leading-relaxed text-sm">
                A secondary marketplace for buying and selling subdomain NFTs is planned.
                The marketplace smart contract is deployed on Coston2 testnet but the
                frontend trading flows are not yet available.
              </p>
              <div className="space-y-2 text-sm text-zinc-500">
                <p><strong className="text-zinc-300">Planned features:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-1 text-xs">
                  <li>Fixed-price and auction-style listings</li>
                  <li>On-chain escrow for safe trading</li>
                  <li>2.5% creator royalty (EIP-2981) on every resale</li>
                  <li>Offer system for negotiated sales</li>
                </ul>
              </div>
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-3 flex gap-2">
                  <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-zinc-500 text-xs">
                    In the meantime, subdomain NFTs are standard ERC-721 tokens and can be
                    transferred or traded on any compatible NFT platform.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

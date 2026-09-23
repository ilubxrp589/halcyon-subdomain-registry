"use client";

import {
  Globe,
  Layers,
  Server,
  Link2,
  Shield,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
  Network,
  Key,
  Users,
  Lock,
  Landmark,
  Gavel,
  Ban,
  Eye,
  Zap,
  Radio,
  Hash,
  Coins,
  Crown,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function HandshakeNamesPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/10">
            <Globe className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Concepts</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Handshake Names</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Handshake (HNS) is a decentralized naming protocol that replaces the traditional
          ICANN root zone with a permissionless blockchain. HSR leverages Handshake TLDs to
          offer subdomain registration as NFTs on Flare Network.
        </p>
      </div>

      {/* Key properties */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Decentralized Root Zone", icon: Network },
          { label: "Proof-of-Work Blockchain", icon: Hash },
          { label: "Censorship Resistant", icon: Shield },
          { label: "True Ownership", icon: Key },
          { label: "Auction-Based TLDs", icon: Gavel },
        ].map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50"
          >
            <f.icon className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-zinc-300 text-xs font-medium">{f.label}</span>
          </div>
        ))}
      </div>

      {/* ─── What is Handshake ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Network className="h-5 w-5 text-amber-400" />
          What is Handshake?
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Today, every domain name on the internet ultimately traces back to ICANN &mdash; a single
          organization that controls which top-level domains (like .com, .org, .net) exist.
          Handshake replaces this centralized root zone with a blockchain, making domain
          ownership truly decentralized and permissionless.
        </p>

        {/* Three pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: Shield,
              title: "Decentralized Root",
              desc: "No single authority controls which TLDs exist. The blockchain replaces ICANN's root zone file.",
              color: "text-blue-400",
              gradient: "from-blue-500/5 to-blue-600/5",
              border: "border-blue-500/20",
            },
            {
              icon: Key,
              title: "True Ownership",
              desc: "TLD owners have cryptographic control via private keys. No registrar can revoke or seize your name.",
              color: "text-green-400",
              gradient: "from-green-500/5 to-green-600/5",
              border: "border-green-500/20",
            },
            {
              icon: Layers,
              title: "Hierarchical Naming",
              desc: "Handshake names follow a hierarchical structure — TLD owners can delegate subdomains to users and services.",
              color: "text-amber-400",
              gradient: "from-amber-500/5 to-amber-600/5",
              border: "border-amber-500/20",
            },
          ].map((item) => (
            <Card key={item.title} className={`bg-gradient-to-br ${item.gradient} ${item.border} border`}>
              <CardContent className="p-5">
                <div className={`p-2 rounded-lg bg-zinc-900/50 w-fit mb-3`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                <p className="text-zinc-400 text-xs leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Naming Hierarchy ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          The Naming Hierarchy
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Just like traditional DNS, Handshake follows a hierarchical structure. The key difference
          is who controls each level.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Root Zone */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <Globe className="h-5 w-5 text-orange-400" />
                  </div>
                  <div className="w-px h-6 bg-zinc-700" />
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white text-sm font-medium">Root Zone</h4>
                    <Badge className="bg-orange-500/20 text-orange-400 border-0 text-[10px]">Handshake Blockchain</Badge>
                  </div>
                  <p className="text-zinc-400 text-xs">
                    The root of all domain names. In traditional DNS, ICANN controls this.
                    In Handshake, it&apos;s stored on a proof-of-work blockchain that anyone can participate in.
                  </p>
                </div>
              </div>

              {/* TLD */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Crown className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="w-px h-6 bg-zinc-700" />
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white text-sm font-medium">Top-Level Domain (TLD)</h4>
                    <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px]">.cryptofans</Badge>
                  </div>
                  <p className="text-zinc-400 text-xs">
                    TLDs are won through HNS auctions. The owner sets NS records to delegate all
                    subdomains to their infrastructure. HSR owns <code className="text-amber-400 bg-zinc-800 px-1 rounded text-[10px]">.cryptofans</code> and
                    points it to our servers for subdomain services.
                  </p>
                </div>
              </div>

              {/* Subdomain */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <Hash className="h-5 w-5 text-blue-400" />
                  </div>
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white text-sm font-medium">Subdomain</h4>
                    <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px]">alice.cryptofans</Badge>
                  </div>
                  <p className="text-zinc-400 text-xs">
                    Subdomains are sold by HSR as ERC-721 NFTs on Flare Network. The NFT proves
                    ownership and grants the holder control over their subdomain.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── HNS vs ICANN ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-amber-400" />
          Handshake vs Traditional DNS
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Traditional domains (.com, .org) are managed by ICANN through accredited registrars.
          Handshake operates a parallel system with fundamentally different properties.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            {/* Header */}
            <div className="grid grid-cols-3 px-5 py-3 border-b border-zinc-800 bg-zinc-800/20">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Property</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">ICANN (Traditional)</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Handshake (HNS)</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                {
                  prop: "Governance",
                  icann: "Centralized (ICANN board)",
                  hns: "Decentralized (blockchain consensus)",
                  icon: Building2,
                },
                {
                  prop: "TLD Cost",
                  icann: "$185,000+ application fee",
                  hns: "Auction-based (HNS coins)",
                  icon: Coins,
                },
                {
                  prop: "Ownership",
                  icann: "Leased (annual renewal to registrar)",
                  hns: "Owned (cryptographic key control)",
                  icon: Key,
                },
                {
                  prop: "Censorship",
                  icann: "Can be seized or suspended",
                  hns: "Unstoppable (private key required)",
                  icon: Shield,
                },
                {
                  prop: "Resolution",
                  icann: "Standard DNS resolvers (8.8.8.8)",
                  hns: "HNS-aware resolvers required",
                  icon: Globe,
                },
                {
                  prop: "Subdomain Control",
                  icann: "Via registrar control panel",
                  hns: "Via NS delegation to owner infrastructure",
                  icon: Server,
                },
              ].map((row) => (
                <div key={row.prop} className="grid grid-cols-3 gap-4 px-5 py-3.5 items-start">
                  <div className="flex items-center gap-2">
                    <row.icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span className="text-white text-xs font-medium">{row.prop}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">{row.icann}</span>
                  <span className="text-amber-400 text-xs">{row.hns}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── How HSR Uses Handshake ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Link2 className="h-5 w-5 text-amber-400" />
          How HSR Uses Handshake
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR bridges Handshake TLDs with Flare Network NFTs. We own the TLD on Handshake
          and sell subdomains as NFTs on Flare.
        </p>

        {/* Visual flow */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4">
              {[
                {
                  step: 1,
                  color: "text-orange-400",
                  bg: "bg-orange-500/10",
                  border: "border-orange-500/20",
                  title: "HSR Owns .cryptofans on Handshake",
                  desc: "The TLD was acquired through the HNS auction process. HSR has full cryptographic control over the TLD.",
                  code: "HNS Blockchain → TLD: cryptofans → Owner: HSR Wallet",
                },
                {
                  step: 2,
                  color: "text-amber-400",
                  bg: "bg-amber-500/10",
                  border: "border-amber-500/20",
                  title: "NS Records Delegate to HSR",
                  desc: "The TLD's nameserver records on HNS point to HSR's infrastructure. This delegates all *.cryptofans subdomains to HSR.",
                  code: "cryptofans NS → ns1.halcyon.domains",
                },
                {
                  step: 3,
                  color: "text-blue-400",
                  bg: "bg-blue-500/10",
                  border: "border-blue-500/20",
                  title: "Subdomains Sold as ERC-721 NFTs",
                  desc: "Users purchase subdomains through the Flare smart contract. Each subdomain becomes a unique NFT with AI-generated artwork.",
                  code: "SubdomainNFT.mint(alice, 'cryptofans') → Token #456",
                },
                {
                  step: 4,
                  color: "text-green-400",
                  bg: "bg-green-500/10",
                  border: "border-green-500/20",
                  title: "Owners Use Their Subdomain",
                  desc: "NFT holders can set up URL forwarding and customize their subdomain's NFT artwork. Ownership is verified on-chain via the NFT.",
                  code: "alice.cryptofans → URL forwarding, NFT artwork, ownership proof",
                },
              ].map((s, i) => (
                <div key={s.step}>
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${s.bg} border ${s.border} shrink-0`}>
                      <span className={`text-sm font-bold ${s.color}`}>{s.step}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white text-sm font-medium mb-1">{s.title}</h4>
                      <p className="text-zinc-400 text-xs leading-relaxed mb-2">{s.desc}</p>
                      <div className="bg-zinc-950 rounded-lg px-3 py-2">
                        <code className={`text-[11px] ${s.color}`}>{s.code}</code>
                      </div>
                    </div>
                  </div>
                  {i < 3 && (
                    <div className="flex justify-start ml-5 my-2">
                      <ArrowDown className="h-4 w-4 text-zinc-700" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Resolution ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Radio className="h-5 w-5 text-amber-400" />
          Resolving Handshake Names
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Standard DNS resolvers (Google 8.8.8.8, Cloudflare 1.1.1.1) only query the ICANN root zone
          and cannot resolve Handshake names. Users need an HNS-aware resolver.
        </p>

        {/* Resolution methods */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-gradient-to-br from-amber-500/5 to-blue-500/5 border-amber-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">HSR DoH Resolver</h4>
                <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px]">Recommended</Badge>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed mb-2">
                HSR runs its own DNS-over-HTTPS resolver that handles both standard and Handshake domains.
                Encrypted, private, and resolves everything through one endpoint.
              </p>
              <div className="bg-zinc-950 rounded-lg px-3 py-2 mt-2">
                <code className="text-amber-400 text-[10px]">https://174.163.11.200/dns-query</code>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-blue-400" />
                <h4 className="text-white text-sm font-medium">HDNS.io</h4>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed mb-2">
                A public DNS resolver that resolves both Handshake and ICANN names. Set your system
                DNS to HDNS servers to access HNS domains without any software installation.
              </p>
              <a
                href="https://hdns.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-[10px] underline inline-flex items-center gap-0.5"
              >
                hdns.io <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Network className="h-4 w-4 text-green-400" />
                <h4 className="text-white text-sm font-medium">Fingertip</h4>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed mb-2">
                A lightweight resolver that runs locally and queries the HNS blockchain directly.
                Maximum decentralization for power users.
              </p>
              <a
                href="https://impervious.com/fingertip"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300 text-[10px] underline inline-flex items-center gap-0.5"
              >
                impervious.com/fingertip <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </CardContent>
          </Card>
        </div>

        {/* How resolution works */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3">How Resolution Works</h4>
            <div className="space-y-2.5">
              {[
                {
                  step: "Browser requests alice.cryptofans",
                  desc: "DNS query sent to HNS-aware resolver (DoH, HDNS, or Fingertip)",
                  color: "text-blue-400",
                },
                {
                  step: "Resolver queries Handshake blockchain",
                  desc: "Finds .cryptofans NS records → ns1.halcyon.domains",
                  color: "text-orange-400",
                },
                {
                  step: "Resolver queries HSR's nameserver",
                  desc: "Asks HSR's server for alice.cryptofans records",
                  color: "text-amber-400",
                },
                {
                  step: "HSR returns the answer",
                  desc: "URL forwarding redirect, or other configured response",
                  color: "text-green-400",
                },
              ].map((s, i) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 ${s.color} text-[10px] font-bold shrink-0 mt-0.5`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-white text-xs font-medium">{s.step}</p>
                    <p className="text-zinc-500 text-[10px]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Adoption barrier */}
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-white text-sm font-medium mb-1">Resolution Requirement</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Visitors must have an HNS-aware resolver to access Handshake domains. Without it,
                the domain won&apos;t resolve. This is the primary adoption barrier for HNS today.
                HSR&apos;s URL forwarding can bridge this by redirecting HNS-resolved requests to
                standard ICANN domains.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── HNS Auctions ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Gavel className="h-5 w-5 text-amber-400" />
          How Handshake Auctions Work
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          TLDs on Handshake are acquired through a Vickrey auction system (sealed-bid, second-price).
          This is how names like .cryptofans end up owned by entities like HSR.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="space-y-3">
              {[
                {
                  phase: "Open",
                  duration: "~5 days",
                  desc: "Anyone can open an auction for an unclaimed TLD by placing a sealed bid (bid + blind amount)",
                  color: "text-blue-400",
                },
                {
                  phase: "Bidding",
                  duration: "~5 days",
                  desc: "Others can submit their own sealed bids. All bids are hidden until reveal phase.",
                  color: "text-amber-400",
                },
                {
                  phase: "Reveal",
                  duration: "~10 days",
                  desc: "Bidders reveal their bids. Highest bidder wins but pays the second-highest price (Vickrey auction).",
                  color: "text-amber-400",
                },
                {
                  phase: "Claimed",
                  duration: "Permanent",
                  desc: "Winner receives the TLD. They can set NS records, transfer ownership, or sell the name.",
                  color: "text-green-400",
                },
              ].map((p) => (
                <div key={p.phase} className="flex items-start gap-3">
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${p.color.replace("text-", "bg-")}`} />
                    <span className={`text-sm font-medium ${p.color}`}>{p.phase}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-zinc-400 text-xs">{p.desc}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{p.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 flex gap-3">
            <Coins className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-white text-xs font-medium">HNS Coin</h4>
              <p className="text-zinc-500 text-[10px]">
                All Handshake auctions use HNS, the native cryptocurrency of the Handshake blockchain.
                Losing bids are fully refunded. The winning bid amount is burned (removed from circulation),
                not paid to anyone.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── TLD Ownership ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-400" />
          TLD Ownership & Subdomain Selling
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR&apos;s business model bridges Handshake TLD ownership with Flare Network NFTs.
          The TLD is the foundation; subdomains are the product.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="space-y-4">
              {[
                {
                  icon: Crown,
                  title: "HSR Owns the TLD",
                  desc: "HSR acquired .cryptofans through the Handshake auction process, giving full cryptographic control over the TLD.",
                  color: "text-orange-400",
                },
                {
                  icon: Server,
                  title: "NS Records Delegate to HSR",
                  desc: "The TLD's nameserver records on the Handshake blockchain point to HSR's infrastructure, delegating all *.cryptofans subdomains to the platform.",
                  color: "text-amber-400",
                },
                {
                  icon: Zap,
                  title: "Subdomains Sold as NFTs",
                  desc: "Users purchase subdomains (alice.cryptofans, bob.cryptofans) as ERC-721 NFTs on Flare Network. The NFT proves ownership.",
                  color: "text-blue-400",
                },
                {
                  icon: Lock,
                  title: "Ownership Verified On-Chain",
                  desc: "All subdomain actions require wallet signature verification. The backend checks NFT ownership before allowing any modifications.",
                  color: "text-green-400",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-zinc-800/50 shrink-0">
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-medium">{item.title}</h4>
                    <p className="text-zinc-400 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── HNS vs HSR Subdomains ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Eye className="h-5 w-5 text-amber-400" />
          What You Own
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          It&apos;s important to understand the distinction between what lives on Handshake and
          what lives on Flare.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-orange-500/5 to-amber-500/5 border-orange-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-orange-400" />
                <h4 className="text-white text-sm font-medium">On Handshake</h4>
                <Badge className="bg-orange-500/20 text-orange-400 border-0 text-[10px]">TLD Level</Badge>
              </div>
              <ul className="space-y-2">
                {[
                  "The .cryptofans TLD itself",
                  "NS records pointing to HSR's nameservers",
                  "TLD ownership controlled by HSR's wallet",
                  "Proof-of-work consensus secures the name",
                ].map((item) => (
                  <li key={item} className="text-zinc-400 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/5 to-blue-500/5 border-amber-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">On Flare Network</h4>
                <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px]">Subdomain Level</Badge>
              </div>
              <ul className="space-y-2">
                {[
                  "Your subdomain NFT (alice.cryptofans)",
                  "AI-generated artwork stored on IPFS",
                  "URL forwarding configuration",
                  "Ownership proof for your subdomain",
                ].map((item) => (
                  <li key={item} className="text-zinc-400 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── Why Handshake Matters ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          Why Handshake Matters
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: Ban,
              title: "Censorship Resistance",
              desc: "No central authority can take away a Handshake TLD. Once claimed, it's controlled solely by the owner's private key.",
              color: "text-red-400",
              gradient: "from-red-500/5 to-red-600/5",
              border: "border-red-500/20",
            },
            {
              icon: Lock,
              title: "No Certificate Authority",
              desc: "Handshake replaces the CA system with DANE/TLSA records, enabling trustless TLS without relying on third-party CAs.",
              color: "text-blue-400",
              gradient: "from-blue-500/5 to-blue-600/5",
              border: "border-blue-500/20",
            },
            {
              icon: Users,
              title: "Community TLDs",
              desc: "Anyone can own a TLD and build a community around it. .cryptofans is for crypto enthusiasts; other TLDs can serve different communities.",
              color: "text-green-400",
              gradient: "from-green-500/5 to-green-600/5",
              border: "border-green-500/20",
            },
            {
              icon: Landmark,
              title: "Permanent Ownership",
              desc: "Unlike traditional domains that expire if you stop paying a registrar, Handshake TLDs are owned permanently once claimed.",
              color: "text-amber-400",
              gradient: "from-amber-500/5 to-amber-600/5",
              border: "border-amber-500/20",
            },
          ].map((item) => (
            <Card key={item.title} className={`bg-gradient-to-br ${item.gradient} ${item.border} border`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <h4 className="text-white text-sm font-medium">{item.title}</h4>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Future expansion */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-amber-400" />
            Future TLD Expansion
          </h3>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            HSR plans to support additional Handshake TLDs beyond .cryptofans. Each new TLD
            would be acquired on the Handshake blockchain and integrated into HSR&apos;s
            infrastructure. This means more naming options and the ability to choose TLDs
            that match your brand, community, or identity.
          </p>
          <div className="flex flex-wrap gap-2">
            {[".cryptofans", ".forever", ".yourname", ".community"].map((tld) => (
              <span
                key={tld}
                className={`text-xs px-3 py-1 rounded-full ${
                  tld === ".cryptofans"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50"
                }`}
              >
                {tld}
                {tld === ".cryptofans" && <span className="ml-1 text-[10px]">(live)</span>}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Related */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            Related
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { title: "How HSR Works", href: "/wiki/concepts/how-it-works", desc: "Full architecture and registration flow" },
              { title: "Buy Your First Domain", href: "/wiki/getting-started/buy-first-domain", desc: "Step-by-step purchase guide" },
            ].map((link) => (
              <a key={link.title} href={link.href} className="block no-underline">
                <div className="bg-zinc-900/50 rounded-lg px-3 py-2.5 border border-zinc-800 hover:border-blue-500/30 transition-colors">
                  <p className="text-blue-400 text-xs font-medium">{link.title}</p>
                  <p className="text-zinc-500 text-[10px] mt-0.5">{link.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

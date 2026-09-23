"use client";

import {
  Globe,
  Server,
  Database,
  Shield,
  Lock,
  ExternalLink,
  Cpu,
  Layers,
  Wallet,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap,
  Search,
  ImageIcon,
  RefreshCw,
  Info,
  DollarSign,
  HardDrive,
  Hash,
  Flame,
  User,
  Palette,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function HowItWorksContent() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-blue-500/20 border border-amber-500/10">
            <Layers className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Concepts</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">How HSR Works</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          A technical deep dive into the architecture behind HSR &mdash; from Handshake domains
          and Flare smart contracts to AI-powered NFT generation and a distributed GPU cluster.
        </p>
      </div>

      {/* What is HSR */}
      <Card className="bg-gradient-to-br from-amber-500/5 to-blue-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3">What is Halcyon?</h3>
          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            Halcyon is a decentralized domain marketplace built on Flare Network.
            TLD owners stake their Handshake domains and sell subdomains as ERC-721 NFTs.
            Buyers register names (like <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">alice.cryptofans</code>),
            get AI-generated artwork, and own their domain on-chain. The platform supports
            both official TLDs (~300 operated by Halcyon) and community TLDs staked by independent owners.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "Handshake Domains",
              "Flare Network",
              "ERC-721 NFTs",
              "AI Image Generation",
              "8-GPU Cluster",
              "Coston2 Testnet",
              "IPFS Storage",
            ].map((t) => (
              <span
                key={t}
                className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                {t}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-Layer Architecture */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Two-Layer Architecture
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR combines two layers that work together to deliver decentralized domain ownership
          with unique NFT artwork.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Blockchain Layer",
              subtitle: "Flare Network (Coston2)",
              icon: Flame,
              color: "text-orange-400",
              gradient: "from-orange-500/5 to-red-500/5",
              border: "border-orange-500/20",
              items: ["ERC-721 NFT ownership", "Escrow payments", "Price oracle (FTSO)", "On-chain metadata"],
            },
            {
              title: "Application Layer",
              subtitle: "Next.js + Express",
              icon: Server,
              color: "text-green-400",
              gradient: "from-green-500/5 to-emerald-500/5",
              border: "border-green-500/20",
              items: ["Web frontend (React 19)", "REST API backend", "GPU image generation", "PostgreSQL database"],
            },
          ].map((layer) => (
            <Card key={layer.title} className={`bg-gradient-to-br ${layer.gradient} ${layer.border} border`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <layer.icon className={`h-5 w-5 ${layer.color}`} />
                  <h4 className="text-white text-sm font-medium">{layer.title}</h4>
                </div>
                <p className="text-zinc-500 text-[10px] mb-3">{layer.subtitle}</p>
                <ul className="space-y-1.5">
                  {layer.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-zinc-400 text-xs">
                      <CheckCircle2 className={`h-3 w-3 ${layer.color} shrink-0`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Registration Flow */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Registration Flow
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          From searching for a domain to owning it as an NFT, here&apos;s the complete registration
          pipeline. The entire process typically completes in under 2 minutes.
        </p>

        <div className="space-y-3">
          {[
            {
              step: 1,
              icon: Search,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              borderColor: "border-l-blue-500",
              title: "Check Availability",
              desc: "User types desired subdomain. Backend checks the domains table in PostgreSQL and validates against reserved words. Returns availability and tier-based price.",
              detail: "alice.cryptofans → Available → $10 USD (~200 FLR)",
            },
            {
              step: 2,
              icon: Palette,
              color: "text-amber-400",
              bg: "bg-amber-500/10",
              borderColor: "border-l-amber-500",
              title: "Generate NFT Artwork",
              desc: "User selects an AI model, art style, and theme. The backend dispatches image generation to the GPU cluster via ComfyUI. One image is generated per credit in 8-12 seconds.",
              detail: "Model: Playground → Style: Cinematic → Theme: Cosmic Jellyfish",
              badge: "In Testing",
            },
            {
              step: 3,
              icon: HardDrive,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              borderColor: "border-l-cyan-500",
              title: "Upload to IPFS",
              desc: "Selected image uploaded to Pinata (IPFS). OpenSea-compatible metadata JSON created with domain name, tier, theme, and image CID. Both stored on IPFS.",
              detail: "Image → ipfs://QmImage... → Metadata → ipfs://QmMeta...",
            },
            {
              step: 4,
              icon: Wallet,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              borderColor: "border-l-emerald-500",
              title: "Payment & Mint",
              desc: "User confirms purchase in Bifrost Wallet. FLR is sent to the SubdomainEscrow contract which holds funds until the NFT is minted. Once minted, funds are released to the treasury.",
              detail: "SubdomainEscrow.createEscrow() → FLR locked → NFT minted → Funds released",
            },
          ].map((s) => (
            <Card key={s.step} className={`bg-zinc-900/50 border-zinc-800 border-l-2 ${s.borderColor}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${s.bg} shrink-0`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[10px]">Step {s.step}</Badge>
                      <h4 className="text-white text-sm font-medium">{s.title}</h4>
                      {"badge" in s && s.badge && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px]">{s.badge}</Badge>
                      )}
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed mb-2">{s.desc}</p>
                    <div className="bg-zinc-950 rounded-lg px-3 py-2">
                      <code className="text-amber-400 text-[11px]">{s.detail}</code>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* AI-Powered NFT Generation */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Cpu className="h-5 w-5 text-amber-400" />
          AI-Powered NFT Generation
          <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">In Testing</Badge>
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Every domain gets unique AI-generated artwork powered by a distributed GPU cluster
          running Stable Diffusion XL through ComfyUI.
        </p>

        {/* GPU Cluster */}
        <Card className="bg-gradient-to-br from-amber-500/5 to-pink-500/5 border-amber-500/20">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-amber-400" />
              GPU Cluster — 4 Machines, 8 GPUs, 88GB VRAM
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: "GPU 0-1", type: "2x RTX 3080", vram: "20 GB" },
                { name: "GPU 2-3", type: "2x RTX 3080", vram: "20 GB" },
                { name: "GPU 4-5", type: "2x RTX 3060", vram: "24 GB" },
                { name: "GPU 6-7", type: "2x RTX 3060", vram: "24 GB" },
              ].map((gpu) => (
                <div key={gpu.name} className="bg-zinc-950/60 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-amber-400 text-xs font-medium">{gpu.name}</p>
                  <p className="text-zinc-300 text-[10px] mt-0.5">{gpu.type}</p>
                  <p className="text-zinc-500 text-[10px]">{gpu.vram}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Generation specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Model", value: "SDXL", desc: "Stable Diffusion XL" },
            { label: "Resolution", value: "1024x1024", desc: "Square format" },
            { label: "Speed", value: "8-12 sec", desc: "Per image" },
            { label: "Engine", value: "ComfyUI", desc: "Workflow-based" },
          ].map((spec) => (
            <Card key={spec.label} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 text-center">
                <p className="text-amber-400 text-sm font-bold">{spec.value}</p>
                <p className="text-white text-xs font-medium mt-0.5">{spec.label}</p>
                <p className="text-zinc-500 text-[10px]">{spec.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Customization stats */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-3">Customization Options</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { stat: "2", label: "AI Models", desc: "Playground & Animagine" },
                { stat: "100+", label: "Themes", desc: "Fantasy, Space, Nature..." },
                { stat: "60", label: "Art Styles", desc: "Cinematic, Neon, Ghibli..." },
                { stat: "34", label: "Watermarks", desc: "Post-generation overlay" },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-800/30 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-white text-lg font-bold">{s.stat}</p>
                  <p className="text-amber-400 text-xs font-medium">{s.label}</p>
                  <p className="text-zinc-500 text-[10px]">{s.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 flex gap-3">
            <ImageIcon className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-white text-sm font-medium mb-1">Credit System</h4>
              <p className="text-zinc-400 text-xs">
                Each domain gets <strong className="text-white">10 free generation credits</strong> (1 credit = 1 image).
                Additional credits can be purchased. Images are uploaded to IPFS (Pinata) and linked to the
                NFT metadata automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Smart Contracts */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          Smart Contracts
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Three core contracts deployed on Flare&apos;s Coston2 testnet (Chain ID 114) handle
          ownership, payments, and pricing.
        </p>

        {/* Contracts table */}
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                {
                  name: "SubdomainNFT",
                  role: "ERC-721 NFT ownership and metadata",
                  address: "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38",
                  color: "text-amber-400",
                },
                {
                  name: "SubdomainEscrow",
                  role: "Payment escrow, holds FLR until NFT minted",
                  address: "0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b",
                  color: "text-amber-400",
                },
                {
                  name: "PriceOracle",
                  role: "FLR/USD exchange rate via Flare FTSO",
                  address: "0x55b92A8C367d408F028914BFCd48D1D4d16960b0",
                  color: "text-green-400",
                },
              ].map((c) => (
                <div key={c.name} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className={`text-sm font-medium ${c.color}`}>{c.name}</h4>
                      <p className="text-zinc-500 text-xs mt-0.5">{c.role}</p>
                    </div>
                    <a
                      href={`https://coston2-explorer.flare.network/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1 shrink-0"
                    >
                      {c.address.slice(0, 8)}...{c.address.slice(-6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Contract details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <h4 className="text-amber-400 text-sm font-medium mb-2">SubdomainNFT</h4>
              <p className="text-zinc-400 text-xs mb-3">ERC-721 with extensions for domain lifecycle:</p>
              <div className="space-y-1.5">
                {[
                  "ERC-721URIStorage — per-token metadata URIs",
                  "ERC-721Enumerable — query all domains by owner",
                  "ERC-2981 — 2.5% royalty standard",
                  "On-chain domain name registry",
                ].map((f) => (
                  <p key={f} className="text-zinc-500 text-[10px] flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {f}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <h4 className="text-amber-400 text-sm font-medium mb-2">SubdomainEscrow</h4>
              <p className="text-zinc-400 text-xs mb-3">Holds FLR until NFT is minted:</p>
              <div className="space-y-1.5">
                {[
                  "createEscrow() — lock FLR payment",
                  "completePurchase() — triggers NFT minting",
                  "reclaimFunds() — refund if purchase fails",
                  "ReentrancyGuard — prevents reentrancy attacks",
                ].map((f) => (
                  <p key={f} className="text-zinc-500 text-[10px] flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {f}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-green-400 text-sm font-medium mb-2">PriceOracle</h4>
            <p className="text-zinc-400 text-xs mb-3">Real-time pricing via Flare FTSO:</p>
            <div className="space-y-1.5">
              {[
                "convertUSDtoFLR() — USD → FLR conversion",
                "convertFLRtoUSD() — FLR → USD conversion",
                "Updates every 5 minutes (if >1% change)",
                "Flare Time Series Oracle as data source",
                "Fallback to last known price if unavailable",
              ].map((f) => (
                <p key={f} className="text-zinc-500 text-[10px] flex items-start gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                  {f}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Pricing */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-amber-400" />
          Pricing Tiers
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Domain pricing is based on character length. Shorter names are more valuable.
          Prices are set in USD and converted to FLR in real-time via the price oracle.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-4 gap-0 px-5 py-3 border-b border-zinc-800 bg-zinc-800/20">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Tier</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Length</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Price (USD)</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">~FLR</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { tier: "Ultra Premium", length: "1 char", price: "$500", flr: "~10,000", color: "text-amber-400" },
                { tier: "Premium", length: "2 chars", price: "$200", flr: "~4,000", color: "text-amber-400" },
                { tier: "Standard Plus", length: "3 chars", price: "$80", flr: "~1,600", color: "text-blue-400" },
                { tier: "Standard", length: "4+ chars", price: "$10", flr: "~200", color: "text-green-400" },
              ].map((t) => (
                <div key={t.tier} className="grid grid-cols-4 gap-0 px-5 py-3 items-center">
                  <span className={`text-sm font-medium ${t.color}`}>{t.tier}</span>
                  <span className="text-zinc-400 text-xs">{t.length}</span>
                  <span className="text-white text-sm font-bold">{t.price}</span>
                  <span className="text-zinc-500 text-xs font-mono">{t.flr}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 flex gap-3">
            <Flame className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-white text-xs font-medium">FLR Conversion</h4>
              <p className="text-zinc-500 text-[10px]">Live FLR/USD rate from Flare FTSO. Assumes ~$0.05/FLR. Testnet pricing may differ.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Domain Lifecycle */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          Domain Lifecycle
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Every domain follows a lifecycle from registration through its active period.
          The dashboard tracks expiration with color-coded urgency indicators.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                {
                  state: "Active",
                  timeline: "Day 1 - Day 275",
                  desc: "Domain is live and tradeable, NFT visible in dashboard",
                  color: "bg-green-500",
                  text: "text-green-400",
                },
                {
                  state: "Expiring Soon",
                  timeline: "Day 275 - Day 365",
                  desc: "Warning notifications and color-coded urgency on dashboard",
                  color: "bg-amber-500",
                  text: "text-amber-400",
                },
                {
                  state: "Expired",
                  timeline: "Day 365+",
                  desc: "Domain no longer active. Returns to available pool for new registration.",
                  color: "bg-red-500",
                  text: "text-red-400",
                },
              ].map((s) => (
                <div key={s.state} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${s.color} shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${s.text}`}>{s.state}</span>
                      <span className="text-zinc-600 text-xs">{s.timeline}</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3">Timeline Example: 1-Year Domain</h4>
            <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
              <div className="bg-green-500 h-full" style={{ width: "75%" }} title="Active (275 days)" />
              <div className="bg-amber-500 h-full" style={{ width: "25%" }} title="Warning (90 days)" />
            </div>
            <div className="flex justify-between mt-2 text-[10px]">
              <span className="text-green-400">Register</span>
              <span className="text-amber-400">90 days left</span>
              <span className="text-red-400">Expired</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Backend Services */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Server className="h-5 w-5 text-amber-400" />
          Backend Services
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The Express.js backend runs several background services that coordinate between
          the blockchain, database, and GPU cluster.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-3 gap-0 px-5 py-3 border-b border-zinc-800 bg-zinc-800/20">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Service</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Purpose</span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Frequency</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { name: "Contract Listener", purpose: "Watches blockchain for purchase/transfer events", freq: "Every 15 sec" },
                { name: "Price Sync", purpose: "Updates on-chain price oracle from FTSO", freq: "Every 5 min" },
                { name: "Expiry Cron", purpose: "Checks domain expirations, sends notifications", freq: "Daily" },
                { name: "ComfyUI Manager", purpose: "Routes image generation to available GPUs", freq: "On-demand" },
              ].map((s) => (
                <div key={s.name} className="grid grid-cols-3 gap-0 px-5 py-3 items-center">
                  <span className="text-white text-xs font-medium">{s.name}</span>
                  <span className="text-zinc-400 text-xs">{s.purpose}</span>
                  <span className="text-zinc-500 text-xs">{s.freq}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Security */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Lock className="h-5 w-5 text-amber-400" />
          Security Model
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-green-400" />
                <h4 className="text-white text-sm font-medium">Smart Contract Security</h4>
              </div>
              <ul className="space-y-1.5">
                {[
                  "ReentrancyGuard on escrow contract",
                  "Role-based access control (MINTER, OPERATOR)",
                  "Emergency pause mechanism",
                  "Escrow protects buyer funds until NFT minted",
                ].map((f) => (
                  <li key={f} className="text-zinc-400 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-4 w-4 text-blue-400" />
                <h4 className="text-white text-sm font-medium">API & Authentication</h4>
              </div>
              <ul className="space-y-1.5">
                {[
                  "Wallet signature authentication (no passwords)",
                  "Nonce-based replay protection (5-min expiry)",
                  "Rate limiting on auth endpoints (10/min)",
                  "Helmet.js security headers",
                  "Parameterized SQL queries (no injection)",
                ].map((f) => (
                  <li key={f} className="text-zinc-400 text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-400" />
          Tech Stack
        </h2>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                { layer: "Frontend", tech: "Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui", color: "text-blue-400" },
                { layer: "Backend", tech: "Express.js, Node.js, PostgreSQL, Pino logger", color: "text-green-400" },
                { layer: "Blockchain", tech: "Flare Network (Coston2, Chain ID 114), Solidity", color: "text-orange-400" },
                { layer: "AI / GPU", tech: "SDXL via ComfyUI, 8-GPU cluster (RTX 3080/3060)", color: "text-amber-400" },
                { layer: "Storage", tech: "IPFS via Pinata (primary), NFT.storage (fallback)", color: "text-amber-400" },
                { layer: "Wallet", tech: "Web3Modal v5, Ethers.js v6, WalletConnect, Bifrost", color: "text-pink-400" },
                { layer: "State", tech: "Zustand, React Query, Axios", color: "text-amber-400" },
              ].map((row) => (
                <div key={row.layer} className="flex items-center gap-4 px-5 py-3">
                  <span className={`text-sm font-medium w-24 shrink-0 ${row.color}`}>{row.layer}</span>
                  <span className="text-zinc-400 text-xs">{row.tech}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Architecture Diagram */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          System Architecture
        </h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* User layer */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-blue-400" />
                  <span className="text-blue-400 text-xs font-medium uppercase tracking-wide">User</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                    <p className="text-white text-xs font-medium">Next.js Frontend</p>
                    <p className="text-zinc-500 text-[10px]">React 19 + Web3Modal + Ethers.js</p>
                  </div>
                  <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                    <p className="text-white text-xs font-medium">Bifrost Wallet</p>
                    <p className="text-zinc-500 text-[10px]">WalletConnect + Transaction Signing</p>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-1 text-zinc-600">
                  <div className="w-px h-4 bg-zinc-700" />
                  <span className="text-[10px]">API + Blockchain Txs</span>
                  <div className="w-px h-4 bg-zinc-700" />
                </div>
              </div>

              {/* Backend + Blockchain */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 text-xs font-medium uppercase tracking-wide">Backend</span>
                  </div>
                  <div className="space-y-1.5">
                    {["Express.js API", "Contract Listener", "Price Sync", "ComfyUI Manager"].map((s) => (
                      <div key={s} className="bg-zinc-950/50 rounded px-2.5 py-1.5">
                        <p className="text-zinc-300 text-[10px]">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="h-4 w-4 text-orange-400" />
                    <span className="text-orange-400 text-xs font-medium uppercase tracking-wide">Flare (Coston2)</span>
                  </div>
                  <div className="space-y-1.5">
                    {["SubdomainNFT", "SubdomainEscrow", "PriceOracle"].map((s) => (
                      <div key={s} className="bg-zinc-950/50 rounded px-2.5 py-1.5">
                        <p className="text-zinc-300 text-[10px]">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-px h-6 bg-zinc-700" />
              </div>

              {/* Infrastructure */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "PostgreSQL", icon: Database, color: "text-blue-400" },
                  { name: "IPFS (Pinata)", icon: HardDrive, color: "text-cyan-400" },
                  { name: "GPU Cluster", icon: Cpu, color: "text-pink-400" },
                ].map((infra) => (
                  <div key={infra.name} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-center">
                    <infra.icon className={`h-4 w-4 ${infra.color} mx-auto mb-1`} />
                    <p className="text-zinc-300 text-[10px] font-medium">{infra.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* End-to-End Example */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          End-to-End Example
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Here&apos;s exactly what happens when Alice registers <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">alice.cryptofans</code>.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="space-y-4">
              {[
                {
                  action: "Search",
                  detail: "Alice types \"alice\" → Backend checks availability → \"Available! $10 USD (~200 FLR)\"",
                },
                {
                  action: "Customize",
                  detail: "Selects Playground model → Cinematic style → Cosmic Jellyfish theme → Image generated in 10 seconds",
                },
                {
                  action: "Upload",
                  detail: "Image → Pinata (IPFS) → imageCID. Metadata JSON → IPFS → metadataCID",
                },
                {
                  action: "Purchase",
                  detail: "Bifrost Wallet signs 200 FLR → SubdomainEscrow locks funds → EscrowCreated event",
                },
                {
                  action: "NFT Minted",
                  detail: "Escrow → SubdomainNFT.mint() → Token #456 created → Metadata URI: ipfs://QmMeta...",
                },
                {
                  action: "Funds Released",
                  detail: "Escrow releases 200 FLR to treasury → Purchase status: completed",
                },
                {
                  action: "Ownership Confirmed",
                  detail: "alice.cryptofans NFT visible in dashboard → AI artwork on IPFS → Verifiable on block explorer",
                },
              ].map((s, i) => (
                <div key={s.action} className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div>
                    <span className="text-white text-sm font-medium">{s.action}</span>
                    <p className="text-zinc-500 text-xs">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Related guides */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            Dive Deeper
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { title: "NFT Customization", href: "/wiki/guides/nft-customization", desc: "Models, styles, themes, prompts, watermarks" },
              { title: "Domain Management", href: "/wiki/guides/domain-management", desc: "Dashboard, URL forwarding, notifications" },
              { title: "Smart Contracts", href: "/wiki/developers/smart-contracts", desc: "Contract details, ABIs, and integration" },
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

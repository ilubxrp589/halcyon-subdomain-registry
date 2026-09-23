"use client";

import {
  Flame,
  Cpu,
  Coins,
  BarChart3,
  TestTube,
  Globe,
  Zap,
  Shield,
  ExternalLink,
  CheckCircle2,
  Info,
  Network,
  DollarSign,
  TrendingUp,
  Server,
  ArrowRight,
  Gift,
  RefreshCw,
  Wallet,
  FileCode,
  Lock,
  BookOpen,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function FlareNetworkPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30">
            <Flame className="h-6 w-6 text-orange-400" />
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">Concepts</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Flare Network</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Flare is an EVM-compatible Layer 1 blockchain designed to provide decentralized
          data access to smart contracts. HSR is built on Flare to take advantage of its
          native price oracle (FTSO), fast finality, and low transaction costs.
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { label: "EVM Compatible", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
            { label: "Native FTSO Oracle", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
            { label: "< $0.01 Gas", color: "bg-green-500/10 text-green-400 border-green-500/20" },
            { label: "~1.8s Blocks", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
            { label: "Chain ID 114", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
            { label: "Coston2 Testnet", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
          ].map((badge) => (
            <span key={badge.label} className={`text-xs px-2.5 py-1 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* What is Flare */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Network className="h-5 w-5 text-orange-400" />
          What is Flare?
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Flare is a Layer 1 blockchain that is fully EVM-compatible, meaning smart
          contracts written in Solidity for Ethereum work on Flare without modification.
          What sets Flare apart is its suite of native data protocols that provide
          decentralized price feeds, cross-chain data, and more &mdash; directly at the
          protocol level.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: <Cpu className="h-5 w-5 text-blue-400" />,
              title: "EVM Compatible",
              desc: "Runs Solidity smart contracts. All Ethereum tooling (Hardhat, ethers.js, Web3Modal) works out of the box.",
              border: "border-blue-500/20",
              bg: "from-blue-500/5 to-blue-600/5",
            },
            {
              icon: <Shield className="h-5 w-5 text-green-400" />,
              title: "Federated Byzantine Agreement",
              desc: "Uses a variant of FBA consensus. Validators reach agreement without energy-intensive mining.",
              border: "border-green-500/20",
              bg: "from-green-500/5 to-green-600/5",
            },
            {
              icon: <BarChart3 className="h-5 w-5 text-yellow-400" />,
              title: "Native Data Protocols",
              desc: "FTSO provides decentralized price feeds natively at the protocol level — no external oracle dependencies.",
              border: "border-yellow-500/20",
              bg: "from-yellow-500/5 to-yellow-600/5",
            },
          ].map((item) => (
            <Card key={item.title} className={`bg-gradient-to-br ${item.bg} ${item.border}`}>
              <CardContent className="p-4">
                <div className="mb-2">{item.icon}</div>
                <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Network Stats */}
      <Card className="bg-gradient-to-r from-orange-500/5 via-red-500/5 to-yellow-500/5 border-orange-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            Flare Network at a Glance
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { label: "Consensus", value: "FBA", color: "text-blue-400" },
              { label: "Block Time", value: "~1.8s", color: "text-green-400" },
              { label: "Avg Gas Fee", value: "< $0.01", color: "text-yellow-400" },
              { label: "EVM Version", value: "London+", color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FLR Token */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Coins className="h-5 w-5 text-orange-400" />
          The FLR Token
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          FLR is the native token of Flare Network, used for gas fees, staking, FTSO
          delegation, and governance. On HSR, FLR is the currency used to purchase
          subdomain NFTs.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                { label: "Token Name", value: "Flare", icon: <Flame className="h-3.5 w-3.5 text-orange-400" />, color: "text-white" },
                { label: "Symbol", value: "FLR", icon: <Coins className="h-3.5 w-3.5 text-yellow-400" />, color: "text-yellow-400 font-mono" },
                { label: "Type", value: "Native gas token (like ETH on Ethereum)", icon: <Zap className="h-3.5 w-3.5 text-blue-400" />, color: "text-zinc-400" },
                { label: "Decimals", value: "18", icon: <FileCode className="h-3.5 w-3.5 text-zinc-400" />, color: "text-white font-mono" },
                { label: "Uses on HSR", value: "Domain purchases, gas fees", icon: <Globe className="h-3.5 w-3.5 text-amber-400" />, color: "text-amber-400" },
                { label: "Testnet Token", value: "C2FLR (Coston2 FLR — free from faucet, no real value)", icon: <TestTube className="h-3.5 w-3.5 text-cyan-400" />, color: "text-cyan-400" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-shrink-0">{row.icon}</div>
                  <span className="text-zinc-500 text-sm w-32 flex-shrink-0">{row.label}</span>
                  <span className={`text-sm ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Faucet callout */}
        <Card className="bg-cyan-500/5 border-cyan-500/20">
          <CardContent className="p-4 flex items-start gap-3">
            <Gift className="h-5 w-5 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-white text-sm font-medium mb-1">Getting Testnet C2FLR</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                HSR currently runs on Coston2 testnet. To get free C2FLR tokens for testing,
                visit the{" "}
                <a
                  href="https://faucet.flare.network/coston2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Coston2 Faucet
                  <ExternalLink className="inline h-3 w-3 ml-0.5" />
                </a>
                . Connect your wallet and request tokens — they arrive within seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FTSO */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-orange-400" />
          FTSO: Flare Time Series Oracle
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The Flare Time Series Oracle (FTSO) is Flare&apos;s native decentralized price
          oracle. It provides on-chain price feeds for various asset pairs without relying
          on third-party oracle networks like Chainlink. This is a key reason HSR chose Flare.
        </p>

        {/* How FTSO Works */}
        <Card className="bg-gradient-to-br from-yellow-500/5 to-orange-500/5 border-yellow-500/20">
          <CardContent className="p-5 space-y-4">
            <h4 className="text-white text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-yellow-400" />
              How FTSO Works
            </h4>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Data Providers Submit",
                  desc: "Independent data providers submit price estimates for each asset pair during each voting epoch (~3 minutes).",
                },
                {
                  step: "2",
                  title: "Weighted Median Calculated",
                  desc: "The protocol calculates a weighted median price, rewarding accurate providers and penalizing outliers.",
                },
                {
                  step: "3",
                  title: "On-Chain Price Available",
                  desc: "The finalized price is available on-chain for any smart contract to read — including HSR's PriceOracle.",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-yellow-400 text-xs font-bold">{item.step}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{item.title}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FTSO v2 Feed IDs */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3">FTSO v2 Price Feeds Used by HSR</h4>
            <div className="space-y-2">
              {[
                { pair: "FLR / USD", id: "0x01464c522f555344...", primary: true, note: "Primary — domain pricing" },
                { pair: "BTC / USD", id: "0x014254432f555344...", primary: false, note: "Reference feed" },
                { pair: "ETH / USD", id: "0x014554482f555344...", primary: false, note: "Reference feed" },
              ].map((feed) => (
                <div key={feed.pair} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${feed.primary ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-zinc-800/50"}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-mono font-medium ${feed.primary ? "text-yellow-400" : "text-zinc-300"}`}>
                      {feed.pair}
                    </span>
                    {feed.primary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-500 text-xs">{feed.note}</span>
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-xs mt-3">
              Feed IDs are 21-byte identifiers defined by the Flare FTSO v2 protocol. HSR primarily
              uses FLR/USD for converting USD-denominated domain prices to FLR at purchase time.
            </p>
          </CardContent>
        </Card>

        {/* Price flow diagram */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-4">Price Flow: How Domain Pricing Works</h4>
            <div className="space-y-3">
              {[
                {
                  badge: "FTSO",
                  color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                  desc: "Provides real-time FLR/USD price (updated every ~3 min epoch)",
                },
                {
                  badge: "PriceOracle",
                  color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                  desc: "Reads FTSO feed, stores price on-chain (updates if >1% drift)",
                },
                {
                  badge: "SubdomainNFT",
                  color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                  desc: "Calls PriceOracle at purchase time to calculate FLR cost for each tier",
                },
                {
                  badge: "User",
                  color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  desc: "Pays the calculated FLR amount → held in Escrow until NFT is minted",
                },
              ].map((item, i) => (
                <div key={item.badge}>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono px-2.5 py-1 rounded border ${item.color} w-28 text-center`}>
                      {item.badge}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                    <span className="text-zinc-400 text-sm">{item.desc}</span>
                  </div>
                  {i < 3 && (
                    <div className="ml-14 my-1">
                      <div className="w-px h-3 bg-zinc-700 mx-auto" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Price sync details */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-400" />
              Automatic Price Synchronization
            </h4>
            <p className="text-zinc-400 text-xs leading-relaxed mb-3">
              HSR runs a backend PriceSync service that keeps the on-chain PriceOracle
              in sync with the latest FTSO data automatically.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Sync Interval", value: "5 min", color: "text-blue-400" },
                { label: "Update Threshold", value: ">1% drift", color: "text-yellow-400" },
                { label: "Min Between Updates", value: "1 min", color: "text-green-400" },
                { label: "Price Cache", value: "30 sec", color: "text-amber-400" },
              ].map((item) => (
                <div key={item.label} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* No external dependencies */}
        <div className="flex items-start gap-3 bg-green-500/5 border border-green-500/20 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">No External Oracle Dependencies</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Because FTSO is built into the Flare protocol itself, there are no external
              oracle contracts to trust, no bridge risks, and no additional fees. The
              price data is as reliable as the network itself.
            </p>
          </div>
        </div>
      </section>

      {/* HSR Smart Contracts on Flare */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCode className="h-5 w-5 text-orange-400" />
          HSR Smart Contracts on Flare
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR has deployed smart contracts to the Coston2 testnet. The core contracts
          are live, with additional contracts planned for future features.
        </p>

        <div className="space-y-2">
          {[
            {
              name: "SubdomainNFT",
              address: "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38",
              desc: "ERC-721 NFT ownership, ERC-2981 royalties (2.5%), domain registration & renewal",
              color: "border-amber-500/20 from-amber-500/5 to-amber-600/5",
              icon: <Layers className="h-4 w-4 text-amber-400" />,
            },
            {
              name: "SubdomainEscrow",
              address: "0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b",
              desc: "Holds FLR during registration, releases to platform after NFT is minted",
              color: "border-blue-500/20 from-blue-500/5 to-blue-600/5",
              icon: <Lock className="h-4 w-4 text-blue-400" />,
            },
            {
              name: "PriceOracle",
              address: "0x55b92A8C367d408F028914BFCd48D1D4d16960b0",
              desc: "Stores FLR/USD price from FTSO, converts USD tier prices to FLR, 1-hour max staleness",
              color: "border-yellow-500/20 from-yellow-500/5 to-yellow-600/5",
              icon: <TrendingUp className="h-4 w-4 text-yellow-400" />,
            },
            {
              name: "SubdomainMarketplace",
              address: "0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92",
              desc: "Secondary NFT marketplace (Coming Soon) — fixed-price and auction listings planned",
              color: "border-zinc-500/20 from-zinc-500/5 to-zinc-600/5",
              icon: <Globe className="h-4 w-4 text-zinc-400" />,
            },
            {
              name: "CommunityTreasury",
              address: "0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD",
              desc: "FTSO delegation rewards for domain holders (Coming Soon)",
              color: "border-zinc-500/20 from-zinc-500/5 to-zinc-600/5",
              icon: <Gift className="h-4 w-4 text-zinc-400" />,
            },
          ].map((contract) => (
            <Card key={contract.name} className={`bg-gradient-to-br ${contract.color}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{contract.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white text-sm font-semibold">{contract.name}</h4>
                      <a
                        href={`https://coston2-explorer.flare.network/address/${contract.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-orange-400 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-zinc-500 font-mono text-[11px] truncate mb-1.5">{contract.address}</p>
                    <p className="text-zinc-400 text-xs leading-relaxed">{contract.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-zinc-600 text-xs">
          All contracts deployed with Solidity 0.8.20 via Hardhat. Deployer:{" "}
          <span className="font-mono text-zinc-500">0xCafB...d34B</span>
        </p>
      </section>

      {/* Domain Pricing on Flare */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-orange-400" />
          Domain Pricing on Flare
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Domain prices are set in USD and converted to FLR at purchase time using the FTSO
          oracle. This ensures stable pricing regardless of FLR market fluctuations.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            {/* Header */}
            <div className="grid grid-cols-4 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <span className="text-zinc-500 text-xs font-medium">Tier</span>
              <span className="text-zinc-500 text-xs font-medium">Length</span>
              <span className="text-zinc-500 text-xs font-medium">USD Price</span>
              <span className="text-zinc-500 text-xs font-medium">FLR @ $0.05</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { tier: "Ultra Premium", len: "1 char", usd: "$500", flr: "~10,000 FLR", color: "text-red-400" },
                { tier: "Premium", len: "2 chars", usd: "$200", flr: "~4,000 FLR", color: "text-orange-400" },
                { tier: "Standard Plus", len: "3 chars", usd: "$50", flr: "~1,000 FLR", color: "text-yellow-400" },
                { tier: "Standard", len: "4+ chars", usd: "$10", flr: "~200 FLR", color: "text-green-400" },
              ].map((row) => (
                <div key={row.tier} className="grid grid-cols-4 px-4 py-3">
                  <span className={`text-sm font-medium ${row.color}`}>{row.tier}</span>
                  <span className="text-zinc-400 text-sm">{row.len}</span>
                  <span className="text-white text-sm font-mono">{row.usd}</span>
                  <span className="text-zinc-400 text-sm font-mono">{row.flr}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Testnet Pricing</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              On Coston2 testnet (Chain 114), all tiers cost a flat <span className="text-yellow-400 font-mono">1 C2FLR</span> for
              easy testing. Real USD-tiered pricing activates on Flare mainnet (Chain 14).
            </p>
          </div>
        </div>

        {/* Revenue split */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3">Revenue Distribution</h4>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
                  <div className="bg-amber-500 h-full" style={{ width: "94%" }} />
                  <div className="bg-orange-500 h-full" style={{ width: "6%" }} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-amber-500" />
                <span className="text-zinc-400 text-xs">94% Platform</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500" />
                <span className="text-zinc-400 text-xs">6% Community Treasury</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Community Treasury & FTSO Rewards */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Gift className="h-5 w-5 text-orange-400" />
          Community Treasury &amp; FTSO Rewards
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-xs">
            Coming Soon
          </Badge>
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR plans to leverage Flare&apos;s unique FTSO delegation system to reward long-term
          domain holders. A portion of domain sales will flow to the Community Treasury,
          which will delegate its FLR holdings to FTSO data providers to earn additional rewards.
        </p>

        <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
          <Info className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Flare-Native Advantage</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              FTSO delegation rewards are a feature unique to Flare Network. On other chains,
              treasury funds would simply sit idle. On Flare, they can actively earn yield that
              flows back to the community — making domain ownership a potentially rewarding experience.
              This feature is under development and will be detailed in a future update.
            </p>
          </div>
        </div>
      </section>

      {/* Wallet Connection */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-400" />
          Connecting to Flare
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR uses Web3Modal with WalletConnect v2 for seamless wallet connectivity.
          Bifrost Wallet is the recommended wallet for Flare, with native Coston2 testnet support.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              name: "Bifrost Wallet",
              tag: "RECOMMENDED",
              desc: "Native Flare support, built-in Coston2 testnet (enable Developer Mode), mobile-first with WalletConnect",
              color: "border-green-500/20 from-green-500/5 to-green-600/5",
              tagColor: "bg-green-500/20 text-green-400 border-green-500/30",
            },
            {
              name: "Any WalletConnect Wallet",
              tag: "SUPPORTED",
              desc: "MetaMask, Rabby, Rainbow, Trust Wallet — any wallet supporting WalletConnect v2 can connect to HSR",
              color: "border-blue-500/20 from-blue-500/5 to-blue-600/5",
              tagColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
            },
          ].map((wallet) => (
            <Card key={wallet.name} className={`bg-gradient-to-br ${wallet.color}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-white text-sm font-semibold">{wallet.name}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${wallet.tagColor}`}>
                    {wallet.tag}
                  </span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">{wallet.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Network config */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3">Coston2 Network Configuration</h4>
            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs space-y-1.5">
              <div className="flex">
                <span className="text-zinc-500 w-32">Network Name</span>
                <span className="text-green-400">Coston2</span>
              </div>
              <div className="flex">
                <span className="text-zinc-500 w-32">Chain ID</span>
                <span className="text-yellow-400">114</span>
              </div>
              <div className="flex">
                <span className="text-zinc-500 w-32">Currency</span>
                <span className="text-cyan-400">C2FLR</span>
              </div>
              <div className="flex">
                <span className="text-zinc-500 w-32">RPC URL</span>
                <span className="text-amber-400">https://coston2-api.flare.network/ext/C/rpc</span>
              </div>
              <div className="flex">
                <span className="text-zinc-500 w-32">Explorer</span>
                <span className="text-blue-400">https://coston2-explorer.flare.network</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Coston2 vs Mainnet */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <TestTube className="h-5 w-5 text-orange-400" />
          Coston2 Testnet vs Flare Mainnet
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR currently operates on Coston2, Flare&apos;s primary testnet. This allows
          full functionality testing with no real money at risk. A mainnet deployment is
          planned for the future.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <span className="text-zinc-500 text-xs font-medium">Property</span>
              <span className="text-zinc-500 text-xs font-medium flex items-center gap-1">
                <TestTube className="h-3 w-3" /> Coston2 Testnet
              </span>
              <span className="text-zinc-500 text-xs font-medium flex items-center gap-1">
                <Flame className="h-3 w-3" /> Flare Mainnet
              </span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { prop: "Chain ID", coston: "114", mainnet: "14" },
                { prop: "Token", coston: "C2FLR (no value)", mainnet: "FLR (real value)" },
                { prop: "Token Source", coston: "Faucet (free)", mainnet: "Exchanges / DEX" },
                { prop: "RPC URL", coston: "coston2-api.flare.network", mainnet: "flare-api.flare.network" },
                { prop: "FTSO", coston: "Active (test prices)", mainnet: "Active (real prices)" },
                { prop: "Domain Pricing", coston: "Flat 1 C2FLR (all tiers)", mainnet: "USD-tiered via FTSO" },
                { prop: "Block Explorer", coston: "coston2-explorer.flare.network", mainnet: "flare-explorer.flare.network" },
                { prop: "Purpose", coston: "Development & testing", mainnet: "Production" },
              ].map((row, i) => (
                <div key={row.prop} className={`grid grid-cols-3 px-4 py-3 ${i % 2 === 0 ? "bg-zinc-900/30" : ""}`}>
                  <span className="text-white text-sm">{row.prop}</span>
                  <span className="text-cyan-400 text-xs font-mono">{row.coston}</span>
                  <span className="text-green-400 text-xs font-mono">{row.mainnet}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Block Explorer */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-orange-400" />
          Block Explorer
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Flare provides block explorers for both Coston2 and mainnet. You can use the
          explorer to view transactions, smart contracts, token transfers, and account
          balances.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border-cyan-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TestTube className="h-4 w-4 text-cyan-400" />
                <h4 className="text-white text-sm font-medium">Coston2 Explorer</h4>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  CURRENT
                </span>
              </div>
              <a
                href="https://coston2-explorer.flare.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 text-xs underline break-all flex items-center gap-1"
              >
                coston2-explorer.flare.network
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
              <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                View HSR contract interactions, domain NFT transfers,
                and escrow payments on the testnet.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="h-4 w-4 text-green-400" />
                <h4 className="text-white text-sm font-medium">Flare Mainnet Explorer</h4>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 border border-zinc-600">
                  FUTURE
                </span>
              </div>
              <a
                href="https://flare-explorer.flare.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300 text-xs underline break-all flex items-center gap-1"
              >
                flare-explorer.flare.network
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
              <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                The production explorer for when HSR migrates to mainnet.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Why HSR Chose Flare */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-400" />
          Why HSR Chose Flare
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Several factors make Flare the ideal blockchain for a decentralized domain
          marketplace:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <TrendingUp className="h-5 w-5 text-yellow-400" />,
              title: "Native Price Feeds (FTSO)",
              desc: "HSR needs reliable FLR/USD pricing to calculate domain costs. FTSO provides this natively — no Chainlink, no bridge risks, no extra fees.",
              color: "border-yellow-500/20 from-yellow-500/5 to-yellow-600/5",
            },
            {
              icon: <Zap className="h-5 w-5 text-blue-400" />,
              title: "Fast Finality (~1.8s)",
              desc: "Domain purchases and NFT minting happen in seconds, not minutes. Users don't wait.",
              color: "border-blue-500/20 from-blue-500/5 to-blue-600/5",
            },
            {
              icon: <DollarSign className="h-5 w-5 text-green-400" />,
              title: "Sub-Cent Gas Costs",
              desc: "Transaction fees are a fraction of a cent. Users can buy domains and interact with their NFTs without gas anxiety.",
              color: "border-green-500/20 from-green-500/5 to-green-600/5",
            },
            {
              icon: <Cpu className="h-5 w-5 text-amber-400" />,
              title: "Full EVM Compatibility",
              desc: "HSR's Solidity contracts deploy and run identically to Ethereum. Hardhat, ethers.js, and standard wallets work seamlessly.",
              color: "border-amber-500/20 from-amber-500/5 to-amber-600/5",
            },
            {
              icon: <Gift className="h-5 w-5 text-orange-400" />,
              title: "FTSO Delegation Rewards",
              desc: "Treasury FLR can earn yield through FTSO delegation — a feature unique to Flare that will reward domain holders (Coming Soon).",
              color: "border-orange-500/20 from-orange-500/5 to-orange-600/5",
            },
            {
              icon: <Server className="h-5 w-5 text-cyan-400" />,
              title: "Growing Ecosystem",
              desc: "Active development, regular protocol upgrades, and growing DeFi and NFT communities building on the network.",
              color: "border-cyan-500/20 from-cyan-500/5 to-cyan-600/5",
            },
          ].map((item) => (
            <Card key={item.title} className={`bg-gradient-to-br ${item.color}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                  <div>
                    <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Flare's Key Interfaces Used by HSR */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCode className="h-5 w-5 text-orange-400" />
          Flare Protocol Interfaces
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR interacts with these Flare-specific protocol interfaces, all available natively
          on the network through the Flare Contract Registry.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-0 divide-y divide-zinc-800">
            {[
              {
                name: "IFlareContractRegistry",
                desc: "Central registry for all Flare protocol contracts. HSR uses this to dynamically look up FTSO addresses.",
                address: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
                tag: "Same on all Flare networks",
              },
              {
                name: "IFastUpdatesConfiguration",
                desc: "FTSO v2 interface for reading price feeds by feed ID. Primary source for FLR/USD pricing.",
                address: null,
                tag: "Resolved via registry",
              },
              {
                name: "IWNat (Wrapped Native Token)",
                desc: "Wraps FLR for FTSO delegation. Used by the Community Treasury for reward generation (Coming Soon).",
                address: null,
                tag: "Resolved via registry",
              },
            ].map((iface) => (
              <div key={iface.name} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-mono font-medium">{iface.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                    {iface.tag}
                  </span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">{iface.desc}</p>
                {iface.address && (
                  <p className="text-zinc-600 font-mono text-[11px] mt-1">{iface.address}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Learn More */}
      <Card className="bg-gradient-to-br from-orange-500/5 to-red-500/5 border-orange-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-orange-400" />
            Learn More About Flare
          </h3>
          <p className="text-zinc-400 text-sm mb-4">
            For deeper technical details about Flare Network, visit the official resources:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Flare Documentation", url: "https://docs.flare.network", desc: "Complete developer docs" },
              { label: "FTSO Documentation", url: "https://docs.flare.network/tech/ftso/", desc: "Price oracle details" },
              { label: "Flare Portal", url: "https://portal.flare.network", desc: "Delegation & staking" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 hover:border-orange-500/30 rounded-lg p-3 transition-colors group"
              >
                <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-orange-400 transition-colors flex-shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-orange-400 transition-colors">{link.label}</p>
                  <p className="text-zinc-500 text-xs">{link.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Related Guides */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Related Guides</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { title: "Wallet Setup", desc: "Connect Bifrost to Coston2", section: "getting-started", page: "wallet-setup" },
            { title: "How It Works", desc: "Full HSR architecture", section: "concepts", page: "how-it-works" },
            { title: "Smart Contracts", desc: "Developer documentation", section: "developers", page: "smart-contracts" },
          ].map((guide) => (
            <div
              key={guide.title}
              className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
            >
              <ArrowRight className="h-4 w-4 text-orange-400 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">{guide.title}</p>
                <p className="text-zinc-500 text-xs">{guide.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

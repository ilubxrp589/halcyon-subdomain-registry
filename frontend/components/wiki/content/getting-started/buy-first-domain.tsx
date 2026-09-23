"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Wallet,
  Search,
  ShoppingCart,
  CheckCircle2,
  Clock,
  PartyPopper,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Smartphone,
  Droplets,
  Sparkles,
  ImageIcon,
  Layers,
  TrendingUp,
} from "lucide-react";

export default function BuyFirstDomainContent() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <ShoppingCart className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Getting Started</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Buy Your First Domain</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Walk through the complete process of searching for a Handshake subdomain
          and purchasing it as an NFT on the Flare network.
        </p>
      </div>

      {/* Prerequisites */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            Before You Start
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Smartphone className="h-6 w-6 text-amber-400" />,
                title: "Bifrost Wallet",
                desc: "Installed on your phone with Developer Mode enabled",
                link: { text: "Setup Guide", href: "/wiki/getting-started/wallet-setup" },
              },
              {
                icon: <Droplets className="h-6 w-6 text-blue-400" />,
                title: "C2FLR Tokens",
                desc: "Test tokens from the Flare faucet (free)",
                link: { text: "Get Tokens", href: "https://faucet.flare.network/" },
              },
              {
                icon: <Clock className="h-6 w-6 text-amber-400" />,
                title: "5 Minutes",
                desc: "The whole process from search to ownership",
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center text-center p-4 rounded-lg bg-zinc-800/50">
                {item.icon}
                <h4 className="text-white font-medium mt-2 text-sm">{item.title}</h4>
                <p className="text-zinc-500 text-xs mt-1">{item.desc}</p>
                {item.link && (
                  <a
                    href={item.link.href}
                    target={item.link.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="text-amber-400 hover:text-amber-300 text-xs mt-2 underline"
                  >
                    {item.link.text}
                    {item.link.href.startsWith("http") && <ExternalLink className="inline h-3 w-3 ml-1" />}
                  </a>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Connect Wallet */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            1
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-400" />
            Connect Your Wallet
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Connect your Bifrost wallet to HSR by scanning a QR code. Make sure
            Developer Mode is enabled in Bifrost so you&apos;re on the Coston2 testnet.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>
                  Click <strong className="text-white">Connect Wallet</strong> in the top-right corner of HSR
                </li>
                <li>A Web3Modal popup will appear with a QR code</li>
                <li>Open Bifrost on your phone and scan the QR code</li>
                <li>Approve the connection request in Bifrost</li>
              </ol>
              <p className="text-zinc-500 text-xs mt-3">
                Once connected, your wallet address will appear in the navigation bar.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 2: Search */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            2
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-400" />
            Search for a Subdomain
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Enter the name you want and select a top-level domain (TLD). HSR will
            check availability and show you the price instantly.
          </p>

          {/* Search Example */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/80 border border-zinc-700">
                <Search className="h-4 w-4 text-zinc-500" />
                <span className="text-white font-mono text-sm">coolname</span>
                <span className="text-zinc-500 text-sm">.</span>
                <span className="text-amber-400 font-mono text-sm">cryptofans</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                {[
                  { label: "Available", color: "bg-green-500/10 text-green-400 border-green-500/20", desc: "You can buy it" },
                  { label: "Taken", color: "bg-red-500/10 text-red-400 border-red-500/20", desc: "Already owned" },
                  { label: "Reserved", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", desc: "Not available" },
                ].map((status) => (
                  <div key={status.label} className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-xs ${status.color}`}>{status.label}</Badge>
                    <span className="text-zinc-600 text-xs hidden sm:inline">{status.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pricing Tiers */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <h4 className="text-white text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                  Pricing Tiers
                </h4>
              </div>
              <div className="divide-y divide-zinc-800">
                {[
                  { length: "1 character", example: "a.cryptofans", tier: "Ultra Premium", color: "text-amber-400" },
                  { length: "2 characters", example: "ab.cryptofans", tier: "Premium", color: "text-amber-400" },
                  { length: "3 characters", example: "abc.cryptofans", tier: "Standard Plus", color: "text-blue-400" },
                  { length: "4+ characters", example: "coolname.cryptofans", tier: "Standard", color: "text-zinc-400" },
                ].map((row) => (
                  <div key={row.length} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-500 text-sm w-24">{row.length}</span>
                      <code className="text-xs font-mono text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded">{row.example}</code>
                    </div>
                    <span className={`text-sm font-medium ${row.color}`}>{row.tier}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-zinc-500 text-sm">
            The exact price in FLR (with live USD conversion) is shown before you commit
            to anything. The cheapest domains start at approximately 1 FLR.
          </p>
        </div>
      </section>

      {/* Step 3: Purchase */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            3
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-amber-400" />
            Complete Your Purchase
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Review your domain details and confirm the purchase. Your FLR is held
            in escrow until the NFT is minted to your wallet.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>Review the domain name and price</li>
                <li>Click <strong className="text-white">Purchase</strong></li>
                <li>Approve the transaction in <strong className="text-white">Bifrost</strong> on your phone</li>
                <li>Wait for blockchain confirmation (usually 10-30 seconds)</li>
              </ol>
            </CardContent>
          </Card>

          {/* What happens behind the scenes */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <h4 className="text-white text-sm font-medium">What happens behind the scenes</h4>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm">
                  {[
                    { label: "Payment", color: "bg-amber-500/20 text-amber-400" },
                    { label: "Escrow", color: "bg-blue-500/20 text-blue-400" },
                    { label: "NFT Mint", color: "bg-green-500/20 text-green-400" },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${step.color}`}>{step.label}</span>
                      {i < 2 && <ArrowRight className="h-3 w-3 text-zinc-600" />}
                    </div>
                  ))}
                </div>
                <p className="text-zinc-500 text-xs mt-3">
                  Your FLR is held in escrow until the NFT is successfully minted to your wallet.
                  Once minted, the funds are released and you own the domain.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 4: You Own It */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">
            <PartyPopper className="h-4 w-4" />
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            You Own It!
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Congratulations! Your subdomain is now an ERC-721 NFT in your wallet.
            Here&apos;s what you can do with it:
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: <Wallet className="h-5 w-5 text-amber-400" />, title: "Web3 Identity", desc: "Use it as your decentralized on-chain identity" },
              { icon: <ImageIcon className="h-5 w-5 text-pink-400" />, title: "Collect NFTs", desc: "Each domain has unique artwork — build a collection" },
              { icon: <Layers className="h-5 w-5 text-cyan-400" />, title: "Transfer", desc: "Send to another wallet as a standard ERC-721 token" },
            ].map((item) => (
              <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {item.icon}
                    <h4 className="text-white text-sm font-medium">{item.title}</h4>
                  </div>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* AI Art callout */}
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white text-sm font-medium">AI-Generated Artwork</h4>
                  <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px]">In Testing</Badge>
                </div>
                <p className="text-zinc-400 text-xs">
                  HSR is testing AI-generated NFT artwork powered by an 8-GPU ComfyUI cluster.
                  Soon you&apos;ll be able to choose themes and styles for your domain&apos;s
                  unique NFT image, stored permanently on IPFS.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-400" />
          Troubleshooting
        </h2>
        <div className="space-y-3">
          {[
            {
              title: "Transaction Failed",
              solutions: [
                "Make sure you have enough C2FLR for both the price and gas fees",
                "Check that Bifrost is on the Coston2 testnet (Developer Mode enabled)",
                "Try again — the network may be congested",
              ],
            },
            {
              title: "Wallet Won't Connect",
              solutions: [
                "Make sure Bifrost is open on your phone when scanning the QR code",
                "Check that Developer Mode is enabled in Bifrost settings",
                "Try refreshing the HSR page and scanning a new QR code",
              ],
            },
            {
              title: "Can't See My Domain",
              solutions: [
                "Wait a minute for the blockchain to confirm the transaction",
                "Check your HSR dashboard under My Domains",
                "Verify your wallet is connected to the correct network",
              ],
            },
          ].map((item) => (
            <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                    <ul className="text-zinc-500 text-xs space-y-1">
                      {item.solutions.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-zinc-600 mt-0.5">&#8226;</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-white font-semibold mb-1">Ready to register?</h3>
              <p className="text-zinc-400 text-sm">Find your perfect subdomain now</p>
            </div>
            <div className="flex gap-2">
              <Link href="/register-v2">
                <Button className="bg-amber-600 hover:bg-amber-700">
                  Register Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/wiki/concepts/how-it-works">
                <Button variant="outline">
                  How It Works
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

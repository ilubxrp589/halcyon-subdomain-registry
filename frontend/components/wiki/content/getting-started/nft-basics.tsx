"use client";

import {
  Hexagon,
  FileJson,
  Image,
  Eye,
  ArrowRightLeft,
  Shield,
  Database,
  Tag,
  Layers,
  ExternalLink,
  Info,
  CheckCircle2,
  Sparkles,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function NftBasicsPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Hexagon className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Getting Started</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">NFT Basics</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Every domain you purchase on HSR is minted as an ERC-721 NFT on Flare Network.
          This page explains what that means, what metadata your NFT contains, how it&apos;s
          stored, and what ownership rights it grants you.
        </p>
      </div>

      {/* What is an ERC-721 NFT */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          What is an ERC-721 NFT?
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          ERC-721 is the Ethereum standard for non-fungible tokens. Each token is unique
          and has a distinct token ID. Unlike fungible tokens (like FLR or USDT) where
          every token is interchangeable, each ERC-721 NFT represents a one-of-a-kind
          asset &mdash; in HSR&apos;s case, a specific Handshake subdomain.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: <Shield className="h-5 w-5 text-blue-400" />,
              title: "Unique Ownership",
              desc: "Each domain is a single NFT with a unique token ID. Only one wallet can own it at a time.",
            },
            {
              icon: <ArrowRightLeft className="h-5 w-5 text-green-400" />,
              title: "Transferable",
              desc: "You can transfer your domain NFT to any other wallet address, just like sending tokens.",
            },
            {
              icon: <Eye className="h-5 w-5 text-yellow-400" />,
              title: "Verifiable On-Chain",
              desc: "Ownership is recorded on the Flare blockchain. Anyone can verify who owns a domain.",
            },
          ].map((item) => (
            <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="mb-2">{item.icon}</div>
                <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                <p className="text-zinc-500 text-xs">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2">HSR&apos;s Smart Contract</h4>
            <p className="text-zinc-400 text-sm mb-2">
              HSR deploys a <code className="text-amber-400 bg-amber-500/10 px-1 rounded text-xs">SubdomainNFT</code> contract
              that extends the standard ERC-721 interface. When you purchase a domain, the
              contract mints a new NFT to your wallet. The token ID maps to the domain name
              stored in the contract&apos;s registry.
            </p>
            <p className="text-zinc-500 text-xs">
              The contract address can be found on the Coston2 block explorer. It implements
              ERC-721 with EIP-2981 royalty support.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* NFT Metadata */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileJson className="h-5 w-5 text-amber-400" />
          NFT Metadata
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Each domain NFT includes rich metadata following the ERC-721 metadata standard.
          This metadata is what wallets, explorers, and marketplaces use to display your
          NFT&apos;s name, image, and properties.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <h4 className="text-white text-sm font-medium">Metadata Structure</h4>
            </div>
            <div className="p-4 font-mono text-sm text-zinc-400 space-y-1">
              <p>{"{"}</p>
              <p className="ml-4">
                <span className="text-amber-400">&quot;name&quot;</span>:{" "}
                <span className="text-green-400">&quot;alice.cryptofans&quot;</span>,
              </p>
              <p className="ml-4">
                <span className="text-amber-400">&quot;description&quot;</span>:{" "}
                <span className="text-green-400">&quot;Handshake subdomain registered on HSR&quot;</span>,
              </p>
              <p className="ml-4">
                <span className="text-amber-400">&quot;image&quot;</span>:{" "}
                <span className="text-green-400">&quot;ipfs://Qm.../alice-cryptofans.png&quot;</span>,
              </p>
              <p className="ml-4">
                <span className="text-amber-400">&quot;attributes&quot;</span>: [
              </p>
              <p className="ml-8">
                {"{"} <span className="text-amber-400">&quot;trait_type&quot;</span>:{" "}
                <span className="text-green-400">&quot;TLD&quot;</span>,{" "}
                <span className="text-amber-400">&quot;value&quot;</span>:{" "}
                <span className="text-green-400">&quot;cryptofans&quot;</span> {"}"},
              </p>
              <p className="ml-8">
                {"{"} <span className="text-amber-400">&quot;trait_type&quot;</span>:{" "}
                <span className="text-green-400">&quot;Length&quot;</span>,{" "}
                <span className="text-amber-400">&quot;value&quot;</span>:{" "}
                <span className="text-yellow-400">5</span> {"}"},
              </p>
              <p className="ml-8">
                {"{"} <span className="text-amber-400">&quot;trait_type&quot;</span>:{" "}
                <span className="text-green-400">&quot;Tier&quot;</span>,{" "}
                <span className="text-amber-400">&quot;value&quot;</span>:{" "}
                <span className="text-green-400">&quot;Standard&quot;</span> {"}"},
              </p>
              <p className="ml-8">
                {"{"} <span className="text-amber-400">&quot;trait_type&quot;</span>:{" "}
                <span className="text-green-400">&quot;Registration Date&quot;</span>,{" "}
                <span className="text-amber-400">&quot;value&quot;</span>:{" "}
                <span className="text-green-400">&quot;2025-01-15&quot;</span> {"}"}
              </p>
              <p className="ml-4">]</p>
              <p>{"}"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Attribute Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <Tag className="h-4 w-4 text-blue-400" />,
              attr: "TLD",
              desc: "The top-level domain (e.g., cryptofans). Identifies which Handshake name the subdomain belongs to.",
            },
            {
              icon: <Layers className="h-4 w-4 text-yellow-400" />,
              attr: "Tier",
              desc: "Pricing tier based on name length: Premium (1-2 chars), Standard (3-5 chars), Budget (6+ chars).",
            },
            {
              icon: <FileJson className="h-4 w-4 text-green-400" />,
              attr: "Length",
              desc: "Character count of the subdomain label. Shorter names are rarer and more expensive.",
            },
            {
              icon: <Image className="h-4 w-4 text-amber-400" />,
              attr: "Image",
              desc: "NFT artwork stored on IPFS. AI-generated customization is currently in testing.",
            },
          ].map((item) => (
            <Card key={item.attr} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {item.icon}
                  <h4 className="text-white text-sm font-medium">{item.attr}</h4>
                </div>
                <p className="text-zinc-500 text-xs">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* IPFS Storage */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-400" />
          IPFS Storage
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          NFT metadata and images are stored on IPFS (InterPlanetary File System), a
          decentralized storage network. This ensures your domain&apos;s metadata is not
          dependent on any single server and cannot be altered or taken down.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Content-Addressed</p>
                <p className="text-zinc-500 text-xs">
                  IPFS uses content hashing. The URL contains a hash of the content itself,
                  so it&apos;s impossible to modify data without changing the URL.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Pinned & Persistent</p>
                <p className="text-zinc-500 text-xs">
                  HSR pins all NFT metadata on IPFS through a dedicated pinning service,
                  ensuring long-term availability even if HSR&apos;s servers go offline.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Gateway Accessible</p>
                <p className="text-zinc-500 text-xs">
                  You can view your NFT metadata via any IPFS gateway (e.g.,
                  ipfs.io, cloudflare-ipfs.com) by replacing <code className="text-amber-400 bg-amber-500/10 px-1 rounded">ipfs://</code> with
                  a gateway URL.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Viewing on Explorers */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Eye className="h-5 w-5 text-amber-400" />
          Viewing on Block Explorers
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          You can view your domain NFT on the Flare block explorer to verify ownership,
          see transaction history, and inspect metadata.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
              <li>
                Go to{" "}
                <a
                  href="https://coston2-explorer.flare.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  coston2-explorer.flare.network
                  <ExternalLink className="inline h-3 w-3 ml-1" />
                </a>
              </li>
              <li>Search for the SubdomainNFT contract address or your wallet address</li>
              <li>Navigate to the &quot;Token Transfers&quot; or &quot;NFTs&quot; tab</li>
              <li>Click on your token ID to see full metadata, ownership history, and transfer events</li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Ownership Rights */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          What Ownership Grants You
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Owning a domain NFT on HSR gives you several concrete rights and capabilities:
        </p>
        <div className="space-y-3">
          {[
            {
              title: "URL Forwarding",
              desc: "Set up URL forwarding to redirect your subdomain to any website. Configure redirect type (301/302) and path forwarding from the dashboard.",
              badge: "Live",
              badgeColor: "bg-green-500/20 text-green-400",
            },
            {
              title: "Transfer Rights",
              desc: "Transfer the NFT to any address. This is a standard ERC-721 transfer and works with any ERC-721 compatible wallet or platform.",
              badge: "Ownership",
              badgeColor: "bg-yellow-500/20 text-yellow-400",
            },
            {
              title: "NFT Customization",
              desc: "Customize the AI-generated artwork for your domain NFT. Choose themes, styles, and prompts for unique artwork stored on IPFS.",
              badge: "In Testing",
              badgeColor: "bg-amber-500/20 text-amber-400",
            },
          ].map((item) => (
            <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white text-sm font-medium">{item.title}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Coming Soon */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          Coming Soon
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Additional perks are being built for NFT holders:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <Sparkles className="h-4 w-4 text-amber-400" />,
              title: "Community Rewards",
              desc: "FTSO delegation rewards distributed to domain holders.",
            },
            {
              icon: <ArrowRightLeft className="h-4 w-4 text-blue-400" />,
              title: "Marketplace Trading",
              desc: "List and trade domains on a dedicated HSR marketplace.",
            },
          ].map((item) => (
            <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {item.icon}
                  <h4 className="text-white text-sm font-medium">{item.title}</h4>
                  <Badge className="bg-zinc-500/20 text-zinc-400 border-0 text-[10px]">Coming Soon</Badge>
                </div>
                <p className="text-zinc-500 text-xs">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Important Notes */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            Important Notes
          </h3>
          <ul className="text-zinc-400 text-sm space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#8226;</span>
              HSR is currently running on the Coston2 testnet. All tokens are test tokens with no real value.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#8226;</span>
              Transferring the NFT transfers all associated rights to the new owner.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#8226;</span>
              HSR subdomains resolve via Handshake-aware resolvers (HDNS, Fingertip). See the Handshake Names concept page for details.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

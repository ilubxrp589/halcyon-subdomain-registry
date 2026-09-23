"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWeb3Modal, useWeb3ModalAccount } from "@/lib/web3modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GoldenEraBg } from "@/components/golden-era-bg";
import { PlatformStats } from "@/components/home/PlatformStats";
import { FeaturedTlds } from "@/components/home/FeaturedTlds";
import { CommunityTlds } from "@/components/home/CommunityTlds";
import { StakerPitch } from "@/components/home/StakerPitch";
import { EarningsCalculator } from "@/components/home/EarningsCalculator";
import { HandshakeWeb } from "@/components/home/HandshakeWeb";

import {
  ArrowRight,
  Coins,
  Hexagon,
  Pickaxe,
  Search,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";

export default function Home() {
  const { open } = useWeb3Modal();
  const { isConnected } = useWeb3ModalAccount();

  // Scroll-reveal IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("visible");
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleCTA = () => {
    if (isConnected) {
      window.location.href = "/register-v2";
    } else {
      open();
    }
  };

  return (
    <div className="flex flex-col relative">
      <GoldenEraBg />

      {/* 1. Hero Section */}
      <section className="relative py-16 md:py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 hero-halcyon-bg" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[hsl(var(--halcyon-teal)/0.08)] blur-3xl animate-drift" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-[hsl(var(--halcyon-green)/0.06)] blur-3xl animate-drift hidden sm:block" style={{ animationDelay: "-7s" }} />

        <div className="container relative z-10 max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            Community-Built &middot; Powered by Handshake + Flare
          </Badge>

          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Where{" "}
            <span className="text-halcyon-gradient">Handshake</span>
            <br />
            Meets Flare
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
            AI-powered NFT domains on Handshake + Flare. Register names, stake your TLD, and earn from every sale.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-8">
            Independent community project. Not affiliated with, endorsed by, or backed by Flare Networks or Handshake.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="btn-halcyon h-12 px-6 text-base sm:h-14 sm:px-8 sm:text-lg" onClick={handleCTA}>
              {isConnected ? "Register a Domain" : "Connect Wallet to Start"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Link href="/stake">
              <Button variant="outline" size="lg" className="h-12 px-6 text-base sm:h-14 sm:px-8 sm:text-lg border-amber-500/30 hover:bg-amber-500/10">
                <Pickaxe className="mr-2 h-5 w-5" />
                Stake Your TLD
              </Button>
            </Link>
          </div>

          {/* Live Stats */}
          <div className="mt-8">
            <PlatformStats />
          </div>
        </div>
      </section>

      {/* 2. Featured TLDs */}
      <section className="py-12 border-y border-border/50">
        <div className="container max-w-5xl mx-auto space-y-10">
          <FeaturedTlds />
          <CommunityTlds />
        </div>
      </section>

      {/* 3. How It Works — 3 columns for Buyers, TLD Owners, The Platform */}
      <section className="py-12 md:py-20">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground">For buyers, TLD owners, and the platform.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* For Buyers */}
            <div className="glass-card p-6 reveal">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Wallet className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">For Buyers</h3>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Connect your wallet</li>
                <li>Search for a name across all TLDs</li>
                <li>Register and mint your NFT</li>
                <li>Get unique AI-generated artwork</li>
              </ol>
            </div>

            {/* For TLD Owners */}
            <div className="glass-card p-6 reveal" style={{ transitionDelay: "0.1s" }}>
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Pickaxe className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">For TLD Owners</h3>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Own a Handshake TLD</li>
                <li>Stake it on Halcyon</li>
                <li>Set your own SLD pricing</li>
                <li>Earn 80% of every registration</li>
              </ol>
            </div>

            {/* The Platform */}
            <div className="glass-card p-6 reveal" style={{ transitionDelay: "0.2s" }}>
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">The Platform</h3>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                <li>AI-generated NFT art per domain</li>
                <li>Built on the Flare blockchain</li>
                <li>5% fee on official TLDs</li>
                <li>20% fee on community TLDs</li>
              </ul>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href="/explore">
              <Button size="lg" className="btn-halcyon">
                Browse All TLDs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Unique Value Props — Bento Grid */}
      <section className="py-12 md:py-20 bg-secondary/10">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              The <span className="text-halcyon-gradient">Halcyon Standard</span>
            </h2>
            <p className="text-muted-foreground">
              Everything a digital identity should be. Nothing it shouldn&apos;t.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-card p-8 md:row-span-2 reveal flex flex-col justify-center" style={{ boxShadow: "0 8px 32px hsl(var(--halcyon-teal) / 0.2)" }}>
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-xl font-semibold mb-3">AI-Generated Artwork</h3>
              <p className="text-muted-foreground">
                Every subdomain is paired with unique AI art generated from your
                name. Not a generic avatar — a one-of-one piece that lives with
                your NFT forever.
              </p>
            </div>

            <div className="glass-card p-6 reveal" style={{ transitionDelay: "0.1s" }}>
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Hexagon className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">True Domain Ownership</h3>
              <p className="text-sm text-muted-foreground">
                Your domain is an ERC-721 NFT on Flare. No registrar can revoke it. Trade, sell, or hold — it&apos;s yours.
              </p>
            </div>

            <div className="glass-card p-6 reveal" style={{ transitionDelay: "0.2s" }}>
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--halcyon-teal)/0.1)] flex items-center justify-center mb-4">
                <Coins className="h-6 w-6 text-[hsl(var(--halcyon-teal))]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Earn From Your TLDs</h3>
              <p className="text-sm text-muted-foreground">
                Stake your Handshake TLD and keep 80% of every subdomain sale. Set your own prices, withdraw anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Staker Pitch + Earnings Calculator */}
      <section className="py-12 md:py-16">
        <div className="container max-w-5xl mx-auto">
          <div className="grid md:grid-cols-5 gap-6">
            <div className="md:col-span-3">
              <StakerPitch />
            </div>
            <div className="md:col-span-2">
              <EarningsCalculator />
            </div>
          </div>
        </div>
      </section>

      {/* 5b. Handshake Web Discovery */}
      <section className="py-12 md:py-20 bg-secondary/10 reveal">
        <div className="container max-w-5xl mx-auto">
          <HandshakeWeb />
        </div>
      </section>

      {/* 6. Pricing Section */}
      <section className="py-12 md:py-20 bg-secondary/10">
        <div className="container max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Pricing</h2>
          <p className="text-muted-foreground mb-4">
            Pricing is set by TLD owners. Official TLDs start from $2/year for standard names.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Shorter names are more expensive. Multi-year discounts available on select TLDs.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { chars: "1 char", label: "Ultra Premium", price: "$500" },
              { chars: "2 chars", label: "Premium", price: "$100" },
              { chars: "3 chars", label: "Standard Plus", price: "$25" },
              { chars: "4+ chars", label: "Standard", price: "From $2" },
            ].map((item) => (
              <div key={item.chars} className="glass-card p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">{item.chars}</div>
                <div className="text-lg font-bold">{item.price}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Prices shown for official TLDs. Community TLD pricing may vary.
          </p>

          <div className="mt-8">
            <Button size="lg" onClick={handleCTA}>
              {isConnected ? "Register Now" : "Connect Wallet"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section className="py-12 md:py-20">
        <div className="container max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Common Questions
          </h2>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="ai-art">
              <AccordionTrigger>How does the AI artwork work?</AccordionTrigger>
              <AccordionContent>
                When you register a subdomain, our AI generates unique artwork based on
                your chosen name using Stable Diffusion models on dedicated GPUs. The art
                becomes part of your NFT metadata and is stored permanently on IPFS.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="staking-cost">
              <AccordionTrigger>What does it cost to stake a TLD?</AccordionTrigger>
              <AccordionContent>
                Staking a TLD costs $10 USD (paid in FLR). This covers the on-chain verification
                of your Handshake TLD ownership and minting of the TLD NFT on Flare Network.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="revenue-split">
              <AccordionTrigger>What percentage do TLD owners keep?</AccordionTrigger>
              <AccordionContent>
                Community TLD owners keep 80% of every subdomain registration. The 20% platform
                fee covers AI artwork generation, DNS infrastructure, and platform operations.
                Official Halcyon TLDs have a 5% platform fee.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="community-art">
              <AccordionTrigger>Do community TLDs get AI art too?</AccordionTrigger>
              <AccordionContent>
                Yes! Every subdomain registered on any TLD (official or community) gets unique
                AI-generated artwork. This is included in the platform fee — no extra cost.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="resolve">
              <AccordionTrigger>
                Will my subdomain work in normal browsers?
              </AccordionTrigger>
              <AccordionContent>
                It resolves through HNS-compatible resolvers like NextDNS and
                Fingertip. We also provide a DoH (DNS-over-HTTPS) endpoint at
                dns.halcyon-names.io for direct resolution.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sell">
              <AccordionTrigger>Can I sell my subdomain?</AccordionTrigger>
              <AccordionContent>
                Yes. It&apos;s a standard ERC-721 NFT on Flare Network. List on any NFT
                marketplace, trade P2P, or transfer directly to another wallet.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="renewal">
              <AccordionTrigger>What are the renewal fees?</AccordionTrigger>
              <AccordionContent>
                Renewals are price-locked at 10% of the original purchase price per year.
                No surprise markups.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* 8. Final CTA */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-[hsl(var(--halcyon-teal)/0.05)] to-[hsl(var(--halcyon-green)/0.1)]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            <span className="text-halcyon-gradient">Your Domain. Your Revenue.</span>
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground mb-8">
            Register a domain or stake your TLD. The decentralized marketplace awaits.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="btn-halcyon h-12 px-6 text-base sm:h-14 sm:px-10 sm:text-lg" onClick={handleCTA}>
              {isConnected ? "Get Started" : "Connect Wallet"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Link href="/explore">
              <Button variant="outline" size="lg" className="h-12 px-6 text-base sm:h-14 sm:px-10 sm:text-lg">
                Browse TLDs
              </Button>
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Smart Contract Escrow
            </span>
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" /> Multi-TLD Search
            </span>
          </div>

          <p className="mt-8 text-xs text-muted-foreground/60 max-w-lg mx-auto">
            Halcyon is a 100% community-driven project. It is not affiliated with, endorsed by, or backed by Flare Networks, Handshake, or any of their affiliated entities.
          </p>
        </div>
      </section>

    </div>
  );
}

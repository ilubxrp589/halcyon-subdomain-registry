"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Coins, Sparkles, Zap, PiggyBank } from "lucide-react";

export function StakerPitch() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-amber-600/10 p-6 sm:p-10">
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative">
        <h3 className="text-2xl font-bold mb-2">
          Own a Handshake TLD? <span className="text-amber-400">Start Earning Today.</span>
        </h3>
        <p className="text-muted-foreground mb-6 max-w-xl">
          Stake your TLD on Halcyon and earn from every subdomain registration. AI-generated NFT artwork included for your buyers.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-sm">Stake in minutes</span>
          </div>
          <div className="flex items-start gap-2">
            <Coins className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-sm">Set your own pricing</span>
          </div>
          <div className="flex items-start gap-2">
            <PiggyBank className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-sm">Keep 80% of sales</span>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-sm">AI art included</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/stake">
            <Button size="lg" className="btn-halcyon">
              Stake Your TLD
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/wiki/concepts/tld-staking">
            <Button variant="outline" size="lg">
              How It Works
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Gift, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function CommunityRewardsPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/10">
            <Gift className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">Concepts</Badge>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-xs">
            Coming Soon
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Community Rewards</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          HSR plans to leverage Flare&apos;s native FTSO delegation system to reward
          long-term domain holders. This feature is currently in development.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="bg-gradient-to-br from-amber-500/5 to-yellow-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-400" />
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-semibold text-lg">Under Development</h3>
              <p className="text-zinc-400 leading-relaxed">
                Community Rewards will use Flare&apos;s FTSO delegation system to generate
                yield from the Community Treasury, which will be distributed to domain
                holders. The system is designed to reward long-term participants in the
                HSR ecosystem.
              </p>
              <div className="space-y-2 text-sm text-zinc-500">
                <p><strong className="text-zinc-300">Planned features:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>6% of domain sales flow to the Community Treasury</li>
                  <li>Treasury FLR delegated to FTSO data providers to earn rewards</li>
                  <li>Weekly reward distribution to domain holders</li>
                  <li>On-chain Merkle-based claims for transparency</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

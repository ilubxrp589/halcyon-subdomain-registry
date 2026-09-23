"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

export function EarningsCalculator() {
  const [slds, setSlds] = useState(100);
  const [avgPrice, setAvgPrice] = useState(5);

  const totalRevenue = slds * avgPrice;
  const ownerEarnings = totalRevenue * 0.8;
  const platformFee = totalRevenue * 0.2;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-amber-400" />
        <h4 className="font-semibold">Earnings Calculator</h4>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">SLDs Sold</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={slds}
            onChange={(e) => setSlds(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Avg Price (USD)</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={avgPrice}
            onChange={(e) => setAvgPrice(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Revenue</span>
          <span className="font-mono">${totalRevenue.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-green-400">
          <span>Your Earnings (80%)</span>
          <span className="font-mono font-bold">${ownerEarnings.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Platform Fee (20%)</span>
          <span className="font-mono">${platformFee.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

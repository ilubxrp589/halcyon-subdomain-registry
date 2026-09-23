"use client";

import {
  DollarSign,
  TrendingUp,
  Calculator,
  Gem,
  Crown,
  Star,
  Tag,
  RefreshCw,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const tiers = [
  {
    name: "Ultra Premium",
    chars: "1 character",
    examples: ["a.example", "x.example", "7.example"],
    baseUSD: 500,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    badgeVariant: "default" as const,
    icon: Gem,
    description:
      "Single-character subdomains are the rarest and most valuable. With only 36 possible combinations (a-z, 0-9), these are highly collectible digital assets.",
  },
  {
    name: "Premium",
    chars: "2 characters",
    examples: ["ai.example", "go.example", "xy.example"],
    baseUSD: 100,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/30",
    badgeVariant: "default" as const,
    icon: Crown,
    description:
      "Two-character subdomains are short, memorable, and in high demand. With 1,296 possible combinations, they carry significant brand value.",
  },
  {
    name: "Standard Plus",
    chars: "3 characters",
    examples: ["app.example", "dev.example", "nft.example"],
    baseUSD: 25,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    badgeVariant: "secondary" as const,
    icon: Star,
    description:
      "Three-character subdomains strike a balance between scarcity and affordability. Popular choices include common abbreviations and acronyms.",
  },
  {
    name: "Standard",
    chars: "4+ characters",
    examples: ["hello.example", "wallet.example", "mysite.example"],
    baseUSD: 5,
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    badgeVariant: "secondary" as const,
    icon: Tag,
    description:
      "Standard subdomains are the most accessible tier. Full words, phrases, and brand names are available at an affordable price point.",
  },
];

const exampleCalculations = [
  {
    subdomain: "a.example",
    tier: "Ultra Premium",
    baseUSD: 500,
    flrPrice: 0.025,
    flrAmount: 20000,
  },
  {
    subdomain: "ai.example",
    tier: "Premium",
    baseUSD: 100,
    flrPrice: 0.025,
    flrAmount: 4000,
  },
  {
    subdomain: "dev.example",
    tier: "Standard Plus",
    baseUSD: 25,
    flrPrice: 0.025,
    flrAmount: 1000,
  },
  {
    subdomain: "wallet.example",
    tier: "Standard",
    baseUSD: 5,
    flrPrice: 0.025,
    flrAmount: 200,
  },
];

export default function PricingTiersPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Pricing Tiers</h1>
            <p className="text-muted-foreground">
              How subdomain pricing works on HSR
            </p>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          Halcyon uses a tiered pricing model based on subdomain character length.
          Shorter names are rarer and therefore more expensive. All prices are
          denominated in USD and converted to FLR at the time of purchase using
          the Flare Time Series Oracle (FTSO) price feed. Each TLD owner can
          customize pricing for their namespace — the tiers below show the
          default prices set by the platform.
        </p>
      </div>

      {/* Tier Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Tier Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <Card key={tier.name} className={`border ${tier.bgColor}`}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${tier.color}`} />
                      <h3 className="text-lg font-semibold">{tier.name}</h3>
                    </div>
                    <Badge variant={tier.badgeVariant}>{tier.chars}</Badge>
                  </div>
                  <p className="text-2xl font-bold">
                    ${tier.baseUSD}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      USD base price
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tier.description}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tier.examples.map((ex) => (
                      <Badge key={ex} variant="outline" className="font-mono text-xs">
                        {ex}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Why shorter names cost more */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Why Shorter Names Cost More</h2>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              The pricing model follows the same economic principles as
              traditional domain registrars and real-world scarcity:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Mathematical Scarcity</h4>
                <p className="text-sm text-muted-foreground">
                  Using alphanumeric characters (a-z, 0-9), 1-character
                  subdomains have only <strong>36</strong> possibilities,
                  2-character have <strong>1,296</strong>, 3-character have{" "}
                  <strong>46,656</strong>, while 4+ character subdomains have
                  effectively unlimited combinations.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Brand Value</h4>
                <p className="text-sm text-muted-foreground">
                  Short names are easier to remember, type, and share. They carry
                  inherent brand value and are frequently sought after by
                  companies, projects, and collectors.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Resale Potential</h4>
                <p className="text-sm text-muted-foreground">
                  Since HSR subdomains are ERC-721 NFTs, shorter names tend to
                  hold greater value due to their scarcity. As transferable tokens,
                  they can be traded on any ERC-721 compatible platform.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Anti-Squatting</h4>
                <p className="text-sm text-muted-foreground">
                  Higher prices for short names help prevent mass registration by
                  speculators, ensuring fair distribution of the most desirable
                  subdomains.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Example Calculations */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Example Calculations
        </h2>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              Assuming a FLR price of $0.025 USD at time of purchase:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4">Subdomain</th>
                    <th className="pb-3 pr-4">Tier</th>
                    <th className="pb-3 pr-4">Base Price (USD)</th>
                    <th className="pb-3 pr-4">FLR/USD Rate</th>
                    <th className="pb-3">FLR Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {exampleCalculations.map((calc) => (
                    <tr key={calc.subdomain} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono">{calc.subdomain}</td>
                      <td className="py-3 pr-4">{calc.tier}</td>
                      <td className="py-3 pr-4">${calc.baseUSD}</td>
                      <td className="py-3 pr-4">${calc.flrPrice}</td>
                      <td className="py-3 font-semibold">
                        {calc.flrAmount.toLocaleString()} FLR
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-secondary/50">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                The formula is: <strong>FLR Amount = Base USD Price / FLR Price in USD</strong>.
                Prices are fetched in real-time from the FTSO at the moment of purchase. The
                FLR amount you pay will vary depending on the current exchange rate.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* PriceOracle.sol */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          How the PriceOracle Works
        </h2>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              The <code className="text-sm bg-secondary/50 px-1.5 py-0.5 rounded">PriceOracle</code> contract
              (deployed at{" "}
              <code className="text-sm bg-secondary/50 px-1.5 py-0.5 rounded font-mono">
                0xfCf8c862933b23fbFE99a30EfFB8FF867a8e55A1
              </code>{" "}
              on Coston2) is responsible for converting USD-denominated tier
              prices into the correct FLR amount.
            </p>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-1">FTSO Integration</h4>
                <p className="text-sm text-muted-foreground">
                  The oracle reads the FLR/USD price from the Flare Time Series
                  Oracle (FTSO), a decentralized price feed native to the Flare
                  Network. This ensures accurate, manipulation-resistant pricing.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-1">getPrice(uint256 charLength)</h4>
                <p className="text-sm text-muted-foreground">
                  Returns the USD base price for a given character length. Maps
                  1 character to $500, 2 characters to $100, 3 characters to $25,
                  and 4+ characters to $5.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-1">
                  convertUSDtoFLR(uint256 usdAmount)
                </h4>
                <p className="text-sm text-muted-foreground">
                  Queries the FTSO for the latest FLR/USD exchange rate and
                  returns the equivalent amount in FLR (wei). This function is
                  called internally during subdomain purchases to determine the
                  exact payment amount.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-1">Price Staleness Protection</h4>
                <p className="text-sm text-muted-foreground">
                  The oracle includes a staleness check. If the FTSO price feed
                  has not been updated within a configurable threshold, the
                  transaction will revert to protect users from stale pricing
                  data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

"use client";

import {
  Search,
  Database,
  Link2,
  Ruler,
  Lightbulb,
  Layers,
  CheckCircle2,
  XCircle,
  Lock,
  AlertTriangle,
  Zap,
  DollarSign,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function DomainSearchPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Search className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Guides</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Domain Search</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Learn how to search for available Handshake subdomains on HSR, understand naming
          rules and restrictions, and use search tips to find the perfect domain at the
          right price.
        </p>
      </div>

      {/* How Search Works */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-400" />
          How Search Works
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          When you type a domain name into the HSR search bar, the platform performs a
          dual lookup to determine availability:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-blue-400" />
                <h4 className="text-white text-sm font-medium">Database Check</h4>
              </div>
              <p className="text-zinc-500 text-xs">
                HSR first queries its backend database for a fast initial lookup. This
                database is synchronized with the blockchain and contains all registered
                domains along with their metadata and pricing information.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="h-4 w-4 text-green-400" />
                <h4 className="text-white text-sm font-medium">Blockchain Verification</h4>
              </div>
              <p className="text-zinc-500 text-xs">
                The result is verified against the SubdomainNFT smart contract on Flare to
                ensure the database is accurate. The blockchain is the source of truth for
                all domain ownership.
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="text-zinc-500 text-sm">
          Search results appear in real-time as you type. The system checks availability
          for the specific TLD you selected (e.g., .cryptofans) and returns the name&apos;s
          status, price tier, and estimated cost in FLR.
        </p>
      </section>

      {/* Naming Rules */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Ruler className="h-5 w-5 text-amber-400" />
          Naming Rules & Restrictions
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Domain names must follow specific rules to be valid. These restrictions are
          enforced both by the frontend and the smart contract.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <h4 className="text-white text-sm font-medium">Validation Rules</h4>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                {
                  rule: "Character Set",
                  detail: "Lowercase letters (a-z), numbers (0-9), and hyphens (-)",
                  status: "required",
                },
                {
                  rule: "Length",
                  detail: "Minimum 1 character, maximum 63 characters",
                  status: "required",
                },
                {
                  rule: "Start / End Characters",
                  detail: "Must start and end with a letter or number (not a hyphen)",
                  status: "required",
                },
                {
                  rule: "No Consecutive Hyphens",
                  detail: "Cannot contain two hyphens in a row (e.g., my--name is invalid)",
                  status: "required",
                },
                {
                  rule: "Case Sensitivity",
                  detail: "Names are case-insensitive. 'Alice' and 'alice' are the same domain.",
                  status: "info",
                },
                {
                  rule: "Unicode / Emoji",
                  detail: "Not currently supported. Only ASCII characters are allowed.",
                  status: "info",
                },
              ].map((item) => (
                <div key={item.rule} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-white text-sm">{item.rule}</p>
                    <p className="text-zinc-500 text-xs">{item.detail}</p>
                  </div>
                  <Badge
                    variant={item.status === "required" ? "default" : "secondary"}
                    className="text-xs ml-3 flex-shrink-0"
                  >
                    {item.status === "required" ? "Required" : "Note"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Availability Statuses */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Availability Statuses
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          When you search for a domain, it will return one of three statuses:
        </p>
        <div className="space-y-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white text-sm font-medium">Available</h4>
                  <Badge variant="success" className="text-xs">Can Purchase</Badge>
                </div>
                <p className="text-zinc-500 text-xs">
                  The domain has not been registered. You can purchase it immediately at the
                  displayed price. The price is determined by the domain&apos;s length and
                  the current FLR/USD exchange rate from Flare&apos;s FTSO price oracle.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white text-sm font-medium">Taken</h4>
                  <Badge variant="destructive" className="text-xs">Registered</Badge>
                </div>
                <p className="text-zinc-500 text-xs">
                  The domain is already owned by another wallet. You cannot register this
                  domain unless the current owner transfers their NFT.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 flex items-start gap-3">
              <Lock className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white text-sm font-medium">Reserved</h4>
                  <Badge variant="warning" className="text-xs">Restricted</Badge>
                </div>
                <p className="text-zinc-500 text-xs">
                  Certain names are reserved by the platform and cannot be registered. This
                  includes common system names, offensive terms, and names reserved for
                  future use. Reserved names show a lock icon in search results.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Search Tips */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Search Tips
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Finding the right domain at a good price requires some strategy. Here are tips
          to help you search effectively:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <DollarSign className="h-4 w-4 text-green-400" />,
              title: "Shorter = More Expensive",
              desc: "1-2 character domains are Premium tier and cost significantly more. 3-5 characters are Standard, and 6+ are Budget tier. If you want a cheap domain, go longer.",
            },
            {
              icon: <Layers className="h-4 w-4 text-blue-400" />,
              title: "Try Different TLDs",
              desc: "If your desired name is taken under one TLD, it might be available under another. HSR will support multiple Handshake TLDs over time.",
            },
            {
              icon: <Zap className="h-4 w-4 text-yellow-400" />,
              title: "Use Numbers & Hyphens",
              desc: "Adding numbers or hyphens can help you find available names. For example, 'alice123' or 'my-project' if 'alice' or 'myproject' are taken.",
            },
            {
              icon: <Search className="h-4 w-4 text-amber-400" />,
              title: "Act Fast on Short Names",
              desc: "Short premium names are limited in supply. If you find an available 1-3 character name you like, consider registering it before someone else does.",
            },
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
      </section>

      {/* Price Estimation */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-amber-400" />
          Price Estimation in Search Results
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Search results display the estimated price for each available domain in FLR
          tokens. Prices are calculated using the PriceOracle contract, which consults
          Flare&apos;s FTSO for the current FLR/USD rate.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <h4 className="text-white text-sm font-medium">Pricing Tiers</h4>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { tier: "Premium", length: "1-2 characters", price: "~$50 in FLR", color: "text-yellow-400" },
                { tier: "Standard", length: "3-5 characters", price: "~$10 in FLR", color: "text-blue-400" },
                { tier: "Budget", length: "6+ characters", price: "~$2 in FLR", color: "text-green-400" },
              ].map((row) => (
                <div key={row.tier} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${row.color}`}>{row.tier}</span>
                    <span className="text-zinc-500 text-xs">{row.length}</span>
                  </div>
                  <span className="text-white text-sm">{row.price}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <p className="text-zinc-500 text-sm">
          Prices shown in search are estimates. The exact amount in FLR may vary slightly
          at the time of purchase due to FLR price fluctuations. The contract uses the
          latest FTSO price at transaction time.
        </p>
      </section>

      {/* Tip */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Pro Tip
          </h3>
          <p className="text-zinc-400 text-sm">
            If FLR price drops, domains cost more FLR (since prices are pegged to USD). If
            FLR pumps, domains become cheaper in FLR terms. Keep an eye on FLR price if
            you&apos;re trying to time your purchases for the best value.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

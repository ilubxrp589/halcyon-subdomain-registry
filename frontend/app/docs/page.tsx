"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Key, Globe, Coins, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DocsOverviewPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">Documentation</Badge>
        <h1 className="text-4xl font-bold mb-4">Halcyon Subdomain Registry</h1>
        <p className="text-xl text-muted-foreground">
          A decentralized marketplace where you can buy and own subdomains as NFTs
        </p>
      </div>

      {/* What's a TLD / Subdomain */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Wait, What&apos;s a TLD? What&apos;s a Subdomain?</h2>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardContent className="pt-6">
              <Building2 className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-bold text-lg mb-2">TLDs are Like Big Buildings</h3>
              <p className="text-muted-foreground mb-4">
                You know how websites end with things like <code>.com</code>, <code>.org</code>, or <code>.net</code>?
                Those are called TLDs (Top-Level Domains). Think of each one as a massive skyscraper in a city.
              </p>
              <ul className="space-y-1 text-sm">
                <li><code>.com</code> → The giant business tower</li>
                <li><code>.org</code> → The nonprofit community center</li>
                <li><code>.cryptofans</code> → A new HNS building anyone can own!</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Key className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-bold text-lg mb-2">Subdomains are Like Rooms</h3>
              <p className="text-muted-foreground mb-4">
                If someone owns the <code>.cryptofans</code> building (TLD), they can rent out rooms inside it.
                These &quot;rooms&quot; are called subdomains.
              </p>
              <p className="text-sm">
                So if you wanted <code>john.cryptofans</code>, that&apos;s like renting Room &quot;john&quot; inside
                the <code>.cryptofans</code> building.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ASCII Diagram */}
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`          THE INTERNET (The City)
                  |
    --------------------------------
    |       |        |       |
  .com    .org   .cryptofans  .gaming
  (old)   (old)    (HNS)      (HNS)
                     |
         -------------------------
         |      |       |       |
       john   alice   store   blog
         |
    "john.cryptofans" - Your Room!`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* What Does HSR Do */}
      <section>
        <h2 className="text-2xl font-bold mb-4">So What Does HSR Do?</h2>
        <p className="text-muted-foreground mb-6">
          Halcyon Subdomain Registry is a marketplace that lets you:
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: Globe, title: "Browse", desc: "See available subdomains on TLDs we manage" },
            { icon: Coins, title: "Buy", desc: "Pay with FLR (Flare Network cryptocurrency)" },
            { icon: Key, title: "Own", desc: "Receive proof of ownership as an NFT" },
            { icon: Building2, title: "Use", desc: "Point your subdomain wherever you want" },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="pt-6 text-center">
                <item.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h4 className="font-bold">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Why NFT */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Why an NFT?</h2>
        <p className="text-muted-foreground mb-4">
          When you buy a subdomain through HSR, you get an NFT (Non-Fungible Token) that proves you own it:
        </p>
        <ul className="space-y-2 mb-6">
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span><strong>You actually own it</strong> - Not just &quot;renting&quot; from a company</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span><strong>You can sell it</strong> - Transfer ownership to someone else</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span><strong>It&apos;s on the blockchain</strong> - Nobody can take it away from you</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span><strong>It&apos;s verifiable</strong> - Anyone can confirm you&apos;re the real owner</span>
          </li>
        </ul>
      </section>

      {/* How It Works Simple */}
      <section>
        <h2 className="text-2xl font-bold mb-4">How It Works (Simple Version)</h2>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`   YOU                    HSR                    BLOCKCHAIN
    |                      |                         |
    |  "I want john.xyz"   |                         |
    |--------------------->|                         |
    |                      |                         |
    |  "That'll be 5 FLR"  |                         |
    |<---------------------|                         |
    |                      |                         |
    |  *sends payment*     |                         |
    |--------------------->|------------------------>|
    |                      |    *creates NFT*        |
    |                      |                         |
    |  *receives NFT*      |                         |
    |<---------------------------------------------|
    |                      |                         |
    |  "You now own        |                         |
    |   john.xyz!"         |                         |`}
            </pre>
          </CardContent>
        </Card>

        <ol className="mt-6 space-y-2">
          <li><strong>1.</strong> You pick a subdomain - Search for what&apos;s available</li>
          <li><strong>2.</strong> You pay with crypto - Payment goes into secure escrow</li>
          <li><strong>3.</strong> We set up DNS - Your subdomain starts working</li>
          <li><strong>4.</strong> You get your NFT - Proof of ownership in your wallet</li>
          <li><strong>5.</strong> You&apos;re the owner - Manage DNS, point it wherever</li>
        </ol>
      </section>

      {/* Current TLDs */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Current TLDs We Manage</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">TLD</th>
                <th className="text-left py-2">Description</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2"><code>.cryptofans</code></td>
                <td className="py-2 text-muted-foreground">For the crypto community</td>
                <td className="py-2"><Badge variant="default">Active</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground mt-2">More TLDs coming soon!</p>
      </section>

      {/* Glossary */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Quick Glossary</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Term</th>
                <th className="text-left py-2">Simple Explanation</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["TLD", "The ending of a website (.com, .cryptofans) - like a building"],
                ["Subdomain", "The part before the TLD (john.cryptofans) - like a room"],
                ["NFT", "A digital deed proving you own something"],
                ["Blockchain", "A public ledger that keeps track of who owns what"],
                ["DNS", "The internet's phone book - converts names to addresses"],
                ["Handshake (HNS)", "A system that lets people own their own TLDs"],
                ["Flare Network", "The blockchain where your NFT lives"],
                ["FLR", "The cryptocurrency used to buy subdomains"],
                ["Escrow", "A holding account that keeps payment safe until setup is complete"],
              ].map(([term, desc]) => (
                <tr key={term} className="border-b">
                  <td className="py-2 font-medium">{term}</td>
                  <td className="py-2 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="pt-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ready to get started?</h3>
                <p className="text-muted-foreground">Learn how to buy your first subdomain NFT</p>
              </div>
              <Link
                href="/docs/getting-started"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Getting Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

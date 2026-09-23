"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { wikiCategories } from "@/lib/wiki";
import Link from "next/link";
import { ArrowRight, Building2, Key, Globe, Coins } from "lucide-react";

export default function WikiHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-4">Knowledge Base</Badge>
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
                <li><code>.com</code> &rarr; The giant business tower</li>
                <li><code>.org</code> &rarr; The nonprofit community center</li>
                <li><code>.cryptofans</code> &rarr; A new HNS building anyone can own!</li>
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
            { icon: Building2, title: "Use", desc: "Customize with AI-generated artwork" },
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

      {/* Quick Glossary */}
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
                ["Handshake (HNS)", "A system that lets people own their own TLDs"],
                ["Flare Network", "The blockchain where your NFT lives"],
                ["FLR", "The cryptocurrency used to buy subdomains"],
                ["Escrow", "A holding account that keeps payment safe until your NFT is minted"],
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

      {/* Category Cards */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Explore the Wiki</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wikiCategories.map((cat) => (
            <Link key={cat.id} href={`/wiki/${cat.id}`}>
              <Card className="h-full hover:bg-secondary/30 transition-colors group cursor-pointer">
                <CardContent className="pt-6">
                  <cat.icon className="h-8 w-8 text-primary mb-3" />
                  <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                    {cat.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">{cat.description}</p>
                  <div className="flex items-center gap-1 text-sm text-primary">
                    {cat.pages.length} articles
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
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
                href="/wiki/getting-started/buy-first-domain"
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

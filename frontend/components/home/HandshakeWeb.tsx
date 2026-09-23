"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HnsDomainCard } from "@/components/indexer/HnsDomainCard";
import { TldMatchProvider } from "@/components/indexer/TldMatchProvider";
import { Globe, ArrowRight, Search } from "lucide-react";
import {
  getIndexerStats,
  getIndexedDomains,
  type IndexedDomain,
  type IndexerStats,
} from "@/services/indexer";

export function HandshakeWeb() {
  const router = useRouter();
  const [stats, setStats] = useState<IndexerStats | null>(null);
  const [featured, setFeatured] = useState<IndexedDomain[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getIndexerStats().then(setStats).catch(() => {});
    getIndexedDomains({ classification: "real", limit: 4, sort: "name" })
      .then((res) => setFeatured(res.data))
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/explore?tab=handshake-web&q=${encodeURIComponent(q)}`);
    } else {
      router.push("/explore?tab=handshake-web");
    }
  };

  const aliveCount = stats ? parseInt(stats.domains.alive).toLocaleString() : "35,000+";

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Globe className="w-5 h-5 text-amber-400" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">
          Explore the Handshake Web
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Discover {aliveCount} live domains on the decentralized internet.
          Browse, search, and register subdomains.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Handshake domains..."
          className="pl-9 pr-24 bg-muted/20 border-border/40"
        />
        <Button
          type="submit"
          size="sm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-amber-500 hover:bg-amber-600 text-black h-7"
        >
          Search
        </Button>
      </form>

      {/* Featured domain cards */}
      {featured.length > 0 && (
        <TldMatchProvider>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((domain) => (
              <HnsDomainCard key={domain.id} domain={domain} />
            ))}
          </div>
        </TldMatchProvider>
      )}

      {/* CTA */}
      <div className="text-center">
        <Link href="/explore?tab=handshake-web">
          <Button
            variant="outline"
            size="lg"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2"
          >
            Browse All Domains
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

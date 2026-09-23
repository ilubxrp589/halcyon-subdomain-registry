import {
  Rocket,
  BookOpen,
  Lightbulb,
  Code2,
  HelpCircle,
  Wallet,
  ShoppingCart,
  Search,
  Palette,
  Globe,
  Settings,
  Cog,
  Network,
  Coins,
  Layers,
  FileCode,
  Terminal,
  AlertCircle,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

export interface WikiPage {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
}

export interface WikiCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  pages: WikiPage[];
}

export const wikiCategories: WikiCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Set up your wallet and buy your first domain",
    icon: Rocket,
    pages: [
      {
        slug: "wallet-setup",
        title: "Wallet Setup",
        description: "How to connect and configure your wallet",
        keywords: ["wallet", "metamask", "connect", "setup", "flare"],
      },
      {
        slug: "buy-first-domain",
        title: "Buy Your First Domain",
        description: "Step-by-step guide to purchasing a subdomain NFT",
        keywords: ["buy", "purchase", "register", "domain", "subdomain", "first"],
      },
      {
        slug: "nft-basics",
        title: "NFT Basics",
        description: "What your domain NFT means and how to use it",
        keywords: ["nft", "ownership", "token", "erc-721", "basics"],
      },
    ],
  },
  {
    id: "guides",
    title: "Guides",
    description: "Step-by-step guides for common tasks",
    icon: BookOpen,
    pages: [
      {
        slug: "domain-search",
        title: "Domain Search",
        description: "Search tips, filters, and availability checks",
        keywords: ["search", "find", "availability", "filter", "tips"],
      },
      {
        slug: "domain-management",
        title: "Domain Management",
        description: "Dashboard overview, URL forwarding, and notifications",
        keywords: ["dashboard", "manage", "domains", "forwarding", "notifications"],
      },
      {
        slug: "nft-customization",
        title: "NFT Customization",
        description: "AI-generated artwork for your subdomain NFT (In Testing)",
        keywords: ["nft", "customize", "style", "prompt", "image", "art", "ai"],
      },
      {
        slug: "marketplace",
        title: "Marketplace",
        description: "How the TLD marketplace works for buyers and stakers",
        keywords: ["marketplace", "buy", "sell", "list", "trade", "tld", "staker", "browse"],
      },
    ],
  },
  {
    id: "concepts",
    title: "Concepts",
    description: "Understand the technology behind HSR",
    icon: Lightbulb,
    pages: [
      {
        slug: "how-it-works",
        title: "How It Works",
        description: "Technical deep dive into the HSR architecture",
        keywords: ["architecture", "technical", "how", "works", "system", "escrow"],
      },
      {
        slug: "handshake-names",
        title: "Handshake Names",
        description: "What is Handshake and how TLDs work",
        keywords: ["handshake", "hns", "tld", "top-level", "domain", "decentralized"],
      },
      {
        slug: "flare-network",
        title: "Flare Network",
        description: "Flare, FLR tokens, and FTSO basics",
        keywords: ["flare", "flr", "ftso", "blockchain", "network", "token"],
      },
      {
        slug: "pricing-tiers",
        title: "Pricing Tiers",
        description: "Tier breakdown, examples, and pricing logic",
        keywords: ["pricing", "tier", "cost", "price", "premium", "standard"],
      },
      {
        slug: "tld-staking",
        title: "TLD Staking (V2)",
        description: "Two-phase TLD onboarding with FDC-verified ownership and 13 smart contracts",
        keywords: ["tld", "staking", "fdc", "claim", "v2", "foundry", "keeper", "attestation", "handshake"],
      },
      {
        slug: "fee-structure",
        title: "Fee Structure",
        description: "Platform fees for official and community TLDs",
        keywords: ["fee", "revenue", "split", "official", "community", "platform", "earnings", "withdraw"],
      },
      {
        slug: "community-rewards",
        title: "Community Rewards",
        description: "FTSO delegation rewards for domain holders (Coming Soon)",
        keywords: ["ftso", "rewards", "community", "delegation", "coming soon"],
      },
    ],
  },
  {
    id: "developers",
    title: "Developers",
    description: "API reference and technical documentation",
    icon: Code2,
    pages: [
      {
        slug: "api",
        title: "API Reference",
        description: "REST API endpoints and authentication",
        keywords: ["api", "rest", "endpoint", "auth", "developer", "integration"],
      },
      {
        slug: "architecture",
        title: "Architecture",
        description: "System design, diagrams, and deployment",
        keywords: ["architecture", "diagram", "system", "deployment", "mermaid"],
      },
      {
        slug: "smart-contracts",
        title: "Smart Contracts",
        description: "Contract addresses, ABIs, and integration",
        keywords: ["contract", "solidity", "abi", "address", "blockchain", "erc-721"],
      },
      {
        slug: "hns-indexer",
        title: "HNS Indexer",
        description: "Handshake blockchain domain indexer — pipeline, API, and classification",
        keywords: ["hns", "handshake", "indexer", "scan", "dns", "pipeline", "search", "classification", "parking", "domains"],
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Common problems and frequently asked questions",
    icon: HelpCircle,
    pages: [
      {
        slug: "common-issues",
        title: "Common Issues",
        description: "Common problems and their solutions",
        keywords: ["error", "problem", "fix", "issue", "troubleshoot", "debug"],
      },
      {
        slug: "faq",
        title: "FAQ",
        description: "Frequently asked questions about HSR",
        keywords: ["faq", "question", "answer", "help", "support"],
      },
    ],
  },
];

// Flatten all pages with category info
export interface FlatWikiPage extends WikiPage {
  categoryId: string;
  categoryTitle: string;
  href: string;
}

export function getAllPages(): FlatWikiPage[] {
  const pages: FlatWikiPage[] = [];
  for (const cat of wikiCategories) {
    for (const page of cat.pages) {
      pages.push({
        ...page,
        categoryId: cat.id,
        categoryTitle: cat.title,
        href: `/wiki/${cat.id}/${page.slug}`,
      });
    }
  }
  return pages;
}

export function searchPages(query: string): FlatWikiPage[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return getAllPages().filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.keywords.some((k) => k.includes(q))
  );
}

export function getPageBySlug(
  categoryId: string,
  slug: string
): { page: WikiPage; category: WikiCategory } | null {
  const category = wikiCategories.find((c) => c.id === categoryId);
  if (!category) return null;
  const page = category.pages.find((p) => p.slug === slug);
  if (!page) return null;
  return { page, category };
}

export function getPrevNextPages(
  categoryId: string,
  slug: string
): { prev: FlatWikiPage | null; next: FlatWikiPage | null } {
  const all = getAllPages();
  const idx = all.findIndex(
    (p) => p.categoryId === categoryId && p.slug === slug
  );
  return {
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
  };
}

export function getBreadcrumbs(
  categoryId: string,
  slug?: string
): { label: string; href: string }[] {
  const crumbs = [{ label: "Wiki", href: "/wiki" }];
  const category = wikiCategories.find((c) => c.id === categoryId);
  if (category) {
    crumbs.push({ label: category.title, href: `/wiki/${category.id}` });
    if (slug) {
      const page = category.pages.find((p) => p.slug === slug);
      if (page) {
        crumbs.push({
          label: page.title,
          href: `/wiki/${category.id}/${slug}`,
        });
      }
    }
  }
  return crumbs;
}

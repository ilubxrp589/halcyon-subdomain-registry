"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getPageBySlug } from "@/lib/wiki";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";

const contentMap: Record<string, Record<string, ReturnType<typeof dynamic>>> = {
  "getting-started": {
    "wallet-setup": dynamic(() => import("@/components/wiki/content/getting-started/wallet-setup")),
    "buy-first-domain": dynamic(() => import("@/components/wiki/content/getting-started/buy-first-domain")),
    "nft-basics": dynamic(() => import("@/components/wiki/content/getting-started/nft-basics")),
  },
  guides: {
    "domain-search": dynamic(() => import("@/components/wiki/content/guides/domain-search")),
    "nft-customization": dynamic(() => import("@/components/wiki/content/guides/nft-customization")),
    marketplace: dynamic(() => import("@/components/wiki/content/guides/marketplace")),
    "domain-management": dynamic(() => import("@/components/wiki/content/guides/domain-management")),
  },
  concepts: {
    "how-it-works": dynamic(() => import("@/components/wiki/content/concepts/how-it-works")),
    "handshake-names": dynamic(() => import("@/components/wiki/content/concepts/handshake-names")),
    "flare-network": dynamic(() => import("@/components/wiki/content/concepts/flare-network")),
    "pricing-tiers": dynamic(() => import("@/components/wiki/content/concepts/pricing-tiers")),
    "tld-staking": dynamic(() => import("@/components/wiki/content/concepts/tld-staking")),
    "fee-structure": dynamic(() => import("@/components/wiki/content/concepts/fee-structure")),
    "community-rewards": dynamic(() => import("@/components/wiki/content/concepts/community-rewards")),
  },
  developers: {
    api: dynamic(() => import("@/components/wiki/content/developers/api")),
    architecture: dynamic(() => import("@/components/wiki/content/developers/architecture")),
    "smart-contracts": dynamic(() => import("@/components/wiki/content/developers/smart-contracts")),
    "hns-indexer": dynamic(() => import("@/components/wiki/content/developers/hns-indexer")),
  },
  troubleshooting: {
    "common-issues": dynamic(() => import("@/components/wiki/content/troubleshooting/common-issues")),
    faq: dynamic(() => import("@/components/wiki/content/troubleshooting/faq")),
  },
};

export default function WikiArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = use(params);
  const result = getPageBySlug(category, slug);
  if (!result) notFound();

  const Content = contentMap[category]?.[slug];
  if (!Content) notFound();

  return (
    <WikiPageShell categoryId={category} slug={slug}>
      <Content />
    </WikiPageShell>
  );
}

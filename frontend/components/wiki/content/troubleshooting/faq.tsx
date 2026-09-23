"use client";

import { useState } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface FAQItem {
  question: string;
  answer: string;
  tags: string[];
}

const faqs: FAQItem[] = [
  {
    question: "What is Halcyon?",
    answer:
      "Halcyon is a decentralized domain marketplace built on Flare Network. Anyone can stake a Handshake TLD and sell subdomains as ERC-721 NFTs. Buyers register domains (like alice.cryptofans), get AI-generated NFT artwork, and own their name on-chain. TLD owners earn revenue from every registration under their namespace.",
    tags: ["general", "basics"],
  },
  {
    question: "What blockchain does HSR run on?",
    answer:
      "HSR is deployed on the Flare Network, currently operating on the Coston2 testnet (Chain ID 114). Flare was chosen for its native FTSO (Flare Time Series Oracle) which provides decentralized price feeds for USD-to-FLR conversion, and its EVM compatibility which allows standard Solidity smart contracts and familiar wallet tooling.",
    tags: ["general", "blockchain"],
  },
  {
    question: "How much do subdomains cost?",
    answer:
      "Subdomain pricing is tiered by character length. Shorter names are more valuable and cost more, while longer names are more affordable. All prices are denominated in USD and converted to FLR at the current exchange rate via the Flare FTSO price oracle at the time of purchase. Visit the pricing page for current tier details.",
    tags: ["pricing"],
  },
  {
    question: "How long does a subdomain purchase take?",
    answer:
      "The purchase process is straightforward. You submit a transaction that sends FLR to the escrow contract, and once confirmed your NFT is minted. On the Coston2 testnet, transactions typically confirm within a few seconds. The full process usually takes under a minute.",
    tags: ["purchasing"],
  },
  {
    question: "Can I sell my subdomain after purchasing it?",
    answer:
      "A secondary NFT marketplace is planned but not yet available. Since Halcyon subdomains are standard ERC-721 NFTs, you can transfer or sell them on any EVM-compatible NFT marketplace that supports the Flare network.",
    tags: ["nft", "selling"],
  },
  {
    question: "What does it cost to stake a TLD?",
    answer:
      "The staking fee is $10 USD (converted to FLR at the current FTSO exchange rate). This one-time fee covers FDC attestation verification of your Handshake TLD ownership. If the stake is not completed within 14 days, the fee is refundable.",
    tags: ["staking", "pricing"],
  },
  {
    question: "What percentage do TLD owners keep from registrations?",
    answer:
      "Community TLD owners keep 80% of every subdomain registration. The remaining 20% is the platform fee, which covers AI artwork generation (GPU compute), DNS infrastructure, and platform maintenance. Official (operator) TLDs have a reduced 5% platform fee since the operator covers their own infrastructure costs.",
    tags: ["staking", "revenue"],
  },
  {
    question: "Do community TLDs get AI-generated artwork?",
    answer:
      "Yes. AI-generated NFT artwork is included for all TLDs on the platform — both official and community. The 20% platform fee for community TLDs covers the GPU compute cost of generating unique artwork for each subdomain registration.",
    tags: ["staking", "nft"],
  },
  {
    question: "What is the difference between official and community TLDs?",
    answer:
      "Official TLDs are operated by the Halcyon platform (the ~300 Handshake TLDs owned by the operator). Community TLDs are staked by independent Handshake TLD owners. Both types work identically for buyers — the only difference is the platform fee (5% for official, 20% for community) and the badge displayed on the TLD listing.",
    tags: ["staking", "general"],
  },
  {
    question: "What happens if my purchase fails?",
    answer:
      "If the purchase fails for any reason, the escrow contract automatically refunds your FLR payment. No NFT is minted if the purchase does not succeed. Your funds are never lost — the escrow system ensures you only pay for subdomains that are successfully registered.",
    tags: ["purchasing", "escrow"],
  },
  {
    question: "Is HSR available on mainnet yet?",
    answer:
      "HSR is currently deployed on the Flare Coston2 testnet only. This means all transactions use test FLR (C2FLR) which has no real monetary value. A mainnet launch on Flare is planned but has not been announced. You can use the testnet version to explore the full functionality — register subdomains, customize NFT artwork, and set up URL forwarding.",
    tags: ["general", "network"],
  },
  {
    question: "What wallets are supported?",
    answer:
      "HSR supports any EVM-compatible wallet. The recommended wallet for Flare is Bifrost, which has native Flare support. Other supported options include any wallet compatible with WalletConnect v2. You need to add the Coston2 testnet to your wallet: RPC URL https://coston2-api.flare.network/ext/C/rpc, Chain ID 114, Symbol C2FLR.",
    tags: ["wallets", "getting-started"],
  },
  {
    question: "How are the NFT images generated?",
    answer:
      "HSR subdomain NFTs will feature AI-generated artwork. Users select a theme and prompt, and the image is generated by a distributed GPU cluster then uploaded to IPFS for permanent storage. This feature is currently in testing. In the meantime, NFTs are minted with on-chain SVG artwork generated at mint time.",
    tags: ["nft", "technical"],
  },
  {
    question: "Can I set up URL forwarding for my subdomain?",
    answer:
      "Yes. HSR supports URL forwarding for your subdomains, allowing you to redirect visitors to any URL. You can configure forwarding through the HSR dashboard under the domain management page, choosing from permanent (301) or temporary (302, 307, 308) redirect types.",
    tags: ["domains", "technical"],
  },
  {
    question: "What is the escrow system and why is it needed?",
    answer:
      "The escrow system protects buyers during the purchase process. When you purchase a subdomain, your FLR is held by the escrow contract until the NFT is successfully minted. Once minting completes, funds are released to the platform. If the purchase fails for any reason, your FLR is automatically refunded. This ensures you only pay for subdomains that are successfully registered.",
    tags: ["escrow", "technical"],
  },
  {
    question: "Do subdomains expire?",
    answer:
      "Yes. Subdomains are registered for 1-10 years and can be renewed. The renewal price is locked at the per-year rate from when you originally registered, so prices won't increase on you. There is a 30-day grace period after expiry before the domain becomes available for re-registration by someone else. You can renew any time from your dashboard.",
    tags: ["ownership", "renewal"],
  },
  {
    question: "Can I transfer my subdomain to another wallet?",
    answer:
      "Yes. HSR subdomains are standard ERC-721 NFTs, so you can transfer them using any method that supports ERC-721 transfers — through your wallet directly or any compatible NFT platform.",
    tags: ["nft", "transfers"],
  },
  {
    question: "What is Handshake and how does it relate to HSR?",
    answer:
      "Handshake (HNS) is a decentralized naming protocol that provides an alternative to ICANN for top-level domain registration. Handshake TLD owners can create subdomains under their names. HSR acts as a marketplace layer that allows Handshake TLD owners to sell subdomains as NFTs on the Flare blockchain. The subdomain registration happens on the Handshake network, while ownership and trading are managed through Flare smart contracts.",
    tags: ["general", "handshake"],
  },
  {
    question: "How does the FTSO price oracle work?",
    answer:
      "The Flare Time Series Oracle (FTSO) is a decentralized price feed native to the Flare Network. Independent data providers submit price observations, and the protocol aggregates them into a reliable median price. HSR uses the FTSO FLR/USD price to convert tier prices from USD to FLR, ensuring pricing is accurate, decentralized, and resistant to manipulation.",
    tags: ["pricing", "technical"],
  },
  {
    question: "What characters are allowed in subdomain names?",
    answer:
      "Subdomain names follow standard DNS naming rules: lowercase letters (a-z), digits (0-9), and hyphens (-). Names cannot start or end with a hyphen. The minimum length is 1 character. All names are normalized to lowercase before registration.",
    tags: ["domains", "rules"],
  },
  {
    question:
      "Can I register the same subdomain under different parent domains?",
    answer:
      "Yes. Subdomains are scoped to their parent domain. For example, \"wallet.example\" and \"wallet.otherdomain\" are completely separate registrations with separate NFTs. Each parent domain has its own namespace, and availability depends on what has already been registered under that specific parent.",
    tags: ["domains"],
  },
  {
    question: "How do I get testnet FLR to try HSR?",
    answer:
      "You can obtain free Coston2 testnet FLR (C2FLR) from the official Flare faucet at faucet.flare.network. Connect your wallet, select the Coston2 network, and request tokens. The faucet typically provides enough C2FLR to purchase several subdomains and cover gas fees for testing.",
    tags: ["getting-started", "testnet"],
  },
  {
    question: "What is the Community Treasury?",
    answer:
      "The Community Treasury is a planned feature that will receive a portion of domain registration revenue. These funds will be delegated to FTSO providers to earn staking rewards, which will be distributed back to NFT holders. This feature is not yet active.",
    tags: ["community", "coming-soon"],
  },
  {
    question: "How do I withdraw my TLD earnings?",
    answer:
      "TLD owners accumulate pending revenue in the PaymentManager contract as subdomains are registered under their TLD. You can withdraw your earnings at any time from the Dashboard (My TLDs tab) by clicking the Withdraw button. The withdrawal is an on-chain transaction that sends your accumulated FLR to your wallet.",
    tags: ["staking", "revenue"],
  },
  {
    question: "Can I set custom pricing for my TLD?",
    answer:
      "Yes. TLD owners can customize length-based pricing (different prices for 1-char, 2-char, 3-char names, etc.), set premium names with custom prices, reserve specific names for certain wallets, and configure multi-year registration discounts. Pricing is managed through the TLD management page at /tld/[your-tld].",
    tags: ["staking", "pricing"],
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(filter.toLowerCase()) ||
      faq.answer.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <HelpCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">
              Frequently Asked Questions
            </h1>
            <p className="text-muted-foreground">
              Answers to common questions about HSR
            </p>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          Find answers to the most frequently asked questions about the
          Halcyon Subdomain Registry, including pricing, ownership,
          technical details, and getting started.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search questions..."
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOpenIndex(null);
          }}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* FAQ count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredFaqs.length} of {faqs.length} questions
      </p>

      {/* FAQ Items */}
      <div className="space-y-3">
        {filteredFaqs.map((faq, index) => {
          const realIndex = faqs.indexOf(faq);
          const isOpen = openIndex === realIndex;

          return (
            <Card key={realIndex}>
              <CardContent className="p-0">
                <button
                  onClick={() => toggle(realIndex)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-secondary/30 transition-colors rounded-lg"
                >
                  {isOpen ? (
                    <ChevronDown className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                  ) : (
                    <ChevronRight className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">
                    {faq.question}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pl-12 space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {faq.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredFaqs.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              No questions match your search. Try different keywords.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

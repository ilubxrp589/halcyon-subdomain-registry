"use client";

import {
  FileCode2,
  Shield,
  ShoppingCart,
  DollarSign,
  ExternalLink,
  Zap,
  ArrowRight,
  Coins,
  CheckCircle2,
  Database,
  Users,
  Layers,
  Lock,
  Settings,
  Tag,
  Network,
  Workflow,
  Scale,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeBlock } from "@/components/wiki/CodeBlock";

/* ─── Contract Registry ────────────────────────────────────────── */

const EXPLORER = "https://coston2-explorer.flare.network/address";

interface ContractFunction {
  signature: string;
  description: string;
  access: string;
}

interface ContractInfo {
  name: string;
  address: string;
  icon: typeof FileCode2;
  color: string;
  borderColor: string;
  bgGrad: string;
  description: string;
  functions: ContractFunction[];
}

/* ─── V1 Legacy Contracts ──────────────────────────────────── */

const v1Contracts: ContractInfo[] = [
  {
    name: "SubdomainNFT",
    address: "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38",
    icon: FileCode2,
    color: "text-blue-400",
    borderColor: "border-blue-500/20",
    bgGrad: "from-blue-500/10 to-blue-600/5",
    description:
      "Core ERC-721 contract representing subdomain ownership as NFTs. Each token maps to a unique Handshake subdomain and stores metadata including the parent domain, label, tier, and a dynamically generated on-chain SVG image.",
    functions: [
      {
        signature: "tokenURI(uint256 tokenId) view returns (string)",
        description:
          "Returns the fully on-chain metadata URI for a token, including subdomain name, parent domain, tier, and a base64-encoded SVG image.",
        access: "View",
      },
      {
        signature:
          "subdomainOf(uint256 tokenId) view returns (string, string)",
        description:
          "Returns the subdomain label and parent domain for a given token ID.",
        access: "View",
      },
      {
        signature: "ownerOf(uint256 tokenId) view returns (address)",
        description:
          "Standard ERC-721 function returning the current owner of a token.",
        access: "View",
      },
      {
        signature: "approve(address to, uint256 tokenId)",
        description:
          "Approves another address to transfer a specific token.",
        access: "Token Owner",
      },
    ],
  },
  {
    name: "SubdomainEscrow",
    address: "0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b",
    icon: Shield,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/20",
    bgGrad: "from-emerald-500/10 to-emerald-600/5",
    description:
      "Manages the purchase flow for subdomains. Users pay FLR into escrow, the NFT is minted, and funds are released to the platform. If the purchase fails, funds are automatically refunded.",
    functions: [
      {
        signature:
          "purchaseSubdomain(string subdomain, string parentDomain) payable",
        description:
          "Initiates a subdomain purchase. Accepts FLR payment based on the current PriceOracle rate and locks funds in escrow until the NFT is minted.",
        access: "Payable",
      },
      {
        signature:
          "getEscrow(uint256 escrowId) view returns (EscrowDetails)",
        description:
          "Returns the details of an escrow record including buyer, subdomain, amount, status, and timestamps.",
        access: "View",
      },
    ],
  },
  {
    name: "PriceOracle",
    address: "0x55b92A8C367d408F028914BFCd48D1D4d16960b0",
    icon: DollarSign,
    color: "text-orange-400",
    borderColor: "border-orange-500/20",
    bgGrad: "from-orange-500/10 to-orange-600/5",
    description:
      "Provides USD to FLR price conversion using the Flare Time Series Oracle (FTSO). Contains tiered pricing logic based on subdomain character length and ensures accurate exchange rates for purchases.",
    functions: [
      {
        signature:
          "getPrice(uint256 charLength) view returns (uint256)",
        description:
          "Returns the USD base price in cents for a subdomain of the given character length. Shorter names are priced higher.",
        access: "View",
      },
      {
        signature:
          "getPriceInFLR(uint256 charLength) view returns (uint256)",
        description:
          "Returns the FLR price in wei for a given character length. Combines the base USD price with the current FTSO exchange rate.",
        access: "View",
      },
      {
        signature:
          "convertUSDtoFLR(uint256 usdAmount) view returns (uint256)",
        description:
          "Converts a USD amount in cents to the equivalent FLR in wei using the latest FTSO price feed.",
        access: "View",
      },
    ],
  },
  {
    name: "SubdomainMarketplace",
    address: "0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92",
    icon: ShoppingCart,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/20",
    bgGrad: "from-yellow-500/10 to-yellow-600/5",
    description:
      "Peer-to-peer marketplace for trading subdomain NFTs (Coming Soon). Sellers will list tokens at a fixed FLR price, and buyers can purchase directly.",
    functions: [
      {
        signature: "createListing(uint256 tokenId, uint256 price)",
        description:
          "Lists a subdomain NFT for sale at a specified FLR price. The seller must first approve this contract via SubdomainNFT.approve().",
        access: "Token Owner",
      },
      {
        signature: "buy(uint256 listingId) payable",
        description:
          "Purchases a listed subdomain NFT. Transfers FLR to the seller and the NFT to the buyer.",
        access: "Payable",
      },
      {
        signature: "cancelListing(uint256 listingId)",
        description:
          "Cancels an active marketplace listing. Only the original seller can cancel.",
        access: "Seller",
      },
      {
        signature:
          "getListing(uint256 listingId) view returns (Listing)",
        description:
          "Returns listing details including token ID, seller, price, and active status.",
        access: "View",
      },
    ],
  },
  {
    name: "CommunityTreasury",
    address: "0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD",
    icon: Users,
    color: "text-pink-400",
    borderColor: "border-pink-500/20",
    bgGrad: "from-pink-500/10 to-pink-600/5",
    description:
      "Community treasury contract (Coming Soon). Will receive a portion of domain registration revenue, delegate to FTSO providers for staking rewards, and distribute community rewards to NFT holders.",
    functions: [],
  },
];

/* ─── V2 TLD Staking Contracts (Foundry) ─────────────────── */

interface V2ContractInfo {
  name: string;
  address: string;
  proxy?: boolean;
  icon: typeof FileCode2;
  color: string;
  borderColor: string;
  bgGrad: string;
  description: string;
  category: string;
  functions: ContractFunction[];
}

const v2Contracts: V2ContractInfo[] = [
  // Core NFT Layer
  {
    name: "HsrTld",
    address: "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE",
    proxy: true,
    icon: Layers,
    color: "text-amber-400",
    borderColor: "border-amber-500/20",
    bgGrad: "from-amber-500/10 to-amber-600/5",
    category: "Core NFT",
    description:
      "ERC-721 UUPS upgradeable contract representing TLD ownership. Each token maps to a Handshake TLD and its owner receives 95% of subdomain registration revenue. Supports operator batch minting and FDC-verified external staking.",
    functions: [
      {
        signature: "operatorMintBatch(string[] labels, address to)",
        description:
          "Batch mints TLD NFTs for platform-owned TLDs. Only callable by the operator (platform admin).",
        access: "Operator",
      },
      {
        signature: "stakeMint(string label, address to)",
        description:
          "Mints a TLD NFT after FDC-verified ownership proof. Called by TldClaimManager after successful staking.",
        access: "Authorized",
      },
      {
        signature: "tldId(string label) view returns (uint256)",
        description:
          "Returns the token ID for a given TLD label. Returns 0 if the TLD is not registered.",
        access: "View",
      },
      {
        signature: "ownerOfTld(string label) view returns (address)",
        description:
          "Returns the owner address for a given TLD label.",
        access: "View",
      },
    ],
  },
  {
    name: "HsrSld",
    address: "0xA94F9BB2877e969b63e78c148fdc66A61E415110",
    proxy: true,
    icon: FileCode2,
    color: "text-blue-400",
    borderColor: "border-blue-500/20",
    bgGrad: "from-blue-500/10 to-blue-600/5",
    category: "Core NFT",
    description:
      "ERC-721 UUPS upgradeable contract for subdomain (SLD) NFTs. Supports expiry dates, 30-day grace periods, renewal, and AI-generated artwork metadata via SldMetadataService.",
    functions: [
      {
        signature: "register(string label, uint256 tldId, address to, uint64 expiry)",
        description:
          "Registers a new SLD under a TLD with an expiry timestamp. Only callable by SldRegistrationManager.",
        access: "Authorized",
      },
      {
        signature: "renew(uint256 tokenId, uint64 newExpiry)",
        description:
          "Extends the expiry date for an existing SLD. Callable by the registration manager.",
        access: "Authorized",
      },
      {
        signature: "isExpired(uint256 tokenId) view returns (bool)",
        description:
          "Returns true if the SLD has passed its expiry date.",
        access: "View",
      },
      {
        signature: "inGracePeriod(uint256 tokenId) view returns (bool)",
        description:
          "Returns true if the SLD is expired but within the 30-day grace period where only the owner can renew.",
        access: "View",
      },
    ],
  },
  // Orchestration Layer
  {
    name: "TldClaimManager",
    address: "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4",
    proxy: true,
    icon: Lock,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/20",
    bgGrad: "from-cyan-500/10 to-cyan-600/5",
    category: "Orchestration",
    description:
      "Two-phase TLD onboarding contract. Phase 1: operator batch mints platform TLDs. Phase 2: external users stake FLR and prove Handshake TLD ownership via Flare Data Connector (FDC) attestation. Uses UUPS proxy pattern.",
    functions: [
      {
        signature: "requestStake(string tld) payable",
        description:
          "Phase 2: External TLD owner initiates staking by paying the staking fee. TLD must have a 'flr:0x...' TXT record in Handshake DNS pointing to the caller's address.",
        access: "Payable",
      },
      {
        signature: "completeStake(string tld, bytes32[] proof)",
        description:
          "Completes staking after FDC proof is available. The keeper bot calls this with the DA Layer proof once the FDC voting round finalizes.",
        access: "Public",
      },
      {
        signature: "stakingFee() view returns (uint256)",
        description:
          "Returns the current staking fee in FLR wei. Set by the platform operator.",
        access: "View",
      },
      {
        signature: "claims(string tld) view returns (ClaimInfo)",
        description:
          "Returns the current claim status for a TLD including staker address, amount, FDC round ID, and phase.",
        access: "View",
      },
    ],
  },
  {
    name: "SldRegistrationManager",
    address: "0x9e680e851492F6135320FDaf64030F1F0Eb35D69",
    proxy: true,
    icon: Workflow,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/20",
    bgGrad: "from-emerald-500/10 to-emerald-600/5",
    category: "Orchestration",
    description:
      "Central SLD registration hub with an 11-step validation flow. Supports two registration paths: commit-reveal (anti-frontrunning, 8-17,280 block window) and signature-based (operator-approved). Enforces global rules, strategy pricing, and payment splitting.",
    functions: [
      {
        signature: "registerWithCommit(string label, uint256 tldId, uint256 years, bytes32 secret) payable",
        description:
          "Registers an SLD using the commit-reveal pattern. The user must have previously committed via SldCommitIntent. Prevents front-running of premium names.",
        access: "Payable",
      },
      {
        signature: "registerWithSignature(string label, uint256 tldId, uint256 years, bytes sig) payable",
        description:
          "Registers an SLD using an operator-signed approval. For operator-managed registrations where commit-reveal isn't needed.",
        access: "Payable",
      },
      {
        signature: "renewSld(uint256 tokenId, uint256 years) payable",
        description:
          "Renews an existing SLD for additional years. Pricing uses the same strategy as initial registration.",
        access: "Payable",
      },
    ],
  },
  {
    name: "PaymentManager",
    address: "0xc502b38C93A3B34D5E0BcFD83384678632D0F112",
    icon: Coins,
    color: "text-green-400",
    borderColor: "border-green-500/20",
    bgGrad: "from-green-500/10 to-green-600/5",
    category: "Orchestration",
    description:
      "Pull-pattern revenue distribution contract. Splits SLD registration payments: 95% to TLD owner, 5% platform fee. Both parties withdraw accumulated balances on demand — no automatic transfers.",
    functions: [
      {
        signature: "splitPayment(uint256 tldId) payable",
        description:
          "Receives payment and splits it between the TLD owner (95%) and the platform (5%). Called by SldRegistrationManager during registration.",
        access: "Authorized",
      },
      {
        signature: "withdraw()",
        description:
          "Withdraws all accumulated balance for the caller. Available for both TLD owners and the platform.",
        access: "Public",
      },
      {
        signature: "balanceOf(address account) view returns (uint256)",
        description:
          "Returns the withdrawable FLR balance for an address.",
        access: "View",
      },
    ],
  },
  {
    name: "SldCommitIntent",
    address: "0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d",
    icon: Shield,
    color: "text-violet-400",
    borderColor: "border-violet-500/20",
    bgGrad: "from-violet-500/10 to-violet-600/5",
    category: "Orchestration",
    description:
      "Anti-frontrunning mechanism for SLD registration. Users commit a hash of their desired name + secret, wait a minimum number of blocks, then reveal. Valid window: 8 to 17,280 blocks (~24 seconds to ~24 hours).",
    functions: [
      {
        signature: "commit(bytes32 commitHash)",
        description:
          "Stores a commitment hash (keccak256 of label + tldId + sender + secret). Must wait at least 8 blocks before revealing.",
        access: "Public",
      },
      {
        signature: "canReveal(bytes32 commitHash) view returns (bool)",
        description:
          "Returns true if the commitment is within the valid reveal window (8-17,280 blocks after commit).",
        access: "View",
      },
    ],
  },
  // Strategy & Pricing
  {
    name: "DefaultRegistrationStrategy",
    address: "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE",
    icon: DollarSign,
    color: "text-orange-400",
    borderColor: "border-orange-500/20",
    bgGrad: "from-orange-500/10 to-orange-600/5",
    category: "Strategy & Pricing",
    description:
      "Per-TLD configurable pricing with length-based tiers, premium name lists, reserved names, and multi-year discounts (5% for 2y, 10% for 3y, 15% for 4y, 20% for 5y). TLD owners can customize pricing for their namespace.",
    functions: [
      {
        signature: "getPrice(uint256 tldId, string label, uint256 years) view returns (uint256)",
        description:
          "Returns the USD price in cents for registering a label under a TLD for a given number of years. Accounts for length tier, premium multiplier, and multi-year discount.",
        access: "View",
      },
      {
        signature: "isReserved(uint256 tldId, string label) view returns (bool)",
        description:
          "Returns true if the label is reserved by the TLD owner and cannot be registered by others.",
        access: "View",
      },
      {
        signature: "isPremium(uint256 tldId, string label) view returns (uint256)",
        description:
          "Returns the premium multiplier for a label (0 if not premium). Premium names cost more based on the TLD owner's configuration.",
        access: "View",
      },
    ],
  },
  {
    name: "FtsoOracle",
    address: "0x08d391c50AE8aa94B031195491Ffa9Df7953200c",
    icon: Zap,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/20",
    bgGrad: "from-yellow-500/10 to-yellow-600/5",
    category: "Strategy & Pricing",
    description:
      "FTSO v2 FLR/USD price feed with staleness guard (max 300s price age). Converts USD prices from the registration strategy into FLR amounts using Flare's native oracle. Feed ID: 0x01464c522f55534400000000000000000000000000.",
    functions: [
      {
        signature: "getFlrUsdPrice() view returns (uint256, uint64)",
        description:
          "Returns the current FLR/USD price (18 decimals) and the timestamp of the last update. Reverts if price is stale (>300s).",
        access: "View",
      },
      {
        signature: "usdToFlr(uint256 usdCents) view returns (uint256)",
        description:
          "Converts a USD amount in cents to FLR wei using the latest FTSO price.",
        access: "View",
      },
    ],
  },
  // Validation & Rules
  {
    name: "LabelValidator",
    address: "0x5D13FA219deA785754043D63Cae2059b8AE1D213",
    icon: CheckCircle2,
    color: "text-teal-400",
    borderColor: "border-teal-500/20",
    bgGrad: "from-teal-500/10 to-teal-600/5",
    category: "Validation & Rules",
    description:
      "Strict ASCII alphanumeric-only label validation. Enforces 1-63 character length, lowercase a-z and 0-9 only. No hyphens, no unicode, no special characters. Prevents confusable and malicious labels.",
    functions: [
      {
        signature: "isValidLabel(string label) view returns (bool)",
        description:
          "Returns true if the label contains only lowercase a-z and 0-9 characters, is 1-63 characters long.",
        access: "View",
      },
    ],
  },
  {
    name: "GlobalRegistrationRules",
    address: "0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92",
    icon: Scale,
    color: "text-red-400",
    borderColor: "border-red-500/20",
    bgGrad: "from-red-500/10 to-red-600/5",
    category: "Validation & Rules",
    description:
      "Platform-wide safety net enforcing minimum registration standards. Validates label format, duration limits, and a $1/year minimum price floor. Runs as step 6 of the 11-step registration flow, even if TLD owners set lower prices.",
    functions: [
      {
        signature: "validate(string label, uint256 years, uint256 priceUsd) view returns (bool)",
        description:
          "Returns true if the registration meets all global rules: valid label, acceptable duration, and price >= $1/year.",
        access: "View",
      },
    ],
  },
  // Resolution & Metadata
  {
    name: "DefaultResolver",
    address: "0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F",
    icon: Network,
    color: "text-indigo-400",
    borderColor: "border-indigo-500/20",
    bgGrad: "from-indigo-500/10 to-indigo-600/5",
    category: "Resolution & Metadata",
    description:
      "ENS-compatible multi-chain resolver with multicall batch support. Stores addr (Flare + 60+ chains via ENSIP-9), text records, and content hashes per SLD. Supports batch reads via multicall for efficient frontend queries.",
    functions: [
      {
        signature: "addr(bytes32 node) view returns (address)",
        description:
          "Returns the Flare address mapped to an SLD node hash.",
        access: "View",
      },
      {
        signature: "addr(bytes32 node, uint256 coinType) view returns (bytes)",
        description:
          "Returns the address for any chain via ENSIP-9 coin types (e.g., 60=ETH, 714=BNB, 501=SOL).",
        access: "View",
      },
      {
        signature: "text(bytes32 node, string key) view returns (string)",
        description:
          "Returns a text record (avatar, url, email, description, etc.) for an SLD.",
        access: "View",
      },
      {
        signature: "setAddr(bytes32 node, address addr)",
        description:
          "Sets the Flare address for an SLD. Only callable by the SLD owner.",
        access: "SLD Owner",
      },
    ],
  },
  {
    name: "SldMetadataService",
    address: "0x0f9AEC25344239E1356A7966F8E05F281C5daFF5",
    icon: Tag,
    color: "text-fuchsia-400",
    borderColor: "border-fuchsia-500/20",
    bgGrad: "from-fuchsia-500/10 to-fuchsia-600/5",
    category: "Resolution & Metadata",
    description:
      "Generates ERC-721 metadata JSON for SLD NFTs including name, description, image URI (IPFS), and attributes (TLD, label, length, expiry, art style). Powers the tokenURI for all subdomain NFTs.",
    functions: [
      {
        signature: "tokenURI(uint256 tokenId) view returns (string)",
        description:
          "Returns the full metadata URI for an SLD NFT, including AI-generated artwork CID and domain attributes.",
        access: "View",
      },
    ],
  },
  {
    name: "TldMetadataService",
    address: "0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430",
    icon: Tag,
    color: "text-rose-400",
    borderColor: "border-rose-500/20",
    bgGrad: "from-rose-500/10 to-rose-600/5",
    category: "Resolution & Metadata",
    description:
      "Generates ERC-721 metadata JSON for TLD NFTs. Includes TLD name, registration stats, revenue info, and a generated visual identity for the namespace.",
    functions: [
      {
        signature: "tokenURI(uint256 tokenId) view returns (string)",
        description:
          "Returns the full metadata URI for a TLD NFT.",
        access: "View",
      },
    ],
  },
];

const v2Categories = ["Core NFT", "Orchestration", "Strategy & Pricing", "Validation & Rules", "Resolution & Metadata"];

/* ─── Helper Components ────────────────────────────────────────── */

function AccessBadge({ access }: { access: string }) {
  const styles: Record<string, string> = {
    View: "bg-zinc-800/60 text-zinc-400 border-zinc-700/40",
    Payable: "bg-emerald-950/50 text-emerald-400 border-emerald-800/30",
    "Token Owner": "bg-blue-950/50 text-blue-400 border-blue-800/30",
    "SLD Owner": "bg-blue-950/50 text-blue-400 border-blue-800/30",
    Seller: "bg-yellow-950/50 text-yellow-400 border-yellow-800/30",
    Operator: "bg-amber-950/50 text-amber-400 border-amber-800/30",
    Authorized: "bg-cyan-950/50 text-cyan-400 border-cyan-800/30",
    Public: "bg-zinc-800/60 text-zinc-300 border-zinc-700/40",
  };

  return (
    <Badge
      className={`text-[10px] font-mono shrink-0 ${styles[access] || styles.View}`}
    >
      {access}
    </Badge>
  );
}

function ProxyBadge() {
  return (
    <Badge className="text-[10px] font-mono bg-amber-950/50 text-amber-400 border-amber-800/30 ml-2">
      UUPS Proxy
    </Badge>
  );
}

function CategoryHeader({ category }: { category: string }) {
  const icons: Record<string, typeof FileCode2> = {
    "Core NFT": Layers,
    "Orchestration": Workflow,
    "Strategy & Pricing": DollarSign,
    "Validation & Rules": CheckCircle2,
    "Resolution & Metadata": Network,
  };
  const Icon = icons[category] || FileCode2;
  return (
    <div className="flex items-center gap-2 mt-8 mb-4 pb-2 border-b border-zinc-800/50">
      <Icon className="h-4 w-4 text-amber-400" />
      <h3 className="text-lg font-semibold text-zinc-300">{category}</h3>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */

export default function SmartContractsPage() {
  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/20">
            <FileCode2 className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
              Smart Contracts
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              HSR contract architecture on Flare Coston2
            </p>
          </div>
        </div>
        <p className="text-zinc-400 leading-relaxed max-w-3xl">
          HSR has two contract systems deployed on Flare Coston2. The{" "}
          <span className="text-zinc-300 font-medium">V1 Legacy system</span>{" "}
          (5 Hardhat contracts) handles escrow-based subdomain purchases with
          FTSO pricing. The{" "}
          <span className="text-zinc-300 font-medium">V2 TLD Staking system</span>{" "}
          (13 Foundry contracts) adds TLD NFTs, two-phase staking via Flare Data
          Connector, per-TLD pricing strategies, commit-reveal registration, and
          ENS-compatible resolution.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            "Solidity ^0.8.25",
            "ERC-721",
            "UUPS Proxy",
            "FTSO v2",
            "FDC Attestation",
            "Commit-Reveal",
            "Pull Payments",
          ].map((tag) => (
            <Badge
              key={tag}
              className="bg-zinc-800/50 text-zinc-400 border-zinc-700/40 text-xs"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Network Info ── */}
      <Card className="bg-zinc-900/40 border-zinc-800/50">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Network</span>
              <Badge className="bg-zinc-800/60 text-zinc-300 border-zinc-700/40">
                Flare Coston2 Testnet
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Chain ID</span>
              <Badge className="bg-zinc-800/60 text-zinc-300 border-zinc-700/40 font-mono">
                114
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Explorer</span>
              <a
                href="https://coston2-explorer.flare.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1 text-sm"
              >
                coston2-explorer.flare.network
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">V1 Contracts</span>
              <Badge className="bg-zinc-800/60 text-zinc-300 border-zinc-700/40 font-mono">
                5
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">V2 Contracts</span>
              <Badge className="bg-amber-950/50 text-amber-300 border-amber-800/30 font-mono">
                13
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── V2 TLD STAKING SYSTEM (Foundry) ─────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/20">
            <Layers className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">
              V2 — TLD Staking System
            </h2>
            <p className="text-zinc-500 text-sm mt-0.5">
              13 Foundry contracts &middot; UUPS proxies &middot; Solidity ^0.8.25
            </p>
          </div>
          <Badge className="bg-amber-950/50 text-amber-300 border-amber-800/30 text-xs ml-auto">
            Active
          </Badge>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          The V2 system introduces TLD NFTs, two-phase FDC-verified staking, per-TLD
          pricing strategies, commit-reveal anti-frontrunning, pull-pattern payment
          splitting (95% TLD owner / 5% platform), ENS-compatible resolution, and
          AI artwork metadata services. All core contracts use UUPS upgradeable proxies.
        </p>
      </section>

      {/* ── V2 Registration Flow ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <Workflow className="h-5 w-5 text-amber-400" />
          V2 Registration Flow (11-Step)
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          SLD registration in V2 uses an 11-step validation pipeline through SldRegistrationManager.
          Two registration paths are supported: commit-reveal and signature-based.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { step: "1-2", title: "Validate", desc: "Label + TLD checks", color: "text-teal-400" },
            { step: "3-4", title: "Verify", desc: "Commit or signature", color: "text-violet-400" },
            { step: "5-6", title: "Rules", desc: "Strategy + global rules", color: "text-orange-400" },
            { step: "7-8", title: "Price", desc: "FTSO oracle → FLR", color: "text-yellow-400" },
            { step: "9", title: "Pay", desc: "Split 95/5 via PaymentManager", color: "text-green-400" },
            { step: "10", title: "Mint", desc: "SLD NFT issued", color: "text-blue-400" },
            { step: "11", title: "Resolve", desc: "DNS + on-chain records", color: "text-indigo-400" },
            { step: "FDC", title: "TLD Stake", desc: "Two-phase onboarding", color: "text-cyan-400" },
          ].map((s) => (
            <div
              key={s.step}
              className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center"
            >
              <div className={`text-lg font-bold ${s.color} font-mono mb-1`}>
                {s.step}
              </div>
              <div className="text-zinc-200 text-sm font-medium">{s.title}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── V2 Contract Sections by Category ── */}
      {v2Categories.map((category) => {
        const categoryContracts = v2Contracts.filter((c) => c.category === category);
        return (
          <section key={category}>
            <CategoryHeader category={category} />
            <div className="space-y-6">
              {categoryContracts.map((contract) => {
                const Icon = contract.icon;
                return (
                  <div key={contract.name} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg bg-gradient-to-br ${contract.bgGrad} border ${contract.borderColor}`}
                      >
                        <Icon className={`h-5 w-5 ${contract.color}`} />
                      </div>
                      <h2 className="text-xl font-semibold text-zinc-200">
                        {contract.name}
                      </h2>
                      {contract.proxy && <ProxyBadge />}
                    </div>

                    <Card className={`bg-zinc-900/40 ${contract.borderColor} border`}>
                      <CardContent className="pt-5 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-500 text-sm">Address</span>
                          <a
                            href={`${EXPLORER}/${contract.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 group"
                          >
                            <code className="bg-zinc-800/60 px-2.5 py-1 rounded font-mono text-xs text-zinc-300 group-hover:text-amber-300 transition-colors border border-zinc-700/40">
                              {contract.address}
                            </code>
                            <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                          </a>
                        </div>
                        <p className="text-zinc-400 text-sm leading-relaxed">
                          {contract.description}
                        </p>
                      </CardContent>
                    </Card>

                    {contract.functions.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">
                          Public Interface
                        </h3>
                        <div className="space-y-2">
                          {contract.functions.map((fn) => (
                            <Card
                              key={fn.signature}
                              className="bg-zinc-900/30 border-zinc-800/40"
                            >
                              <CardContent className="pt-3.5 pb-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <code className="text-xs bg-zinc-800/50 text-zinc-300 px-2 py-1 rounded font-mono break-all leading-relaxed border border-zinc-700/30">
                                    {fn.signature}
                                  </code>
                                  <AccessBadge access={fn.access} />
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                  {fn.description}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── V1 LEGACY SYSTEM (Hardhat) ──────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}

      <section className="space-y-4 mt-12">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-zinc-500/20 to-zinc-600/20 border border-zinc-500/20">
            <Shield className="h-6 w-6 text-zinc-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-300">
              V1 — Legacy System
            </h2>
            <p className="text-zinc-500 text-sm mt-0.5">
              5 Hardhat contracts &middot; Escrow-based purchases
            </p>
          </div>
          <Badge className="bg-zinc-800/60 text-zinc-400 border-zinc-700/40 text-xs ml-auto">
            Legacy
          </Badge>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          The original V1 contracts handle direct subdomain purchases through an
          escrow pattern with FTSO-powered pricing. These contracts remain deployed
          on Coston2 and functional alongside the V2 system.
        </p>
      </section>

      {/* ── V1 Purchase Flow ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <Zap className="h-5 w-5 text-zinc-400" />
          V1 Purchase Flow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {[
            { step: "1", title: "Pay", desc: "User sends FLR to Escrow", color: "text-emerald-400" },
            { step: "2", title: "Price", desc: "Oracle validates the amount", color: "text-orange-400" },
            { step: "3", title: "Mint", desc: "NFT issued to buyer", color: "text-blue-400" },
            { step: "4", title: "Release", desc: "Funds released from escrow", color: "text-pink-400" },
          ].map((s) => (
            <div
              key={s.step}
              className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center"
            >
              <div className={`text-2xl font-bold ${s.color} font-mono mb-1`}>
                {s.step}
              </div>
              <div className="text-zinc-200 text-sm font-medium">{s.title}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── V1 Contract Sections ── */}
      {v1Contracts.map((contract) => {
        const Icon = contract.icon;
        return (
          <section key={contract.name} className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg bg-gradient-to-br ${contract.bgGrad} border ${contract.borderColor}`}
              >
                <Icon className={`h-5 w-5 ${contract.color}`} />
              </div>
              <h2 className="text-xl font-semibold text-zinc-200">
                {contract.name}
              </h2>
            </div>

            <Card className={`bg-zinc-900/40 ${contract.borderColor} border`}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-500 text-sm">Address</span>
                  <a
                    href={`${EXPLORER}/${contract.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 group"
                  >
                    <code className="bg-zinc-800/60 px-2.5 py-1 rounded font-mono text-xs text-zinc-300 group-hover:text-amber-300 transition-colors border border-zinc-700/40">
                      {contract.address}
                    </code>
                    <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                  </a>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {contract.description}
                </p>
              </CardContent>
            </Card>

            {contract.functions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">
                  Public Interface
                </h3>
                <div className="space-y-2">
                  {contract.functions.map((fn) => (
                    <Card
                      key={fn.signature}
                      className="bg-zinc-900/30 border-zinc-800/40"
                    >
                      <CardContent className="pt-3.5 pb-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <code className="text-xs bg-zinc-800/50 text-zinc-300 px-2 py-1 rounded font-mono break-all leading-relaxed border border-zinc-700/30">
                            {fn.signature}
                          </code>
                          <AccessBadge access={fn.access} />
                        </div>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {fn.description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {contract.functions.length === 0 && (
              <Card className="bg-zinc-900/20 border-zinc-800/30 border-dashed">
                <CardContent className="pt-4 pb-3.5">
                  <p className="text-xs text-zinc-600 italic">
                    This contract operates through authorized roles only.
                    Public query functions are available via the block explorer.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        );
      })}

      {/* ── Marketplace Flow ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-amber-400" />
          Marketplace Flow
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-xs ml-2">
            Coming Soon
          </Badge>
        </h2>
        <Card className="bg-zinc-900/20 border-zinc-800/30 border-dashed">
          <CardContent className="pt-4 pb-3.5">
            <p className="text-sm text-zinc-500">
              The SubdomainMarketplace contract is deployed on Coston2 but the
              marketplace frontend is not yet available. Subdomain NFTs are standard
              ERC-721 tokens and can be transferred or traded on any compatible platform.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── INTEGRATION EXAMPLES ────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}

      <section className="space-y-4 mt-12">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-400" />
          Integration Examples
        </h2>

        <h3 className="text-sm font-medium text-zinc-300 mt-6">
          V2: Check TLD staking fee &amp; register an SLD
        </h3>
        <CodeBlock
          language="typescript"
          code={`import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "https://coston2-api.flare.network/ext/C/rpc"
);

// === TLD Staking ===
const claimMgr = new ethers.Contract(
  "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4",
  [
    "function stakingFee() view returns (uint256)",
    "function claims(string tld) view returns (address,uint256,uint256,uint8)",
  ],
  provider
);

const fee = await claimMgr.stakingFee();
console.log(\`Staking fee: \${ethers.formatEther(fee)} FLR\`);

// === SLD Registration (commit-reveal) ===
const regMgr = new ethers.Contract(
  "0x9e680e851492F6135320FDaf64030F1F0Eb35D69",
  [
    "function registerWithCommit(string,uint256,uint256,bytes32) payable",
  ],
  signer // requires a connected wallet
);

// === V2 Pricing ===
const strategy = new ethers.Contract(
  "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE",
  ["function getPrice(uint256,string,uint256) view returns (uint256)"],
  provider
);

const priceUsd = await strategy.getPrice(tldId, "myname", 1);
console.log(\`Price: $\${Number(priceUsd) / 100}/year\`);

// === Convert to FLR ===
const oracle = new ethers.Contract(
  "0x08d391c50AE8aa94B031195491Ffa9Df7953200c",
  ["function usdToFlr(uint256) view returns (uint256)"],
  provider
);
const priceFLR = await oracle.usdToFlr(priceUsd);
console.log(\`Price: \${ethers.formatEther(priceFLR)} FLR\`);`}
        />

        <h3 className="text-sm font-medium text-zinc-300 mt-6">
          V1: Read subdomain data
        </h3>
        <CodeBlock
          language="typescript"
          code={`import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "https://coston2-api.flare.network/ext/C/rpc"
);

// SubdomainNFT ABI (read functions)
const nftAbi = [
  "function subdomainOf(uint256 tokenId) view returns (string, string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

const nft = new ethers.Contract(
  "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38",
  nftAbi,
  provider
);

const [label, parent] = await nft.subdomainOf(1);
console.log(\`Subdomain: \${label}.\${parent}\`);

const owner = await nft.ownerOf(1);
console.log(\`Owner: \${owner}\`);`}
        />
      </section>

      {/* ── Contract Addresses Quick Reference ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-amber-400" />
          Address Reference
        </h2>

        {/* V2 Table */}
        <h3 className="text-sm font-medium text-amber-400 uppercase tracking-wider">
          V2 TLD Staking (Foundry)
        </h3>
        <Card className="bg-zinc-900/40 border-zinc-800/50">
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-2 pr-4 text-left text-zinc-400 font-medium">Contract</th>
                    <th className="pb-2 pr-4 text-left text-zinc-400 font-medium">Category</th>
                    <th className="pb-2 text-left text-zinc-400 font-medium">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {v2Contracts.map((c) => (
                    <tr key={c.name} className="border-b border-zinc-800/40">
                      <td className="py-2.5 pr-4">
                        <span className={`font-medium ${c.color} text-sm`}>
                          {c.name}
                        </span>
                        {c.proxy && (
                          <span className="ml-1.5 text-[10px] text-amber-500/60 font-mono">
                            proxy
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-zinc-500 text-xs">{c.category}</span>
                      </td>
                      <td className="py-2.5">
                        <a
                          href={`${EXPLORER}/${c.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-zinc-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                        >
                          {c.address}
                          <ExternalLink className="h-3 w-3 opacity-40" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* V1 Table */}
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mt-6">
          V1 Legacy (Hardhat)
        </h3>
        <Card className="bg-zinc-900/40 border-zinc-800/50">
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-2 pr-4 text-left text-zinc-400 font-medium">Contract</th>
                    <th className="pb-2 text-left text-zinc-400 font-medium">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {v1Contracts.map((c) => (
                    <tr key={c.name} className="border-b border-zinc-800/40">
                      <td className="py-2.5 pr-4">
                        <span className={`font-medium ${c.color} text-sm`}>
                          {c.name}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <a
                          href={`${EXPLORER}/${c.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-zinc-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                        >
                          {c.address}
                          <ExternalLink className="h-3 w-3 opacity-40" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Related Guides ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200">
          Related Guides
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "TLD Staking (V2)",
              desc: "Two-phase staking, FDC proofs, and keeper bot",
              icon: Layers,
            },
            {
              title: "Flare Network",
              desc: "FTSO integration and price feeds",
              icon: Zap,
            },
            {
              title: "API Reference",
              desc: "REST API endpoints and usage",
              icon: Database,
            },
            {
              title: "Architecture",
              desc: "System design and deployment diagrams",
              icon: ArrowRight,
            },
          ].map((guide, i) => (
            <Card
              key={i}
              className="bg-zinc-900/30 border-zinc-800/40 hover:border-amber-800/30 transition-colors cursor-pointer"
            >
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-3">
                  <guide.icon className="h-4 w-4 text-amber-400/70" />
                  <div>
                    <h3 className="font-medium text-zinc-300 text-sm">
                      {guide.title}
                    </h3>
                    <p className="text-zinc-600 text-xs">{guide.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

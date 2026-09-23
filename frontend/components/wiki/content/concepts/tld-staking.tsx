"use client";

import {
  Layers,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode,
  Coins,
  Lock,
  RefreshCw,
  Database,
  Server,
  AlertTriangle,
  Info,
  Flame,
  Globe,
  Users,
  Bot,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeBlock } from "@/components/wiki/CodeBlock";

const EXPLORER = "https://coston2-explorer.flare.network/address";

export default function TldStakingPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
            <Layers className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Concepts</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          TLD Staking (V2)
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          The V2 TLD Staking system lets Handshake TLD owners bring their
          domains on-chain as ERC-721 NFTs on Flare Network. Ownership is
          verified trustlessly through the Flare Data Connector (FDC), and TLD
          holders earn revenue from subdomain registrations.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            "13 Smart Contracts",
            "FDC Attestation",
            "UUPS Upgradeable",
            "FTSO Pricing",
            "Two-Phase Staking",
            "Coston2 Testnet",
            "Foundry",
          ].map((t) => (
            <span
              key={t}
              className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* What is TLD Staking */}
      <Card className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3">
            What is TLD Staking?
          </h3>
          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            Halcyon is an open marketplace. Anyone with a Handshake TLD can stake
            it on Flare Network, sell subdomains, and earn revenue. The platform
            operator also stakes ~300 official TLDs. Once staked, TLD owners
            configure pricing, earn from every registration, and manage their
            namespace entirely on-chain.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: Shield,
                title: "Trustless Verification",
                desc: "FDC proves Handshake ownership on-chain without a centralized oracle",
                color: "text-green-400",
              },
              {
                icon: Coins,
                title: "Revenue Sharing",
                desc: "Community TLD owners keep 80% of sales (20% platform fee). Official TLDs: 95/5 split.",
                color: "text-amber-400",
              },
              {
                icon: Lock,
                title: "Full Ownership",
                desc: "TLD NFTs are standard ERC-721 tokens — transferable, tradeable, composable",
                color: "text-blue-400",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50"
              >
                <item.icon
                  className={`h-5 w-5 ${item.color} mb-2`}
                />
                <h4 className="text-white text-sm font-medium mb-1">
                  {item.title}
                </h4>
                <p className="text-zinc-500 text-xs leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-Phase Architecture */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Two-Phase Staking Architecture
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          TLD onboarding uses a two-phase system: Phase 1 for the platform
          operator to batch-mint pre-owned TLDs, and Phase 2 for external TLD
          owners to stake their domains with FDC-verified proof of ownership.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              phase: "Phase 1",
              title: "Operator Batch Mint",
              subtitle: "Platform-owned TLDs (~300 domains)",
              icon: Users,
              color: "text-blue-400",
              gradient: "from-blue-500/5 to-blue-600/5",
              border: "border-blue-500/20",
              items: [
                "Operator calls operatorMintBatch()",
                "Mints up to 300 TLDs in one transaction",
                "No FDC verification needed (trusted operator)",
                "TLD NFTs owned by platform wallet",
                "Instant — no waiting for attestation",
              ],
              status: "Blocked: waiting on Namebase TLD export",
            },
            {
              phase: "Phase 2",
              title: "FDC-Verified External Staking",
              subtitle: "Third-party TLD owners",
              icon: Shield,
              color: "text-green-400",
              gradient: "from-green-500/5 to-green-600/5",
              border: "border-green-500/20",
              items: [
                'User sets "flr:0x..." TXT record on HNS TLD',
                "User calls requestStake() with $10 staking fee",
                "FDC verifies Handshake TLD ownership trustlessly",
                "Keeper bot submits proof when voting round finalizes",
                "TLD NFT minted to verified owner",
              ],
              status: "Live on Coston2",
            },
          ].map((phase) => (
            <Card
              key={phase.phase}
              className={`bg-gradient-to-br ${phase.gradient} ${phase.border} border`}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <phase.icon className={`h-5 w-5 ${phase.color}`} />
                  <h4 className="text-white text-sm font-medium">
                    {phase.title}
                  </h4>
                  <Badge className="bg-zinc-800/60 text-zinc-400 border-zinc-700/40 text-[10px]">
                    {phase.phase}
                  </Badge>
                </div>
                <p className="text-zinc-500 text-[10px] mb-3">
                  {phase.subtitle}
                </p>
                <ul className="space-y-1.5 mb-3">
                  {phase.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-zinc-400 text-xs"
                    >
                      <CheckCircle2
                        className={`h-3 w-3 ${phase.color} shrink-0 mt-0.5`}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <div
                  className={`text-[10px] px-2 py-1 rounded ${
                    phase.phase === "Phase 2"
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  }`}
                >
                  {phase.status}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FDC Staking Flow (Phase 2) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          FDC Staking Flow (Phase 2)
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The complete end-to-end flow for a third-party TLD owner to stake
          their Handshake domain on Flare. The entire process is trustless
          &mdash; no centralized authority verifies ownership.
        </p>

        <div className="space-y-3">
          {[
            {
              step: 1,
              icon: Globe,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              borderColor: "border-l-blue-500",
              title: "Set FLR Address on Handshake TLD",
              desc: 'TLD owner adds a TXT record to their Handshake domain in the format "flr:0xYourFlareWalletAddress". This links the HNS TLD to a Flare wallet so the Flare Data Connector can trustlessly verify ownership on-chain — no centralized authority needed.',
              detail: null,
              customDetail: true,
            },
            {
              step: 2,
              icon: FileCode,
              color: "text-amber-400",
              bg: "bg-amber-500/10",
              borderColor: "border-l-amber-500",
              title: "Backend Creates FDC Attestation Request",
              desc: "The HSR backend constructs a Web2Json attestation request via the Flare Verifier API. This request encodes the TLD label and asks FDC to verify the HNS ownership state and FLR address.",
              detail:
                "POST /verifier/web2json → abiEncodedRequest + MIC signature",
            },
            {
              step: 3,
              icon: Coins,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              borderColor: "border-l-emerald-500",
              title: "User Calls requestStake()",
              desc: "User submits the attestation request on-chain along with a $10 staking fee (converted to FLR via FTSO oracle). The contract forwards the request to the FDC Hub for the current voting round.",
              detail:
                "TldClaimManager.requestStake(tldLabel, abiEncodedRequest) + FLR fee",
            },
            {
              step: 4,
              icon: Server,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              borderColor: "border-l-cyan-500",
              title: "Staking Listener Captures Event",
              desc: "The backend event listener catches the StakeRequested event, extracts the attestation request bytes from the transaction data, computes the FDC voting round ID, and inserts a pending claim into the database.",
              detail:
                'StakeRequested → pending_claims INSERT (status: "pending", fdc_round_id computed)',
            },
            {
              step: 5,
              icon: Clock,
              color: "text-purple-400",
              bg: "bg-purple-500/10",
              borderColor: "border-l-purple-500",
              title: "FDC Network Processes Attestation",
              desc: "Flare Data Nodes independently verify the TLD state on the Handshake blockchain. They submit attestation proofs to the FDC Hub and build Merkle trees for the voting round. This takes 2-3 voting rounds (~4.5-7 minutes).",
              detail:
                "Flare Data Nodes → verify HNS state → submit proofs → Merkle tree finalized",
            },
            {
              step: 6,
              icon: Bot,
              color: "text-orange-400",
              bg: "bg-orange-500/10",
              borderColor: "border-l-orange-500",
              title: "FDC Keeper Bot Submits Proof",
              desc: "The keeper bot polls the Flare DA Layer every 30 seconds for finalized proofs. When the voting round is finalized, it retrieves the proof and calls completeStake() on-chain.",
              detail:
                "DA Layer → proof-by-request-round-raw → completeStake(tldLabel, proof)",
            },
            {
              step: 7,
              icon: CheckCircle2,
              color: "text-green-400",
              bg: "bg-green-500/10",
              borderColor: "border-l-green-500",
              title: "TLD NFT Minted to Owner",
              desc: 'The contract verifies the FDC proof via IFdcVerification.verifyWeb2Json(), validates the TLD is CLOSED and not expired, confirms the FLR address matches the claimer, and mints the TLD NFT.',
              detail:
                "verifyWeb2Json(proof) → validate ownership → HsrTld.mint(claimer, label, namehash)",
            },
          ].map((s) => (
            <Card
              key={s.step}
              className={`bg-zinc-900/50 border-zinc-800 border-l-2 ${s.borderColor}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${s.bg} shrink-0`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[10px]">
                        Step {s.step}
                      </Badge>
                      <h4 className="text-white text-sm font-medium">
                        {s.title}
                      </h4>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed mb-2">
                      {s.desc}
                    </p>
                    {s.customDetail ? (
                      <div className="space-y-2">
                        <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wide">Set the TXT record using any of these tools:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-zinc-950 rounded-lg px-3 py-2">
                            <span className="text-blue-400 text-[11px] font-semibold">ShakeStation</span>
                            <p className="text-zinc-500 text-[10px] mt-0.5">Your domain → Records → Add TXT → <code className="text-amber-400">flr:0xYourAddress</code></p>
                          </div>
                          <div className="bg-zinc-950 rounded-lg px-3 py-2">
                            <span className="text-blue-400 text-[11px] font-semibold">Namebase</span>
                            <p className="text-zinc-500 text-[10px] mt-0.5">My Domains → DNS Settings → Add TXT → <code className="text-amber-400">flr:0xYourAddress</code></p>
                          </div>
                          <div className="bg-zinc-950 rounded-lg px-3 py-2">
                            <span className="text-blue-400 text-[11px] font-semibold">Bob Wallet</span>
                            <p className="text-zinc-500 text-[10px] mt-0.5">Domain Manager → Records → Add TXT → <code className="text-amber-400">flr:0xYourAddress</code></p>
                          </div>
                          <div className="bg-zinc-950 rounded-lg px-3 py-2">
                            <span className="text-blue-400 text-[11px] font-semibold">hsd CLI</span>
                            <code className="text-amber-400 text-[10px] break-all">hsd-cli rpc sendupdate &quot;mytld&quot; &#39;&#123;&quot;records&quot;:[&#123;&quot;type&quot;:&quot;TXT&quot;,&quot;txt&quot;:[&quot;flr:0xAddr&quot;]&#125;]&#125;&#39;</code>
                          </div>
                        </div>
                      </div>
                    ) : s.detail ? (
                      <div className="bg-zinc-950 rounded-lg px-3 py-2">
                        <code className="text-amber-400 text-[11px]">
                          {s.detail}
                        </code>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Refund fallback */}
        <Card className="bg-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-white text-sm font-medium mb-1">
                Claim Expiry &amp; Refund
              </h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                If a stake is not completed within <strong className="text-white">14 days</strong>,
                the staking fee can be refunded by calling{" "}
                <code className="text-yellow-400 bg-zinc-800 px-1 py-0.5 rounded text-[10px]">
                  refundExpiredStake(namehash)
                </code>
                . The FLR is returned to the original claimer and the claim is
                marked as refunded.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Flare Data Connector (FDC) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Link2 className="h-5 w-5 text-amber-400" />
          Flare Data Connector (FDC)
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The FDC is Flare&apos;s trustless attestation system for proving
          off-chain state on-chain. HSR uses it to verify Handshake TLD
          ownership without running a full Handshake node inside the smart
          contract.
        </p>

        <Card className="bg-gradient-to-br from-orange-500/5 to-amber-500/5 border-orange-500/20">
          <CardContent className="p-5 space-y-4">
            <h4 className="text-white text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-400" />
              How FDC Verification Works
            </h4>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Attestation Request Created",
                  desc: 'Backend uses Verifier API to construct a Web2Json request encoding the TLD label. Request includes a check for TXT records with "flr:0x..." format and the TLD CLOSED state.',
                },
                {
                  step: "2",
                  title: "Request Submitted On-Chain",
                  desc: "User sends the ABI-encoded request to FDC Hub via requestStake(). FDC Hub queues it for the current ~90-second voting round.",
                },
                {
                  step: "3",
                  title: "Data Nodes Verify Independently",
                  desc: "Flare Data Nodes independently query the Handshake blockchain to verify TLD state. Each node submits attestation proofs and builds a Merkle tree for consensus.",
                },
                {
                  step: "4",
                  title: "Proof Available on DA Layer",
                  desc: "Once the voting round finalizes, the proof is available on the Data Availability Layer. The keeper bot fetches it via proof-by-request-round-raw endpoint.",
                },
                {
                  step: "5",
                  title: "On-Chain Verification",
                  desc: "The completeStake() function calls IFdcVerification.verifyWeb2Json(proof) which verifies the Merkle proof and MIC signature, returning the attestation data (FLR address, expired status, TLD state).",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <span className="text-orange-400 text-xs font-bold">
                      {item.step}
                    </span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      {item.title}
                    </p>
                    <p className="text-zinc-500 text-xs leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Voting Round",
              value: "~90s",
              desc: "Per voting epoch",
              color: "text-blue-400",
            },
            {
              label: "Attestation Time",
              value: "4-7 min",
              desc: "2-3 voting rounds",
              color: "text-green-400",
            },
            {
              label: "Staking Fee",
              value: "$10 USD",
              desc: "Converted to FLR",
              color: "text-amber-400",
            },
            {
              label: "Claim Expiry",
              value: "14 days",
              desc: "Refundable after",
              color: "text-orange-400",
            },
          ].map((spec) => (
            <Card key={spec.label} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 text-center">
                <p className={`text-sm font-bold ${spec.color}`}>
                  {spec.value}
                </p>
                <p className="text-white text-xs font-medium mt-0.5">
                  {spec.label}
                </p>
                <p className="text-zinc-500 text-[10px]">{spec.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 13 Smart Contracts */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCode className="h-5 w-5 text-amber-400" />
          13 Smart Contracts
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The V2 system is composed of 13 smart contracts working together.
          Core NFT contracts use UUPS upgradeable proxies for future
          improvements. All contracts are deployed on Flare Coston2 testnet.
        </p>

        {/* Contract groups */}
        {[
          {
            group: "Core NFT Contracts",
            color: "text-blue-400",
            border: "border-blue-500/20",
            contracts: [
              {
                name: "HsrTld",
                address: "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE",
                role: "ERC-721 TLD ownership NFTs (UUPS upgradeable)",
                details:
                  "Represents ownership of Handshake TLDs. Only TldClaimManager can mint. TLD owners configure registration pricing strategy and enable/disable subdomain registrations.",
              },
              {
                name: "HsrSld",
                address: "0xA94F9BB2877e969b63e78c148fdc66A61E415110",
                role: "ERC-721 subdomain NFTs with expiry (UUPS upgradeable)",
                details:
                  "Represents subdomain ownership. Stores registration time, expiry (1-10 years), per-year price lock for renewals, and artwork IPFS hash. 30-day grace period after expiry.",
              },
            ],
          },
          {
            group: "Orchestration",
            color: "text-emerald-400",
            border: "border-emerald-500/20",
            contracts: [
              {
                name: "TldClaimManager",
                address: "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4",
                role: "Two-phase TLD onboarding (UUPS upgradeable)",
                details:
                  "Phase 1: operatorMintBatch() for platform TLDs. Phase 2: requestStake() + completeStake() with FDC verification. Handles staking fees, claim expiry (14 days), and refunds.",
              },
              {
                name: "SldRegistrationManager",
                address: "0x9e680e851492F6135320FDaf64030F1F0Eb35D69",
                role: "Subdomain registration and renewal orchestrator (UUPS upgradeable)",
                details:
                  "Central registration hub. Supports commit-reveal (anti-frontrunning) and signature-based (TLD owner signs) registration. Handles renewals using stored per-year price lock. Converts USD to FLR via FTSO.",
              },
              {
                name: "PaymentManager",
                address: "0xc502b38C93A3B34D5E0BcFD83384678632D0F112",
                role: "Revenue splitting between TLD owner and platform",
                details:
                  "Splits payments: 95% to TLD owner, 5% platform fee. Uses pull pattern (withdraw()) for safety. Tracks pending balances per address.",
              },
              {
                name: "SldCommitIntent",
                address: "0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d",
                role: "Anti-frontrunning commit-reveal for registrations",
                details:
                  "Users commit hash(label + tld + caller + secret), wait 8-17,280 blocks (~1 min to 2 days), then reveal during registration. Prevents MEV bots from sniping desired names.",
              },
            ],
          },
          {
            group: "Strategy & Pricing",
            color: "text-amber-400",
            border: "border-amber-500/20",
            contracts: [
              {
                name: "DefaultRegistrationStrategy",
                address: "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE",
                role: "Per-TLD configurable pricing engine",
                details:
                  "TLD owners set per-length pricing (1-char: $500, 2-char: $250, 3-char: $100, 4-char: $5, 5-char: $2, 6+char: $1 defaults). Supports premium names, reserved names, and multi-year discounts.",
              },
              {
                name: "FtsoOracle",
                address: "0x08d391c50AE8aa94B031195491Ffa9Df7953200c",
                role: "FTSO v2 price feed wrapper (FLR/USD)",
                details:
                  "Wraps Flare FTSO v2 for FLR/USD pricing. Feed ID: 0x01464c522f555344... Max price age: 300 seconds. Formula: flrWei = (usdCents * 1e36) / (priceWei * 100).",
              },
            ],
          },
          {
            group: "Validation & Rules",
            color: "text-cyan-400",
            border: "border-cyan-500/20",
            contracts: [
              {
                name: "LabelValidator",
                address: "0x5D13FA219deA785754043D63Cae2059b8AE1D213",
                role: "Label format validation (lowercase a-z, 0-9 only)",
                details:
                  "Pure validation contract. Labels must be non-empty and contain only lowercase letters (a-z) and digits (0-9). No hyphens, unicode, or special characters.",
              },
              {
                name: "GlobalRegistrationRules",
                address: "0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92",
                role: "System-wide registration constraints",
                details:
                  "Validates duration (1-10 years), minimum price ($1/year), and label format. Owner can update minimum price. Applied to all registrations regardless of TLD.",
              },
            ],
          },
          {
            group: "Resolution & Metadata",
            color: "text-purple-400",
            border: "border-purple-500/20",
            contracts: [
              {
                name: "DefaultResolver",
                address: "0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F",
                role: "ENS-compatible multi-chain name resolution",
                details:
                  "Supports setAddr() for Flare (coinType 0x8000000E) and Ethereum (coinType 60). Also setText(), setContenthash(), and setName() for reverse resolution. Only SLD owner can modify.",
              },
              {
                name: "SldMetadataService",
                address: "0x0f9AEC25344239E1356A7966F8E05F281C5daFF5",
                role: "API-based tokenURI for subdomain NFTs",
                details:
                  "Returns baseApiUrl + tokenId for SLD NFT metadata. Backend serves the actual JSON with domain name, attributes, and AI-generated artwork IPFS CID.",
              },
              {
                name: "TldMetadataService",
                address: "0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430",
                role: "API-based tokenURI for TLD NFTs",
                details:
                  "Same pattern as SldMetadataService but for TLD tokens. Separate contract allows future divergence in metadata formats.",
              },
            ],
          },
        ].map((group) => (
          <div key={group.group} className="space-y-2">
            <h3
              className={`text-sm font-medium ${group.color} uppercase tracking-wider ml-1`}
            >
              {group.group}
            </h3>
            <div className="space-y-2">
              {group.contracts.map((c) => (
                <Card
                  key={c.name}
                  className={`bg-zinc-900/40 ${group.border} border`}
                >
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${group.color}`}>
                          {c.name}
                        </span>
                      </div>
                      <a
                        href={`${EXPLORER}/${c.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 group"
                      >
                        <code className="bg-zinc-800/60 px-2 py-0.5 rounded font-mono text-[10px] text-zinc-400 group-hover:text-amber-300 transition-colors border border-zinc-700/40">
                          {c.address.slice(0, 10)}...{c.address.slice(-8)}
                        </code>
                        <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                      </a>
                    </div>
                    <p className="text-zinc-400 text-xs">{c.role}</p>
                    <p className="text-zinc-500 text-[10px] leading-relaxed">
                      {c.details}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Default Pricing */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-400" />
          Default Subdomain Pricing
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Each TLD owner can customize pricing via the DefaultRegistrationStrategy
          contract. These are the default per-year prices set at deployment.
          TLD owners can override with custom length prices, premium names, and
          multi-year discounts.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-4 gap-0 px-5 py-3 border-b border-zinc-800 bg-zinc-800/20">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Label Length
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                USD / Year
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                ~FLR / Year
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Customizable
              </span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                {
                  length: "1 character",
                  price: "$500",
                  flr: "~12,500",
                  color: "text-red-400",
                },
                {
                  length: "2 characters",
                  price: "$250",
                  flr: "~6,250",
                  color: "text-orange-400",
                },
                {
                  length: "3 characters",
                  price: "$100",
                  flr: "~2,500",
                  color: "text-yellow-400",
                },
                {
                  length: "4 characters",
                  price: "$5",
                  flr: "~125",
                  color: "text-green-400",
                },
                {
                  length: "5 characters",
                  price: "$2",
                  flr: "~50",
                  color: "text-green-400",
                },
                {
                  length: "6+ characters",
                  price: "$1",
                  flr: "~25",
                  color: "text-green-400",
                },
              ].map((t) => (
                <div
                  key={t.length}
                  className="grid grid-cols-4 gap-0 px-5 py-3 items-center"
                >
                  <span className={`text-sm font-medium ${t.color}`}>
                    {t.length}
                  </span>
                  <span className="text-white text-sm font-bold">{t.price}</span>
                  <span className="text-zinc-500 text-xs font-mono">
                    {t.flr}
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 flex gap-3">
            <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-white text-xs font-medium">
                Revenue Split
              </h4>
              <p className="text-zinc-500 text-[10px]">
                Registration and renewal payments are split based on TLD type:{" "}
                <strong className="text-white">Official TLDs: 95% owner / 5% platform</strong>.{" "}
                <strong className="text-white">Community TLDs: 80% owner / 20% platform</strong>{" "}
                (covers AI art compute + infrastructure).
                TLD owners withdraw accumulated earnings via{" "}
                <code className="text-amber-400 bg-zinc-800 px-1 py-0.5 rounded text-[10px]">
                  PaymentManager.withdraw()
                </code>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Registration Flow (SLD) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-amber-400" />
          Subdomain Registration Flow (V2)
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Once a TLD is staked and registrations are enabled, users can register
          subdomains. The V2 system supports two registration methods and
          built-in renewal with price lock.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <h4 className="text-amber-400 text-sm font-medium mb-2">
                Commit-Reveal Registration
              </h4>
              <p className="text-zinc-400 text-xs mb-3">
                Anti-frontrunning: prevents MEV bots from sniping desired names.
              </p>
              <div className="space-y-1.5">
                {[
                  "1. User commits hash(label + tld + caller + secret)",
                  "2. Wait 8+ blocks (~1 minute minimum)",
                  "3. Reveal and register with FLR payment",
                  "4. NFT minted, artwork generation queued",
                ].map((f) => (
                  <p
                    key={f}
                    className="text-zinc-500 text-[10px] flex items-start gap-1.5"
                  >
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {f}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <h4 className="text-amber-400 text-sm font-medium mb-2">
                Signature-Based Registration
              </h4>
              <p className="text-zinc-400 text-xs mb-3">
                Single-transaction: TLD owner pre-signs approval for the buyer.
              </p>
              <div className="space-y-1.5">
                {[
                  "1. TLD owner signs registration approval off-chain",
                  "2. User submits signature + FLR payment in one tx",
                  "3. Contract verifies TLD owner signature",
                  "4. NFT minted, artwork generation queued",
                ].map((f) => (
                  <p
                    key={f}
                    className="text-zinc-500 text-[10px] flex items-start gap-1.5"
                  >
                    <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    {f}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Renewal */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-green-400 text-sm font-medium mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Renewal System
            </h4>
            <p className="text-zinc-400 text-xs mb-3">
              Subdomain renewals use a <strong className="text-white">price lock</strong> mechanism:
            </p>
            <div className="space-y-1.5">
              {[
                "Renewal price = original per-year price at registration time",
                "Duration: 1-10 additional years per renewal",
                "USD price converted to FLR at current FTSO rate",
                "30-day grace period after expiry before domain can be re-registered",
                "Revenue split same as registration (per-TLD fee tier)",
              ].map((f) => (
                <p
                  key={f}
                  className="text-zinc-500 text-[10px] flex items-start gap-1.5"
                >
                  <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                  {f}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Backend Infrastructure */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Server className="h-5 w-5 text-amber-400" />
          Backend Infrastructure
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Three backend services work together to keep the database in sync with
          on-chain state and automate the FDC staking completion process.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-4 gap-0 px-5 py-3 border-b border-zinc-800 bg-zinc-800/20">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Service
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Purpose
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Frequency
              </span>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">
                Events
              </span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                {
                  name: "Staking Listener",
                  purpose: "Polls chain for V2 contract events, writes to DB",
                  freq: "Every 5 sec",
                  events: "20 events across 6 contracts",
                },
                {
                  name: "FDC Keeper Bot",
                  purpose:
                    "Monitors pending claims, submits FDC proofs when rounds finalize",
                  freq: "Every 30 sec",
                  events: "Polls DA Layer + calls completeStake()",
                },
                {
                  name: "Artwork Queue",
                  purpose:
                    "Processes AI art generation for newly registered SLDs",
                  freq: "Every 15 sec",
                  events: "Dispatches to ComfyUI GPU cluster",
                },
              ].map((s) => (
                <div
                  key={s.name}
                  className="grid grid-cols-4 gap-0 px-5 py-3 items-center"
                >
                  <span className="text-white text-xs font-medium">
                    {s.name}
                  </span>
                  <span className="text-zinc-400 text-xs">{s.purpose}</span>
                  <span className="text-zinc-500 text-xs">{s.freq}</span>
                  <span className="text-zinc-500 text-xs">{s.events}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Event System */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Event System (20 Events)
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The staking listener monitors 20 on-chain events across 6 contracts.
          Each event triggers database updates to keep the off-chain state in
          sync with the blockchain.
        </p>

        {[
          {
            contract: "TldClaimManager",
            color: "text-emerald-400",
            events: [
              {
                name: "StakeRequested",
                db: "pending_claims INSERT (status: pending)",
              },
              {
                name: "StakeCompleted",
                db: "pending_claims UPDATE (status: completed)",
              },
              {
                name: "StakeRefunded",
                db: "pending_claims UPDATE (status: refunded)",
              },
              {
                name: "TldClaimed",
                db: "Logged via processed_events (Phase 1 operator mint)",
              },
            ],
          },
          {
            contract: "HsrTld",
            color: "text-blue-400",
            events: [
              { name: "TldMinted", db: "tlds_v2 INSERT" },
              {
                name: "Transfer",
                db: "tlds_v2 UPDATE owner_address",
              },
              {
                name: "RegistrationEnabledUpdated",
                db: "tlds_v2 UPDATE registration_enabled",
              },
              {
                name: "RegistrationStrategyUpdated",
                db: "tlds_v2 UPDATE strategy_address",
              },
            ],
          },
          {
            contract: "HsrSld",
            color: "text-purple-400",
            events: [
              { name: "SldMinted", db: "slds_v2 INSERT" },
              {
                name: "SldRenewed",
                db: "slds_v2 UPDATE expiry_time",
              },
              {
                name: "ArtworkSet",
                db: "sld_artwork_v2 UPDATE (status: complete)",
              },
              {
                name: "Transfer",
                db: "slds_v2 UPDATE owner_address",
              },
            ],
          },
          {
            contract: "SldRegistrationManager",
            color: "text-amber-400",
            events: [
              {
                name: "Registered",
                db: "registration_events_v2 INSERT (type: register)",
              },
              {
                name: "Renewed",
                db: "registration_events_v2 INSERT (type: renew)",
              },
              {
                name: "ArtworkRequested",
                db: "sld_artwork_v2 INSERT (status: pending)",
              },
            ],
          },
          {
            contract: "PaymentManager",
            color: "text-green-400",
            events: [
              {
                name: "PaymentProcessed",
                db: "registration_events_v2 INSERT (type: payment)",
              },
            ],
          },
          {
            contract: "DefaultRegistrationStrategy",
            color: "text-orange-400",
            events: [
              {
                name: "LengthPricesSet",
                db: "tld_pricing_v2 UPSERT length_prices",
              },
              {
                name: "PremiumNameSet",
                db: "premium_names_v2 INSERT/DELETE",
              },
              {
                name: "ReservedNameSet",
                db: "reserved_names_v2 INSERT/DELETE",
              },
              {
                name: "MultiYearDiscountsSet",
                db: "tld_pricing_v2 UPSERT discounts",
              },
            ],
          },
        ].map((group) => (
          <Card
            key={group.contract}
            className="bg-zinc-900/40 border-zinc-800/50"
          >
            <CardContent className="pt-3 pb-2">
              <h4
                className={`text-xs font-semibold ${group.color} mb-2`}
              >
                {group.contract}
              </h4>
              <div className="space-y-1">
                {group.events.map((e) => (
                  <div
                    key={e.name}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-zinc-800/30"
                  >
                    <code className="text-zinc-300 text-[10px] font-mono">
                      {e.name}
                    </code>
                    <span className="text-zinc-500 text-[10px]">
                      {e.db}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Database Tables */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-400" />
          V2 Database Schema
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The V2 staking system uses 7 dedicated PostgreSQL tables that mirror
          on-chain state. The staking listener populates these tables from
          blockchain events.
        </p>

        <div className="space-y-2">
          {[
            {
              table: "tlds_v2",
              desc: "TLD registry — mirrors HsrTld contract",
              columns:
                "token_id, label, namehash, owner_address, registration_enabled, strategy_address",
              source: "TldMinted, Transfer, RegistrationEnabled/Strategy events",
            },
            {
              table: "slds_v2",
              desc: "Subdomain registry — mirrors HsrSld contract",
              columns:
                "token_id, label, tld_id (FK), namehash, full_name, owner_address, registration_time, expiry_time, registration_price_usd_cents",
              source: "SldMinted, SldRenewed, Transfer events",
            },
            {
              table: "pending_claims",
              desc: "FDC staking claim tracking (Phase 2)",
              columns:
                "tld_label, claimer_address, namehash, staking_fee_paid, fdc_round_id, attestation_request_bytes, status, attempts",
              source: "StakeRequested, StakeCompleted, StakeRefunded events",
            },
            {
              table: "tld_pricing_v2",
              desc: "Cached pricing from DefaultRegistrationStrategy",
              columns: "tld_id (FK), length_prices[10], multi_year_discounts[10]",
              source: "LengthPricesSet, MultiYearDiscountsSet events",
            },
            {
              table: "premium_names_v2",
              desc: "Premium-priced SLD labels per TLD",
              columns: "tld_id (FK), label, price_usd_cents",
              source: "PremiumNameSet events",
            },
            {
              table: "reserved_names_v2",
              desc: "Reserved SLD labels for specific wallets",
              columns: "tld_id (FK), label, reserved_for (wallet address)",
              source: "ReservedNameSet events",
            },
            {
              table: "registration_events_v2",
              desc: "Analytics log for all registration activity",
              columns:
                "sld_id (FK), event_type, tx_hash, flr_amount, usd_amount, payer_address",
              source: "Registered, Renewed, PaymentProcessed events",
            },
          ].map((t) => (
            <Card
              key={t.table}
              className="bg-zinc-900/40 border-zinc-800/50"
            >
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-amber-400 text-xs font-mono font-bold">
                    {t.table}
                  </code>
                  <span className="text-zinc-500 text-[10px]">{t.desc}</span>
                </div>
                <p className="text-zinc-400 text-[10px] mb-1">
                  <strong className="text-zinc-300">Columns:</strong> {t.columns}
                </p>
                <p className="text-zinc-500 text-[10px]">
                  <strong className="text-zinc-400">Source:</strong> {t.source}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* API Endpoints */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-amber-400" />
          Staking API Endpoints
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The V2 API provides endpoints for staking fee queries, claim status
          tracking, and user claim management. All routes are under{" "}
          <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
            /api/v2/
          </code>
          .
        </p>

        <div className="space-y-2">
          {[
            {
              method: "GET",
              path: "/staking/fee",
              desc: "Current staking fee in USD and FLR equivalent",
              auth: "Public",
              response:
                "{ feeUsdCents, feeFlr, flrPriceUsd, contractAddress }",
            },
            {
              method: "GET",
              path: "/staking/status/:tldLabel",
              desc: "Claim status for a specific TLD",
              auth: "Public",
              response:
                "{ tldLabel, status, claimerAddress, fdcRoundId, txHash, createdAt }",
            },
            {
              method: "POST",
              path: "/staking/my-claims",
              desc: "All pending/completed stakes for authenticated user",
              auth: "Wallet signature",
              response: "{ claims: [{ tldLabel, status, tokenId, ... }] }",
            },
            {
              method: "GET",
              path: "/tld/verify/:tldLabel",
              desc: "Pre-validation: HNS ownership + flr: TXT record check",
              auth: "Public",
              response:
                "{ tldLabel, namehash, registered, verified, hasFlrRecord }",
            },
          ].map((endpoint) => (
            <Card
              key={endpoint.path}
              className="bg-zinc-900/40 border-zinc-800/50"
            >
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge
                    className={`text-[10px] font-mono ${
                      endpoint.method === "GET"
                        ? "bg-blue-950/50 text-blue-400 border-blue-800/30"
                        : "bg-green-950/50 text-green-400 border-green-800/30"
                    }`}
                  >
                    {endpoint.method}
                  </Badge>
                  <code className="text-amber-400 text-xs font-mono">
                    {endpoint.path}
                  </code>
                  <Badge className="bg-zinc-800/60 text-zinc-400 border-zinc-700/40 text-[10px]">
                    {endpoint.auth}
                  </Badge>
                </div>
                <p className="text-zinc-400 text-xs mb-1">{endpoint.desc}</p>
                <p className="text-zinc-500 text-[10px] font-mono">
                  Response: {endpoint.response}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Integration Example */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCode className="h-5 w-5 text-amber-400" />
          Integration Example
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Query TLD ownership and subdomain pricing from the V2 contracts using
          ethers.js v6.
        </p>
        <CodeBlock
          language="typescript"
          code={`import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "https://coston2-api.flare.network/ext/C/rpc"
);

// HsrTld — check TLD ownership
const tldAbi = [
  "function ownerOfNamehash(bytes32 namehash) view returns (address)",
  "function tokenIdToLabel(uint256 tokenId) view returns (string)",
];
const hsrTld = new ethers.Contract(
  "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE",
  tldAbi,
  provider
);

// Compute namehash for a TLD (e.g., "cryptofans")
const namehash = ethers.keccak256(
  ethers.solidityPacked(
    ["bytes32", "bytes32"],
    [ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes("cryptofans"))]
  )
);
const owner = await hsrTld.ownerOfNamehash(namehash);
console.log(\`TLD owner: \${owner}\`);

// FtsoOracle — get current FLR/USD price
const oracleAbi = [
  "function usdCentsToFlr(uint256 usdCents) view returns (uint256)",
];
const oracle = new ethers.Contract(
  "0x08d391c50AE8aa94B031195491Ffa9Df7953200c",
  oracleAbi,
  provider
);

const flrFor10Usd = await oracle.usdCentsToFlr(1000);
console.log(\`$10 USD = \${ethers.formatEther(flrFor10Usd)} FLR\`);`}
        />
      </section>

      {/* Contract Address Reference */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-amber-400" />
          Full Address Reference
        </h2>
        <Card className="bg-zinc-900/40 border-zinc-800/50">
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-2 pr-4 text-left text-zinc-400 font-medium text-xs">
                      Contract
                    </th>
                    <th className="pb-2 pr-4 text-left text-zinc-400 font-medium text-xs">
                      Type
                    </th>
                    <th className="pb-2 text-left text-zinc-400 font-medium text-xs">
                      Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "HsrTld", type: "UUPS Proxy", addr: "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE" },
                    { name: "HsrSld", type: "UUPS Proxy", addr: "0xA94F9BB2877e969b63e78c148fdc66A61E415110" },
                    { name: "TldClaimManager", type: "UUPS Proxy", addr: "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4" },
                    { name: "SldRegistrationManager", type: "UUPS Proxy", addr: "0x9e680e851492F6135320FDaf64030F1F0Eb35D69" },
                    { name: "PaymentManager", type: "Immutable", addr: "0xc502b38C93A3B34D5E0BcFD83384678632D0F112" },
                    { name: "SldCommitIntent", type: "Immutable", addr: "0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d" },
                    { name: "DefaultRegistrationStrategy", type: "Immutable", addr: "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE" },
                    { name: "FtsoOracle", type: "Immutable", addr: "0x08d391c50AE8aa94B031195491Ffa9Df7953200c" },
                    { name: "LabelValidator", type: "Immutable", addr: "0x5D13FA219deA785754043D63Cae2059b8AE1D213" },
                    { name: "GlobalRegistrationRules", type: "Immutable", addr: "0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92" },
                    { name: "DefaultResolver", type: "Immutable", addr: "0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F" },
                    { name: "SldMetadataService", type: "Immutable", addr: "0x0f9AEC25344239E1356A7966F8E05F281C5daFF5" },
                    { name: "TldMetadataService", type: "Immutable", addr: "0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430" },
                  ].map((c) => (
                    <tr
                      key={c.name}
                      className="border-b border-zinc-800/40"
                    >
                      <td className="py-2 pr-4">
                        <span className="font-medium text-amber-400 text-xs">
                          {c.name}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={`text-[10px] ${c.type === "UUPS Proxy" ? "bg-blue-950/50 text-blue-400 border-blue-800/30" : "bg-zinc-800/60 text-zinc-400 border-zinc-700/40"}`}>
                          {c.type}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <a
                          href={`${EXPLORER}/${c.addr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-zinc-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                        >
                          {c.addr}
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

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-zinc-500">
              <span>
                Deployer/Operator:{" "}
                <code className="text-zinc-400 font-mono">0xCafB...d34B</code>
              </span>
              <span>|</span>
              <span>Platform Fee: 5% official / 20% community</span>
              <span>|</span>
              <span>Staking Fee: $10 USD</span>
              <span>|</span>
              <span>Network: Coston2 (Chain ID 114)</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Related Guides */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Related Guides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              title: "Smart Contracts",
              desc: "V2 contract details and ABIs",
              icon: FileCode,
              href: "/wiki/developers/smart-contracts",
            },
            {
              title: "Flare Network",
              desc: "FTSO pricing, FDC attestation, wallet setup",
              icon: Flame,
              href: "/wiki/concepts/flare-network",
            },
            {
              title: "Architecture",
              desc: "System diagrams and component overview",
              icon: Layers,
              href: "/wiki/developers/architecture",
            },
          ].map((guide) => (
            <Card
              key={guide.title}
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

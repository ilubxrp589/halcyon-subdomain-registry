"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Network,
  Server,
  Workflow,
  Shield,
  Cpu,
  FileCode,
  Layers,
} from "lucide-react";
import { MermaidDiagram } from "@/components/wiki/MermaidDiagram";

const diagrams = {
  overview: `flowchart TB
    classDef user fill:#7c3aed,stroke:#a78bfa,color:#fff,stroke-width:2px
    classDef frontend fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px
    classDef backend fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef chain fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef infra fill:#0891b2,stroke:#22d3ee,color:#fff,stroke-width:2px
    classDef gpu fill:#dc2626,stroke:#f87171,color:#fff,stroke-width:2px

    U["<b>Users</b><br/>Browser + Wallet"]:::user

    subgraph FE["Frontend"]
        direction LR
        Next["Next.js App"]
        W3["Web3Modal"]
    end
    class Next,W3 frontend

    subgraph BE["Backend"]
        direction LR
        API["API Server"]
        SVC["Services"]
        PG[("Database")]
    end
    class API,SVC backend
    class PG infra

    subgraph Chain["Flare Network (Coston2)"]
        direction LR
        V1["V1: SubdomainNFT + Escrow"]
        V2["V2: TLD Staking (13 contracts)"]
        FDC["Flare Data Connector"]
    end
    class V1,V2 chain
    class FDC chain

    subgraph DNS["DNS Infrastructure"]
        direction LR
        BIND["volume-resolver (BIND)"]
        HSD["hsd (Handshake)"]
    end
    class BIND,HSD infra

    subgraph Infra["Storage"]
        direction LR
        IPFS["IPFS / Pinata"]
    end
    class IPFS infra

    GPU["<b>GPU Cluster</b><br/>Distributed AI Generation"]:::gpu

    U --> FE
    FE --> BE
    FE <-.->|"RPC"| Chain
    BE --> Chain
    BE --> Infra
    BE --> DNS
    BE --> GPU`,

  components: `flowchart TB
    classDef route fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px
    classDef mw fill:#8b5cf6,stroke:#a78bfa,color:#fff,stroke-width:2px
    classDef svc fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef v2svc fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef data fill:#0891b2,stroke:#22d3ee,color:#fff,stroke-width:2px

    subgraph Layer1["API Layer"]
        direction LR
        R1["V1 Routes"]:::route
        R3["V2 Routes"]:::route
        R2["Admin Routes"]:::route
    end

    subgraph Layer2["Middleware"]
        direction LR
        A["Authentication"]:::mw
        V["Validation"]:::mw
        RL["Logging"]:::mw
    end

    subgraph Layer3["Services"]
        direction LR
        S1["Domain Services"]:::svc
        S2["NFT Services"]:::svc
        S3["Price Services"]:::svc
        S4["Image Generation"]:::svc
        S5["Contract Listener (V1)"]:::svc
    end

    subgraph Layer4["V2 Staking Services"]
        direction LR
        T1["Staking Listener"]:::v2svc
        T2["FDC Keeper Bot"]:::v2svc
        T3["DNS Agent"]:::v2svc
    end

    DB[("PostgreSQL (52+ tables)")]:::data

    Layer1 --> Layer2 --> Layer3 --> DB
    Layer4 --> DB`,

  registration: `sequenceDiagram
    autonumber
    participant U as User
    participant App as App
    participant IMG as Image Service
    participant Chain as Blockchain

    U->>App: Search domain
    App-->>U: Available, price in FLR

    U->>App: Select theme + prompt
    App->>IMG: Generate artwork
    IMG-->>App: Generated image

    App->>App: Upload to IPFS
    App-->>U: Preview image + metadata

    U->>Chain: Purchase + FLR payment
    Chain-->>Chain: Mint ERC-721 NFT
    Chain-->>U: Domain is yours!`,

  tldStaking: `sequenceDiagram
    autonumber
    participant Owner as TLD Owner
    participant HNS as Handshake DNS
    participant App as HSR Backend
    participant Chain as Flare (TldClaimManager)
    participant FDC as Flare Data Connector
    participant Keeper as FDC Keeper Bot

    Note over Owner,Keeper: Phase 2 — External TLD Staking

    Owner->>HNS: Set TXT record: flr:0xMyAddress
    Owner->>App: POST /api/v2/tld/verify?tld=mytld
    App->>HNS: Verify TXT record exists
    App-->>Owner: Ownership confirmed

    Owner->>Chain: requestStake("mytld") + staking fee
    Chain->>FDC: Request Web2Json attestation
    Note over FDC: Voting round (~90s)
    FDC-->>FDC: Validators attest TLD ownership

    Keeper->>FDC: Poll DA Layer for proof
    Keeper->>Chain: completeStake("mytld", proof)
    Chain->>Chain: Mint TLD NFT to owner
    Chain-->>Owner: TLD NFT received!

    Note over Owner,Keeper: Owner now earns 95% of SLD registrations`,

  v2Registration: `sequenceDiagram
    autonumber
    participant U as User
    participant App as HSR App
    participant CMT as SldCommitIntent
    participant REG as SldRegistrationManager
    participant PAY as PaymentManager
    participant SLD as HsrSld

    Note over U,SLD: Commit-Reveal Registration

    U->>App: Search subdomain
    App-->>U: Available, show price

    U->>CMT: commit(hash(label+tldId+secret))
    Note over CMT: Wait 8+ blocks

    U->>REG: registerWithCommit(label, tldId, years, secret) + FLR
    REG->>REG: Validate label (LabelValidator)
    REG->>REG: Check strategy pricing
    REG->>REG: Enforce global rules ($1/yr min)
    REG->>REG: Convert USD to FLR (FtsoOracle)
    REG->>PAY: Split payment (95% TLD owner / 5% platform)
    REG->>SLD: Mint SLD NFT with expiry
    SLD-->>U: SLD NFT minted!`,

  contracts: `flowchart TB
    classDef core fill:#7c3aed,stroke:#a78bfa,color:#fff,stroke-width:2px
    classDef commerce fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef oracle fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef soon fill:#52525b,stroke:#71717a,color:#a1a1aa,stroke-width:1px,stroke-dasharray:5 5
    classDef v2core fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef v2orch fill:#0891b2,stroke:#22d3ee,color:#fff,stroke-width:2px
    classDef v2val fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px

    subgraph V2["V2 TLD Staking System (Foundry)"]
        direction TB
        subgraph V2Core["Core NFT"]
            TLD["<b>HsrTld</b><br/>TLD NFTs (UUPS)"]
            SLD["<b>HsrSld</b><br/>SLD NFTs (UUPS)"]
        end
        class TLD,SLD v2core

        subgraph V2Orch["Orchestration"]
            CLM["<b>TldClaimManager</b><br/>FDC Staking"]
            REG["<b>SldRegistrationManager</b><br/>11-Step Registration"]
            PAY["<b>PaymentManager</b><br/>95/5 Split"]
            CMT["<b>SldCommitIntent</b><br/>Anti-Frontrunning"]
        end
        class CLM,REG,PAY,CMT v2orch

        subgraph V2Price["Strategy & Pricing"]
            STR["<b>DefaultRegistrationStrategy</b><br/>Per-TLD Pricing"]
            ORC["<b>FtsoOracle</b><br/>FLR/USD Feed"]
        end
        class STR,ORC oracle

        subgraph V2Rules["Validation"]
            LBL["<b>LabelValidator</b><br/>a-z 0-9 only"]
            GRR["<b>GlobalRegistrationRules</b><br/>$1/yr minimum"]
        end
        class LBL,GRR v2val

        CLM --> TLD
        REG --> SLD
        REG --> PAY
        REG --> STR
        STR --> ORC
        REG --> GRR
        GRR --> LBL
    end

    subgraph V1["V1 Legacy System (Hardhat)"]
        direction LR
        NFT["<b>SubdomainNFT</b><br/>ERC-721"]:::core
        ESC["<b>SubdomainEscrow</b><br/>Purchase"]:::commerce
        PRC["<b>PriceOracle</b><br/>FTSO"]:::oracle
        MKT["<b>Marketplace</b><br/>Coming Soon"]:::soon
        ESC --> NFT
        ESC --> PRC
    end`,


  imageGen: `flowchart TB
    classDef user fill:#7c3aed,stroke:#a78bfa,color:#fff
    classDef backend fill:#059669,stroke:#34d399,color:#fff
    classDef gpu fill:#dc2626,stroke:#f87171,color:#fff
    classDef output fill:#3b82f6,stroke:#60a5fa,color:#fff

    REQ["User selects theme + prompt"]:::user
    ORCH["Image Generation Orchestrator"]:::backend

    subgraph Cluster["Distributed GPU Nodes"]
        direction LR
        subgraph N1["Node 1 — RTX 3060"]
            G0a["Worker 1"]:::gpu
            G0b["Worker 2"]:::gpu
        end
        subgraph N2["Node 2 — RTX 3060"]
            G1a["Worker 1"]:::gpu
            G1b["Worker 2"]:::gpu
        end
        subgraph N3["Node 3 — RTX 3080"]
            G2a["Worker 1"]:::gpu
            G2b["Worker 2"]:::gpu
        end
        subgraph N4["Node 4 — RTX 3080"]
            G3a["Worker 1"]:::gpu
            G3b["Worker 2"]:::gpu
        end
    end

    OUT["Image returned → IPFS upload"]:::output

    REQ --> ORCH
    ORCH -->|"dispatch to available worker"| Cluster
    Cluster --> OUT`,

  deployment: `flowchart TB
    classDef controller fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px
    classDef gpu fill:#dc2626,stroke:#f87171,color:#fff
    classDef data fill:#0891b2,stroke:#22d3ee,color:#fff
    classDef ext fill:#d97706,stroke:#fbbf24,color:#fff

    subgraph Main["Application Server"]
        direction TB
        subgraph Apps["Application Services"]
            FE["Frontend"]
            BE["Backend API"]
        end
        subgraph Data["Data Services"]
            PG[("Database")]
        end
    end
    class FE,BE controller
    class PG data

    subgraph GPUCluster["GPU Nodes"]
        direction LR
        subgraph DN1["Node 1 — RTX 3060"]
            W1a["Worker 1"]:::gpu
            W1b["Worker 2"]:::gpu
        end
        subgraph DN2["Node 2 — RTX 3060"]
            W2a["Worker 1"]:::gpu
            W2b["Worker 2"]:::gpu
        end
        subgraph DN3["Node 3 — RTX 3080"]
            W3a["Worker 1"]:::gpu
            W3b["Worker 2"]:::gpu
        end
        subgraph DN4["Node 4 — RTX 3080"]
            W4a["Worker 1"]:::gpu
            W4b["Worker 2"]:::gpu
        end
    end

    subgraph Ext["External Services"]
        direction LR
        FL["Flare RPC"]
        PIN["IPFS"]
        FTSO["Flare FTSO"]
    end
    class FL,PIN,FTSO ext

    BE --> GPUCluster
    BE --> Ext
    BE --> PG`,

  security: `flowchart TB
    classDef public fill:#dc2626,stroke:#f87171,color:#fff,stroke-width:2px
    classDef dmz fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef private fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef chain fill:#7c3aed,stroke:#a78bfa,color:#fff

    subgraph PUB["Public Zone"]
        INT["Internet"]:::public
    end

    subgraph DMZ["Application Zone"]
        FE["Frontend"]:::dmz
        API["Backend API"]:::dmz
    end

    subgraph PRIV["Private Zone"]
        DB[("Database")]:::private
        HNS["Handshake Node"]:::private
        GPU["GPU Workers"]:::private
    end

    CHAIN["Flare Blockchain"]:::chain

    INT --> FE & API
    API --> DB & HNS & GPU
    API <-->|"RPC"| CHAIN
    FE <-->|"Wallet RPC"| CHAIN`,
};

const contractAddresses = [
  // V2 TLD Staking System
  { name: "HsrTld", address: "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE", role: "TLD NFTs (UUPS proxy)", version: "V2" },
  { name: "HsrSld", address: "0xA94F9BB2877e969b63e78c148fdc66A61E415110", role: "SLD NFTs (UUPS proxy)", version: "V2" },
  { name: "TldClaimManager", address: "0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4", role: "Two-phase TLD staking", version: "V2" },
  { name: "SldRegistrationManager", address: "0x9e680e851492F6135320FDaf64030F1F0Eb35D69", role: "11-step SLD registration", version: "V2" },
  { name: "PaymentManager", address: "0xc502b38C93A3B34D5E0BcFD83384678632D0F112", role: "95/5 revenue split", version: "V2" },
  { name: "SldCommitIntent", address: "0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d", role: "Anti-frontrunning commits", version: "V2" },
  { name: "DefaultRegistrationStrategy", address: "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE", role: "Per-TLD pricing", version: "V2" },
  { name: "FtsoOracle", address: "0x08d391c50AE8aa94B031195491Ffa9Df7953200c", role: "FLR/USD price feed", version: "V2" },
  { name: "LabelValidator", address: "0x5D13FA219deA785754043D63Cae2059b8AE1D213", role: "Label format validation", version: "V2" },
  { name: "GlobalRegistrationRules", address: "0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92", role: "$1/yr minimum floor", version: "V2" },
  { name: "DefaultResolver", address: "0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F", role: "ENS-compatible resolver", version: "V2" },
  { name: "SldMetadataService", address: "0x0f9AEC25344239E1356A7966F8E05F281C5daFF5", role: "SLD NFT metadata", version: "V2" },
  { name: "TldMetadataService", address: "0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430", role: "TLD NFT metadata", version: "V2" },
  // V1 Legacy
  { name: "SubdomainNFT", address: "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38", role: "ERC-721 domain tokens", version: "V1" },
  { name: "SubdomainEscrow", address: "0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b", role: "Purchase & payment flow", version: "V1" },
  { name: "PriceOracle", address: "0x55b92A8C367d408F028914BFCd48D1D4d16960b0", role: "FLR/USD via FTSO", version: "V1" },
  { name: "SubdomainMarketplace", address: "0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92", role: "Domain trading (Coming Soon)", version: "V1" },
  { name: "CommunityTreasury", address: "0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD", role: "Community rewards (Coming Soon)", version: "V1" },
];

export default function ArchitectureContent() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">
          Architecture
        </Badge>
        <h1 className="text-4xl font-bold mb-4">System Architecture</h1>
        <p className="text-xl text-muted-foreground">
          Technical deep dive into how HSR components work together
        </p>
      </div>

      {/* Architecture Diagrams */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 bg-secondary/50 p-1">
          <TabsTrigger value="overview" className="gap-2">
            <Network className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="components" className="gap-2">
            <Server className="h-4 w-4" />
            Components
          </TabsTrigger>
          <TabsTrigger value="registration" className="gap-2">
            <Workflow className="h-4 w-4" />
            Registration
          </TabsTrigger>
          <TabsTrigger value="tldStaking" className="gap-2">
            <Layers className="h-4 w-4" />
            TLD Staking
          </TabsTrigger>
          <TabsTrigger value="v2Registration" className="gap-2">
            <Workflow className="h-4 w-4" />
            V2 Registration
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-2">
            <FileCode className="h-4 w-4" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="imageGen" className="gap-2">
            <Cpu className="h-4 w-4" />
            GPU Cluster
          </TabsTrigger>
          <TabsTrigger value="deployment" className="gap-2">
            <Server className="h-4 w-4" />
            Deployment
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                High-level view of the HSR ecosystem. Users interact through
                a Next.js frontend and crypto wallet. The backend orchestrates
                all services: V1 escrow contracts, V2 TLD staking system (13
                Foundry contracts with FDC attestation), DNS infrastructure
                (BIND + hsd), IPFS storage, and a distributed GPU cluster for
                AI image generation.
              </p>
              <MermaidDiagram chart={diagrams.overview} id="overview" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
                {[
                  {
                    label: "Frontend",
                    desc: "Next.js + Web3Modal",
                    color: "#3b82f6",
                  },
                  {
                    label: "Backend",
                    desc: "API + Staking Listener + Keeper",
                    color: "#059669",
                  },
                  {
                    label: "V2 Staking",
                    desc: "13 Foundry contracts (UUPS)",
                    color: "#d97706",
                  },
                  {
                    label: "DNS Stack",
                    desc: "BIND + dnsdist + hsd",
                    color: "#0891b2",
                  },
                  {
                    label: "Storage",
                    desc: "PostgreSQL + IPFS/Pinata",
                    color: "#0891b2",
                  },
                  {
                    label: "GPU Cluster",
                    desc: "4x ComfyUI instances",
                    color: "#dc2626",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: item.color }}
                  >
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Components ── */}
        <TabsContent value="components">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Backend Components
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Request flow through the backend: API routes pass through
                authentication and validation middleware before reaching the
                service layer.
              </p>
              <MermaidDiagram
                chart={diagrams.components}
                id="components"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Registration ── */}
        <TabsContent value="registration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-primary" />
                Registration Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Complete domain registration: search availability, generate
                AI artwork, upload to IPFS, pay via escrow contract, and
                mint as ERC-721 NFT.
              </p>
              <MermaidDiagram
                chart={diagrams.registration}
                id="registration"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TLD Staking ── */}
        <TabsContent value="tldStaking">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                TLD Staking Architecture (V2)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Two-phase TLD onboarding flow. Phase 1: platform operator batch
                mints ~300 owned Handshake TLDs. Phase 2: external TLD owners
                stake FLR and prove Handshake ownership via the Flare Data
                Connector (FDC) attestation system. The FDC Keeper Bot
                automatically completes stakes when proofs become available.
              </p>
              <MermaidDiagram
                chart={diagrams.tldStaking}
                id="tldStaking"
              />
              <h4 className="text-lg font-bold mt-8 mb-4">
                Key Components
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {
                    label: "TldClaimManager",
                    desc: "Two-phase staking orchestrator",
                    color: "#0891b2",
                  },
                  {
                    label: "HsrTld (ERC-721)",
                    desc: "TLD NFT with UUPS proxy",
                    color: "#d97706",
                  },
                  {
                    label: "FDC Attestation",
                    desc: "Web2Json ownership proof",
                    color: "#7c3aed",
                  },
                  {
                    label: "Keeper Bot",
                    desc: "Auto-completes stakes",
                    color: "#059669",
                  },
                  {
                    label: "Staking Listener",
                    desc: "20 events across 6 contracts",
                    color: "#dc2626",
                  },
                  {
                    label: "DA Layer",
                    desc: "Proof storage & retrieval",
                    color: "#3b82f6",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: item.color }}
                  >
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── V2 Registration ── */}
        <TabsContent value="v2Registration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-primary" />
                V2 SLD Registration Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                V2 registration uses an 11-step validation pipeline through
                SldRegistrationManager. Supports commit-reveal (anti-frontrunning)
                and signature-based paths. Payments split 95% to TLD owner, 5%
                platform via pull-pattern PaymentManager.
              </p>
              <MermaidDiagram
                chart={diagrams.v2Registration}
                id="v2Registration"
              />
              <h4 className="text-lg font-bold mt-8 mb-4">
                Registration Pipeline
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "1. Label Validation",
                    desc: "a-z, 0-9 only (LabelValidator)",
                    color: "#059669",
                  },
                  {
                    label: "2. TLD Active",
                    desc: "Check TLD NFT is staked",
                    color: "#d97706",
                  },
                  {
                    label: "3. Commit/Sig",
                    desc: "Anti-frontrunning or operator",
                    color: "#7c3aed",
                  },
                  {
                    label: "4. Not Reserved",
                    desc: "TLD owner reserved list",
                    color: "#dc2626",
                  },
                  {
                    label: "5. Strategy Price",
                    desc: "Length tiers + premium",
                    color: "#3b82f6",
                  },
                  {
                    label: "6. Global Rules",
                    desc: "$1/year minimum floor",
                    color: "#0891b2",
                  },
                  {
                    label: "7-8. FTSO Convert",
                    desc: "USD → FLR via oracle",
                    color: "#d97706",
                  },
                  {
                    label: "9-11. Pay & Mint",
                    desc: "Split, mint NFT, resolve",
                    color: "#059669",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: item.color }}
                  >
                    <p className="font-semibold text-xs">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Contracts ── */}
        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                Smart Contract Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Two contract systems on Flare Coston2. V2 (Foundry): 13 contracts
                for TLD staking, SLD registration, commit-reveal, and ENS-compatible
                resolution with UUPS proxies. V1 (Hardhat): 5 legacy contracts for
                escrow-based purchases.
              </p>

              {/* V2 System */}
              <div className="mb-8">
                <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">V2</Badge>
                  TLD Staking System
                  <span className="text-muted-foreground font-normal text-sm">(Foundry, 13 contracts)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Core NFT */}
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <h5 className="text-sm font-semibold text-amber-400 mb-3">Core NFT</h5>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-sm">HsrTld</span>
                          <span className="text-muted-foreground text-xs ml-2">TLD NFTs (UUPS)</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-sm">HsrSld</span>
                          <span className="text-muted-foreground text-xs ml-2">SLD NFTs (UUPS)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Orchestration */}
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
                    <h5 className="text-sm font-semibold text-cyan-400 mb-3">Orchestration</h5>
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium text-sm">TldClaimManager</span>
                        <span className="text-muted-foreground text-xs ml-2">FDC Staking</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">SldRegistrationManager</span>
                        <span className="text-muted-foreground text-xs ml-2">11-Step Registration</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">PaymentManagerV2</span>
                        <span className="text-muted-foreground text-xs ml-2">95/5 Split</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">SldCommitIntent</span>
                        <span className="text-muted-foreground text-xs ml-2">Anti-Frontrunning</span>
                      </div>
                    </div>
                  </div>
                  {/* Strategy & Pricing */}
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
                    <h5 className="text-sm font-semibold text-yellow-400 mb-3">Strategy & Pricing</h5>
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium text-sm">DefaultRegistrationStrategy</span>
                        <span className="text-muted-foreground text-xs ml-2">Per-TLD Pricing</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">FtsoOracle</span>
                        <span className="text-muted-foreground text-xs ml-2">FLR/USD Feed</span>
                      </div>
                    </div>
                  </div>
                  {/* Validation & Resolution */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <h5 className="text-sm font-semibold text-emerald-400 mb-3">Validation & Resolution</h5>
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium text-sm">LabelValidator</span>
                        <span className="text-muted-foreground text-xs ml-2">a-z 0-9 only</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">GlobalRegistrationRules</span>
                        <span className="text-muted-foreground text-xs ml-2">$1/yr minimum</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">DefaultResolver</span>
                        <span className="text-muted-foreground text-xs ml-2">On-chain resolution</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">SldMetadataService</span>
                        <span className="text-muted-foreground text-xs ml-2">SLD tokenURI</span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">TldMetadataService</span>
                        <span className="text-muted-foreground text-xs ml-2">TLD tokenURI</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* V2 Flow */}
                <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Flow:</span>{" "}
                  TldClaimManager → HsrTld &nbsp;|&nbsp; SldRegistrationManager → PaymentManagerV2 → FtsoOracle → HsrSld &nbsp;|&nbsp; CommitIntent → RegistrationManager → LabelValidator
                </div>
              </div>

              {/* V1 System */}
              <div className="mb-8">
                <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                  <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/40">V1</Badge>
                  Legacy System
                  <span className="text-muted-foreground font-normal text-sm">(Hardhat, 7 contracts)</span>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-center">
                    <div className="font-medium text-sm">SubdomainNFT</div>
                    <div className="text-muted-foreground text-xs">ERC-721</div>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <div className="font-medium text-sm">SubdomainEscrow</div>
                    <div className="text-muted-foreground text-xs">Purchase</div>
                  </div>
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
                    <div className="font-medium text-sm">PriceOracle</div>
                    <div className="text-muted-foreground text-xs">FTSO</div>
                  </div>
                  <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/5 p-3 text-center">
                    <div className="font-medium text-sm">Marketplace</div>
                    <div className="text-muted-foreground text-xs">Secondary Sales</div>
                  </div>
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-center">
                    <div className="font-medium text-sm">HSRResolver</div>
                    <div className="text-muted-foreground text-xs">Name Resolution</div>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <div className="font-medium text-sm">DNSOracle</div>
                    <div className="text-muted-foreground text-xs">DNS Verification</div>
                  </div>
                  <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/5 p-3 text-center">
                    <div className="font-medium text-sm">CommunityTreasury</div>
                    <div className="text-muted-foreground text-xs">Fee Distribution</div>
                  </div>
                </div>
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">
                Contract Addresses (Coston2 Testnet)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 w-12">Ver</th>
                      <th className="text-left py-2 pr-4">Contract</th>
                      <th className="text-left py-2 pr-4">Role</th>
                      <th className="text-left py-2">Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractAddresses.map((c) => (
                      <tr
                        key={`${c.version}-${c.name}`}
                        className="border-b border-border/50"
                      >
                        <td className="py-2 pr-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${c.version === "V2" ? "border-amber-500/40 text-amber-400" : "border-zinc-600/40 text-zinc-500"}`}
                          >
                            {c.version}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-medium">
                          {c.name}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {c.role}
                        </td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          <a
                            href={`https://coston2-explorer.flare.network/address/${c.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary transition-colors"
                          >
                            {c.address}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* ── GPU Cluster ── */}
        <TabsContent value="imageGen">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                GPU Cluster &amp; Image Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Distributed AI image generation across multiple remote GPU
                workers. The application server orchestrates work across the
                cluster. Users select a theme and prompt, an image is
                generated on an available worker, then uploaded to IPFS for
                the NFT.
              </p>
              <MermaidDiagram
                chart={diagrams.imageGen}
                id="imageGen"
              />

              <h4 className="text-lg font-bold mt-8 mb-4">
                How It Works
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Input", value: "Theme + Prompt" },
                  { label: "Processing", value: "AI Image Generation" },
                  { label: "Storage", value: "IPFS Pinning" },
                  { label: "Output", value: "NFT Metadata" },
                ].map((spec) => (
                  <Card key={spec.label} className="bg-secondary/30">
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {spec.label}
                      </p>
                      <p className="font-mono font-bold mt-1">
                        {spec.value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Deployment ── */}
        <TabsContent value="deployment">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Deployment Topology
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                The application server runs all core services and
                coordinates remote GPU worker nodes over HTTP for image
                generation.
              </p>
              <MermaidDiagram
                chart={diagrams.deployment}
                id="deployment"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security Boundaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Three security zones: public-facing ingress, application
                zone (frontend + API), and a private zone for databases,
                DNS, and GPU infrastructure.
              </p>
              <MermaidDiagram
                chart={diagrams.security}
                id="security"
              />

              <h4 className="text-lg font-bold mt-8 mb-4">
                Security Layers
              </h4>
              <div className="space-y-3">
                {[
                  {
                    layer: "Network",
                    color: "#dc2626",
                    controls:
                      "DDoS protection, TLS encryption, traffic filtering",
                  },
                  {
                    layer: "API",
                    color: "#d97706",
                    controls:
                      "Rate limiting, CORS policy, security headers, input validation",
                  },
                  {
                    layer: "Auth",
                    color: "#d97706",
                    controls:
                      "Wallet signature verification, nonce replay protection, session management",
                  },
                  {
                    layer: "Database",
                    color: "#059669",
                    controls:
                      "Parameterized queries, connection pooling, encrypted backups",
                  },
                  {
                    layer: "Blockchain",
                    color: "#7c3aed",
                    controls:
                      "On-chain access control, escrow payment pattern, role-based permissions",
                  },
                ].map((item) => (
                  <div
                    key={item.layer}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: item.color }}
                  >
                    <Badge variant="outline" className="shrink-0 mt-0.5">
                      {item.layer}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {item.controls}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

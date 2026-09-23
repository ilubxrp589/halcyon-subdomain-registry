"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Network,
  Server,
  Database,
  Workflow,
  Shield,
  Cpu,
  Globe,
  FileCode,
} from "lucide-react";

// Mermaid diagram component
function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#8b5cf6",
            primaryTextColor: "#fff",
            primaryBorderColor: "#7c3aed",
            lineColor: "#64748b",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
            background: "#0f172a",
            mainBkg: "#1e293b",
            nodeBkg: "#1e293b",
            nodeBorder: "#475569",
            clusterBkg: "#1e293b",
            clusterBorder: "#475569",
            titleColor: "#f1f5f9",
            edgeLabelBackground: "#1e293b",
            actorTextColor: "#f1f5f9",
            actorBkg: "#1e293b",
            actorBorder: "#8b5cf6",
            signalColor: "#f1f5f9",
            signalTextColor: "#f1f5f9",
            labelBoxBkgColor: "#1e293b",
            labelBoxBorderColor: "#475569",
            labelTextColor: "#f1f5f9",
            loopTextColor: "#f1f5f9",
            noteBorderColor: "#8b5cf6",
            noteBkgColor: "#1e293b",
            noteTextColor: "#f1f5f9",
            activationBorderColor: "#8b5cf6",
            activationBkgColor: "#1e293b",
            sequenceNumberColor: "#fff",
          },
          flowchart: {
            htmlLabels: true,
            curve: "basis",
          },
          sequence: {
            diagramMarginX: 10,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            mirrorActors: true,
            useMaxWidth: true,
          },
        });

        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        setSvg(svg);
        setError("");
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError("Failed to render diagram");
      }
    };

    renderDiagram();
  }, [chart, id]);

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/50 rounded-lg p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Architecture diagram data
const diagrams = {
  overview: `flowchart TB
    subgraph Users["Users"]
        Browser[Web Browser]
        Wallet[Crypto Wallet]
    end

    subgraph Frontend["Frontend - Next.js"]
        UI[React UI]
        Web3[Web3Modal]
        API_Client[API Client]
    end

    subgraph Backend["Backend - Node.js/Express"]
        API[REST API]
        Auth[Auth Middleware]
        Services[Service Layer]
        DB[(PostgreSQL)]
    end

    subgraph Blockchain["Flare Network"]
        NFT[SubdomainNFT]
        Escrow[SubdomainEscrow]
        Market[SubdomainMarketplace]
        Resolver[HSRResolver]
        Oracle[PriceOracle]
    end

    subgraph DNS["DNS Infrastructure"]
        HNS[Handshake Node]
        PDNS[PowerDNS]
    end

    subgraph Storage["Storage"]
        IPFS[IPFS/Pinata]
        Cache[Image Cache]
    end

    subgraph GPU["GPU Cluster"]
        GPU0[RTX 3060 #0]
        GPU1[RTX 3060 #1]
        GPU2[RTX 3060 #2]
        ComfyUI[ComfyUI]
    end

    Browser --> UI
    Wallet --> Web3
    UI --> API_Client
    Web3 --> Blockchain
    API_Client --> API
    API --> Auth --> Services
    Services --> DB
    Services --> HNS
    Services --> PDNS
    Services --> IPFS
    Services --> ComfyUI
    ComfyUI --> GPU0 & GPU1 & GPU2
    Services --> Blockchain
    NFT --> Resolver
    Escrow --> NFT
    Market --> NFT
    Oracle --> Escrow`,

  components: `flowchart LR
    subgraph API["API Layer"]
        Routes[routes.js]
        Admin[adminRoutes.js]
    end

    subgraph Middleware["Middleware"]
        AuthMW[auth.js]
        Valid[validation.js]
        Audit[auditMiddleware.js]
        Logger[requestLogger.js]
    end

    subgraph Services["Service Layer"]
        HNS_Svc[hns.js]
        PDNS_Svc[pdns.js]
        NFT_Svc[nft.js]
        FTSO[ftso.js]
        Listener[contractListener.js]
        FluxGPU[fluxMultiGPU.js]
        ImgCache[imageCache.js]
        Storage[nftStorage.js]
    end

    subgraph Data["Data Layer"]
        Pool[(pg Pool)]
        Query[query]
    end

    Routes --> AuthMW --> Valid --> Services
    Admin --> AuthMW --> Audit --> Services
    Services --> Query --> Pool`,

  registration: `sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant E as Escrow Contract
    participant N as NFT Contract
    participant I as IPFS

    Note over U,I: Phase 1: Search & Prepare
    U->>F: Search "alice.cryptofans"
    F->>B: GET /search?subdomain=alice&tld=cryptofans
    B->>B: Check availability
    B-->>F: available: true, price: 500 FLR

    U->>F: Customize NFT
    F->>B: POST /nft/flux-generate-parallel
    B->>B: Generate 3 images on 3 GPUs
    B-->>F: images: [img1, img2, img3]

    U->>F: Select image
    F->>B: POST /nft/flux-prepare
    B->>I: Upload to IPFS
    B-->>F: metadataURI: ipfs://...

    Note over U,I: Phase 2: Payment
    U->>F: Click Purchase
    F->>E: createEscrow(subdomain, tld, metadataURI)
    E-->>F: EscrowCreated(escrowId)

    Note over U,I: Phase 3: Minting
    E->>N: mint(owner, subdomain, tld, metadataURI)
    N-->>E: Transfer complete
    E-->>F: PurchaseCompleted(tokenId)`,

  contracts: `flowchart TB
    subgraph Core["Core Contracts"]
        NFT[SubdomainNFT<br/>ERC-721]
        Registry[HSRRegistry<br/>Domain Registry]
        Resolver[HSRResolver<br/>ENS-compatible]
    end

    subgraph Commerce["Commerce Contracts"]
        Escrow[SubdomainEscrow<br/>Payment Handling]
        Market[SubdomainMarketplace<br/>Trading]
    end

    subgraph Oracles["Oracle Contracts"]
        Price[PriceOracle<br/>FLR/USD via FTSO]
        DNS[DNSOracle<br/>DNS Verification]
    end

    Escrow -->|mint| NFT
    Escrow -->|getPrice| Price
    Escrow -->|verifyDNS| DNS

    Market -->|transferFrom| NFT
    Market -->|royaltyInfo| NFT

    NFT -->|register| Registry
    NFT -->|setAddr| Resolver`,

  marketplace: `sequenceDiagram
    autonumber
    participant S as Seller
    participant B as Buyer
    participant F as Frontend
    participant M as Marketplace
    participant N as NFT Contract

    Note over S,N: Fixed Price Listing
    S->>F: List domain for 1000 FLR
    S->>N: approve(marketplace, tokenId)
    S->>M: createListing(tokenId, price)
    M-->>F: ListingCreated

    Note over S,N: Purchase
    B->>F: View listing
    B->>M: buy(listingId) + 1000 FLR
    M->>M: Calculate fees 5%
    M->>N: transferFrom(seller, buyer)
    M->>S: Transfer 950 FLR
    M-->>F: ListingSold`,

  dns: `flowchart LR
    subgraph Client["Client Application"]
        App[dApp / Wallet]
    end

    subgraph Resolution["Resolution Path"]
        SDK[HSR SDK]
        API[HSR API]
        Contract[HSRResolver]
        DB[(Database)]
    end

    App -->|resolve alice.cryptofans| SDK
    SDK -->|1. Try API cache| API
    API -->|Check DB| DB
    DB -->|Cache hit| API
    API -->|0x1234...| SDK

    SDK -->|2. Fallback to chain| Contract
    Contract -->|addr namehash| SDK

    SDK -->|0x1234...| App`,

  imageGen: `flowchart TB
    subgraph Request["User Request"]
        User[User selects 3 themes]
        Prompt[Custom prompt]
    end

    subgraph Backend["Backend Orchestration"]
        FluxSvc[fluxMultiGPU.js]
        Queue[Generation Queue]
    end

    subgraph GPUs["GPU Cluster - 3x RTX 3060"]
        subgraph GPU0["GPU 0 - Port 8188"]
            ComfyUI0[ComfyUI]
            Theme0[Theme: Cyberpunk]
        end
        subgraph GPU1["GPU 1 - Port 8189"]
            ComfyUI1[ComfyUI]
            Theme1[Theme: Fantasy]
        end
        subgraph GPU2["GPU 2 - Port 8190"]
            ComfyUI2[ComfyUI]
            Theme2[Theme: Abstract]
        end
    end

    subgraph Output["Output"]
        Images[3 Generated Images]
        Select[User Selects Best]
        IPFS[Upload to IPFS]
    end

    User --> FluxSvc
    Prompt --> FluxSvc
    FluxSvc --> Queue
    Queue -->|Parallel| GPU0 & GPU1 & GPU2
    GPU0 --> Images
    GPU1 --> Images
    GPU2 --> Images
    Images --> Select --> IPFS`,

  deployment: `flowchart TB
    subgraph Internet["Internet"]
        Users[Users]
        CDN[Cloudflare CDN]
    end

    subgraph Server["Production Server"]
        subgraph PM2["PM2 Process Manager"]
            FE[halcyon-frontend<br/>:3000]
            BE[halcyon-backend<br/>:8000]
            HSD[halcyon-hsd<br/>:12037]
        end

        subgraph GPU_PM2["PM2 - GPU Services"]
            C0[comfyui-gpu0<br/>:8188]
            C1[comfyui-gpu1<br/>:8189]
            C2[comfyui-gpu2<br/>:8190]
        end

        subgraph Data["Data Services"]
            PG[(PostgreSQL<br/>:5432)]
            Redis[(Redis<br/>:6379)]
        end
    end

    subgraph External["External Services"]
        Flare[Flare RPC]
        Pinata[Pinata IPFS]
        FTSO[Flare FTSO]
    end

    Users --> CDN --> FE
    FE --> BE
    BE --> PG
    BE --> Redis
    BE --> HSD
    BE --> C0 & C1 & C2
    BE --> Flare
    BE --> Pinata`,

  security: `flowchart TB
    subgraph Public["Public Zone"]
        Internet[Internet Users]
        CDN[CDN/WAF]
    end

    subgraph DMZ["DMZ"]
        FE[Frontend :3000]
        API[Backend :8000]
    end

    subgraph Private["Private Zone"]
        DB[(PostgreSQL)]
        HNS[HNS Node]
        GPU[GPU Cluster]
    end

    subgraph Blockchain["Blockchain"]
        Contracts[Smart Contracts]
    end

    Internet --> CDN --> FE & API
    API --> DB & HNS & GPU
    API <--> Contracts
    FE <--> Contracts`,
};

// Contract addresses
const contractAddresses = [
  { name: "SubdomainNFT", address: "0x1a6830B495Cd0f6dd8996c7d561EFa7868253398" },
  { name: "SubdomainEscrow", address: "0x3a62659F0C46E02edD42F1834801705f309144DA" },
  { name: "SubdomainMarketplace", address: "0xEc2669629608134474cb7F818710D602CadC6C04" },
  { name: "HSRResolver", address: "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1" },
  { name: "PriceOracle", address: "0xfCf8c862933b23fbFE99a30EfFB8FF867a8e55A1" },
];

// Port reference
const portReference = [
  { service: "Frontend", port: "3000", protocol: "HTTP" },
  { service: "Backend API", port: "8000", protocol: "HTTP" },
  { service: "HNS Node (RPC)", port: "12037", protocol: "HTTP" },
  { service: "HNS Node (DNS)", port: "12039", protocol: "DNS" },
  { service: "PostgreSQL", port: "5432", protocol: "TCP" },
  { service: "Redis", port: "6379", protocol: "TCP" },
  { service: "ComfyUI GPU0", port: "8188", protocol: "HTTP" },
  { service: "ComfyUI GPU1", port: "8189", protocol: "HTTP" },
  { service: "ComfyUI GPU2", port: "8190", protocol: "HTTP" },
  { service: "PowerDNS API", port: "8081", protocol: "HTTP" },
  { service: "PowerDNS DNS", port: "53", protocol: "UDP/TCP" },
];

export default function ArchitecturePage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">Architecture</Badge>
        <h1 className="text-4xl font-bold mb-4">System Architecture</h1>
        <p className="text-xl text-muted-foreground">
          Technical deep dive into how HSR components work together
        </p>
      </div>

      {/* Main Diagrams */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 bg-secondary/50 p-1">
          <TabsTrigger value="overview" className="gap-2">
            <Network className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="components" className="gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Components</span>
          </TabsTrigger>
          <TabsTrigger value="registration" className="gap-2">
            <Workflow className="h-4 w-4" />
            <span className="hidden sm:inline">Registration</span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-2">
            <FileCode className="h-4 w-4" />
            <span className="hidden sm:inline">Contracts</span>
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Marketplace</span>
          </TabsTrigger>
          <TabsTrigger value="dns" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">DNS</span>
          </TabsTrigger>
          <TabsTrigger value="imageGen" className="gap-2">
            <Cpu className="h-4 w-4" />
            <span className="hidden sm:inline">Image Gen</span>
          </TabsTrigger>
          <TabsTrigger value="deployment" className="gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Deployment</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                High-level view of the HSR ecosystem showing all major components and their interactions.
              </p>
              <MermaidDiagram chart={diagrams.overview} id="overview" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="components">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Backend Components
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Detailed view of the backend service architecture showing API routes, middleware, and services.
              </p>
              <MermaidDiagram chart={diagrams.components} id="components" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-primary" />
                Registration Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Complete domain registration process from search to NFT mint.
              </p>
              <MermaidDiagram chart={diagrams.registration} id="registration" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                Smart Contract Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Relationships between HSR smart contracts on Flare Network.
              </p>
              <MermaidDiagram chart={diagrams.contracts} id="contracts" />

              <h4 className="text-lg font-bold mt-6 mb-3">Contract Addresses (Coston2 Testnet)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Contract</th>
                      <th className="text-left py-2">Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractAddresses.map((contract) => (
                      <tr key={contract.name} className="border-b">
                        <td className="py-2 font-medium">{contract.name}</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          {contract.address}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Marketplace Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Domain listing, bidding, and sale process including fee distribution.
              </p>
              <MermaidDiagram chart={diagrams.marketplace} id="marketplace" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dns">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                DNS Resolution Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                How HSR domains resolve to wallet addresses with caching and on-chain fallback.
              </p>
              <MermaidDiagram chart={diagrams.dns} id="dns" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imageGen">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Image Generation Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Multi-GPU image generation flow for NFT artwork using SDXL and Animagine models.
              </p>
              <MermaidDiagram chart={diagrams.imageGen} id="imageGen" />

              <h4 className="text-lg font-bold mt-6 mb-3">Generation Specs</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm text-muted-foreground">Model</p>
                    <p className="font-mono font-bold">SDXL / Animagine</p>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm text-muted-foreground">Resolution</p>
                    <p className="font-mono font-bold">1024x1024</p>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm text-muted-foreground">Steps</p>
                    <p className="font-mono font-bold">4</p>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm text-muted-foreground">Time</p>
                    <p className="font-mono font-bold">8-12 sec</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Deployment Topology
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Production deployment architecture with PM2 process management.
              </p>
              <MermaidDiagram chart={diagrams.deployment} id="deployment" />

              <h4 className="text-lg font-bold mt-6 mb-3">Port Reference</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Service</th>
                      <th className="text-left py-2">Port</th>
                      <th className="text-left py-2">Protocol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portReference.map((item) => (
                      <tr key={item.service} className="border-b">
                        <td className="py-2">{item.service}</td>
                        <td className="py-2 font-mono text-primary">{item.port}</td>
                        <td className="py-2 text-muted-foreground">{item.protocol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security Boundaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Network segmentation and security zones.
              </p>
              <MermaidDiagram chart={diagrams.security} id="security" />

              <h4 className="text-lg font-bold mt-6 mb-3">Security Controls</h4>
              <div className="space-y-3">
                {[
                  { layer: "CDN", controls: "DDoS protection, WAF, SSL termination" },
                  { layer: "API", controls: "Rate limiting, CORS, Helmet.js, Input validation" },
                  { layer: "Auth", controls: "Wallet signature verification, Nonce replay protection" },
                  { layer: "Database", controls: "Connection pooling, Parameterized queries" },
                  { layer: "Blockchain", controls: "On-chain access control, Escrow pattern" },
                ].map((item) => (
                  <div key={item.layer} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                    <Badge variant="outline">{item.layer}</Badge>
                    <span className="text-sm text-muted-foreground">{item.controls}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Data Flow Summary */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Data Flow Summary</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-secondary/30">
                <h4 className="font-bold mb-2">Input</h4>
                <p className="text-sm text-muted-foreground">User actions via Frontend</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/30">
                <h4 className="font-bold mb-2">Processing</h4>
                <p className="text-sm text-muted-foreground">Backend API + Blockchain</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/30">
                <h4 className="font-bold mb-2">Storage</h4>
                <p className="text-sm text-muted-foreground">PostgreSQL + IPFS + On-chain</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

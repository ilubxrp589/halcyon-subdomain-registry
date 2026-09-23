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
  Database,
  Globe,
  Search,
  Server,
  Activity,
  Layers,
  Eye,
  Filter,
  BarChart3,
  Network,
  Camera,
  Terminal,
} from "lucide-react";
import { MermaidDiagram } from "@/components/wiki/MermaidDiagram";

/* ─────────────────── Mermaid diagrams ─────────────────── */

const diagrams = {
  pipeline: `flowchart TB
    classDef stage fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px
    classDef data fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef output fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef infra fill:#0891b2,stroke:#22d3ee,color:#fff,stroke-width:2px

    HSD["hsd Full Node<br/>12.7M names"]:::infra
    DUMP["Stage 1: Blockchain Dump"]:::stage
    FILTER["Stage 2: Pre-filter"]:::stage
    DNS["Stage 3: DNS Scan"]:::stage
    HTTP["Stage 4: HTTP Probe"]:::stage
    CLASS["Stage 5: Classification"]:::stage
    IP["Stage 6: IP Analysis"]:::stage
    SCREEN["Stage 7: Screenshots"]:::stage
    DB[("PostgreSQL")]:::data
    API["REST API"]:::output
    FE["Frontend"]:::output
    HSR["HSR Backend<br/>/api/v2/indexer"]:::output

    HSD --> DUMP
    DUMP -->|"~4 hours"| FILTER
    FILTER -->|"12.7M → 35.8K<br/>DNS-configured only"| DNS
    DNS -->|"500 concurrent<br/>595 q/s"| HTTP
    HTTP -->|"50 concurrent<br/>5.9 r/s"| CLASS
    CLASS --> IP
    IP --> SCREEN
    CLASS --> DB
    IP --> DB
    SCREEN --> DB
    DB --> API
    DB --> HSR
    API --> FE`,

  integration: `flowchart LR
    classDef hsr fill:#7c3aed,stroke:#a78bfa,color:#fff,stroke-width:2px
    classDef indexer fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef shared fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef fe fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px

    subgraph HSR_BE["HSR Backend"]
        direction TB
        ROUTES["/api/v2/indexer/*"]:::hsr
        TLD_MATCH["TLD Matching<br/>Cross-DB lookup"]:::hsr
    end

    subgraph IDX["HNS Indexer (standalone)"]
        direction TB
        IDX_API["REST API"]:::indexer
        IDX_FE["Frontend UI"]:::indexer
        PIPE["Pipeline Scripts<br/>Daily batch scan"]:::indexer
    end

    subgraph Data["Databases"]
        direction TB
        HSR_DB[("HSR DB")]:::shared
        IDX_DB[("Indexer DB")]:::shared
    end

    subgraph FE["HSR Frontend"]
        SVC["Indexer Service"]:::fe
        PAGES["Explore / Browse"]:::fe
    end

    ROUTES --> IDX_DB
    TLD_MATCH --> HSR_DB
    IDX_API --> IDX_DB
    PIPE --> IDX_DB
    IDX_FE --> IDX_API
    SVC -->|"/api/v2/indexer"| ROUTES
    PAGES --> SVC`,

  classification: `flowchart TB
    classDef real fill:#059669,stroke:#34d399,color:#fff,stroke-width:2px
    classDef parking fill:#d97706,stroke:#fbbf24,color:#fff,stroke-width:2px
    classDef empty fill:#6b7280,stroke:#9ca3af,color:#fff,stroke-width:2px
    classDef error fill:#dc2626,stroke:#f87171,color:#fff,stroke-width:2px
    classDef input fill:#3b82f6,stroke:#60a5fa,color:#fff,stroke-width:2px

    HTTP["HTTP Probe Results<br/>35,838 domains"]:::input

    HTTP --> ALIVE{"HTTP 200?"}
    ALIVE -->|Yes| TITLE{"Has unique title?"}
    ALIVE -->|No| ERR["Error<br/>502 / timeout / refused"]:::error

    TITLE -->|Yes| PARK{"Parking keywords<br/>in title/body?"}
    TITLE -->|No| EMPTY["Empty<br/>Default server page"]:::empty

    PARK -->|Yes| PARKING["Parking<br/>Domain for sale"]:::parking
    PARK -->|No| CLUSTER{"IP hosts<br/>100+ domains?"}

    CLUSTER -->|Yes| PARKING
    CLUSTER -->|No| REAL["Real Site<br/>Genuine content"]:::real`,
};

/* ─────────────────── Stats data ─────────────────── */

const pipelineStats = [
  { label: "Total HNS Names", value: "12,720,872", desc: "Complete blockchain" },
  { label: "Registered", value: "7,021,179", desc: "55.2% of total" },
  { label: "DNS Configured", value: "35,838", desc: "0.28% have nameservers" },
  { label: "HTTP Responsive", value: "8,617", desc: "Return status 200" },
  { label: "HTTPS Enabled", value: "2,857", desc: "Valid SSL certificates" },
  { label: "Real Sites", value: "~408", desc: "Genuine content" },
  { label: "Unique IPs", value: "577", desc: "Distinct hosting IPs" },
  { label: "Parking Detected", value: "34,490+", desc: "6 major parking IPs" },
];

const apiEndpoints = [
  { method: "GET", path: "/stats", desc: "Aggregate statistics (total domains, classifications, last scan)" },
  { method: "GET", path: "/domains", desc: "Paginated domain listing with filters (classification, status, HTTPS, letter, sort)" },
  { method: "GET", path: "/domain/:name", desc: "Detailed info for a single domain (title, body text, keywords, screenshot)" },
  { method: "GET", path: "/search?q=", desc: "Full-text search across name, title, description, body text with relevance ranking" },
  { method: "GET", path: "/clusters", desc: "IP clusters with 50+ domains each (parking detection)" },
  { method: "GET", path: "/screenshots/:file", desc: "Serve domain screenshot JPEGs with path-traversal protection" },
  { method: "GET", path: "/proxy/:domain", desc: "Reverse-proxy Handshake sites via DoH resolution (no client DoH needed)" },
];

const hsrApiEndpoints = [
  { method: "GET", path: "/api/v2/indexer/stats", desc: "Same as standalone /stats — aggregate indexer statistics" },
  { method: "GET", path: "/api/v2/indexer/domains", desc: "Same as standalone /domains — paginated listing with all filters" },
  { method: "GET", path: "/api/v2/indexer/domain/:name", desc: "Same as standalone /domain/:name — single domain detail" },
  { method: "GET", path: "/api/v2/indexer/search?q=", desc: "Same as standalone /search — full-text search with ranking" },
  { method: "GET", path: "/api/v2/indexer/clusters", desc: "Same as standalone /clusters — IP cluster data" },
  { method: "GET", path: "/api/v2/indexer/screenshots/:file", desc: "Serve screenshot images from the indexer data directory" },
  { method: "GET", path: "/api/v2/indexer/tld-list", desc: "Returns all registration-enabled TLDs from HSR (cross-DB lookup)" },
  { method: "GET", path: "/api/v2/indexer/tld-match/:name", desc: "Check if an indexed HNS domain matches an HSR-enabled TLD" },
];

const dbColumns = {
  domains: [
    { col: "id", type: "SERIAL PRIMARY KEY" },
    { col: "name", type: "TEXT NOT NULL UNIQUE" },
    { col: "ip", type: "TEXT" },
    { col: "status", type: "TEXT DEFAULT 'unknown'", note: "alive, dead, error" },
    { col: "http_status", type: "INTEGER", note: "HTTP response code (200, 404, 502, etc.)" },
    { col: "https", type: "BOOLEAN DEFAULT FALSE" },
    { col: "title", type: "TEXT", note: "Extracted <title> tag" },
    { col: "description", type: "TEXT", note: "Meta description" },
    { col: "keywords", type: "TEXT", note: "Meta keywords" },
    { col: "body_text", type: "TEXT", note: "First 500 chars of visible text" },
    { col: "classification", type: "TEXT DEFAULT 'unknown'", note: "real, parking, empty, error" },
    { col: "class_reason", type: "TEXT", note: "Why this classification was assigned" },
    { col: "content_type", type: "TEXT", note: "MIME type (text/html, etc.)" },
    { col: "redirect", type: "TEXT", note: "Final URL after redirects" },
    { col: "response_time_ms", type: "INTEGER" },
    { col: "screenshot_path", type: "TEXT", note: "Path to JPEG screenshot" },
    { col: "ip_cluster_id", type: "INTEGER", note: "FK to ip_clusters" },
    { col: "first_seen", type: "TIMESTAMPTZ" },
    { col: "last_checked", type: "TIMESTAMPTZ" },
    { col: "last_alive", type: "TIMESTAMPTZ" },
  ],
  ip_clusters: [
    { col: "id", type: "SERIAL PRIMARY KEY" },
    { col: "ip", type: "TEXT NOT NULL UNIQUE" },
    { col: "domain_count", type: "INTEGER NOT NULL DEFAULT 0" },
    { col: "hosting_provider", type: "TEXT", note: "Detected provider (optional)" },
  ],
};

/* ─────────────────── Component ─────────────────── */

export default function HnsIndexerContent() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">
          Developers
        </Badge>
        <h1 className="text-4xl font-bold mb-4">HNS Indexer</h1>
        <p className="text-xl text-muted-foreground">
          A search engine for the entire Handshake decentralized naming ecosystem
          &mdash; scanning 12.7 million names, probing live domains, and classifying
          real sites from parking pages.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {pipelineStats.map((s) => (
          <Card key={s.label} className="bg-secondary/30">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {s.label}
              </p>
              <p className="font-mono font-bold text-lg mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 bg-secondary/50 p-1">
          <TabsTrigger value="overview" className="gap-2">
            <Layers className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2">
            <Activity className="h-4 w-4" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="classification" className="gap-2">
            <Filter className="h-4 w-4" />
            Classification
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Terminal className="h-4 w-4" />
            API
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-4 w-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2">
            <Network className="h-4 w-4" />
            HSR Integration
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                The HNS Indexer is a 7-stage data pipeline that scans the entire
                Handshake blockchain, filters for domains with active DNS, probes
                them over HTTP/HTTPS, classifies content, captures screenshots,
                and stores everything in PostgreSQL for search and discovery.
              </p>
              <MermaidDiagram chart={diagrams.pipeline} id="pipeline" />

              <h4 className="text-lg font-bold mt-8 mb-4">How It Works</h4>
              <div className="space-y-3">
                {[
                  {
                    stage: "1. Blockchain Dump",
                    desc: "Connects to the hsd full node via RPC and extracts all 12.7 million name records. Each record includes name, state (CLOSED/OPENING/etc.), registration height, renewal info, and expiry stats. Takes approximately 4 hours at ~880 names/second.",
                    color: "#3b82f6",
                  },
                  {
                    stage: "2. Pre-filter",
                    desc: "Memory-efficient streaming parser filters the 12.7M names down to ~35,838 that have DNS nameserver (NS) records configured. This eliminates 99.7% of names that are registered but have no active DNS, dramatically reducing the scan workload.",
                    color: "#3b82f6",
                  },
                  {
                    stage: "3. DNS Resolution",
                    desc: "Async DNS scanner resolves the 35,838 filtered names using the local hsd node. Runs 500 concurrent queries at 595 queries/second with checkpoint/resume capability. Takes approximately 6 hours. Records resolved IP addresses and alive/dead status.",
                    color: "#3b82f6",
                  },
                  {
                    stage: "4. HTTP Probing",
                    desc: "Python HTTP prober checks each alive domain over HTTPS first, falling back to HTTP. Extracts page title, meta description, meta keywords, first 500 characters of body text, content type, redirect chain, and response time. Runs 50 concurrent requests at 5.9 req/s with 5-second timeout. Checkpoints every 500 domains.",
                    color: "#3b82f6",
                  },
                  {
                    stage: "5. Classification",
                    desc: "Analyzes HTTP probe results to categorize each domain as real (genuine content), parking (domain-for-sale pages), empty (default server pages), or error (non-200 responses). Uses keyword matching in titles/body, IP cluster analysis, and title pattern detection. Detects 6 major parking IPs hosting 34,490+ parked domains.",
                    color: "#059669",
                  },
                  {
                    stage: "6. IP Analysis",
                    desc: "Groups all domains by resolved IP address to identify hosting clusters. Domains sharing an IP with 100+ other domains are flagged as parking infrastructure. Identifies ~577 unique IPs, ~140 medium clusters (2-100 domains), and 431 genuinely independent sites.",
                    color: "#059669",
                  },
                  {
                    stage: "7. Screenshot Capture",
                    desc: "Uses Playwright headless browser to capture JPEG screenshots of newly discovered domains. Screenshots are stored locally and served via the API. Only captures new domains to avoid re-scanning existing ones.",
                    color: "#d97706",
                  },
                ].map((item) => (
                  <div
                    key={item.stage}
                    className="flex items-start gap-3 p-4 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: item.color }}
                  >
                    <div>
                      <p className="font-semibold text-sm">{item.stage}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">Pipeline Execution</h4>
              <Card className="bg-secondary/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    The pipeline runs daily as a scheduled batch job.
                    Each stage runs sequentially with per-stage timing and exit code
                    capture. Comprehensive logging with daily rotation.
                    Supports Discord webhook notifications and checkpoint/resume
                    for long-running stages.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {[
                      { label: "Blockchain Dump", time: "~4 hours" },
                      { label: "DNS Scan", time: "~6 hours" },
                      { label: "HTTP Probe", time: "~1.7 hours" },
                      { label: "Full Pipeline", time: "~12 hours" },
                    ].map((t) => (
                      <div key={t.label} className="text-center p-2 rounded bg-muted/30">
                        <p className="text-xs text-muted-foreground">{t.label}</p>
                        <p className="font-mono font-bold text-sm">{t.time}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pipeline Details ── */}
        <TabsContent value="pipeline">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Data Pipeline Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Each pipeline stage is a standalone script that reads from the
                previous stage&rsquo;s output. All scripts support checkpoint/resume
                so interrupted runs can continue where they left off.
              </p>

              <h4 className="text-base font-bold mb-4">Stage Scripts</h4>
              <div className="space-y-3">
                {[
                  {
                    title: "Stage 1: Blockchain Dump",
                    lang: "Node.js",
                    input: "hsd RPC",
                    output: "NDJSON (~3.4GB)",
                    rate: "~880 names/sec",
                    details: "Iterates every name in the Handshake blockchain. Each record contains: name, nameHash, state (CLOSED/OPENING/BIDDING/REVEAL/etc.), height, renewal block, registered boolean, expired boolean, and stats (renewalPeriodsPaid, blocksUntilExpire).",
                  },
                  {
                    title: "Stage 2: Pre-filter",
                    lang: "Node.js",
                    input: "Blockchain dump",
                    output: "Filtered name list (35,838)",
                    rate: "Streaming, <500MB RAM",
                    details: "Memory-efficient streaming parser that reads the dump line-by-line. Queries hsd for each name's resource records and keeps only those with NS records configured. Reduces workload by 99.7%.",
                  },
                  {
                    title: "Stage 3: DNS Scan",
                    lang: "Python",
                    input: "Filtered name list",
                    output: "DNS resolution results",
                    rate: "500 concurrent, 595 q/sec",
                    details: "Async DNS resolver queries the local hsd node for A/AAAA records. Records resolved IP addresses, NXDOMAIN responses, and timeouts. Graceful shutdown with checkpoint file for resume.",
                  },
                  {
                    title: "Stage 4: HTTP Probe",
                    lang: "Python",
                    input: "DNS-alive domains",
                    output: "HTTP probe results",
                    rate: "50 concurrent, 5.9 req/sec",
                    details: "HTTPS-first with HTTP fallback. Extracts: page title, meta description, meta keywords, first 500 chars of visible body text, Content-Type, final redirect URL, response time in milliseconds. 5-second timeout per request.",
                  },
                  {
                    title: "Stage 5: Classification",
                    lang: "Python",
                    input: "HTTP probe results",
                    output: "Classified domains",
                    rate: "In-memory analysis",
                    details: "Multi-signal classification engine. Parking detection via keyword matching ('domain for sale', 'buy this domain', 'coming soon', 'parked domain') in titles and body text, plus IP cluster analysis (IPs hosting 100+ domains). Empty detection via default server page patterns.",
                  },
                  {
                    title: "Stage 6: IP Analysis",
                    lang: "Python",
                    input: "Classified domains",
                    output: "IP cluster data",
                    rate: "In-memory grouping",
                    details: "Groups all domains by resolved IP. Creates cluster entries for IPs hosting multiple domains. Tags large clusters (100+ domains) as parking infrastructure. Identifies hosting providers where possible.",
                  },
                  {
                    title: "Stage 7: Screenshot Capture",
                    lang: "Python",
                    input: "Newly discovered domains",
                    output: "JPEG screenshots",
                    rate: "Headless browser capture",
                    details: "Launches a headless Chromium browser to capture full-page screenshots. Only captures new domains not already screenshotted. Filenames use domain name (e.g., shakeshift.jpg).",
                  },
                ].map((s) => (
                  <div key={s.title} className="p-4 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-muted rounded text-sm font-bold">{s.title}</span>
                      <Badge variant="outline" className="text-[10px]">{s.lang}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{s.details}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="text-center p-1.5 rounded bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">Input</p>
                        <p className="text-xs font-medium">{s.input}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">Output</p>
                        <p className="text-xs font-medium">{s.output}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">Rate</p>
                        <p className="text-xs font-medium">{s.rate}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="text-base font-bold mt-8 mb-4">HTTP Probe Result Breakdown</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "200 OK", value: "8,617", color: "#059669" },
                  { label: "Unreachable", value: "24,616", color: "#6b7280" },
                  { label: "502 Bad Gateway", value: "2,133", color: "#dc2626" },
                  { label: "403 Forbidden", value: "249", color: "#d97706" },
                  { label: "404 Not Found", value: "158", color: "#d97706" },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="text-center p-3 rounded-lg bg-secondary/30 border-l-4"
                    style={{ borderLeftColor: r.color }}
                  >
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="font-mono font-bold">{r.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Classification ── */}
        <TabsContent value="classification">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Domain Classification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Every probed domain is classified into one of four categories
                using a multi-signal heuristic engine. The goal is to separate
                genuine content sites from the vast majority of parked,
                empty, and error domains.
              </p>
              <MermaidDiagram chart={diagrams.classification} id="classification" />

              <h4 className="text-lg font-bold mt-8 mb-4">Classification Categories</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    label: "Real",
                    count: "~408",
                    color: "#059669",
                    border: "border-emerald-500/30",
                    bg: "bg-emerald-500/5",
                    text: "text-emerald-400",
                    desc: "Genuine content sites with unique titles, meaningful body text, and hosted on independent IPs. These are the sites that provide actual value to the Handshake ecosystem.",
                    examples: "shakeshift (HNS Explorer), hnsdoh (DoH service), hnshosting (hosting provider), hackbase, clubit",
                  },
                  {
                    label: "Parking",
                    count: "~6,840",
                    color: "#d97706",
                    border: "border-amber-500/30",
                    bg: "bg-amber-500/5",
                    text: "text-amber-400",
                    desc: "Domain-for-sale pages detected via keyword matching ('domain for sale', 'buy this domain', 'coming soon') and IP cluster analysis. Six major IPs host 34,490+ parked domains.",
                    examples: "Detected via title keywords + IP clustering. Common patterns: GoDaddy parking, Sedo, Afternic-style pages.",
                  },
                  {
                    label: "Empty",
                    count: "~15,230",
                    color: "#6b7280",
                    border: "border-zinc-500/30",
                    bg: "bg-zinc-500/5",
                    text: "text-zinc-400",
                    desc: "Default server pages with no meaningful content. Includes nginx welcome pages, Apache test pages, Rails defaults, and blank index files. The server responds but no content has been published.",
                    examples: "nginx default, Apache 'It works!', IIS welcome page, blank index.html",
                  },
                  {
                    label: "Error",
                    count: "~13,360",
                    color: "#dc2626",
                    border: "border-red-500/30",
                    bg: "bg-red-500/5",
                    text: "text-red-400",
                    desc: "Domains that returned non-200 HTTP status codes (502 Bad Gateway, 403 Forbidden, 404 Not Found, 500 Internal Server Error) or timed out after 5 seconds without any response.",
                    examples: "502 (reverse proxy misconfigured), 403 (blocked), timeout (DNS resolves but no HTTP server)",
                  },
                ].map((cat) => (
                  <div key={cat.label} className={`rounded-lg border ${cat.border} ${cat.bg} p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className={`text-sm font-semibold ${cat.text}`}>{cat.label}</h5>
                      <Badge variant="outline" className="font-mono text-xs">{cat.count}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{cat.desc}</p>
                    <div className="p-2 rounded bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Examples:</span> {cat.examples}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">Parking Detection Heuristics</h4>
              <div className="space-y-2">
                {[
                  { signal: "Keyword Matching", desc: "Scans page title and body text for parking indicators: 'domain for sale', 'buy this domain', 'coming soon', 'parked domain', 'this domain is available'" },
                  { signal: "IP Cluster Analysis", desc: "If the domain's IP hosts 100+ other domains, it's flagged as parking infrastructure regardless of content. Six major parking IPs identified." },
                  { signal: "Title Pattern Analysis", desc: "Common parking page title patterns are matched: 'Buy [domain]', '[domain] - For Sale', 'Coming Soon - [domain]'" },
                  { signal: "Response Consistency", desc: "Domains sharing an IP that all return identical response sizes/titles are batch-classified as parking" },
                ].map((h) => (
                  <div key={h.signal} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                    <Badge variant="outline" className="shrink-0 mt-0.5 text-[10px]">{h.signal}</Badge>
                    <span className="text-sm text-muted-foreground">{h.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── API Reference ── */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                API Reference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                The HNS Indexer exposes a REST API on two paths: a standalone
                service and integrated into the HSR backend
                at <code className="px-1.5 py-0.5 bg-muted rounded text-xs">/api/v2/indexer</code>.
                Both serve the same data from the indexer database.
              </p>

              {/* Standalone API */}
              <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">Standalone</Badge>
                Indexer API
              </h4>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 w-16">Method</th>
                      <th className="text-left py-2 pr-4">Endpoint</th>
                      <th className="text-left py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiEndpoints.map((ep) => (
                      <tr key={ep.path} className="border-b border-border/50">
                        <td className="py-2 pr-2">
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                            {ep.method}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{ep.path}</td>
                        <td className="py-2 text-muted-foreground text-xs">{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* HSR Integrated API */}
              <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">HSR</Badge>
                Integrated API (/api/v2/indexer)
              </h4>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 w-16">Method</th>
                      <th className="text-left py-2 pr-4">Endpoint</th>
                      <th className="text-left py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hsrApiEndpoints.map((ep) => (
                      <tr key={ep.path} className="border-b border-border/50">
                        <td className="py-2 pr-2">
                          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-400">
                            {ep.method}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{ep.path}</td>
                        <td className="py-2 text-muted-foreground text-xs">{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Query Parameters */}
              <h4 className="text-base font-bold mb-4">Domain Listing Query Parameters</h4>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4">Parameter</th>
                      <th className="text-left py-2 pr-4">Default</th>
                      <th className="text-left py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { param: "page", def: "1", desc: "Page number for pagination" },
                      { param: "limit", def: "24 (max 100)", desc: "Results per page" },
                      { param: "classification", def: "—", desc: "Filter: real, parking, empty, error" },
                      { param: "status", def: "—", desc: "Filter: alive, dead, error" },
                      { param: "ip", def: "—", desc: "Filter by resolved IP address" },
                      { param: "https", def: "—", desc: "true to show only HTTPS-enabled sites" },
                      { param: "has_title", def: "—", desc: "true to show only sites with extracted titles" },
                      { param: "letter", def: "—", desc: "A-Z for alphabetic navigation, # for numbers" },
                      { param: "show_clusters", def: "false", desc: "true to include large IP cluster domains" },
                      { param: "sort", def: "name", desc: "name, response_time, newest, checked" },
                    ].map((p) => (
                      <tr key={p.param} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-xs">{p.param}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{p.def}</td>
                        <td className="py-2 text-muted-foreground text-xs">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Search */}
              <h4 className="text-base font-bold mb-4">Full-Text Search</h4>
              <Card className="bg-secondary/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    The <code className="px-1.5 py-0.5 bg-muted rounded text-xs">/search?q=</code> endpoint
                    uses PostgreSQL full-text search (tsvector + tsquery) with English language
                    stemming. Results are ranked by relevance score and support all the same
                    filters as the domain listing endpoint.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Searched fields:</span>{" "}
                    name, title, description, body_text. The GIN index on these fields enables
                    fast full-text queries across all 35,838 indexed domains.
                  </p>
                </CardContent>
              </Card>

              {/* Example Responses */}
              <h4 className="text-base font-bold mt-8 mb-4">Example: Domain Detail Response</h4>
              <Card className="bg-secondary/30">
                <CardContent className="pt-4">
                  <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`{
  "id": 1,
  "name": "shakeshift",
  "ip": "192.0.2.1",
  "status": "alive",
  "http_status": 200,
  "https": true,
  "title": "Shakeshift - HNS Explorer",
  "description": "Handshake explorer and analytics",
  "keywords": "handshake explorer hns blockchain",
  "body_text": "Welcome to Shakeshift, the premier...",
  "classification": "real",
  "class_reason": "Genuine content site",
  "content_type": "text/html",
  "redirect": null,
  "response_time_ms": 145,
  "screenshot_path": "/api/screenshots/shakeshift.jpg",
  "ip_cluster_id": null,
  "cluster_size": null,
  "first_seen": "2026-01-15T08:00:00Z",
  "last_checked": "2026-02-22T06:00:00Z",
  "last_alive": "2026-02-22T06:00:00Z"
}`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Database ── */}
        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Database Schema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                The HNS Indexer uses its own dedicated PostgreSQL
                database, separate from the main HSR database. Two tables store all indexed data.
              </p>

              {/* domains table */}
              <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Table</Badge>
                domains
                <span className="text-muted-foreground font-normal text-sm">(20 columns)</span>
              </h4>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4">Column</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-left py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbColumns.domains.map((c) => (
                      <tr key={c.col} className="border-b border-border/50">
                        <td className="py-1.5 pr-4 font-mono text-xs font-medium">{c.col}</td>
                        <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{c.type}</td>
                        <td className="py-1.5 text-muted-foreground text-xs">{c.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ip_clusters table */}
              <h4 className="text-base font-bold mb-4 flex items-center gap-2">
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">Table</Badge>
                ip_clusters
                <span className="text-muted-foreground font-normal text-sm">(4 columns)</span>
              </h4>
              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4">Column</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-left py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbColumns.ip_clusters.map((c) => (
                      <tr key={c.col} className="border-b border-border/50">
                        <td className="py-1.5 pr-4 font-mono text-xs font-medium">{c.col}</td>
                        <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{c.type}</td>
                        <td className="py-1.5 text-muted-foreground text-xs">{c.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Indexes */}
              <h4 className="text-base font-bold mb-4">Indexes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { idx: "idx_domains_name", on: "domains(name)", note: "Unique lookups" },
                  { idx: "idx_domains_status", on: "domains(status)", note: "Filter by alive/dead" },
                  { idx: "idx_domains_classification", on: "domains(classification)", note: "Category filters" },
                  { idx: "idx_domains_ip", on: "domains(ip)", note: "IP lookups" },
                  { idx: "idx_domains_ip_cluster", on: "domains(ip_cluster_id)", note: "Cluster queries" },
                  { idx: "idx_domains_last_checked", on: "domains(last_checked DESC)", note: "Freshness sorting" },
                  { idx: "idx_domains_search", on: "GIN full-text", note: "name, title, description, body_text" },
                  { idx: "idx_ip_clusters_ip", on: "ip_clusters(ip)", note: "IP lookups" },
                  { idx: "idx_ip_clusters_count", on: "ip_clusters(domain_count DESC)", note: "Size sorting" },
                ].map((i) => (
                  <div key={i.idx} className="flex items-start gap-2 p-2 rounded bg-muted/20 text-xs">
                    <code className="font-mono text-emerald-400 shrink-0">{i.idx}</code>
                    <span className="text-muted-foreground">{i.note}</span>
                  </div>
                ))}
              </div>

              {/* Connection */}
              <h4 className="text-base font-bold mt-8 mb-4">Connection</h4>
              <Card className="bg-secondary/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    The indexer database is configured via environment variable and uses a
                    dedicated PostgreSQL connection pool, separate from the main HSR pool.
                    The database is read-only from the HSR backend&rsquo;s perspective &mdash;
                    only the pipeline scripts write to it.
                  </p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HSR Integration ── */}
        <TabsContent value="integration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                HSR Integration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                The HNS Indexer is integrated into the HSR platform at multiple
                levels: backend API routes, frontend service layer, and cross-database
                TLD matching. This allows the HSR frontend to display indexed
                Handshake domain data alongside its own registration system.
              </p>
              <MermaidDiagram chart={diagrams.integration} id="integration" />

              <h4 className="text-lg font-bold mt-8 mb-4">Integration Points</h4>
              <div className="space-y-4">
                {/* Backend Routes */}
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
                  <h5 className="text-sm font-semibold text-violet-400 mb-2">Backend API Routes</h5>
                  <p className="text-sm text-muted-foreground mb-2">
                    Mounted at <code className="px-1 py-0.5 bg-muted rounded text-xs">/api/v2/indexer</code> in
                    the HSR backend. Maintains its own PostgreSQL connection pool
                    to the indexer database, separate from the main HSR pool. Mirrors all
                    standalone API endpoints plus two HSR-specific endpoints for
                    cross-database TLD matching.
                  </p>
                  <div className="mt-2 p-2 rounded bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Key feature:</span>{" "}
                      The <code className="px-1 py-0.5 bg-muted rounded text-xs">/tld-match/:name</code> endpoint
                      checks if an indexed HNS domain name matches a TLD that&rsquo;s enabled for
                      registration in HSR. This powers &ldquo;Register on HSR&rdquo; badges on indexed domains.
                      TLD list is cached for 5 minutes.
                    </p>
                  </div>
                </div>

                {/* Frontend Service */}
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                  <h5 className="text-sm font-semibold text-blue-400 mb-2">Frontend Service Layer</h5>
                  <p className="text-sm text-muted-foreground mb-2">
                    TypeScript service layer with full type definitions for all API responses.
                    Calls the HSR backend via a CORS-safe proxy used by all frontend API calls.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                    {[
                      "getIndexerStats()",
                      "getIndexedDomains(opts)",
                      "getIndexedDomain(name)",
                      "searchIndexedDomains(q, opts)",
                      "getIndexerClusters()",
                    ].map((fn) => (
                      <div key={fn} className="p-1.5 rounded bg-muted/20 text-center">
                        <code className="text-xs font-mono">{fn}</code>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dual Database */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <h5 className="text-sm font-semibold text-emerald-400 mb-2">Dual Database Architecture</h5>
                  <p className="text-sm text-muted-foreground">
                    The HSR backend maintains two separate connection pools:
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="p-3 rounded bg-muted/20">
                      <p className="text-xs font-medium">HSR Database</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        TLDs, SLDs, users, transactions, and DNS records.
                        Used for registration, staking, and domain management.
                      </p>
                    </div>
                    <div className="p-3 rounded bg-muted/20">
                      <p className="text-xs font-medium">Indexer Database</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Domains and IP clusters. Read-only from the HSR backend&rsquo;s
                        perspective. Populated by the daily pipeline.
                      </p>
                    </div>
                  </div>
                </div>

                {/* TLD Matching */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <h5 className="text-sm font-semibold text-amber-400 mb-2">TLD Matching (Cross-DB)</h5>
                  <p className="text-sm text-muted-foreground mb-2">
                    The <code className="px-1 py-0.5 bg-muted rounded text-xs">/tld-match/:name</code> and{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">/tld-list</code> endpoints
                    bridge both databases. When a user views an indexed HNS domain, the
                    frontend can check if that domain&rsquo;s TLD is available for subdomain
                    registration on HSR. The enabled TLD list is fetched from the HSR database
                    and cached for 5 minutes.
                  </p>
                </div>
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">Deployment</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4">
                    <h5 className="text-sm font-semibold mb-2">Standalone Mode</h5>
                    <p className="text-xs text-muted-foreground">
                      The indexer runs as two separate processes: a REST API server and a
                      Next.js frontend. Both are managed via a process manager with
                      automatic restarts.
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4">
                    <h5 className="text-sm font-semibold mb-2">Integrated Mode (HSR)</h5>
                    <p className="text-xs text-muted-foreground">
                      The indexer API routes are mounted inside the HSR backend
                      at <code className="px-1 py-0.5 bg-muted rounded text-xs">/api/v2/indexer/*</code> with
                      its own database connection pool configured via environment variable.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">Environment Variables</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4">Variable</th>
                      <th className="text-left py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { var: "HNS_INDEXER_DB_URL", desc: "PostgreSQL connection string for the indexer database" },
                      { var: "HNS_SCREENSHOTS_DIR", desc: "Path to screenshot JPEG directory" },
                    ].map((e) => (
                      <tr key={e.var} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-xs">{e.var}</td>
                        <td className="py-2 text-muted-foreground text-xs">{e.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 className="text-lg font-bold mt-8 mb-4">Key Differences: HSR vs HNS Indexer</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4">Aspect</th>
                      <th className="text-left py-2 pr-4">HSR</th>
                      <th className="text-left py-2">HNS Indexer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { aspect: "Purpose", hsr: "Subdomain marketplace", idx: "Domain discovery engine" },
                      { aspect: "Scope", hsr: "User registrations on owned TLDs", idx: "All 12.7M blockchain names" },
                      { aspect: "Database", hsr: "Dedicated PostgreSQL", idx: "Dedicated PostgreSQL" },
                      { aspect: "Data Source", hsr: "Real-time event listeners", idx: "Daily batch pipeline scan" },
                      { aspect: "API", hsr: "/api/v1 and /api/v2", idx: "Standalone + /api/v2/indexer" },
                      { aspect: "Frontend", hsr: "Next.js (main app)", idx: "Next.js (standalone explorer)" },
                      { aspect: "Screenshots", hsr: "ComfyUI AI-generated art", idx: "Headless browser captures" },
                    ].map((r) => (
                      <tr key={r.aspect} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium text-xs">{r.aspect}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">{r.hsr}</td>
                        <td className="py-2 text-muted-foreground text-xs">{r.idx}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

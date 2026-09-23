"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Code2,
  Key,
  Shield,
  Zap,
  Database,
  Globe,
  ArrowRight,
  Lock,
  Search,
  Image,
  Server,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Layers,
  Link2,
  Hash,
  Activity,
} from "lucide-react";
import { CodeBlock } from "@/components/wiki/CodeBlock";

/* ── Endpoint row component ────────────────────────── */
function Endpoint({
  method,
  path,
  desc,
  auth,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  desc: string;
  auth?: boolean;
}) {
  const colors: Record<string, string> = {
    GET: "bg-green-500/20 text-green-400 border-green-500/30",
    POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    PUT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
    PATCH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/60 transition-colors group">
      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${colors[method]} w-14 text-center flex-shrink-0`}>
        {method}
      </span>
      <code className="text-zinc-300 text-xs font-mono flex-1 truncate">{path}</code>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {auth && (
          <span title="Requires wallet auth"><Shield className="h-3.5 w-3.5 text-yellow-500/60" /></span>
        )}
      </div>
      <span className="text-zinc-500 text-[11px] hidden md:block max-w-[200px] truncate">{desc}</span>
    </div>
  );
}

export default function APIContent() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-amber-500/20 border border-blue-500/30">
            <Code2 className="h-6 w-6 text-blue-400" />
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">Developers</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">API Reference</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Complete reference for the HSR backend API — domain search, registration,
          NFT metadata, and image generation.
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { label: "REST API", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
            { label: "Wallet Auth", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
            { label: "Public API", color: "bg-green-500/10 text-green-400 border-green-500/20" },
            { label: "Rate Limited", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
            { label: "CORS Enabled", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
            { label: "JSON Responses", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
          ].map((badge) => (
            <span key={badge.label} className={`text-xs px-2.5 py-1 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* Base URL & Configuration */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-400" />
          Base URL &amp; Configuration
        </h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-sm">
              <span className="text-zinc-500"># All requests go through the frontend proxy</span>
              <br />
              <span className="text-amber-400">https://your-domain.com</span>
              <span className="text-zinc-500">/api/proxy/</span>
              <span className="text-zinc-400">{"[endpoint]"}</span>
            </div>
            <p className="text-zinc-500 text-xs mt-3">
              All API requests are proxied through the frontend with automatic CORS handling
              and request timeouts (30s standard, 5min for image generation).
            </p>
          </CardContent>
        </Card>

        {/* Rate limiting overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "General API", value: "60 req/min", note: "Per IP address", color: "text-green-400", border: "border-green-500/20" },
            { label: "Auth Endpoints", value: "10 req/min", note: "Per IP address", color: "text-yellow-400", border: "border-yellow-500/20" },
          ].map((rate) => (
            <Card key={rate.label} className={`bg-zinc-900/50 ${rate.border}`}>
              <CardContent className="p-4 text-center">
                <p className={`text-xl font-bold font-mono ${rate.color}`}>{rate.value}</p>
                <p className="text-white text-sm font-medium mt-1">{rate.label}</p>
                <p className="text-zinc-500 text-xs">{rate.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Authentication */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Key className="h-5 w-5 text-yellow-400" />
          Authentication
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR uses wallet-based signature authentication (SIWE-like). Protected endpoints require
          a signed message from your connected wallet.
        </p>

        {/* Auth flow steps */}
        <Card className="bg-gradient-to-br from-yellow-500/5 to-orange-500/5 border-yellow-500/20">
          <CardContent className="p-5 space-y-4">
            <h4 className="text-white text-sm font-semibold">Authentication Flow</h4>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Request a Nonce",
                  code: "GET /auth/nonce?wallet=0xYourWallet",
                  desc: "Returns a unique nonce and message to sign",
                },
                {
                  step: "2",
                  title: "Sign the Message",
                  code: "const signature = await signer.signMessage(message)",
                  desc: "User signs with their wallet (Bifrost, MetaMask, etc.)",
                },
                {
                  step: "3",
                  title: "Include in Request Body",
                  code: '{ wallet, signature, nonce, ...params }',
                  desc: "Send all three in the body of authenticated POST requests",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-yellow-400 text-xs font-bold">{item.step}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{item.title}</p>
                    <code className="text-yellow-400/80 text-xs font-mono">{item.code}</code>
                    <p className="text-zinc-500 text-xs mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Auth code example */}
        <CodeBlock
          language="javascript"
          code={`// 1. Get nonce
const nonceRes = await fetch('/api/proxy/auth/nonce?wallet=0xYourWallet');
const { nonce, message } = await nonceRes.json();

// 2. Sign with wallet (ethers.js v6)
const signature = await signer.signMessage(message);

// 3. Make authenticated request
const res = await fetch('/api/proxy/dns/myname/cryptofans/forward', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: '0xYourWallet',
    signature,
    nonce,
    url: 'https://example.com',
    redirectType: 301
  })
});`}
        />

        {/* Auth endpoints */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 space-y-2">
            <h4 className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-2">Auth Endpoints</h4>
            <Endpoint method="GET" path="/auth/nonce?wallet=0x..." desc="Get nonce & message to sign" />
            <Endpoint method="POST" path="/auth/verify" desc="Verify wallet signature" auth />
          </CardContent>
        </Card>

      </section>

      {/* ── ENDPOINT GROUPS ─────────────────────────── */}

      <div className="border-t border-zinc-800 pt-6">
        <h2 className="text-2xl font-bold text-white mb-2">Endpoints</h2>
        <p className="text-zinc-500 text-sm mb-6">
          <Shield className="inline h-3.5 w-3.5 text-yellow-500/60 mr-1" /> = Requires wallet authentication
        </p>

        <div className="space-y-6">

          {/* Health & Status */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-green-400" />
                Health &amp; Status
              </h3>
              <Endpoint method="GET" path="/health" desc="API health check" />
              <Endpoint method="GET" path="/stats" desc="TLD count, total domains, recent registrations" />
              <Endpoint method="GET" path="/features" desc="Feature flags" />
            </CardContent>
          </Card>

          {/* Search & Availability */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-blue-400" />
                Search &amp; Availability
              </h3>
              <Endpoint method="GET" path="/search?subdomain=&tld=" desc="Check single domain availability" />
              <Endpoint method="POST" path="/search/bulk" desc="Bulk availability check (max 10)" />
              <Endpoint method="GET" path="/pricing?tld=" desc="Pricing tiers with FLR/USD conversion" />
              <Endpoint method="POST" path="/pricing/bulk" desc="Bulk pricing for multiple domains (max 5)" />
              <Endpoint method="POST" path="/pricing/bulk-multi" desc="Multi-TLD bulk pricing" />
              <Endpoint method="GET" path="/tlds" desc="List all active TLDs with pricing" />
            </CardContent>
          </Card>

          {/* Domain Management */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-amber-400" />
                Domain Management
              </h3>
              <Endpoint method="GET" path="/domains/:fqdn" desc="Get domain details & metadata" />
              <Endpoint method="GET" path="/domains/owner/:wallet" desc="List domains by owner (public)" />
              <Endpoint method="POST" path="/domains/owner/:wallet" desc="Authenticated domain list" auth />
            </CardContent>
          </Card>

          {/* Registration */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <FileCode className="h-4 w-4 text-cyan-400" />
                Registration
              </h3>
              <Endpoint method="POST" path="/register/complete" desc="Complete single domain registration" />
              <Endpoint method="POST" path="/bulk-purchase/complete" desc="Complete bulk purchase" />
              <div className="text-zinc-600 text-xs mt-1 ml-[4.5rem]">
                Both endpoints award preview credits and trigger NFT generation.
              </div>
            </CardContent>
          </Card>

          {/* URL Forwarding */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-cyan-400" />
                URL Forwarding
              </h3>
              <Endpoint method="GET" path="/dns/:subdomain/:tld/forward" desc="Get forward configuration" />
              <Endpoint method="POST" path="/dns/:subdomain/:tld/forward" desc="Set URL forward (301/302/307/308)" auth />
              <Endpoint method="DELETE" path="/dns/:subdomain/:tld/forward" desc="Remove URL forward" auth />
            </CardContent>
          </Card>

          {/* NFT & Image Generation */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                <Image className="h-4 w-4 text-pink-400" />
                NFT &amp; Image Generation
              </h3>
              <Endpoint method="GET" path="/nft/metadata/:fqdn" desc="OpenSea-compatible metadata" />
              <Endpoint method="GET" path="/nft/token/:tokenId" desc="Metadata by token ID" />
              <Endpoint method="GET" path="/nft/image/:fqdn?size=" desc="NFT image (small/medium/large)" />
              <Endpoint method="POST" path="/nft/prepare" desc="Prepare NFT for minting" />
              <Endpoint method="GET" path="/nft/styles" desc="List available generation styles" />
              <Endpoint method="POST" path="/nft/generate" desc="Generate AI images for your domain" />
              <Endpoint method="GET" path="/nft/preview-credits/:wallet" desc="Check preview credit balance" />
              <Endpoint method="GET" path="/nft/suggest-prompt/:subdomain" desc="AI prompt suggestions" />
              <div className="text-zinc-600 text-xs mt-1 ml-[4.5rem]">
                Image sizes: small (400px), medium (800px), large (1200px).
              </div>
            </CardContent>
          </Card>


        </div>
      </div>

      {/* Quick Examples */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-400" />
          Quick Examples
        </h2>

        {/* Search */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-400" />
              Search Domain Availability
            </h4>
            <CodeBlock
              language="bash"
              code={`curl "https://your-domain.com/api/proxy/search?subdomain=alice&tld=cryptofans"

# Response
{
  "available": true,
  "fqdn": "alice.cryptofans",
  "tier": "standard",
  "price": {
    "usd": 10.00,
    "flr": 200,
    "flrPriceUSD": 0.05,
    "source": "ftso",
    "timestamp": "2026-02-07T17:00:00Z"
  }
}`}
            />
          </CardContent>
        </Card>

        {/* Resolve */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-orange-400" />
              Resolve Domain to Address
            </h4>
            <CodeBlock
              language="bash"
              code={`curl "https://your-domain.com/api/proxy/resolve/alice.cryptofans"

# Response
{
  "fqdn": "alice.cryptofans",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "source": "on-chain",
  "verified": true,
  "resolver": "SubdomainNFT",
  "tokenId": 42,
  "lastUpdated": "2026-02-07T15:30:00Z"
}`}
            />
          </CardContent>
        </Card>

        {/* NFT Metadata */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <Image className="h-4 w-4 text-pink-400" />
              Get NFT Metadata (OpenSea-Compatible)
            </h4>
            <CodeBlock
              language="bash"
              code={`curl "https://your-domain.com/api/proxy/nft/metadata/alice.cryptofans"

# Response
{
  "name": "alice.cryptofans",
  "description": "A Handshake subdomain NFT on Flare Network",
  "image": "ipfs://QmABC123...",
  "attributes": [
    { "trait_type": "TLD", "value": "cryptofans" },
    { "trait_type": "Tier", "value": "Standard" },
    { "trait_type": "Length", "value": 5 },
    { "trait_type": "Style", "value": "Cinematic" }
  ]
}`}
            />
          </CardContent>
        </Card>

        {/* Authenticated request */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-yellow-400" />
              Authenticated Request — Set URL Forward
            </h4>
            <CodeBlock
              language="javascript"
              code={`// Set URL forwarding for your domain (requires ownership)
const res = await fetch('/api/proxy/dns/alice/cryptofans/forward', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: '0xYourWallet',
    signature: signedMessage,
    nonce: authNonce,
    url: 'https://my-website.com',
    redirectType: 301
  })
});

// Response: { "success": true, "message": "URL forward configured" }`}
            />
          </CardContent>
        </Card>
      </section>

      {/* Response Patterns */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Response Patterns
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Success */}
          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <h4 className="text-green-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Success Response
              </h4>
              <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
                <span className="text-zinc-500">{"{"}</span><br />
                <span className="text-amber-400 ml-2">&quot;success&quot;</span><span className="text-zinc-500">: </span><span className="text-green-400">true</span><span className="text-zinc-500">,</span><br />
                <span className="text-amber-400 ml-2">&quot;data&quot;</span><span className="text-zinc-500">: </span><span className="text-zinc-400">{"{ ... }"}</span><br />
                <span className="text-zinc-500">{"}"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          <Card className="bg-red-500/5 border-red-500/20">
            <CardContent className="p-4">
              <h4 className="text-red-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Error Response
              </h4>
              <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
                <span className="text-zinc-500">{"{"}</span><br />
                <span className="text-amber-400 ml-2">&quot;error&quot;</span><span className="text-zinc-500">: </span><span className="text-red-400">&quot;Description&quot;</span><span className="text-zinc-500">,</span><br />
                <span className="text-amber-400 ml-2">&quot;details&quot;</span><span className="text-zinc-500">: </span><span className="text-zinc-400">&quot;Optional context&quot;</span><br />
                <span className="text-zinc-500">{"}"}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pricing response */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-semibold mb-2">Pricing Response Shape</h4>
            <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs leading-relaxed">
              <span className="text-zinc-500">{"{"}</span><br />
              <span className="text-amber-400 ml-2">&quot;flrPriceUSD&quot;</span><span className="text-zinc-500">: </span><span className="text-yellow-400">0.05</span><span className="text-zinc-500">,</span><br />
              <span className="text-amber-400 ml-2">&quot;priceSource&quot;</span><span className="text-zinc-500">: </span><span className="text-green-400">&quot;ftso&quot;</span><span className="text-zinc-500">,</span>
              <span className="text-zinc-600"> // ftso | fallback | cached</span><br />
              <span className="text-amber-400 ml-2">&quot;tiers&quot;</span><span className="text-zinc-500">: {"{"}</span><br />
              <span className="text-amber-400 ml-4">&quot;ultra_premium&quot;</span><span className="text-zinc-500">: {"{"} </span><span className="text-zinc-400">criteria: &quot;1 char&quot;, priceUSD: 500, priceFLR: 10000</span><span className="text-zinc-500"> {"}"},</span><br />
              <span className="text-amber-400 ml-4">&quot;premium&quot;</span><span className="text-zinc-500">:       {"{"} </span><span className="text-zinc-400">criteria: &quot;2 chars&quot;, priceUSD: 200, priceFLR: 4000</span><span className="text-zinc-500"> {"}"},</span><br />
              <span className="text-amber-400 ml-4">&quot;standard_plus&quot;</span><span className="text-zinc-500">: {"{"} </span><span className="text-zinc-400">criteria: &quot;3 chars&quot;, priceUSD: 50, priceFLR: 1000</span><span className="text-zinc-500"> {"}"},</span><br />
              <span className="text-amber-400 ml-4">&quot;standard&quot;</span><span className="text-zinc-500">:      {"{"} </span><span className="text-zinc-400">criteria: &quot;4+ chars&quot;, priceUSD: 10, priceFLR: 200</span><span className="text-zinc-500"> {"}"}</span><br />
              <span className="text-zinc-500 ml-2">{"}"}</span><br />
              <span className="text-zinc-500">{"}"}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* HTTP Status Codes */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Hash className="h-5 w-5 text-zinc-400" />
          HTTP Status Codes
        </h2>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                { code: "200", desc: "Success", color: "text-green-400" },
                { code: "400", desc: "Bad Request — invalid input, missing params, validation failed", color: "text-yellow-400" },
                { code: "401", desc: "Unauthorized — wallet signature required or invalid", color: "text-orange-400" },
                { code: "403", desc: "Forbidden — not the domain owner or insufficient permissions", color: "text-red-400" },
                { code: "404", desc: "Not Found — domain, TLD, or resource doesn't exist", color: "text-zinc-400" },
                { code: "409", desc: "Conflict — domain already registered, duplicate resource", color: "text-amber-400" },
                { code: "429", desc: "Too Many Requests — rate limit exceeded", color: "text-orange-400" },
                { code: "500", desc: "Internal Server Error — unexpected failure", color: "text-red-400" },
              ].map((item, i) => (
                <div key={item.code} className={`flex items-center gap-4 px-4 py-3 ${i % 2 === 0 ? "bg-zinc-900/30" : ""}`}>
                  <span className={`font-mono font-bold text-sm w-10 ${item.color}`}>{item.code}</span>
                  <span className="text-zinc-400 text-sm">{item.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Input Validation */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-400" />
          Input Validation
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          All inputs are validated server-side. Here are the key validation rules:
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-0 divide-y divide-zinc-800">
            {[
              { field: "Subdomain", rules: "RFC 1035 compliant, 1-63 chars, alphanumeric + hyphens, no leading/trailing hyphens, reserved words blocked" },
              { field: "TLD", rules: "Must exist and be active in database, lowercase alphanumeric" },
              { field: "Wallet Address", rules: "Valid Ethereum checksummed format (0x + 40 hex chars)" },
              { field: "URL Forward", rules: "Valid URL with protocol, redirect type must be 301/302/307/308" },
              { field: "IPFS CID", rules: "Valid CIDv0 (Qm...) or CIDv1 (bafy...) format" },
              { field: "Bulk Operations", rules: "Search: max 10, Pricing: max 5, Transfer: max 20, Resolve: max 50" },
            ].map((item) => (
              <div key={item.field} className="px-4 py-3">
                <span className="text-white text-sm font-medium">{item.field}</span>
                <p className="text-zinc-500 text-xs mt-0.5">{item.rules}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>




      {/* Related Guides */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Related Guides</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { title: "Smart Contracts", desc: "On-chain contract reference", section: "developers", page: "smart-contracts" },
            { title: "Architecture", desc: "System architecture overview", section: "developers", page: "architecture" },
            { title: "Flare Network", desc: "Blockchain & FTSO details", section: "concepts", page: "flare-network" },
          ].map((guide) => (
            <div
              key={guide.title}
              className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
            >
              <ArrowRight className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">{guide.title}</p>
                <p className="text-zinc-500 text-xs">{guide.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

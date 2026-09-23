"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import {
  Code2,
  ExternalLink,
  Key,
  Shield,
  Zap,
  Database,
  Image,
  ShoppingCart,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

// Code block with copy button
function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-secondary/50 rounded-lg p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        onClick={copyToClipboard}
        className="absolute top-2 right-2 p-2 rounded-md bg-secondary hover:bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

// Endpoint card component
function EndpointCard({
  method,
  path,
  description,
  auth = false,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  auth?: boolean;
}) {
  const methodColors = {
    GET: "bg-green-600",
    POST: "bg-blue-600",
    PUT: "bg-yellow-600",
    DELETE: "bg-red-600",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-secondary/30 transition-colors">
      <Badge className={`${methodColors[method]} text-white font-mono`}>{method}</Badge>
      <code className="text-sm flex-1">{path}</code>
      {auth && <span title="Requires authentication"><Shield className="h-4 w-4 text-muted-foreground" /></span>}
      <span className="text-sm text-muted-foreground hidden md:block">{description}</span>
    </div>
  );
}

export default function APIDocsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">API Reference</Badge>
        <h1 className="text-4xl font-bold mb-4">HSR Developer API</h1>
        <p className="text-xl text-muted-foreground mb-6">
          Build integrations with the Halcyon Subdomain Registry
        </p>

        {/* Quick Links */}
        <div className="flex flex-wrap gap-3">
          <Link href={`${baseUrl}/api/docs`} target="_blank">
            <Button variant="default">
              <Code2 className="mr-2 h-4 w-4" />
              Interactive API Docs
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="https://github.com/your-repo/hsr-sdk" target="_blank">
            <Button variant="outline">
              TypeScript SDK
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Base URL */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Base URL</h2>
        <CodeBlock code={`${baseUrl}/api/v1`} />
        <p className="text-sm text-muted-foreground mt-2">
          All API endpoints are prefixed with <code>/api/v1</code>
        </p>
      </section>

      {/* Authentication */}
      <section>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Key className="h-6 w-6" />
          Authentication
        </h2>
        <p className="text-muted-foreground mb-4">
          HSR uses wallet signature authentication. Protected endpoints require a signed message from your wallet.
        </p>

        <Tabs defaultValue="flow" className="mb-6">
          <TabsList>
            <TabsTrigger value="flow">Auth Flow</TabsTrigger>
            <TabsTrigger value="example">Example</TabsTrigger>
          </TabsList>
          <TabsContent value="flow">
            <Card className="bg-secondary/30">
              <CardContent className="pt-6">
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">1</div>
                    <div>
                      <strong>Request a nonce</strong>
                      <p className="text-sm text-muted-foreground">GET /auth/nonce?wallet=0x...</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">2</div>
                    <div>
                      <strong>Sign the message</strong>
                      <p className="text-sm text-muted-foreground">Use your wallet to sign the returned message</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">3</div>
                    <div>
                      <strong>Include in request</strong>
                      <p className="text-sm text-muted-foreground">Send wallet, signature, and nonce in request body</p>
                    </div>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="example">
            <CodeBlock
              language="javascript"
              code={`// 1. Get nonce
const nonceRes = await fetch('/api/v1/auth/nonce?wallet=0xYourWallet');
const { nonce, message } = await nonceRes.json();

// 2. Sign with wallet (ethers.js example)
const signature = await signer.signMessage(message);

// 3. Make authenticated request
const res = await fetch('/api/v1/dns/myname/cryptofans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: '0xYourWallet',
    signature,
    nonce,
    records: { ipv4: '1.2.3.4' }
  })
});`}
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* Endpoint Categories */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Endpoints</h2>

        <div className="grid gap-6">
          {/* Health & Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Health & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/health" description="API health check" />
              <EndpointCard method="POST" path="/diagnostics" description="System diagnostics (admin auth required)" />
              <EndpointCard method="GET" path="/hns/status" description="HNS node status" />
            </CardContent>
          </Card>

          {/* Search & Availability */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                Search & Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/search?subdomain=&tld=" description="Check availability" />
              <EndpointCard method="POST" path="/search/bulk" description="Bulk availability check" />
              <EndpointCard method="GET" path="/pricing" description="Get pricing tiers" />
              <EndpointCard method="GET" path="/tlds" description="List available TLDs" />
            </CardContent>
          </Card>

          {/* Domain Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-amber-500" />
                Domain Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/domains/:fqdn" description="Get domain details" />
              <EndpointCard method="GET" path="/domains/owner/:wallet" description="List domains by owner" />
              <EndpointCard method="GET" path="/resolve/:fqdn" description="Resolve to address" />
              <EndpointCard method="POST" path="/resolve/:fqdn/set" description="Set resolve address" auth />
            </CardContent>
          </Card>

          {/* DNS Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-cyan-500" />
                DNS Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/dns/:subdomain/:tld" description="Get DNS records" />
              <EndpointCard method="POST" path="/dns/:subdomain/:tld" description="Update DNS records" auth />
              <EndpointCard method="DELETE" path="/dns/:subdomain/:tld" description="Delete DNS records" auth />
            </CardContent>
          </Card>

          {/* NFT & Images */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-pink-500" />
                NFT & Image Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/nft/metadata/:fqdn" description="Get NFT metadata (OpenSea)" />
              <EndpointCard method="GET" path="/nft/image/:fqdn" description="Get NFT image" />
              <EndpointCard method="POST" path="/nft/prepare" description="Prepare NFT for minting" />
              <EndpointCard method="GET" path="/nft/styles" description="List generation styles" />
              <EndpointCard method="POST" path="/nft/flux-generate-parallel" description="Generate 3 images (multi-GPU)" />
              <EndpointCard method="GET" path="/nft/preview-credits/:wallet" description="Check preview credits" />
            </CardContent>
          </Card>

          {/* Marketplace */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-orange-500" />
                Marketplace
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointCard method="GET" path="/marketplace/stats" description="Marketplace statistics" />
              <EndpointCard method="GET" path="/marketplace/listings" description="Paginated listings" />
              <EndpointCard method="GET" path="/marketplace/recent" description="Recent sales" />
              <EndpointCard method="GET" path="/marketplace/floor/:tld" description="Floor price by TLD" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quick Examples */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Quick Examples</h2>

        <Tabs defaultValue="search" className="mb-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="resolve">Resolve</TabsTrigger>
            <TabsTrigger value="metadata">NFT Metadata</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <CodeBlock
              code={`# Check if a subdomain is available
curl "${baseUrl}/api/v1/search?subdomain=alice&tld=cryptofans"

# Response
{
  "available": true,
  "subdomain": "alice",
  "tld": "cryptofans",
  "fqdn": "alice.cryptofans",
  "tier": "standard",
  "price": {
    "usd": 10.00,
    "flr": 500,
    "flrPriceUSD": 0.02
  }
}`}
            />
          </TabsContent>

          <TabsContent value="resolve">
            <CodeBlock
              code={`# Resolve a domain to wallet address
curl "${baseUrl}/api/v1/resolve/alice.cryptofans"

# Response
{
  "fqdn": "alice.cryptofans",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "source": "on-chain",
  "verified": true
}`}
            />
          </TabsContent>

          <TabsContent value="metadata">
            <CodeBlock
              code={`# Get OpenSea-compatible NFT metadata
curl "${baseUrl}/api/v1/nft/metadata/alice.cryptofans"

# Response
{
  "name": "alice.cryptofans",
  "description": "A Handshake subdomain NFT on Flare Network",
  "image": "ipfs://QmABC...",
  "attributes": [
    { "trait_type": "TLD", "value": "cryptofans" },
    { "trait_type": "Tier", "value": "Standard" },
    { "trait_type": "Length", "value": 5 }
  ]
}`}
            />
          </TabsContent>

          <TabsContent value="marketplace">
            <CodeBlock
              code={`# Get marketplace listings
curl "${baseUrl}/api/v1/marketplace/listings?page=1&limit=20&sort=recent"

# Response
{
  "listings": [
    {
      "listingId": "1",
      "tokenId": "12345",
      "seller": "0x...",
      "price": 100.5,
      "fullDomain": "rare.cryptofans"
    }
  ],
  "pagination": {
    "page": 1,
    "total": 45,
    "hasMore": true
  }
}`}
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* Error Handling */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Error Handling</h2>
        <p className="text-muted-foreground mb-4">
          All errors return a consistent JSON format:
        </p>
        <CodeBlock
          code={`{
  "error": "Error message description",
  "details": "Additional context (optional)"
}`}
        />

        <h3 className="text-lg font-bold mt-6 mb-3">HTTP Status Codes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Code</th>
                <th className="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["200", "Success"],
                ["400", "Bad Request - Invalid input"],
                ["401", "Unauthorized - Authentication required"],
                ["403", "Forbidden - Insufficient permissions"],
                ["404", "Not Found"],
                ["409", "Conflict - Resource already exists"],
                ["500", "Internal Server Error"],
              ].map(([code, desc]) => (
                <tr key={code} className="border-b">
                  <td className="py-2 font-mono">{code}</td>
                  <td className="py-2 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rate Limiting */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Rate Limiting</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">General API</h4>
              <p className="text-2xl font-mono text-primary">60 req/min</p>
              <p className="text-sm text-muted-foreground">Per IP address</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Auth Endpoints</h4>
              <p className="text-2xl font-mono text-primary">10 req/min</p>
              <p className="text-sm text-muted-foreground">Per IP address</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="pt-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ready to build?</h3>
                <p className="text-muted-foreground">
                  Try the interactive API documentation with live requests
                </p>
              </div>
              <Link href={`${baseUrl}/api/docs`} target="_blank">
                <Button>
                  <Code2 className="mr-2 h-4 w-4" />
                  Open Swagger UI
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

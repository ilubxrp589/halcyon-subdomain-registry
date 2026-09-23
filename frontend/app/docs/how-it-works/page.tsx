"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  Landmark,
  Globe2,
  Server,
  Database,
  Shield,
  Lock,
  ExternalLink,
} from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">Technical Deep Dive</Badge>
        <h1 className="text-4xl font-bold mb-4">How HSR Works</h1>
        <p className="text-xl text-muted-foreground">
          A deeper dive into the technology behind the subdomain marketplace
        </p>
      </div>

      {/* Four Pillars */}
      <section>
        <h2 className="text-2xl font-bold mb-4">The Four Pillars of HSR</h2>
        <p className="text-muted-foreground mb-6">
          HSR is built on four main systems that work together:
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Handshake */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-6 w-6 text-primary" />
                <h3 className="font-bold text-lg">1. Handshake (HNS)</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <strong>The Land Registry</strong> - A blockchain specifically designed for domain names.
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                Handshake is like the city&apos;s official land registry. It keeps track of who owns which TLDs.
                When we say we &quot;own&quot; <code>.cryptofans</code>, it&apos;s recorded on the Handshake blockchain.
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`Handshake Blockchain
────────────────────
TLD: cryptofans
Owner: [our wallet]
NS: ns1.halcyon.sh
Status: REGISTERED`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          {/* Flare */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="h-6 w-6 text-primary" />
                <h3 className="font-bold text-lg">2. Flare Network</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <strong>The Bank & Deed Office</strong> - Where payments happen and NFTs live.
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                If Handshake is the land registry, Flare is both the bank (handles payments)
                and the deed office (issues ownership certificates as NFTs).
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`Smart Contracts (Coston2)
──────────────────────────
SubdomainNFT     → Deeds
SubdomainEscrow  → Payments
DNSOracle        → Verifier
PriceOracle      → FLR/USD`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          {/* PowerDNS */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Globe2 className="h-6 w-6 text-primary" />
                <h3 className="font-bold text-lg">3. PowerDNS</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <strong>The Building Directory</strong> - The DNS server that makes subdomains work.
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                When someone types your subdomain, PowerDNS tells them where to go
                (like a lobby directory saying &quot;Room john is at IP 192.168.1.100&quot;).
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`PowerDNS Records
────────────────────
john.cryptofans  A     192.168.1.100
john.cryptofans  AAAA  2001:db8::1
john.cryptofans  TXT   "verify=abc"`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          {/* Backend */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Server className="h-6 w-6 text-primary" />
                <h3 className="font-bold text-lg">4. HSR Backend</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <strong>The Building Manager</strong> - Coordinates everything together.
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                Handles showing available rooms (API), processing purchases,
                updating DNS, keeping records, and talking to smart contracts.
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`Backend Services
────────────────────
Contract Listener
DNS Watcher
Price Sync
PostgreSQL DB`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Complete Purchase Flow */}
      <section>
        <h2 className="text-2xl font-bold mb-4">The Complete Purchase Flow</h2>
        <p className="text-muted-foreground mb-4">
          Here&apos;s exactly what happens when you buy a subdomain:
        </p>

        <div className="space-y-4">
          {/* Step 1 */}
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Step 1: You Search</h4>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`You: "Is john.cryptofans available?"
         │
         ▼
┌──────────────────────────┐
│      HSR Backend         │
│  - Checks database       │
│  - Calculates price      │
└──────────────────────────┘
         │
         ▼
Response: "Available! Price: 881 FLR"`}
              </pre>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Step 2: You Pay</h4>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`You: *Sends FLR to Escrow Contract*
         │
         ▼
┌──────────────────────────┐
│   SubdomainEscrow.sol    │
│  - Receives your FLR     │
│  - Mints NFT to you      │
│  - Holds funds in escrow │
└──────────────────────────┘
         │
         ▼
Event: "SubdomainPurchased" emitted`}
              </pre>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Step 3: Backend Listens</h4>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`┌──────────────────────────┐
│   Contract Listener      │
│  - Sees purchase event   │
│  - Creates DNS records   │
│  - Updates database      │
└──────────────────────────┘
         │
         ▼
PowerDNS: john.cryptofans zone created`}
              </pre>
            </CardContent>
          </Card>

          {/* Step 4 */}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Step 4: DNS Verification & Completion</h4>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`┌──────────────────────────┐
│   DNSVerificationOracle  │
│  - Confirms DNS is live  │
│  - Triggers completion   │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│   SubdomainEscrow.sol    │
│  - Releases funds        │
│  - Marks complete        │
└──────────────────────────┘
         │
         ▼
You own john.cryptofans! 🎉`}
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Architecture */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Architecture Overview</h2>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`┌─────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Next.js Frontend                        │  │
│  │  - Web3Modal for wallet connection                         │  │
│  │  - React components for UI                                 │  │
│  │  - ethers.js for blockchain interaction                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    API Calls │ Blockchain Txs
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐
│   HSR Backend     │                    │  Flare Network    │
│   (Express.js)    │                    │  (Coston2)        │
│                   │                    │                   │
│ - REST API        │◄──── Events ──────│ - SubdomainNFT    │
│ - Auth middleware │                    │ - SubdomainEscrow │
│ - Business logic  │                    │ - DNSOracle       │
│                   │                    │ - PriceOracle     │
└─────────┬─────────┘                    └───────────────────┘
          │
    ┌─────┴─────┬─────────────────┐
    │           │                 │
    ▼           ▼                 ▼
┌───────┐  ┌─────────┐     ┌──────────┐
│Postgre│  │ PowerDNS│     │ HNS Node │
│  SQL  │  │ Server  │     │  (hsd)   │
└───────┘  └─────────┘     └──────────┘`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Smart Contracts */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Smart Contracts Explained</h2>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">SubdomainNFT.sol - The Deed Office</h4>
              <p className="text-sm text-muted-foreground mb-3">
                An ERC-721 NFT contract. Each subdomain becomes a unique token.
              </p>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`// Simplified concept
contract SubdomainNFT is ERC721 {
    // Maps token ID to subdomain
    mapping(uint256 => string) public subdomainOf;

    function mint(address to, string subdomain)
        external onlyEscrow {
        _mint(to, nextTokenId);
        subdomainOf[nextTokenId] = subdomain;
    }
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">SubdomainEscrow.sol - The Safe Deposit Box</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Holds payments until DNS is confirmed working. Protects both buyer and platform.
              </p>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`// Simplified concept
contract SubdomainEscrow {
    function purchaseSubdomain(
        string tld,
        string subdomain,
        string metadataURI
    ) external payable {
        require(msg.value >= price);
        // Mint NFT immediately
        // Hold funds until DNS verified
    }

    function completeDNSRegistration(uint256 escrowId)
        external onlyDNSOracle {
        // Release funds to platform
    }
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">PriceOracle.sol - The Currency Exchange</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Tracks FLR/USD prices using Flare&apos;s FTSO for stable pricing.
              </p>
              <pre className="text-xs overflow-x-auto bg-secondary/50 p-3 rounded">
{`// Gets live FLR/USD price from FTSO
function convertUSDtoFLR(uint256 usdAmount)
    external view returns (uint256) {
    uint256 flrPrice = getFTSOPrice();
    return (usdAmount * 1e18) / flrPrice;
}`}
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Backend Services */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Backend Services</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Service</th>
                <th className="text-left py-2">What It Does</th>
                <th className="text-left py-2">Frequency</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 font-medium">Contract Listener</td>
                <td className="py-2 text-muted-foreground">Watches blockchain for purchase events</td>
                <td className="py-2">Every 15 seconds</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-medium">DNS Watcher</td>
                <td className="py-2 text-muted-foreground">Monitors NS record propagation</td>
                <td className="py-2">Adaptive (30s → 5min)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-medium">Price Sync</td>
                <td className="py-2 text-muted-foreground">Updates on-chain price oracle</td>
                <td className="py-2">Every 5 minutes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-medium">PowerDNS Integration</td>
                <td className="py-2 text-muted-foreground">Manages DNS records via API</td>
                <td className="py-2">On-demand</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Security */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Security Model</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-primary" />
                <h4 className="font-bold">Why Escrow?</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Buyer protection</strong> - Money held until DNS works</li>
                <li>• <strong>Atomic transactions</strong> - All or nothing</li>
                <li>• <strong>Trustless</strong> - Smart contract rules, not humans</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-5 w-5 text-primary" />
                <h4 className="font-bold">Authentication</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Wallet signatures</strong> - Prove ownership without private keys</li>
                <li>• <strong>Nonce-based</strong> - Prevents replay attacks</li>
                <li>• <strong>5-minute expiry</strong> - Signatures expire quickly</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Deployed Contracts */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Deployed Contracts (Coston2 Testnet)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Contract</th>
                <th className="text-left py-2">Address</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "SubdomainNFT", address: "0x4150E230cb71c2964d6A3e807433eb7e6AF857AC" },
                { name: "SubdomainEscrow", address: "0xf233982a12a5694200fB2e44F884A68d1C0093E2" },
                { name: "DNSVerificationOracle", address: "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff" },
                { name: "PriceOracle", address: "0xb46cf50EaBEa751FA6208d7136cC9BfA5dccf80f" },
              ].map((c) => (
                <tr key={c.name} className="border-b">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2">
                    <a
                      href={`https://coston2-explorer.flare.network/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {c.address.slice(0, 10)}...{c.address.slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Database Schema */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Database Schema (Simplified)</h2>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      tlds       │     │     domains     │     │pending_purchases│
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ name            │◄────│ tld_id          │     │ subdomain       │
│ owner_wallet    │     │ subdomain       │     │ tld             │
│ is_active       │     │ owner_wallet    │     │ buyer_wallet    │
│ ns_records[]    │     │ nft_token_id    │     │ amount_flr      │
└─────────────────┘     │ dns_configured  │     │ status          │
                        │ created_at      │     │ tx_hash         │
                        └─────────────────┘     └─────────────────┘`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* URL Forwarding */}
      <section>
        <h2 className="text-2xl font-bold mb-4">URL Forwarding</h2>
        <p className="text-muted-foreground mb-4">
          Point your subdomain to any website with a simple redirect. When someone visits your subdomain,
          they&apos;ll be automatically sent to the URL you configure.
        </p>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">How It Works</h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Go to your <strong>Dashboard</strong> and expand a domain you own</li>
                <li>Find the <strong>URL Forwarding</strong> section and click <strong>Set Up</strong></li>
                <li>Enter the target URL (e.g., <code>https://myportfolio.com</code>)</li>
                <li>Choose redirect type and options, then save</li>
                <li>Your subdomain now redirects visitors to your target URL</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">301 vs 302 Redirects</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>301 (Permanent)</strong> - Tells browsers and search engines the redirect is permanent.
                  Best for long-term forwarding. Search engines will update their index to point to the target URL.
                </p>
                <p>
                  <strong>302 (Temporary)</strong> - Tells browsers the redirect is temporary.
                  Best when you might change the target URL frequently. Search engines keep the original URL in their index.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Path Forwarding</h4>
              <p className="text-sm text-muted-foreground mb-3">
                When enabled, the path from the subdomain URL is appended to the target URL:
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`Path forwarding OFF:
  alice.cryptofans/about → https://mysite.com

Path forwarding ON:
  alice.cryptofans/about → https://mysite.com/about
  alice.cryptofans/blog  → https://mysite.com/blog`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Example: Portfolio Site</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Point <code>alice.cryptofans</code> to your portfolio site:
              </p>
              <Card className="bg-secondary/50">
                <CardContent className="pt-4 pb-4">
                  <pre className="text-xs overflow-x-auto">
{`Domain:    alice.cryptofans
Target:    https://alice-portfolio.vercel.app
Redirect:  301 (Permanent)
Path Fwd:  ON

Result:
  alice.cryptofans       → https://alice-portfolio.vercel.app
  alice.cryptofans/work  → https://alice-portfolio.vercel.app/work`}
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tech Stack */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Tech Stack</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Layer</th>
                <th className="text-left py-2">Technology</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Frontend", "Next.js 16, TypeScript, Tailwind CSS, shadcn/ui"],
                ["Backend", "Express.js, Node.js, PostgreSQL"],
                ["Blockchain", "Flare Network (Coston2 Testnet)"],
                ["DNS", "PowerDNS with HNS (Handshake)"],
                ["Smart Contracts", "Solidity (ERC-721 NFTs)"],
                ["Wallet", "Web3Modal, ethers.js v6"],
              ].map(([layer, tech]) => (
                <tr key={layer} className="border-b">
                  <td className="py-2 font-medium">{layer}</td>
                  <td className="py-2 text-muted-foreground">{tech}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

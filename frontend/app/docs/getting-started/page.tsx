"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Wallet,
  Search,
  DollarSign,
  CheckCircle,
  Clock,
  PartyPopper,
  AlertCircle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

export default function GettingStartedPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">Guide</Badge>
        <h1 className="text-4xl font-bold mb-4">Getting Started with HSR</h1>
        <p className="text-xl text-muted-foreground">
          Your guide to buying your first subdomain NFT
        </p>
      </div>

      {/* Before You Start */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Before You Start</h2>
        <p className="text-muted-foreground mb-4">To buy a subdomain on HSR, you&apos;ll need:</p>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <Wallet className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">A Crypto Wallet</h4>
              <p className="text-sm text-muted-foreground">MetaMask or WalletConnect compatible</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <DollarSign className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">Some FLR Tokens</h4>
              <p className="text-sm text-muted-foreground">Flare Network cryptocurrency</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">A Few Minutes</h4>
              <p className="text-sm text-muted-foreground">The whole process takes ~5 min</p>
            </CardContent>
          </Card>
        </div>

        {/* Setup Help */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-secondary/30">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Don&apos;t Have a Wallet Yet?</h4>
              <ol className="text-sm space-y-2 text-muted-foreground">
                <li>1. Go to <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">metamask.io</a> and install the extension</li>
                <li>2. Follow the setup wizard to create your wallet</li>
                <li>3. <strong className="text-foreground">IMPORTANT:</strong> Write down your recovery phrase!</li>
              </ol>
            </CardContent>
          </Card>
          <Card className="bg-secondary/30">
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Need FLR Tokens?</h4>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>For testnet (Coston2):</strong>
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                Visit the <a href="https://faucet.flare.network/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Flare Faucet</a> to get free test FLR
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>For mainnet:</strong> Buy FLR on Coinbase, Kraken, etc.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 1 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">1</div>
          <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
        </div>

        <Card className="bg-secondary/30 mb-4">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`┌─────────────────────────────────────────┐
│  HSR - Subdomain Registry               │
│                                         │
│                    [Connect Wallet] <── Click here!
│                                         │
└─────────────────────────────────────────┘`}
            </pre>
          </CardContent>
        </Card>

        <ol className="space-y-2 text-muted-foreground">
          <li>1. Click <strong className="text-foreground">Connect Wallet</strong> in the top corner</li>
          <li>2. Choose your wallet (MetaMask, WalletConnect, etc.)</li>
          <li>3. Approve the connection in your wallet</li>
        </ol>
        <p className="text-sm text-muted-foreground mt-2">
          Once connected, you&apos;ll see your wallet address in the corner.
        </p>
      </section>

      {/* Step 2 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">2</div>
          <h2 className="text-2xl font-bold">Search for Your Subdomain</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Think of a name you want. You&apos;re picking a &quot;room&quot; in our &quot;building.&quot;
        </p>

        <Card className="bg-secondary/30 mb-4">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`┌─────────────────────────────────────────┐
│  Find Your Perfect Subdomain            │
│                                         │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ coolname     │  │ .cryptofans ▼│    │
│  └──────────────┘  └──────────────┘    │
│                                         │
│            [Search]                     │
└─────────────────────────────────────────┘`}
            </pre>
          </CardContent>
        </Card>

        <p className="text-muted-foreground mb-2">The search will tell you:</p>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">
            <Badge variant="default" className="bg-green-600">Available</Badge>
            <span className="text-muted-foreground">Great! You can buy it</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge variant="destructive">Taken</Badge>
            <span className="text-muted-foreground">Someone already owns it</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge variant="secondary">Reserved</Badge>
            <span className="text-muted-foreground">This name isn&apos;t available</span>
          </li>
        </ul>
      </section>

      {/* Step 3 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">3</div>
          <h2 className="text-2xl font-bold">Check the Price</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Subdomain prices depend on how short/desirable the name is:
        </p>

        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name Length</th>
                <th className="text-left py-2">Example</th>
                <th className="text-left py-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">1 character</td>
                <td className="py-2 font-mono">a.cryptofans</td>
                <td className="py-2"><Badge className="bg-amber-600">Ultra Premium</Badge></td>
              </tr>
              <tr className="border-b">
                <td className="py-2">2 characters</td>
                <td className="py-2 font-mono">ab.cryptofans</td>
                <td className="py-2"><Badge className="bg-yellow-600">Premium</Badge></td>
              </tr>
              <tr className="border-b">
                <td className="py-2">3 characters</td>
                <td className="py-2 font-mono">abc.cryptofans</td>
                <td className="py-2"><Badge className="bg-blue-600">Standard Plus</Badge></td>
              </tr>
              <tr className="border-b">
                <td className="py-2">4+ characters</td>
                <td className="py-2 font-mono">coolname.cryptofans</td>
                <td className="py-2"><Badge variant="secondary">Standard</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          The exact price in FLR will be shown before you buy.
        </p>
      </section>

      {/* Step 4 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">4</div>
          <h2 className="text-2xl font-bold">Complete Your Purchase</h2>
        </div>

        <Card className="bg-secondary/30 mb-4">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`┌─────────────────────────────────────────┐
│  Confirm Your Purchase                  │
│                                         │
│  Subdomain: coolname.cryptofans         │
│  Price: 881.57 FLR (~$10)               │
│  Gas Fee: ~0.01 FLR                     │
│                                         │
│  [Cancel]          [Confirm Purchase]   │
└─────────────────────────────────────────┘`}
            </pre>
          </CardContent>
        </Card>

        <ol className="space-y-2 text-muted-foreground">
          <li>1. Click <strong className="text-foreground">Continue to Purchase</strong></li>
          <li>2. Review the price and details</li>
          <li>3. Click <strong className="text-foreground">Purchase</strong></li>
          <li>4. Your wallet will pop up - approve the transaction</li>
          <li>5. Wait for confirmation...</li>
        </ol>
      </section>

      {/* Step 5 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">5</div>
          <h2 className="text-2xl font-bold">Wait for Confirmation</h2>
        </div>

        <Card className="bg-secondary/30 mb-4">
          <CardContent className="pt-6">
            <pre className="text-xs md:text-sm overflow-x-auto">
{`Payment sent ──────> Escrow holds it ──────> DNS is set up
      │                    │                      │
      │                    ▼                      │
      │            Verified? ─────────────────────┘
      │                    │
      │                    ▼
      └──────────> NFT minted to your wallet!`}
            </pre>
          </CardContent>
        </Card>

        <p className="text-muted-foreground">
          This usually takes <strong className="text-foreground">1-3 minutes</strong>. You&apos;ll see a confirmation when it&apos;s done.
        </p>
      </section>

      {/* Step 6 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white">
            <PartyPopper className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-bold">You Own It!</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Congratulations! You now own your subdomain. Here&apos;s what you can do:
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">View Your NFT</h4>
              <p className="text-sm text-muted-foreground">
                Go to <strong>My Domains</strong> in the dashboard to see all your subdomains.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-bold mb-2">Set Up DNS Records</h4>
              <p className="text-sm text-muted-foreground">
                Point your subdomain to your website, server, or anywhere you want.
              </p>
            </CardContent>
          </Card>
        </div>

        <h4 className="font-bold mb-2">DNS Record Types</h4>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Record Type</th>
                <th className="text-left py-2">What It Does</th>
                <th className="text-left py-2">Example</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 font-mono">A</td>
                <td className="py-2 text-muted-foreground">Points to an IP address</td>
                <td className="py-2 text-muted-foreground">Your web server</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-mono">AAAA</td>
                <td className="py-2 text-muted-foreground">Points to an IPv6 address</td>
                <td className="py-2 text-muted-foreground">Modern servers</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-mono">CNAME</td>
                <td className="py-2 text-muted-foreground">Points to another domain</td>
                <td className="py-2 text-muted-foreground">mysite.github.io</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-mono">TXT</td>
                <td className="py-2 text-muted-foreground">Stores text data</td>
                <td className="py-2 text-muted-foreground">Verification codes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Troubleshooting */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          {[
            {
              title: '"Transaction Failed"',
              solutions: [
                "Make sure you have enough FLR for both price AND gas fees",
                "Try again - sometimes the network is busy",
              ],
            },
            {
              title: '"Subdomain Not Working Yet"',
              solutions: [
                "DNS changes can take a few minutes to propagate",
                "Check the propagation status on your dashboard",
              ],
            },
            {
              title: '"I Can\'t See My NFT"',
              solutions: [
                "Wait a few minutes for the blockchain to confirm",
                "Check your wallet is connected to the right network",
                "Look in your dashboard under 'My Domains'",
              ],
            },
            {
              title: '"Wallet Won\'t Connect"',
              solutions: [
                "Use a supported browser (Chrome, Firefox, Brave)",
                "Try refreshing the page",
                "Check your wallet extension is unlocked",
              ],
            },
          ].map((item) => (
            <Card key={item.title} className="bg-secondary/30">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold mb-2">{item.title}</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {item.solutions.map((s, i) => (
                        <li key={i}>• {s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Ideas */}
      <section>
        <h2 className="text-2xl font-bold mb-4">What Can You Do With Your Subdomain?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: "Personal Website", desc: "Point it to your portfolio or blog" },
            { title: "Web3 Identity", desc: "Use it as your decentralized identity" },
            { title: "Redirect", desc: "Point it to your social media" },
            { title: "Email (Advanced)", desc: "Set up MX records for email" },
            { title: "Sell It", desc: "Transfer the NFT to someone else" },
            { title: "HODL", desc: "Keep it as a collectible" },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="pt-6">
                <h4 className="font-bold">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="pt-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ready to register?</h3>
                <p className="text-muted-foreground">Find your perfect subdomain now</p>
              </div>
              <div className="flex gap-2">
                <Link href="/register-v2">
                  <Button>
                    Register Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/docs/how-it-works">
                  <Button variant="outline">
                    Technical Details
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

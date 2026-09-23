"use client";

import {
  Wallet,
  Download,
  Droplets,
  Link,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Smartphone,
  Settings,
  ToggleRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
/* eslint-disable @next/next/no-img-element */

export default function WalletSetupPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Wallet className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Getting Started</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Wallet Setup</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          HSR uses the Bifrost Wallet for connecting to the Flare network.
          This guide walks you through installing Bifrost on your phone,
          enabling Developer Mode for testnet access, funding your wallet
          with test tokens, and connecting to HSR.
        </p>
      </div>

      {/* Prerequisites */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            Prerequisites
          </h3>
          <ul className="text-zinc-400 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-zinc-500 mt-0.5">&#8226;</span>
              A smartphone (iOS or Android) to install the Bifrost Wallet
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-500 mt-0.5">&#8226;</span>
              A computer with a web browser to access the HSR website
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-500 mt-0.5">&#8226;</span>
              Both devices on the same Wi-Fi network (for WalletConnect QR scanning)
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Step 1: Install Bifrost Wallet */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            1
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-amber-400" />
            Install Bifrost Wallet
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Bifrost is a multi-chain mobile wallet with native support for the Flare
            network. It&apos;s the recommended wallet for HSR and is required for
            connecting to the platform.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="text-white text-sm font-medium mb-2">Installation Steps</h4>
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>
                  Download Bifrost Wallet from the{" "}
                  <a
                    href="https://apps.apple.com/app/bifrost-wallet/id1577198351"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    App Store
                    <ExternalLink className="inline h-3 w-3 ml-1" />
                  </a>{" "}
                  or{" "}
                  <a
                    href="https://play.google.com/store/apps/details?id=com.aspect.bifrostwallet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    Google Play
                    <ExternalLink className="inline h-3 w-3 ml-1" />
                  </a>
                </li>
                <li>Open the app and create a new wallet</li>
                <li>
                  <strong className="text-yellow-400">Important:</strong> Write down your
                  recovery phrase and store it securely offline. Never share it with anyone.
                </li>
                <li>Set a PIN or enable biometric authentication</li>
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-yellow-500/5 border-yellow-500/20">
            <CardContent className="p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-yellow-400 text-sm font-medium mb-1">Security Warning</h4>
                <p className="text-zinc-400 text-sm">
                  Never share your recovery phrase or private keys. HSR will never ask
                  for them. Only download Bifrost from the official app stores.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 2: Enable Developer Mode */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            2
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ToggleRight className="h-5 w-5 text-amber-400" />
            Enable Developer Mode
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            HSR currently runs on the Flare Coston2 testnet. By default, Bifrost only
            shows mainnet networks. You need to enable Developer Mode to access testnets
            like Coston2.
          </p>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="text-white text-sm font-medium mb-3">How to Enable Developer Mode</h4>
              <ol className="text-zinc-400 text-sm space-y-3 list-decimal list-inside">
                <li>
                  Open Bifrost and tap the <strong className="text-white">Settings gear icon</strong> in the bottom-right corner
                </li>
                <li>
                  Scroll to find <strong className="text-white">Advanced</strong> settings
                </li>
                <li>
                  Find the <strong className="text-white">Developer Mode</strong> toggle and tap it
                </li>
                <li>
                  A confirmation dialog will appear &mdash; tap <strong className="text-white">Enable</strong>
                </li>
                <li>
                  All networks will switch from &quot;Mainnet&quot; to &quot;Testnet&quot; labels.
                  Flare Network will show <strong className="text-white">Coston 2</strong>.
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Screenshot Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { src: "/wiki/bifrost/step1-settings.png", label: "1. Tap Settings", alt: "Bifrost home screen with settings gear icon highlighted" },
              { src: "/wiki/bifrost/step2-devmode-off.png", label: "2. Find Developer Mode", alt: "Bifrost advanced settings showing Developer Mode toggle off" },
              { src: "/wiki/bifrost/step3-enable-confirm.png", label: "3. Tap Enable", alt: "Bifrost confirmation dialog to enable developer mode" },
              { src: "/wiki/bifrost/step4-devmode-on.png", label: "4. Dev Mode Active", alt: "Bifrost with developer mode enabled showing testnet networks" },
            ].map((img) => (
              <div key={img.src} className="space-y-2">
                <div className="relative aspect-[9/16] rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
                <p className="text-xs text-zinc-500 text-center">{img.label}</p>
              </div>
            ))}
          </div>

          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-4 flex gap-3">
              <Settings className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-blue-400 text-sm font-medium mb-1">Note</h4>
                <p className="text-zinc-400 text-sm">
                  When Developer Mode is enabled, your wallet switches to testnet.
                  Your mainnet assets and history are separate and safe &mdash; you can
                  toggle back to mainnet at any time by disabling Developer Mode.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 3: Get Test FLR */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            3
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Droplets className="h-5 w-5 text-amber-400" />
            Get Test FLR from the Faucet
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Since HSR runs on the Coston2 testnet, you need test C2FLR tokens (not real
            money) to buy domains and pay gas fees. The Flare faucet distributes free
            test tokens.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="text-white text-sm font-medium mb-2">Faucet Instructions</h4>
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>
                  Visit the Flare Faucet at{" "}
                  <a
                    href="https://faucet.flare.network/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    faucet.flare.network
                    <ExternalLink className="inline h-3 w-3 ml-1" />
                  </a>
                </li>
                <li>Select &quot;Coston2&quot; from the network dropdown</li>
                <li>
                  Open Bifrost on your phone, tap your Flare wallet, and copy your
                  wallet address
                </li>
                <li>Paste your address into the faucet input field on your computer</li>
                <li>Complete the CAPTCHA and click &quot;Request tokens&quot;</li>
                <li>Wait 10-30 seconds for the tokens to arrive in your Bifrost wallet</li>
              </ol>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 text-center">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Amount per Request</p>
                <p className="text-white text-lg font-semibold">100 C2FLR</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 text-center">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Cooldown Period</p>
                <p className="text-white text-lg font-semibold">24 hours</p>
              </CardContent>
            </Card>
          </div>
          <p className="text-zinc-500 text-sm">
            100 C2FLR is more than enough to purchase several domains and cover gas fees.
            The cheapest domains start at approximately 1 FLR, while premium short names
            can cost more. You can return to the faucet once per day for additional tokens.
          </p>
        </div>
      </section>

      {/* Step 4: Connect to HSR */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            4
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Link className="h-5 w-5 text-amber-400" />
            Connect to HSR
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            HSR uses Web3Modal (by WalletConnect) for wallet connections. You&apos;ll
            scan a QR code on the HSR website with your Bifrost wallet to connect.
            Make sure your phone has Bifrost open and Developer Mode enabled.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="text-white text-sm font-medium mb-2">Connection Steps</h4>
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>Open the HSR website on your computer</li>
                <li>Click the <strong className="text-white">Connect Wallet</strong> button in the top-right navigation</li>
                <li>A Web3Modal popup will appear with a QR code</li>
                <li>Open Bifrost on your phone and tap the <strong className="text-white">scan icon</strong></li>
                <li>Scan the QR code displayed on your computer screen</li>
                <li>Approve the connection request in Bifrost</li>
                <li>
                  If prompted, approve the network switch to Coston2 (chain ID 114)
                </li>
                <li>
                  Your wallet address will appear in the navigation bar confirming the
                  connection
                </li>
              </ol>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: <Smartphone className="h-4 w-4 text-amber-400" />,
                title: "Phone Required",
                desc: "Bifrost is a mobile wallet. You'll need your phone nearby to approve transactions on HSR.",
              },
              {
                icon: <Link className="h-4 w-4 text-amber-400" />,
                title: "Session Persistence",
                desc: "Your connection persists across page reloads. Disconnect manually via the wallet menu.",
              },
              {
                icon: <Settings className="h-4 w-4 text-amber-400" />,
                title: "Auto Network Switch",
                desc: "HSR automatically requests switching to Coston2 if you're on the wrong network.",
              },
            ].map((item) => (
              <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <h4 className="text-white text-sm font-medium mb-1 flex items-center gap-2">
                    {item.icon}
                    {item.title}
                  </h4>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* What's Next */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-2">What&apos;s Next?</h3>
          <p className="text-zinc-400 text-sm">
            Now that your wallet is connected and funded, you&apos;re ready to search for
            and purchase your first Handshake subdomain. Head to the{" "}
            <span className="text-amber-400">Buy Your First Domain</span> guide to learn
            how to find and register a domain, or explore the{" "}
            <span className="text-amber-400">Domain Search</span> guide to master the
            search functionality.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

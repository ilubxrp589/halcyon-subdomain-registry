"use client";

import {
  Globe,
  Server,
  ArrowRight,
  ArrowRightLeft,
  FileText,
  Link2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
  Settings,
  RotateCw,
  Shield,
  Monitor,
  Users,
  User,
  HardDrive,
  Wallet,
  Radio,
  Layers,
  Palette,
  ChevronDown,
  Search,
  Filter,
  LayoutGrid,
  List,
  Zap,
  Hash,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function DnsSetupPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-blue-500/20 border border-amber-500/10">
            <Globe className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Guides</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">DNS Setup & Configuration</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Complete guide to managing DNS records, IPFS hosting, wallet resolution,
          URL forwarding, and resolving Handshake domains in your browser.
        </p>
      </div>

      {/* Feature overview badges */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "5 Record Types", icon: Server },
          { label: "URL Forwarding", icon: ArrowRightLeft },
          { label: "IPFS Hosting", icon: HardDrive },
          { label: "FLR Resolution", icon: Wallet },
          { label: "Profile Pages", icon: User },
          { label: "DNS-over-HTTPS", icon: Shield },
        ].map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50"
          >
            <f.icon className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-zinc-300 text-xs font-medium">{f.label}</span>
          </div>
        ))}
      </div>

      {/* Audience overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href="#domain-owners" className="block no-underline">
          <Card className="bg-zinc-900/50 border-zinc-800 hover:border-amber-500/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <User className="h-4 w-4 text-amber-400" />
                </div>
                <h4 className="text-white text-sm font-medium">Domain Owners</h4>
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Configure DNS records, set up URL forwarding, host on IPFS, map your
                wallet address, and create a profile page for your domain.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {["DNS Records", "Forwarding", "IPFS", "Wallet", "Profile"].map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="#end-users" className="block no-underline">
          <Card className="bg-zinc-900/50 border-zinc-800 hover:border-green-500/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-green-500/10">
                  <Users className="h-4 w-4 text-green-400" />
                </div>
                <h4 className="text-white text-sm font-medium">End Users / Visitors</h4>
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Visit Handshake websites in your browser by setting up DNS-over-HTTPS (DoH).
                One-time Firefox configuration, no extensions required.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {["Firefox Setup", "DoH Config", "Certificate Trust"].map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* ============================================ */}
      {/* PART 1: DOMAIN OWNERS                        */}
      {/* ============================================ */}

      <div id="domain-owners" className="border-t border-zinc-800 pt-8 scroll-mt-6">
        <div className="flex items-center gap-2 mb-1">
          <User className="h-5 w-5 text-amber-400" />
          <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">For Domain Owners</Badge>
        </div>
        <h2 className="text-2xl font-bold text-white mt-2">Domain Management Dashboard</h2>
        <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
          All DNS features are managed through expandable domain cards on your dashboard.
          Each card gives you access to DNS records, URL forwarding, IPFS hosting, wallet resolution,
          and profile page settings.
        </p>
      </div>

      {/* Dashboard UI Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Dashboard Overview
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Your domains are displayed as expandable cards. Click any domain to reveal its
          full management panel with five collapsible sections.
        </p>

        {/* Expandable card mockup */}
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            {/* Collapsed card preview */}
            <div className="px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-600/30 to-blue-600/30 border border-amber-500/20 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono font-bold">alice.cryptofans</span>
                      <span className="text-zinc-600 text-xs font-mono">#12345</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-zinc-500 text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" /> 342 days
                      </span>
                      <span className="text-green-400 text-xs flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> DNS Active
                      </span>
                      <span className="text-green-400 text-xs flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> FLR Set
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 text-zinc-500" />
              </div>
            </div>

            {/* Expanded sections */}
            <div className="px-5 py-3 space-y-1">
              {[
                { icon: Server, label: "DNS Records", desc: "A, AAAA, CNAME, TXT records", color: "text-blue-400" },
                { icon: Wallet, label: "FLR Address Resolution", desc: "Map domain to wallet address", color: "text-amber-400" },
                { icon: ArrowRightLeft, label: "URL Forwarding", desc: "301/302 redirects with path forwarding", color: "text-green-400" },
                { icon: HardDrive, label: "IPFS Content", desc: "Host via IPFS contenthash / dnslink", color: "text-cyan-400" },
                { icon: Globe, label: "Profile Page", desc: "Web3 profile with bio, colors, layout", color: "text-amber-400" },
              ].map((section) => (
                <div
                  key={section.label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/30 border border-zinc-800/50"
                >
                  <section.icon className={`h-4 w-4 ${section.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium">{section.label}</span>
                    <span className="text-zinc-600 text-xs ml-2 hidden sm:inline">{section.desc}</span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filter toolbar */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-400" />
              Filtering & Sorting
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Status", options: "Active, Pending, Expired" },
                { label: "DNS", options: "DNS Active, DNS Pending" },
                { label: "Listing", options: "Listed, Not Listed" },
                { label: "Sort", options: "Name, Registered, Expiring, Token ID" },
              ].map((filter) => (
                <div key={filter.label} className="bg-zinc-950 rounded-lg px-3 py-2">
                  <p className="text-zinc-300 text-xs font-medium">{filter.label}</p>
                  <p className="text-zinc-600 text-[10px] mt-0.5">{filter.options}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700">
                <LayoutGrid className="h-3 w-3 text-zinc-400" />
                <span className="text-zinc-400 text-[10px]">Grid</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/50 border border-zinc-800">
                <List className="h-3 w-3 text-zinc-500" />
                <span className="text-zinc-500 text-[10px]">List</span>
              </div>
              <span className="text-zinc-600 text-[10px] ml-2">Toggle between grid and list views</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── DNS Record Types ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Server className="h-5 w-5 text-amber-400" />
          Supported DNS Record Types
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR uses PowerDNS as its authoritative DNS server. Five record types are supported,
          giving you full control over how your domain resolves.
        </p>
        <div className="grid grid-cols-1 gap-3">
          {[
            {
              type: "A",
              purpose: "IPv4 Address",
              example: "93.184.216.34",
              desc: "Point your domain to a web server, VPS, or hosting provider. The most common record type.",
              color: "from-blue-500/10 to-blue-600/5",
              borderColor: "border-blue-500/20",
              badgeColor: "bg-blue-500/20 text-blue-400",
            },
            {
              type: "AAAA",
              purpose: "IPv6 Address",
              example: "2606:2800:220:1:248:1893:25c8:1946",
              desc: "Point your domain to an IPv6-capable server. Use alongside an A record for dual-stack support.",
              color: "from-amber-500/10 to-amber-600/5",
              borderColor: "border-amber-500/20",
              badgeColor: "bg-amber-500/20 text-amber-400",
            },
            {
              type: "CNAME",
              purpose: "Domain Alias",
              example: "mysite.vercel.app",
              desc: "Alias your domain to another hostname. Perfect for Vercel, Netlify, GitHub Pages, or any hosting platform.",
              color: "from-green-500/10 to-green-600/5",
              borderColor: "border-green-500/20",
              badgeColor: "bg-green-500/20 text-green-400",
            },
            {
              type: "TXT",
              purpose: "Text Data",
              example: "v=spf1 include:_spf.google.com ~all",
              desc: "Store verification tokens, SPF/DKIM email records, or any arbitrary text data.",
              color: "from-amber-500/10 to-amber-600/5",
              borderColor: "border-amber-500/20",
              badgeColor: "bg-amber-500/20 text-amber-400",
            },
            {
              type: "URL",
              purpose: "HTTP Redirect",
              example: "https://example.com",
              desc: "Redirect visitors to any URL. Supports 301 (permanent) and 302 (temporary) redirects. HSR-specific record type.",
              color: "from-amber-500/10 to-amber-600/5",
              borderColor: "border-amber-500/20",
              badgeColor: "bg-amber-500/20 text-amber-400",
            },
          ].map((record) => (
            <Card key={record.type} className={`bg-gradient-to-r ${record.color} ${record.borderColor} border`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={`${record.badgeColor} border-0 font-mono text-xs font-bold px-2.5`}>
                        {record.type}
                      </Badge>
                      <span className="text-white text-sm font-medium">{record.purpose}</span>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">{record.desc}</p>
                  </div>
                  <div className="hidden sm:block bg-zinc-950/80 rounded-lg px-3 py-2 shrink-0">
                    <p className="text-zinc-600 text-[10px] mb-0.5">Example</p>
                    <code className="text-amber-400 text-xs">{record.example}</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-zinc-400 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-white">CNAME exclusivity:</strong> A CNAME record cannot coexist with
                A or AAAA records for the same name. If you set a CNAME, remove any existing A/AAAA records first.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ─── Setting Records ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-amber-400" />
          Setting DNS Records
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Only the wallet that owns the domain NFT can modify its DNS records. Changes are
          verified server-side and pushed to PowerDNS immediately.
        </p>

        {/* Step-by-step */}
        <div className="space-y-3">
          {[
            {
              step: 1,
              title: "Open your dashboard",
              desc: "Navigate to your dashboard where all your domains are listed.",
            },
            {
              step: 2,
              title: "Expand the domain card",
              desc: "Click on the domain you want to configure. The card expands to reveal management sections.",
            },
            {
              step: 3,
              title: "Open DNS Records",
              desc: "Click the \"DNS Records\" collapsible section. You'll see fields for IPv4, IPv6, CNAME, and TXT records.",
            },
            {
              step: 4,
              title: "Enter your record value",
              desc: "Type the value into the appropriate field. Each field validates input format automatically.",
            },
            {
              step: 5,
              title: "Save changes",
              desc: "Click \"Save Changes\". The backend verifies NFT ownership, updates PowerDNS, and confirms with a green success message.",
            },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold shrink-0 mt-0.5">
                {s.step}
              </div>
              <div>
                <h4 className="text-white text-sm font-medium">{s.title}</h4>
                <p className="text-zinc-500 text-xs mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Common Configurations */}
        <h3 className="text-white text-sm font-medium pt-2">Common Configurations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              title: "Web Server",
              type: "A",
              value: "123.45.67.89",
              desc: "Point to your server's IP. Configure your server to respond to your HSR domain.",
            },
            {
              title: "Vercel / Netlify",
              type: "CNAME",
              value: "cname.vercel-dns.com",
              desc: "Set CNAME to your hosting platform's target, then add your domain in their dashboard.",
            },
            {
              title: "Domain Verification",
              type: "TXT",
              value: "google-site-verification=abc123",
              desc: "Prove ownership via TXT records for Google Search Console, email services, etc.",
            },
          ].map((example) => (
            <Card key={example.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <h4 className="text-white text-sm font-medium">{example.title}</h4>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {example.type}
                  </Badge>
                </div>
                <p className="text-zinc-500 text-xs mb-2">{example.desc}</p>
                <div className="bg-zinc-950 rounded px-3 py-2">
                  <code className="text-amber-400 text-xs break-all">{example.value}</code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── URL Forwarding ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-amber-400" />
          URL Forwarding
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Redirect visitors from your Handshake domain to any URL. The easiest way to make
          your domain useful without a web server. URL forwarding uses HSR&apos;s redirect server and
          works independently of A/CNAME records.
        </p>

        {/* Redirect types */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-blue-500/5 to-blue-600/5 border-blue-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-blue-500/20 text-blue-400 border-0 text-sm font-mono font-bold">301</Badge>
                <h4 className="text-white text-sm font-medium">Permanent Redirect</h4>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Browsers cache this redirect and go directly to the target on subsequent visits.
                Search engines transfer ranking to the new URL. Best for long-term forwarding.
              </p>
              <div className="mt-3 px-3 py-2 rounded bg-zinc-950/60">
                <p className="text-zinc-600 text-[10px]">Best for</p>
                <p className="text-blue-400 text-xs">Personal site, portfolio, permanent home</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500/5 to-yellow-600/5 border-yellow-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-yellow-500/20 text-yellow-400 border-0 text-sm font-mono font-bold">302</Badge>
                <h4 className="text-white text-sm font-medium">Temporary Redirect</h4>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Browsers check the original URL each time. Search engines keep the original URL indexed.
                Best for short-term forwarding or when you might change the target.
              </p>
              <div className="mt-3 px-3 py-2 rounded bg-zinc-950/60">
                <p className="text-zinc-600 text-[10px]">Best for</p>
                <p className="text-yellow-400 text-xs">Campaigns, seasonal content, testing</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Path Forwarding */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-1 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-amber-400" />
              Path Forwarding
            </h4>
            <p className="text-zinc-400 text-sm mb-3">
              When enabled, the URL path from the original request is appended to the destination.
              Toggle this option with the &quot;Forward path&quot; checkbox.
            </p>
            <div className="space-y-2">
              <div className="bg-zinc-950 rounded-lg px-4 py-3">
                <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1.5">Path forwarding OFF</p>
                <div className="flex items-center gap-2">
                  <code className="text-blue-400 text-xs">alice.cryptofans/about</code>
                  <ArrowRight className="h-3 w-3 text-zinc-600" />
                  <code className="text-green-400 text-xs">https://example.com</code>
                </div>
                <p className="text-zinc-600 text-[10px] mt-1">/about is dropped</p>
              </div>
              <div className="bg-zinc-950 rounded-lg px-4 py-3 border border-green-500/10">
                <p className="text-green-500 text-[10px] uppercase tracking-wide mb-1.5">Path forwarding ON</p>
                <div className="flex items-center gap-2">
                  <code className="text-blue-400 text-xs">alice.cryptofans/about</code>
                  <ArrowRight className="h-3 w-3 text-zinc-600" />
                  <code className="text-green-400 text-xs">https://example.com/about</code>
                </div>
                <p className="text-zinc-600 text-[10px] mt-1">/about is preserved</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forwarding setup */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2">Setting Up URL Forwarding</h4>
            <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
              <li>Expand your domain card and open the <strong className="text-white">URL Forwarding</strong> section</li>
              <li>Enter the destination URL (must include https:// or http://)</li>
              <li>Choose redirect type: <strong className="text-white">301</strong> (Permanent) or <strong className="text-white">302</strong> (Temporary)</li>
              <li>Toggle <strong className="text-white">Forward path</strong> if you want URL paths preserved</li>
              <li>Toggle <strong className="text-white">Enabled</strong> to activate (can be disabled without deleting)</li>
              <li>Click <strong className="text-white">Save</strong> &mdash; forwarding activates immediately</li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* ─── IPFS Contenthash ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-amber-400" />
          IPFS Content Hosting
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Host your website or content on IPFS and link it to your domain. HSR creates a{" "}
          <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">_dnslink</code>{" "}
          TXT record that points to your IPFS content, making it accessible through any IPFS gateway.
        </p>

        {/* How it works */}
        <Card className="bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border-cyan-500/20">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3">How IPFS Hosting Works</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="text-white text-sm">Upload your content to IPFS</p>
                  <p className="text-zinc-500 text-xs">Use Pinata, web3.storage, or any IPFS pinning service to get a CID</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="text-white text-sm">Enter your CID in the IPFS Content section</p>
                  <p className="text-zinc-500 text-xs">Supports both CIDv0 (Qm...) and CIDv1 (bafy...) formats</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="text-white text-sm">HSR creates the dnslink record automatically</p>
                  <p className="text-zinc-500 text-xs">
                    Creates{" "}
                    <code className="text-cyan-400 bg-zinc-950 px-1 rounded text-[10px]">
                      _dnslink.alice.cryptofans TXT &quot;dnslink=/ipfs/Qm...&quot;
                    </code>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CID formats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-cyan-500/20 text-cyan-400 border-0 text-xs font-mono">CIDv0</Badge>
                <span className="text-white text-sm">Base58 Format</span>
              </div>
              <div className="bg-zinc-950 rounded px-3 py-2 mt-2">
                <code className="text-cyan-400 text-xs break-all">QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG</code>
              </div>
              <p className="text-zinc-500 text-xs mt-2">Starts with &quot;Qm&quot; &mdash; older format, widely supported</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-cyan-500/20 text-cyan-400 border-0 text-xs font-mono">CIDv1</Badge>
                <span className="text-white text-sm">Base32 Format</span>
              </div>
              <div className="bg-zinc-950 rounded px-3 py-2 mt-2">
                <code className="text-cyan-400 text-xs break-all">bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi</code>
              </div>
              <p className="text-zinc-500 text-xs mt-2">Starts with &quot;bafy&quot; &mdash; newer format, recommended</p>
            </CardContent>
          </Card>
        </div>

        {/* Gateway preview */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-amber-400" />
              Gateway Preview
            </h4>
            <p className="text-zinc-400 text-sm mb-3">
              Once configured, your content is accessible through IPFS gateways. The dashboard
              shows a preview link to verify your content is working.
            </p>
            <div className="bg-zinc-950 rounded-lg px-4 py-3 flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
              <code className="text-cyan-400 text-xs break-all">
                gateway.pinata.cloud/ipfs/QmYwAPJzv5CZsnA...
              </code>
              <ExternalLink className="h-3 w-3 text-zinc-600 shrink-0" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── FLR Address Resolution ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Wallet className="h-5 w-5 text-amber-400" />
          FLR Address Resolution
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Map your domain to a wallet address so people can send FLR tokens to{" "}
          <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">alice.cryptofans</code>{" "}
          instead of a long 0x address. Think of it as a human-readable wallet name.
        </p>

        {/* Resolution priority */}
        <Card className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3">Resolution Priority</h4>
            <p className="text-zinc-400 text-xs mb-4">
              When someone resolves your domain to a wallet address, HSR checks three sources in order:
            </p>
            <div className="space-y-2">
              {[
                {
                  priority: 1,
                  source: "On-chain Resolver",
                  desc: "Address set in the smart contract (highest authority)",
                  color: "text-green-400",
                  bg: "bg-green-500/10",
                },
                {
                  priority: 2,
                  source: "Database",
                  desc: "Address set through the dashboard UI",
                  color: "text-blue-400",
                  bg: "bg-blue-500/10",
                },
                {
                  priority: 3,
                  source: "Default (Owner)",
                  desc: "Falls back to the wallet that owns the NFT",
                  color: "text-zinc-400",
                  bg: "bg-zinc-500/10",
                },
              ].map((item) => (
                <div key={item.priority} className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full ${item.bg} ${item.color} text-[10px] font-bold shrink-0`}>
                    {item.priority}
                  </div>
                  <div className="flex-1 flex items-center justify-between bg-zinc-950/50 rounded-lg px-3 py-2">
                    <span className={`text-sm font-medium ${item.color}`}>{item.source}</span>
                    <span className="text-zinc-500 text-xs hidden sm:inline">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Setting wallet */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2">Setting Your Wallet Address</h4>
            <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
              <li>Expand your domain card and open <strong className="text-white">FLR Address Resolution</strong></li>
              <li>Enter a valid wallet address (0x...)</li>
              <li>Click <strong className="text-white">Set Wallet</strong></li>
              <li>The resolver source will show &quot;Database&quot; once saved</li>
            </ol>
            <div className="mt-3 bg-zinc-950 rounded-lg px-4 py-3">
              <p className="text-zinc-600 text-[10px] uppercase tracking-wide mb-1">Example</p>
              <div className="flex items-center gap-2">
                <code className="text-amber-400 text-xs">alice.cryptofans</code>
                <ArrowRight className="h-3 w-3 text-zinc-600" />
                <code className="text-amber-400 text-xs">0x742d...F44e</code>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Text Records & Profile ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Palette className="h-5 w-5 text-amber-400" />
          Profile Pages
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Every domain can have a Web3 profile page &mdash; a customizable landing page
          that displays your bio, wallet address, NFT image, and social links. Your domain
          can operate in two modes:
        </p>

        {/* Domain modes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="h-4 w-4 text-blue-400" />
                <h4 className="text-white text-sm font-medium">Redirect Mode</h4>
                <Badge variant="outline" className="text-[10px]">Default</Badge>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Domain forwards visitors to an external URL via URL forwarding. Profile page
                is not displayed.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/5 to-pink-500/5 border-amber-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">Profile Mode</h4>
                <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px]">Web3 Identity</Badge>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Domain shows a customizable profile page with your bio, wallet address,
                NFT artwork, and social links.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile customization */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3">Profile Customization Options</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Bio", desc: "Up to 500 characters of text", icon: FileText },
                { label: "Layout", desc: "Standard, Minimal, or Card", icon: LayoutGrid },
                { label: "Primary Color", desc: "Accent color via hex picker", icon: Palette },
                { label: "Background Color", desc: "Page background via hex picker", icon: Palette },
                { label: "Show Wallet", desc: "Toggle wallet address visibility", icon: Wallet },
                { label: "Show NFT Image", desc: "Toggle NFT artwork display", icon: Eye },
              ].map((opt) => (
                <div key={opt.label} className="flex items-start gap-2.5 bg-zinc-800/30 rounded-lg px-3 py-2.5">
                  <opt.icon className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white text-xs font-medium">{opt.label}</p>
                    <p className="text-zinc-500 text-[10px]">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-zinc-950 rounded-lg px-4 py-2.5">
              <p className="text-zinc-600 text-[10px] mb-1">Preview your profile at:</p>
              <code className="text-amber-400 text-xs">/profile/alice.cryptofans</code>
            </div>
          </CardContent>
        </Card>

        {/* Text records */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
              <Hash className="h-4 w-4 text-amber-400" />
              Text Records
            </h4>
            <p className="text-zinc-400 text-sm mb-3">
              Text records store metadata about your domain identity. These are used by the
              profile page and can also be read by other applications.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: "avatar", desc: "Profile image URL" },
                { key: "url", desc: "Website link" },
                { key: "description", desc: "Short bio" },
                { key: "email", desc: "Contact email" },
                { key: "github", desc: "GitHub username" },
                { key: "twitter", desc: "Twitter handle" },
              ].map((record) => (
                <div key={record.key} className="bg-zinc-950 rounded-lg px-3 py-2">
                  <code className="text-amber-400 text-xs font-bold">{record.key}</code>
                  <p className="text-zinc-600 text-[10px] mt-0.5">{record.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── DNS Propagation ─── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          DNS Propagation
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Unlike traditional DNS where propagation takes 24-48 hours, HSR controls its own
          authoritative PowerDNS servers. Changes take effect almost instantly.
        </p>

        {/* Propagation timeline */}
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                {
                  step: "PowerDNS Update",
                  time: "Instant (< 1 second)",
                  color: "text-green-400",
                  bg: "bg-green-500",
                  desc: "Record saved to authoritative server",
                },
                {
                  step: "HNS-aware Resolvers",
                  time: "1 – 5 minutes",
                  color: "text-blue-400",
                  bg: "bg-blue-500",
                  desc: "HDNS and HNS resolvers pick up the change",
                },
                {
                  step: "Cached Records (TTL)",
                  time: "5 – 60 minutes",
                  color: "text-yellow-400",
                  bg: "bg-yellow-500",
                  desc: "Stale caches expire based on TTL",
                },
              ].map((row, i) => (
                <div key={row.step} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-2 h-2 rounded-full ${row.bg} shrink-0`} />
                    <div>
                      <span className="text-white text-sm font-medium">{row.step}</span>
                      <p className="text-zinc-500 text-xs">{row.desc}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${row.color} shrink-0`}>{row.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Post-registration DNS setup status */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Post-Registration DNS Setup
            </h4>
            <p className="text-zinc-400 text-xs mb-4">
              After purchasing a domain, HSR automatically configures DNS. A progress indicator
              tracks the four setup stages:
            </p>
            <div className="space-y-3">
              {[
                { step: "Domain registered on blockchain", icon: CheckCircle2, status: "complete" },
                { step: "Setting up DNS records", icon: Server, status: "complete" },
                { step: "DNS propagating to resolvers", icon: Radio, status: "current" },
                { step: "Domain is live", icon: Globe, status: "pending" },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      s.status === "complete"
                        ? "bg-green-500/20"
                        : s.status === "current"
                          ? "bg-teal-500/20"
                          : "bg-white/5"
                    }`}
                  >
                    <s.icon
                      className={`h-4 w-4 ${
                        s.status === "complete"
                          ? "text-green-400"
                          : s.status === "current"
                            ? "text-teal-400"
                            : "text-white/40"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-sm ${
                      s.status === "complete"
                        ? "text-green-400"
                        : s.status === "current"
                          ? "text-white"
                          : "text-white/40"
                    }`}
                  >
                    {s.step}
                  </span>
                  {s.status === "current" && (
                    <RotateCw className="h-3 w-3 text-teal-400 animate-spin" />
                  )}
                </div>
              ))}

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-green-500"
                  style={{ width: "66%" }}
                />
              </div>
              <p className="text-zinc-500 text-xs">
                Usually completes within a few seconds. Polls every 5 seconds for up to 5 minutes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Propagation monitor */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Radio className="h-4 w-4 text-amber-400" />
              Propagation Monitor
            </h4>
            <p className="text-zinc-400 text-xs mb-3">
              The propagation monitor shows resolver-by-resolver status with real-time updates
              every 30 seconds.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "HDNS-1", status: "propagated", color: "text-green-400" },
                  { name: "HDNS-2", status: "propagated", color: "text-green-400" },
                  { name: "HNS-Node", status: "pending", color: "text-zinc-500" },
                ].map((resolver) => (
                  <div key={resolver.name} className="bg-zinc-950 rounded-lg px-3 py-2 text-center">
                    <p className="text-zinc-300 text-xs font-mono">{resolver.name}</p>
                    <p className={`text-[10px] font-medium ${resolver.color} mt-0.5`}>
                      {resolver.status === "propagated" ? "✓ propagated" : "○ pending"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-zinc-600 pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Propagated
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> In Progress
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" /> Pending
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Error
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* DNS Tips */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            DNS Tips
          </h3>
          <ul className="text-zinc-400 text-sm space-y-2.5">
            {[
              "CNAME records cannot coexist with A or AAAA records for the same name.",
              "URL forwarding uses HSR's redirect server and works independently of A/CNAME records.",
              "TXT records can be used for domain verification alongside other record types.",
              "IPFS contenthash and URL forwarding serve different purposes — contenthash sets a dnslink record while forwarding does an HTTP redirect.",
              "FLR resolution defaults to the NFT owner wallet if no custom address is set.",
              "Handshake domains require an HNS-aware resolver. Standard DNS (Google 8.8.8.8, Cloudflare 1.1.1.1) does not resolve HNS names. See the Browser Setup section below.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">&#8226;</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* PART 2: END USERS / BROWSER SETUP            */}
      {/* ============================================ */}

      <div id="end-users" className="border-t border-zinc-800 pt-8 scroll-mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-5 w-5 text-green-400" />
          <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">For End Users</Badge>
        </div>
        <h2 className="text-2xl font-bold text-white mt-2">Browser Setup (DNS-over-HTTPS)</h2>
        <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
          Want to visit Handshake websites? Change one setting in Firefox to route DNS lookups
          through the HSR resolver. No extensions or software required.
        </p>
      </div>

      {/* What is DoH */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          What is DNS-over-HTTPS?
        </h2>
        <Card className="bg-gradient-to-br from-green-500/5 to-teal-500/5 border-green-500/20">
          <CardContent className="p-5">
            <p className="text-zinc-300 text-sm leading-relaxed">
              DNS-over-HTTPS (DoH) encrypts your DNS lookups over HTTPS instead of plain-text UDP.
              By pointing your browser to the HSR resolver, every lookup &mdash; including
              Handshake TLDs &mdash; goes through our infrastructure. Your ISP cannot see which
              domains you resolve.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: "Encrypted", desc: "DNS queries are HTTPS-encrypted" },
                { label: "Universal", desc: "Regular + Handshake domains" },
                { label: "No Install", desc: "Browser setting change only" },
              ].map((b) => (
                <div key={b.label} className="bg-zinc-950/50 rounded-lg px-3 py-2 text-center">
                  <p className="text-green-400 text-xs font-medium">{b.label}</p>
                  <p className="text-zinc-500 text-[10px] mt-0.5">{b.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Browser Compatibility */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Monitor className="h-5 w-5 text-amber-400" />
          Browser Compatibility
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-green-500/5 to-green-600/5 border-green-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <h4 className="text-white text-sm font-medium">Firefox</h4>
                <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px]">Recommended</Badge>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Best DoH support. Allows custom providers with self-signed certificates.
                Full instructions below.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <h4 className="text-white text-sm font-medium">Chrome / Edge</h4>
                <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/30">Limited</Badge>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Stricter certificate validation. May not work with self-signed certs without
                OS-level trust configuration.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Firefox Setup Steps */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-amber-400" />
          Firefox Setup
        </h2>
        <p className="text-zinc-400 text-sm">Four steps to resolve Handshake domains in Firefox.</p>

        {/* Step 1 */}
        <Card className="bg-zinc-900/50 border-zinc-800 border-l-2 border-l-amber-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                1
              </div>
              <h4 className="text-white text-sm font-medium">Accept the Certificate</h4>
            </div>
            <p className="text-zinc-400 text-sm mb-3">
              The HSR resolver uses a self-signed certificate. Tell Firefox to trust it once:
            </p>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>
                Navigate to{" "}
                <code className="text-amber-400 bg-zinc-950 px-1.5 py-0.5 rounded text-xs">
                  https://174.163.11.200
                </code>
              </li>
              <li>
                Click <strong className="text-white">Advanced</strong> &rarr;{" "}
                <strong className="text-white">Accept the Risk and Continue</strong>
              </li>
            </ol>
            <p className="text-zinc-600 text-xs mt-2">This is a one-time step. Firefox remembers the exception.</p>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card className="bg-zinc-900/50 border-zinc-800 border-l-2 border-l-amber-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                2
              </div>
              <h4 className="text-white text-sm font-medium">Enable DNS-over-HTTPS</h4>
            </div>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>
                Open <strong className="text-white">Settings &rarr; Privacy &amp; Security</strong>
              </li>
              <li>
                Scroll to <strong className="text-white">DNS over HTTPS</strong>
              </li>
              <li>
                Select <strong className="text-white">Max Protection</strong>
              </li>
              <li>
                Set the provider to:
                <div className="bg-zinc-950 rounded-lg px-4 py-2.5 mt-2">
                  <code className="text-amber-400 text-xs">https://174.163.11.200/dns-query</code>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card className="bg-zinc-900/50 border-zinc-800 border-l-2 border-l-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                3
              </div>
              <h4 className="text-white text-sm font-medium">Allow Private IPs</h4>
              <Badge variant="outline" className="text-[10px] text-zinc-500">Optional</Badge>
            </div>
            <p className="text-zinc-400 text-sm mb-3">
              Only needed if visiting sites hosted on private/local IPs (10.x.x.x, 192.168.x.x).
              Firefox blocks these by default.
            </p>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>
                Navigate to{" "}
                <code className="text-amber-400 bg-zinc-950 px-1.5 py-0.5 rounded text-xs">about:config</code>
              </li>
              <li>Accept the warning if prompted</li>
              <li>
                Search for{" "}
                <code className="text-amber-400 bg-zinc-950 px-1.5 py-0.5 rounded text-xs">
                  network.trr.allow-rfc1918
                </code>
              </li>
              <li>
                Toggle to <strong className="text-white">true</strong>
              </li>
            </ol>
            <p className="text-zinc-600 text-xs mt-2">
              Skip this if hosting on public servers (Vercel, AWS, VPS, etc.)
            </p>
          </CardContent>
        </Card>

        {/* Step 4 */}
        <Card className="bg-zinc-900/50 border-zinc-800 border-l-2 border-l-green-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">
                4
              </div>
              <h4 className="text-white text-sm font-medium">Restart & Test</h4>
            </div>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>Close Firefox completely and reopen it</li>
              <li>
                Visit{" "}
                <code className="text-amber-400 bg-zinc-950 px-1.5 py-0.5 rounded text-xs">google.com</code>{" "}
                to verify normal browsing
              </li>
              <li>
                Visit any HSR subdomain (e.g.{" "}
                <code className="text-amber-400 bg-zinc-950 px-1.5 py-0.5 rounded text-xs">
                  yourname.cryptofans
                </code>
                ) to verify Handshake resolution
              </li>
            </ol>
            <div className="mt-3 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-2.5">
              <p className="text-green-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                If both resolve, you&apos;re all set! Both standard and Handshake domains work through the same endpoint.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Why Max Protection */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          Why Max Protection?
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Firefox offers three DoH modes. Only Max Protection guarantees Handshake domains resolve correctly.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                {
                  mode: "Default",
                  verdict: "Not recommended",
                  color: "text-red-400",
                  bg: "bg-red-500/5",
                  reason: "Falls back to system DNS which cannot resolve Handshake domains.",
                },
                {
                  mode: "Increased",
                  verdict: "Not recommended",
                  color: "text-yellow-400",
                  bg: "bg-yellow-500/5",
                  reason: "Falls back to system DNS on failure. Handshake domains silently fail.",
                },
                {
                  mode: "Max Protection",
                  verdict: "Recommended",
                  color: "text-green-400",
                  bg: "bg-green-500/5",
                  reason: "All queries go through HSR. No fallback. Handshake domains always resolve.",
                },
              ].map((row) => (
                <div key={row.mode} className={`px-5 py-4 ${row.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium">{row.mode}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${row.color} border-current`}
                    >
                      {row.verdict}
                    </Badge>
                  </div>
                  <p className="text-zinc-500 text-xs">{row.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Troubleshooting
        </h2>
        <div className="space-y-3">
          {[
            {
              q: "Normal websites stopped loading",
              a: "The HSR resolver might be down. Switch DoH back to \"Default\" in Firefox settings to restore normal browsing.",
            },
            {
              q: "Handshake domain shows \"Secure Connection Failed\"",
              a: "You haven't accepted the certificate yet. Visit https://174.163.11.200 and accept the security exception first.",
            },
            {
              q: "Domain resolves but shows wrong content",
              a: "DNS may be cached. Wait for TTL to expire (usually 5-60 minutes), or clear your browser cache.",
            },
            {
              q: "Private IP site shows \"The address is restricted\"",
              a: "Enable network.trr.allow-rfc1918 in about:config (Step 3 above).",
            },
          ].map((item) => (
            <Card key={item.q} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <h4 className="text-white text-sm font-medium mb-1">{item.q}</h4>
                <p className="text-zinc-400 text-xs">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Good to Know */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            Good to Know
          </h3>
          <ul className="text-zinc-400 text-sm space-y-2.5">
            {[
              "DoH encrypts all DNS queries. Your ISP cannot see which domains you resolve.",
              "Both standard domains (google.com) and Handshake domains resolve through the same HSR endpoint.",
              "The certificate exception is a one-time step. Firefox remembers it across sessions.",
              "You can switch back to \"Default\" DoH at any time to restore normal browsing.",
              "DoH only affects DNS resolution, not your browsing traffic. HTTPS still encrypts your actual web traffic separately.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">&#8226;</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

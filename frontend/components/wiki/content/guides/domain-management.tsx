"use client";

import {
  LayoutDashboard,
  ChevronDown,
  Globe,
  Link2,
  ImageIcon,
  ArrowRightLeft,
  Eye,
  CheckCircle2,
  Info,
  ExternalLink,
  Calendar,
  Tag,
  Palette,
  Share2,
  Search,
  Filter,
  LayoutGrid,
  List,
  Clock,
  Wallet,
  AlertCircle,
  X,
  Hash,
  Zap,
  Copy,
  Twitter,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function DomainManagementPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/20 border border-amber-500/10">
            <LayoutDashboard className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Guides</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Domain Management</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Your central hub for viewing and managing Handshake subdomain NFTs. Track your domains,
          set up URL forwarding, monitor expiration dates, and share your collection.
        </p>
      </div>

      {/* Feature overview badges */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "View Domains", icon: Eye },
          { label: "URL Forwarding", icon: ArrowRightLeft },
          { label: "Expiration Tracking", icon: Calendar },
          { label: "Notifications", icon: AlertCircle },
          { label: "NFT Artwork", icon: ImageIcon },
          { label: "Sharing", icon: Share2 },
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

      {/* Domain Card Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Eye className="h-5 w-5 text-amber-400" />
          Domain Card Overview
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          When you connect your Bifrost wallet and open the dashboard, HSR queries the SubdomainNFT
          contract for all NFTs owned by your address. Domains are displayed as expandable cards
          with two view modes.
        </p>

        {/* View modes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* List view */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <List className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">List View</h4>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { name: "alice.cryptofans", days: 342 },
                  { name: "bob.cryptofans", days: 28 },
                ].map((d) => (
                  <div key={d.name} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-3 py-2">
                    <div className={`w-0.5 h-8 rounded-full ${d.days > 90 ? "bg-green-500" : d.days > 30 ? "bg-amber-500" : "bg-orange-500"}`} />
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-600/30 to-blue-600/30 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-xs font-mono font-bold">{d.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-zinc-500 text-[10px]">{d.days}d remaining</span>
                      </div>
                    </div>
                    <ChevronDown className="h-3 w-3 text-zinc-600" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Grid view */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-amber-400" />
                <h4 className="text-white text-sm font-medium">Grid View</h4>
              </div>
              {/* eslint-disable @next/next/no-img-element */}
              <div className="p-3 grid grid-cols-2 gap-2">
                {[
                  { name: "alice", badge: null, color: "ring-green-500/20", img: "/wiki/samples/cosmic-jellyfish.png" },
                  { name: "bob", badge: "28d left", color: "ring-amber-500/30", img: "/wiki/samples/samurai-spirit.png" },
                ].map((d) => (
                  <div
                    key={d.name}
                    className={`relative aspect-square rounded-lg border border-zinc-800 ${d.color} ring-1 overflow-hidden`}
                  >
                    <img
                      src={d.img}
                      alt={`${d.name}.cryptofans NFT`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2">
                      <p className="text-white text-[10px] font-mono font-bold">{d.name}</p>
                    </div>
                    {d.badge && (
                      <div className="absolute top-1.5 left-1.5">
                        <Badge className="bg-amber-500/90 text-[8px] px-1.5 py-0 border-0">{d.badge}</Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card info fields */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-3">Information at a Glance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: "Domain Name", desc: "Full subdomain in monospace (e.g. alice.cryptofans)", icon: Globe },
                { label: "NFT Thumbnail", desc: "Preview of your domain's NFT artwork", icon: ImageIcon },
                { label: "Token ID", desc: "Unique ERC-721 identifier (#12345)", icon: Hash },
                { label: "Expiration", desc: "Days remaining with color-coded urgency", icon: Clock },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2.5 bg-zinc-800/30 rounded-lg px-3 py-2.5">
                  <item.icon className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white text-xs font-medium">{item.label}</p>
                    <p className="text-zinc-500 text-[10px]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Filtering & Sorting */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Filter className="h-5 w-5 text-amber-400" />
          Filtering & Sorting
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The toolbar above your domains lets you search, filter, sort, and switch views.
          Preferences are saved to local storage and persist across sessions.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Status Filter",
              icon: CheckCircle2,
              options: ["All Status", "Active", "Pending", "Expired"],
              color: "text-green-400",
            },
            {
              title: "Sort By",
              icon: ArrowRightLeft,
              options: ["Name A-Z / Z-A", "Registered Newest/Oldest", "Expiring Soonest/Latest", "Token ID Asc/Desc"],
              color: "text-amber-400",
            },
          ].map((filter) => (
            <Card key={filter.title} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <filter.icon className={`h-4 w-4 ${filter.color}`} />
                  <h4 className="text-white text-sm font-medium">{filter.title}</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {filter.options.map((opt, i) => (
                    <span
                      key={opt}
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        i === 0
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {opt}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* TLD filter */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h4 className="text-white text-sm font-medium mb-2">TLD Filter</h4>
            <p className="text-zinc-400 text-xs mb-3">
              If you own domains across multiple TLDs, filter buttons appear to narrow by TLD.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                All
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">
                cryptofans
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">
                forever
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Quick Actions */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Quick Actions
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Each domain card has a row of action buttons for common operations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: ImageIcon,
              label: "View NFT",
              desc: "Open full-size NFT image in a new tab",
              color: "text-zinc-400",
              bg: "bg-zinc-500/10",
            },
            {
              icon: Palette,
              label: "Customize NFT",
              desc: "Regenerate artwork with new model, style, theme, and prompt (In Testing).",
              color: "text-amber-400",
              bg: "bg-amber-500/10",
            },
            {
              icon: Share2,
              label: "Share Domain",
              desc: "Generate a shareable link. Copy to clipboard or share directly to Twitter.",
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              icon: ExternalLink,
              label: "View on Explorer",
              desc: "Open in Flare's Coston2 block explorer to see on-chain NFT details.",
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
            },
          ].map((action) => (
            <Card key={action.label} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${action.bg} shrink-0`}>
                    <action.icon className={`h-4 w-4 ${action.color}`} />
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-medium">{action.label}</h4>
                    <p className="text-zinc-500 text-xs mt-0.5">{action.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* URL Forwarding */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-amber-400" />
          URL Forwarding
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Set up HTTP redirects so your subdomain forwards visitors to any URL. This is
          configured from the expanded domain view.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Target URL</p>
                <p className="text-zinc-500 text-xs">
                  Enter any URL you want your subdomain to redirect to (e.g., your portfolio, blog, or social profile).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Redirect Type</p>
                <p className="text-zinc-500 text-xs">
                  Choose between 301 (permanent) or 302 (temporary) redirects depending on your use case.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Path Forwarding</p>
                <p className="text-zinc-500 text-xs">
                  Optionally forward the URL path. For example, <code className="text-amber-400 bg-amber-500/10 px-1 rounded">alice.cryptofans/about</code> can
                  redirect to <code className="text-amber-400 bg-amber-500/10 px-1 rounded">yoursite.com/about</code>.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Enable / Disable</p>
                <p className="text-zinc-500 text-xs">
                  Toggle forwarding on and off without deleting your configuration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Expiration Tracking */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-400" />
          Expiration Tracking
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The dashboard uses a color-coded urgency system to help you track expiration
          across all your domains at a glance.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h4 className="text-white text-sm font-medium">Expiration Color System</h4>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                {
                  range: "> 90 days",
                  label: "Active",
                  color: "bg-green-500",
                  text: "text-green-400",
                  desc: "Healthy registration, no action needed",
                },
                {
                  range: "31 - 90 days",
                  label: "Warning",
                  color: "bg-amber-500",
                  text: "text-amber-400",
                  desc: "Amber indicator on card",
                },
                {
                  range: "8 - 30 days",
                  label: "Elevated",
                  color: "bg-orange-500",
                  text: "text-orange-400",
                  desc: "Orange badge with days remaining",
                },
                {
                  range: "1 - 7 days",
                  label: "Critical",
                  color: "bg-red-500",
                  text: "text-red-400",
                  desc: "Red pulsing indicator, banner warning",
                },
              ].map((state) => (
                <div key={state.label} className="flex items-center gap-4 px-5 py-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${state.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${state.text}`}>{state.label}</span>
                      <span className="text-zinc-600 text-xs">{state.range}</span>
                    </div>
                    <p className="text-zinc-500 text-[10px]">{state.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-white text-sm font-medium mb-1">Critical Domains Banner</h4>
                <p className="text-zinc-400 text-xs">
                  When any domain has 14 days or fewer remaining, a red warning banner appears
                  at the top of your dashboard listing the affected domains.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* NFT Customization */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          NFT Customization
          <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">In Testing</Badge>
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR is testing AI-generated artwork for domain NFTs. From your dashboard, you can
          regenerate your NFT&apos;s image with different themes, styles, and custom prompts.
          Generated artwork is stored permanently on IPFS.
        </p>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-zinc-400 text-xs">
              See the{" "}
              <a href="/wiki/guides/nft-customization" className="text-amber-400 hover:text-amber-300 underline">
                NFT Customization
              </a>{" "}
              guide for details on themes, models, and the generation process.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Sharing */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Share2 className="h-5 w-5 text-amber-400" />
          Sharing Domains
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Share your domain with a generated link. The share dialog provides multiple options.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="bg-zinc-950 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <code className="text-amber-400 text-xs flex-1 truncate">https://hsr.app/share/alice.cryptofans</code>
                <Copy className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <Copy className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-zinc-300 text-xs">Copy Link</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <Twitter className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-zinc-300 text-xs">Share to Twitter</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Empty States */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-amber-400" />
          Empty States
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5 text-center">
              <Globe className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
              <h4 className="text-white text-sm font-medium">No Domains Yet</h4>
              <p className="text-zinc-500 text-xs mt-1">Shown when you haven&apos;t registered any subdomains.</p>
              <div className="mt-3 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs inline-block">
                Register Your First Domain
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-5 text-center">
              <Search className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
              <h4 className="text-white text-sm font-medium">No Domains Found</h4>
              <p className="text-zinc-500 text-xs mt-1">Shown when active filters match no results.</p>
              <div className="mt-3 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs inline-block">
                Clear All Filters
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Related guides */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            Related Guides
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { title: "NFT Customization", href: "/wiki/guides/nft-customization", desc: "AI models, styles, themes, and watermarks" },
              { title: "NFT Basics", href: "/wiki/getting-started/nft-basics", desc: "ERC-721 standard, metadata, and ownership" },
            ].map((link) => (
              <a key={link.title} href={link.href} className="block no-underline">
                <div className="bg-zinc-900/50 rounded-lg px-3 py-2.5 border border-zinc-800 hover:border-blue-500/30 transition-colors">
                  <p className="text-blue-400 text-xs font-medium">{link.title}</p>
                  <p className="text-zinc-500 text-[10px] mt-0.5">{link.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

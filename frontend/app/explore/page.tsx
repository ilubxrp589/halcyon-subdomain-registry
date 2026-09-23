"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { TldGrid } from "@/components/explore/TldGrid";
import { HnsDomainGrid } from "@/components/indexer/HnsDomainGrid";
import { HnsStatsBar } from "@/components/indexer/HnsStatsBar";
import { HnsDoHBanner } from "@/components/indexer/HnsDoHBanner";
import { TldMatchProvider } from "@/components/indexer/TldMatchProvider";
import { getPlatformStats, type PlatformStats } from "@/services/tldBrowse";
import { Compass, Globe, ArrowRight, AlertTriangle, Monitor, Smartphone, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DOH_WARNING_KEY = "hns-doh-warning-seen";
const DOH_URL = "https://dns.halcyon-names.io/dns-query";
const DOT_HOST = "dns.halcyon-names.io";
const APPLE_PROFILE_URL = "https://dns.halcyon-names.io/apple-doh.mobileconfig";

type SetupPlatform = "desktop" | "iphone" | "android";

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [activeTab, setActiveTab] = useState("tlds");
  const [dohWarningOpen, setDohWarningOpen] = useState(false);
  const [dnsSetupChecked, setDnsSetupChecked] = useState(false);
  const [setupPlatform, setSetupPlatform] = useState<SetupPlatform>("desktop");
  const [copied, setCopied] = useState(false);

  // Read ?tab= param on mount
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "handshake-web") {
      setActiveTab("handshake-web");
      showDohWarningIfNeeded();
    }
  }, [searchParams]);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const showDohWarningIfNeeded = () => {
    try {
      if (!localStorage.getItem(DOH_WARNING_KEY)) {
        setDohWarningOpen(true);
      }
    } catch {
      setDohWarningOpen(true);
    }
  };

  const dismissDohWarning = () => {
    setDohWarningOpen(false);
    // Only permanently dismiss if the user confirmed they set up DNS
    if (dnsSetupChecked) {
      try {
        localStorage.setItem(DOH_WARNING_KEY, "1");
      } catch {
        // localStorage unavailable
      }
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "handshake-web") {
      showDohWarningIfNeeded();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Compass className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Explore</h1>
            <p className="text-muted-foreground">
              Browse TLDs for subdomain registration or explore the Handshake web
            </p>
          </div>
        </div>

        {/* Live stats bar — TLDs tab */}
        {stats && activeTab === "tlds" && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground border border-border/40 rounded-lg px-4 py-3 bg-muted/10">
            <span>
              <strong className="text-foreground">{stats.totalTlds}</strong> TLDs
            </span>
            <span>
              <strong className="text-foreground">{stats.officialTlds}</strong> Official
            </span>
            <span>
              <strong className="text-foreground">{stats.communityTlds}</strong> Community
            </span>
            <span>
              <strong className="text-foreground">{stats.totalSlds}</strong> Domains Registered
            </span>
            <span>
              <strong className="text-foreground">{stats.activeTldOwners}</strong> TLD Owners
            </span>
          </div>
        )}

        {/* DoH onboarding + stats — Handshake Web tab */}
        {activeTab === "handshake-web" && (
          <>
            <HnsDoHBanner />
            <HnsStatsBar />
          </>
        )}

        {/* CTA for TLD stakers */}
        {activeTab === "tlds" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <p className="text-sm text-muted-foreground flex-1">
              Own a Handshake TLD? Stake it on Halcyon and earn from every subdomain registration.
            </p>
            <Link href="/stake">
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5 whitespace-nowrap">
                Stake Your TLD
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="bg-muted/30 h-12 p-1.5 gap-1">
          <TabsTrigger value="tlds" className="gap-2 px-5 py-2.5 text-sm">
            <Compass className="w-4 h-4" />
            Halcyon TLDs
          </TabsTrigger>
          <TabsTrigger
            value="handshake-web"
            className="gap-2 px-5 py-2.5 text-sm data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 data-[state=active]:shadow-[0_0_12px_hsl(38_92%_50%/0.15)] border border-transparent data-[state=active]:border-amber-500/30"
          >
            <Globe className="w-4 h-4" />
            Handshake Web
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-400 leading-none">
              NEW
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tlds">
          <TldGrid />
        </TabsContent>

        <TabsContent value="handshake-web">
          <TldMatchProvider>
            <HnsDomainGrid />
          </TldMatchProvider>
        </TabsContent>
      </Tabs>

      {/* DoH warning popup — shown once on first Handshake Web visit */}
      <Dialog open={dohWarningOpen} onOpenChange={setDohWarningOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-border/40 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Handshake DNS Required
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-2">
              These sites live on the{" "}
              <span className="font-medium text-foreground">decentralized Handshake network</span>{" "}
              and <span className="font-medium text-foreground">won&apos;t load</span> in a
              normal browser. You need to set up a Handshake-compatible DNS resolver first — it
              takes about 60 seconds.
            </p>
          </div>

          {/* Platform selector */}
          <div className="flex border-b border-border/40">
            {([
              { id: "desktop" as const, label: "Desktop Browser", icon: Monitor },
              { id: "iphone" as const, label: "iPhone / iPad", icon: Smartphone },
              { id: "android" as const, label: "Android", icon: Smartphone },
            ]).map((p) => (
              <button
                key={p.id}
                onClick={() => setSetupPlatform(p.id)}
                className={`flex-1 py-3 text-xs font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                  setupPlatform === p.id
                    ? "text-amber-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <p.icon className="w-3.5 h-3.5" />
                {p.label}
                {setupPlatform === p.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Setup instructions — scrollable */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            {/* Desktop Browser */}
            {setupPlatform === "desktop" && (
              <>
                <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider">
                  Chrome / Edge / Brave
                </p>
                <ol className="space-y-2.5">
                  {[
                    "Open chrome://settings/security in your address bar (Edge: edge://settings/privacy)",
                    "Scroll to \"Use secure DNS\" and turn it ON",
                    "Select \"With \u2192 Custom\"",
                    "Paste the DoH URL below and hit Enter",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </li>
                  ))}
                </ol>

                <div className="mt-2 p-3 rounded-lg bg-muted/20 border border-border/40 flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-amber-400/80 truncate">{DOH_URL}</code>
                  <button
                    onClick={() => copyToClipboard(DOH_URL)}
                    className="shrink-0 text-muted-foreground hover:text-amber-400 transition-colors"
                    title="Copy URL"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="pt-2 border-t border-border/20">
                  <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider mb-2">
                    Firefox
                  </p>
                  <ol className="space-y-2">
                    {[
                      "Open about:preferences#general",
                      "Scroll to \"Network Settings\" \u2192 Settings",
                      "Check \"Enable DNS over HTTPS\"",
                      "Select \"Custom\" and paste the DoH URL above",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-muted-foreground">{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            {/* iPhone / iPad */}
            {setupPlatform === "iphone" && (
              <>
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Scan this QR code with your iPhone camera
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This QR code links to a{" "}
                    <span className="font-medium text-foreground">DNS configuration profile</span>{" "}
                    for Apple devices. It&apos;s a small settings file (called a .mobileconfig) that
                    tells your iPhone to use Halcyon&apos;s DNS resolver for all internet traffic.
                    This lets you browse Handshake domains natively in Safari and every other app.
                  </p>
                </div>

                <div className="flex justify-center py-2">
                  <div className="p-4 bg-white rounded-xl">
                    <QRCodeSVG
                      value={APPLE_PROFILE_URL}
                      size={180}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider">
                  After scanning
                </p>
                <ol className="space-y-2.5">
                  {[
                    "Tap \"Allow\" when prompted to download the profile",
                    "Open Settings \u2192 General \u2192 VPN & Device Management",
                    "Tap the \"Halcyon DNS\" profile and install it",
                    "Done \u2014 Handshake sites now resolve system-wide",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </li>
                  ))}
                </ol>

                <p className="text-xs text-muted-foreground/60">
                  Works system-wide for Safari and all apps. You can remove the profile
                  anytime from Settings &gt; General &gt; VPN & Device Management.
                </p>
              </>
            )}

            {/* Android */}
            {setupPlatform === "android" && (
              <>
                <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider">
                  System-wide (Android 9+)
                </p>
                <p className="text-xs text-muted-foreground mb-1">
                  This changes DNS for all apps and browsers on your phone.
                </p>
                <ol className="space-y-2.5">
                  {[
                    "Open Settings \u2192 Network & Internet \u2192 Private DNS",
                    "Select \"Private DNS provider hostname\"",
                    "Enter the hostname below and tap Save",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </li>
                  ))}
                </ol>

                <div className="p-3 rounded-lg bg-muted/20 border border-border/40 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Private DNS hostname</span>
                    <code className="block text-sm font-mono text-amber-400/80 mt-0.5">{DOT_HOST}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(DOT_HOST)}
                    className="shrink-0 text-muted-foreground hover:text-amber-400 transition-colors"
                    title="Copy hostname"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-xs text-muted-foreground/60 mt-1">
                  Uses DNS-over-TLS (DoT). Works system-wide for Chrome, Firefox, and all apps.
                  On some phones the path may be Settings &gt; Connections &gt; More &gt; Private DNS.
                </p>

                <div className="pt-3 border-t border-border/20">
                  <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider mb-2">
                    Chrome only (alternative)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    If you only want it in Chrome: open{" "}
                    <code className="text-amber-400/80">chrome://settings/security</code>,
                    enable &quot;Use secure DNS&quot;, select Custom, and paste the DoH URL:
                  </p>
                  <div className="mt-2 p-3 rounded-lg bg-muted/20 border border-border/40 flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-amber-400/80 truncate">{DOH_URL}</code>
                    <button
                      onClick={() => copyToClipboard(DOH_URL)}
                      className="shrink-0 text-muted-foreground hover:text-amber-400 transition-colors"
                      title="Copy URL"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 px-6 py-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={dnsSetupChecked}
                onChange={(e) => setDnsSetupChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-amber-500 cursor-pointer"
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors select-none">
                I have set up my DNS — don&apos;t show this again
              </span>
            </label>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/50">
                {dnsSetupChecked
                  ? "This popup won\u2019t appear again"
                  : "This popup will show each time until DNS is set up"}
              </p>
              <Button
                size="sm"
                onClick={dismissDohWarning}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                I understand
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

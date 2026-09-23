"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Globe, X, Copy, Check } from "lucide-react";

const STORAGE_KEY = "hns-doh-banner-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ───────── setup guide data ───────── */

const DOH_URL = "https://dns.halcyon-names.io/dns-query";
const DOT_HOST = "dns.halcyon-names.io";

type Platform = "chrome" | "firefox" | "iphone" | "android";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "chrome", label: "Chrome / Edge" },
  { id: "firefox", label: "Firefox" },
  { id: "iphone", label: "iPhone" },
  { id: "android", label: "Android" },
];

const GUIDES: Record<Platform, { steps: string[]; note?: string }> = {
  chrome: {
    steps: [
      "Open chrome://settings/security in your address bar",
      'Scroll to "Use secure DNS" and turn it ON',
      'Select "With \u2192 Custom"',
      `Enter: ${DOH_URL}`,
    ],
    note: "Works on desktop & Android Chrome. Edge: edge://settings/privacy, same steps.",
  },
  firefox: {
    steps: [
      "Open about:preferences#general",
      'Scroll to "Network Settings" \u2192 Settings',
      'Check "Enable DNS over HTTPS"',
      `Select "Custom" and enter: ${DOH_URL}`,
    ],
  },
  iphone: {
    steps: [
      "Open Safari and visit dns.halcyon-names.io/apple-doh.mobileconfig",
      "Tap Allow when prompted to download the profile",
      "Open Settings \u2192 General \u2192 VPN & Device Management",
      "Install the Halcyon DNS profile",
    ],
    note: "Works system-wide for all apps",
  },
  android: {
    steps: [
      "Open Settings \u2192 Network & Internet \u2192 Private DNS",
      'Select "Private DNS provider hostname"',
      `Enter: ${DOT_HOST}`,
      "Tap Save",
    ],
    note: "Android 9+ only. Uses DNS-over-TLS.",
  },
};

/* ───────── banner component ───────── */

export function HnsDoHBanner() {
  const [visible, setVisible] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<Platform>("chrome");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setVisible(true);
        return;
      }
      const ts = parseInt(raw, 10);
      if (isNaN(ts) || Date.now() - ts > DISMISS_DURATION_MS) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(DOH_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible) return null;

  const guide = GUIDES[activePlatform];

  return (
    <>
      {/* Banner */}
      <div className="relative rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-amber-600/5 px-4 py-3 flex items-center gap-3">
        <div className="p-1.5 rounded-md bg-amber-500/10 shrink-0">
          <Globe className="w-4 h-4 text-amber-400" />
        </div>
        <p className="text-sm text-muted-foreground flex-1 min-w-0">
          <span className="font-medium text-foreground">
            These sites live on the decentralized Handshake network.
          </span>{" "}
          Set up DNS resolution to visit them natively — takes 60 seconds.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSetupOpen(true)}
          className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5"
        >
          Set Up Now
        </Button>
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors p-1"
          title="Dismiss for 7 days"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Setup guide modal */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-b border-border/40 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400" />
                Set Up Handshake DNS
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              Point your browser to Halcyon DNS to resolve Handshake domains
              alongside regular websites.
            </p>
          </div>

          {/* Platform tabs */}
          <div className="flex border-b border-border/40">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                  activePlatform === p.id
                    ? "text-amber-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
                {activePlatform === p.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Steps */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <ol className="space-y-3">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>

            {guide.note && (
              <p className="text-xs text-muted-foreground/60 pl-8">
                {guide.note}
              </p>
            )}

            {/* DNS endpoints box */}
            <div className="rounded-lg bg-muted/20 border border-border/40 p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Halcyon DNS Endpoints
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">DoH</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs font-mono text-amber-400/80 truncate">
                      {DOH_URL}
                    </code>
                    <button
                      onClick={copyUrl}
                      className="text-muted-foreground hover:text-amber-400 transition-colors"
                      title="Copy"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    DoT / Private DNS
                  </span>
                  <code className="text-xs font-mono text-amber-400/80">
                    {DOT_HOST}
                  </code>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground/60 text-center">
              Resolves both Handshake and regular domains
            </p>
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 px-6 py-3 flex items-center justify-end">
            <Button
              size="sm"
              onClick={() => setSetupOpen(false)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

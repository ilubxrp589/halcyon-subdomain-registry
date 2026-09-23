"use client";

import Link from "next/link";

const NAV_LINKS = [
  { href: "/explore", label: "Browse TLDs" },
  { href: "/explore?tab=handshake-web", label: "Handshake Web" },
  { href: "/register-v2", label: "Register" },
  { href: "/stake", label: "Stake TLD" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/wiki", label: "Wiki" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/50">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          {/* Brand */}
          <div>
            <span className="text-lg font-bold bg-gradient-to-r from-amber-500 to-amber-500 bg-clip-text text-transparent">
              Halcyon
            </span>
            <p className="text-sm text-muted-foreground mt-1">
              The decentralized domain marketplace
            </p>
          </div>

          {/* Nav */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Legal */}
          <div className="flex gap-6">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

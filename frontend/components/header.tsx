"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useWeb3Modal, useWeb3ModalAccount, useWalletBalance, usePrivacyMode, useCurrencySymbol } from "@/lib/web3modal";
import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/lib/utils";
import { Shield, Book, ShoppingCart, Eye, EyeOff, Wallet, ChevronDown, Layers, Menu, X, Pickaxe, Compass, Send, Gavel } from "lucide-react";

const ADMIN_WALLETS = [
  "0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96",
].map(w => w.toLowerCase());

// Reusable NavLink component with animated underline
function NavLink({ href, children, icon: Icon, onClick, onNavigate }: {
  href: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: (e: React.MouseEvent) => void;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      {Icon && <Icon className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />}
      <span>{children}</span>
      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-500 transition-all duration-300 group-hover:w-full" />
    </>
  );

  if (onClick) {
    return (
      <a
        href={href}
        onClick={(e) => { onClick(e); onNavigate?.(); }}
        className="relative flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
      className="relative flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group"
    >
      {content}
    </Link>
  );
}

// Generic dropdown component for nav groupings
interface NavDropdownItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: (e: React.MouseEvent) => void;
}

function NavDropdown({ label, items, onNavigate }: {
  label: string;
  items: NavDropdownItem[];
  onNavigate?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group"
      >
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-500 transition-all duration-300 group-hover:w-full" />
      </button>

      <div
        className={`absolute top-full left-0 mt-2 w-56 py-2 rounded-lg border border-border/40 bg-background/95 backdrop-blur-md shadow-xl transition-all duration-200 ${
          isOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible -translate-y-2"
        }`}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <div className="p-1.5 rounded-md bg-amber-500/10">
                <Icon className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.description}</div>
              </div>
            </>
          );

          if (item.onClick) {
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => { item.onClick!(e); setIsOpen(false); onNavigate?.(); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {inner}
              </a>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => { setIsOpen(false); onNavigate?.(); }}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Mobile nav link - full width, larger touch targets
function MobileNavLink({ href, children, icon: Icon, onClick, onNavigate }: {
  href: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: (e: React.MouseEvent) => void;
  onNavigate?: () => void;
}) {
  if (onClick) {
    return (
      <a
        href={href}
        onClick={(e) => { onClick(e); onNavigate?.(); }}
        className="flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        <span className="text-base">{children}</span>
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
      className="flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/50 rounded-lg transition-colors"
    >
      {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
      <span className="text-base">{children}</span>
    </Link>
  );
}

export function Header() {
  const { open } = useWeb3Modal();
  const { address, isConnected } = useWeb3ModalAccount();
  const { balance, isLoading } = useWalletBalance();
  const { isPrivate, togglePrivacy } = usePrivacyMode();
  const currencySymbol = useCurrencySymbol();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = address && ADMIN_WALLETS.includes(address.toLowerCase());

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Animated Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-xl font-bold bg-gradient-to-r from-amber-500 to-amber-500 bg-clip-text text-transparent transition-all duration-300 group-hover:from-amber-400 group-hover:to-amber-400 drop-shadow-sm group-hover:drop-shadow-[0_0_12px_rgba(217,167,28,0.5)]">
              Halcyon
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <NavDropdown label="Names" items={[
              { href: "/explore", label: "Explore TLDs", description: "Browse available domains", icon: Compass },
              { href: "/register-v2", label: "Register Domain", description: "Custom NFT artwork", icon: Wallet },
              { href: "/register/bulk", label: "Bulk Register", description: "Up to 5 domains + bonus", icon: Layers },
              { href: "/auction-house", label: "Auction House", description: "Bid on Handshake auctions", icon: Gavel },
            ]} />
            <NavDropdown label="Trade" items={[
              { href: "/marketplace", label: "Marketplace", description: "Buy & sell domains", icon: ShoppingCart },
              { href: "/stake", label: "Stake TLD", description: "Stake Handshake TLDs", icon: Pickaxe },
            ]} />
            <NavDropdown label="Dashboard" items={[
              { href: "/dashboard", label: "My Domains", description: "Manage your portfolio", icon: Compass },
              { href: "/wallet", label: "HNS Wallet", description: "Handshake wallet & swaps", icon: Wallet },
            ]} />
            <NavLink
              href="/send"
              icon={Send}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `/send?t=${Date.now()}`;
              }}
            >
              Send
            </NavLink>
            <NavLink href="/wiki" icon={Book}>Wiki</NavLink>
            {isAdmin && (
              <Link
                href="/admin"
                className="relative flex items-center gap-1 text-primary hover:text-primary/80 transition-colors group"
              >
                <Shield className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
                <span>Admin</span>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              {/* Connection Status Indicator */}
              <div className="flex items-center gap-1.5" title="Connected">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              </div>

              {/* Balance Display - hidden on small mobile */}
              <div
                onClick={togglePrivacy}
                className="hidden sm:relative sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50 hover:border-amber-500/30 cursor-pointer transition-all duration-300 group overflow-hidden"
              >
                {/* Shimmer overlay */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/5 to-transparent" />

                {isPrivate ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-all duration-300 group-hover:scale-110" />
                )}
                <span className="font-mono text-sm relative z-10">
                  {isLoading ? (
                    <span className="animate-pulse">...</span>
                  ) : isPrivate ? (
                    "••••••"
                  ) : (
                    `${parseFloat(balance).toFixed(2)} ${currencySymbol}`
                  )}
                </span>
              </div>

              {/* Wallet Address Button - icon only on mobile */}
              <Button
                variant="outline"
                onClick={() => open()}
                className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 to-amber-500/10 border-amber-500/20 hover:border-amber-500/40 hover:from-amber-500/20 hover:to-amber-500/20 transition-all duration-300 group"
              >
                <Wallet className="h-4 w-4 sm:mr-2 text-amber-400 transition-transform duration-300 group-hover:scale-110" />
                <span className="hidden sm:inline">{truncateAddress(address || "")}</span>
              </Button>
            </>
          ) : (
            <Button
              onClick={() => open()}
              className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/50 hover:scale-105 transition-all duration-300 group"
            >
              {/* Shimmer effect */}
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <Wallet className="h-4 w-4 sm:mr-2 relative z-10" />
              <span className="hidden sm:inline relative z-10">Connect Wallet</span>
            </Button>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-muted/50 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-md">
          <nav className="container py-4 flex flex-col gap-1">
            {/* Names */}
            <div className="px-4 pt-2 pb-1 text-xs text-muted-foreground uppercase tracking-wider">Names</div>
            <MobileNavLink href="/explore" icon={Compass} onNavigate={closeMobileMenu}>
              Explore TLDs
            </MobileNavLink>
            <MobileNavLink href="/register-v2" icon={Wallet} onNavigate={closeMobileMenu}>
              Register Domain
            </MobileNavLink>
            <MobileNavLink href="/register/bulk" icon={Layers} onNavigate={closeMobileMenu}>
              Bulk Register
            </MobileNavLink>
            <MobileNavLink href="/auction-house" icon={Gavel} onNavigate={closeMobileMenu}>
              Auction House
            </MobileNavLink>

            {/* Trade */}
            <div className="border-t border-border/20 mt-2" />
            <div className="px-4 pt-2 pb-1 text-xs text-muted-foreground uppercase tracking-wider">Trade</div>
            <MobileNavLink href="/marketplace" icon={ShoppingCart} onNavigate={closeMobileMenu}>
              Marketplace
            </MobileNavLink>
            <MobileNavLink href="/stake" icon={Pickaxe} onNavigate={closeMobileMenu}>
              Stake TLD
            </MobileNavLink>

            {/* Dashboard */}
            <div className="border-t border-border/20 mt-2" />
            <div className="px-4 pt-2 pb-1 text-xs text-muted-foreground uppercase tracking-wider">Dashboard</div>
            <MobileNavLink href="/dashboard" icon={Compass} onNavigate={closeMobileMenu}>
              My Domains
            </MobileNavLink>
            <MobileNavLink href="/wallet" icon={Wallet} onNavigate={closeMobileMenu}>
              HNS Wallet
            </MobileNavLink>
            <MobileNavLink
              href="/send"
              icon={Send}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `/send?t=${Date.now()}`;
              }}
              onNavigate={closeMobileMenu}
            >
              Send FLR
            </MobileNavLink>
            <MobileNavLink href="/wiki" icon={Book} onNavigate={closeMobileMenu}>
              Wiki
            </MobileNavLink>
            {isAdmin && (
              <MobileNavLink href="/admin" icon={Shield} onNavigate={closeMobileMenu}>
                Admin
              </MobileNavLink>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

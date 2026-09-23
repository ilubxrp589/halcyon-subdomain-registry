"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Server,
  Globe,
  Layers,
  FileText,
  DollarSign,
  Activity,
  ChevronLeft,
  BarChart3,
  Wallet,
  Menu,
  X,
  Cpu,
  Shield,
  Boxes,
  Zap,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavGroup {
  label: string;
  items: { title: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Registry",
    items: [
      { title: "Domains", href: "/admin/domains", icon: Globe },
      { title: "TLDs", href: "/admin/tlds", icon: Layers },
      { title: "HNS Manager", href: "/admin/hns-manager", icon: KeyRound },
      { title: "Pricing", href: "/admin/pricing", icon: DollarSign },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { title: "Services", href: "/admin/services", icon: Server },
      { title: "PM2 Processes", href: "/admin/pm2", icon: Boxes },
      { title: "System", href: "/admin/system", icon: Activity },
    ],
  },
  {
    label: "GPU & Compute",
    items: [
      { title: "GPU Monitor", href: "/admin/gpu", icon: Cpu },
      { title: "Parallel Demo", href: "/admin/parallel", icon: Zap },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Wallets", href: "/admin/wallets", icon: Wallet },
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Security",
    items: [
      { title: "Audit Log", href: "/admin/audit", icon: Shield },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b">
        <Link href="/admin" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <div>
            <h2 className="font-semibold">Halcyon Admin</h2>
            <p className="text-xs text-muted-foreground">Command Center</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-4")}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "/admin" && pathname?.startsWith(item.href));

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <Link href="/" onClick={onNavigate}>
          <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
            <ChevronLeft className="w-4 h-4" />
            Back to Site
          </Button>
        </Link>
      </div>
    </>
  );
}

export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-20 left-4 z-40 p-2 rounded-lg bg-card border shadow-lg"
        aria-label="Open admin menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-64 h-full bg-card flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 bg-card border-r min-h-screen flex-col">
        <SidebarContent />
      </div>
    </>
  );
}

export default AdminSidebar;

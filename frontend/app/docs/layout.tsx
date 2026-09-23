"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Book, Rocket, Cog, Home, Palette, Code2, Network, Menu, X } from "lucide-react";

const docsNav = [
  {
    title: "Overview",
    href: "/docs",
    icon: Home,
    description: "What is HSR?",
  },
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    icon: Rocket,
    description: "Buy your first subdomain",
  },
  {
    title: "NFT Customization",
    href: "/docs/nft-customization",
    icon: Palette,
    description: "Themes & custom prompts",
  },
  {
    title: "How It Works",
    href: "/docs/how-it-works",
    icon: Cog,
    description: "Technical deep dive",
  },
  {
    title: "API Reference",
    href: "/docs/api",
    icon: Code2,
    description: "Developer API documentation",
  },
  {
    title: "Architecture",
    href: "/docs/architecture",
    icon: Network,
    description: "System design & diagrams",
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      <div className="flex items-center gap-2 mb-6">
        <Book className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Documentation</h2>
      </div>
      <nav className="space-y-2">
        {docsNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              )}
            >
              <item.icon className="h-4 w-4" />
              <div>
                <div className="font-medium">{item.title}</div>
                <div className={cn(
                  "text-xs",
                  isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm font-medium w-fit"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          {mobileOpen ? "Close" : "Documentation Menu"}
        </button>

        {/* Mobile sidebar */}
        {mobileOpen && (
          <aside className="md:hidden">
            {navContent}
          </aside>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden md:block md:w-64 shrink-0">
          <div className="sticky top-24">
            {navContent}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <article className="prose prose-neutral dark:prose-invert max-w-none">
            {children}
          </article>
        </main>
      </div>
    </div>
  );
}

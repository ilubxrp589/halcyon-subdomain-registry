"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { wikiCategories } from "@/lib/wiki";
import { ChevronDown, BookOpen, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

export function WikiSidebar() {
  const pathname = usePathname();
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-expand active category
  useEffect(() => {
    const parts = pathname.split("/");
    if (parts[2]) {
      setOpenCategories((prev) =>
        prev.includes(parts[2]) ? prev : [...prev, parts[2]]
      );
    }
  }, [pathname]);

  const toggle = (id: string) => {
    setOpenCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const sidebarContent = (
    <div className="sticky top-24">
      <Link href="/wiki" className="flex items-center gap-2 mb-6 group" onClick={() => setMobileOpen(false)}>
        <BookOpen className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold group-hover:text-primary transition-colors">
          Wiki
        </h2>
      </Link>
      <nav className="space-y-1">
        {wikiCategories.map((cat) => {
          const isOpen = openCategories.includes(cat.id);
          const isCatActive = pathname === `/wiki/${cat.id}`;

          return (
            <div key={cat.id}>
              <button
                onClick={() => toggle(cat.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left transition-colors text-sm",
                  isCatActive
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary text-foreground"
                )}
              >
                <cat.icon className="h-4 w-4 shrink-0" />
                <span className="font-medium flex-1">{cat.title}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <div className="ml-4 pl-3 border-l border-border/50 mt-1 space-y-0.5">
                  {cat.pages.map((page) => {
                    const href = `/wiki/${cat.id}/${page.slug}`;
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={page.slug}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "block px-3 py-1.5 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        )}
                      >
                        {page.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-secondary text-sm font-medium"
      >
        {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        {mobileOpen ? "Close" : "Wiki Navigation"}
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <aside className="md:hidden mb-6">
          {sidebarContent}
        </aside>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:block md:w-72 shrink-0">
        {sidebarContent}
      </aside>
    </>
  );
}

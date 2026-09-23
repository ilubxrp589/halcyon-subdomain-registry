"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchPages, type FlatWikiPage } from "@/lib/wiki";

export function WikiSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FlatWikiPage[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setResults(searchPages(query).slice(0, 8));
    setOpen(query.trim().length > 0);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search wiki..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border/50 bg-secondary/30 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border/40 bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
          {results.map((r) => (
            <button
              key={r.href}
              onClick={() => {
                router.push(r.href);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-secondary/50 transition-colors"
            >
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">
                {r.categoryTitle} &middot; {r.description}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border/40 bg-background/95 backdrop-blur-md shadow-xl p-4 text-center text-sm text-muted-foreground">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

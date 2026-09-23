"use client";

import { WikiSidebar } from "@/components/wiki/WikiSidebar";
import { WikiSearch } from "@/components/wiki/WikiSearch";

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="md:w-72 shrink-0">
          <div className="sticky top-24">
            <WikiSidebar />
          </div>
        </div>
        <main className="flex-1 min-w-0">
          <WikiSearch />
          {children}
        </main>
      </div>
    </div>
  );
}

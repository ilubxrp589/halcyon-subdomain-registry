import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { FlatWikiPage } from "@/lib/wiki";

export function WikiPrevNext({
  prev,
  next,
}: {
  prev: FlatWikiPage | null;
  next: FlatWikiPage | null;
}) {
  if (!prev && !next) return null;

  return (
    <div className="flex items-stretch gap-4 mt-12 pt-8 border-t border-border/50">
      {prev ? (
        <Link
          href={prev.href}
          className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          <div className="text-right flex-1">
            <div className="text-xs text-muted-foreground">{prev.categoryTitle}</div>
            <div className="text-sm font-medium">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors group"
        >
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{next.categoryTitle}</div>
            <div className="text-sm font-medium">{next.title}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

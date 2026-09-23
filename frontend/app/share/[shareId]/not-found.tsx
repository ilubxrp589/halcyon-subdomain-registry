import Link from "next/link";
import { FileQuestion, ArrowRight, Home } from "lucide-react";

export default function ShareNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--halcyon-bg))] to-[hsl(var(--halcyon-surface))] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[hsl(var(--halcyon-surface))] border border-[hsl(var(--halcyon-border))] flex items-center justify-center">
          <FileQuestion className="h-10 w-10 text-[hsl(var(--halcyon-muted))]" />
        </div>

        <h1 className="text-2xl font-bold text-[hsl(var(--halcyon-text))] mb-2">
          Share Not Found
        </h1>

        <p className="text-[hsl(var(--halcyon-muted))] mb-8">
          This shared NFT preview doesn&apos;t exist or may have been removed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register-v2"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-amber,45_100%_50%))] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Create Your NFT
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[hsl(var(--halcyon-border))] text-[hsl(var(--halcyon-text))] font-medium hover:bg-[hsl(var(--halcyon-surface))] transition-colors"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ShareLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--halcyon-bg))] to-[hsl(var(--halcyon-surface))]">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header Skeleton */}
        <div className="text-center mb-8">
          <div className="h-10 w-64 mx-auto bg-[hsl(var(--halcyon-surface))] rounded-lg animate-pulse mb-2" />
          <div className="h-6 w-48 mx-auto bg-[hsl(var(--halcyon-surface))] rounded-lg animate-pulse" />
        </div>

        {/* Main Card Skeleton */}
        <div className="bg-[hsl(var(--halcyon-surface))]/50 backdrop-blur-xl border border-[hsl(var(--halcyon-border))] rounded-2xl overflow-hidden">
          {/* Image Skeleton */}
          <div className="aspect-square bg-[hsl(var(--halcyon-bg))] flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-[hsl(var(--halcyon-teal))]/30 border-t-[hsl(var(--halcyon-teal))] rounded-full animate-spin" />
          </div>

          {/* Info Section Skeleton */}
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <div className="h-8 w-24 bg-[hsl(var(--halcyon-surface))] rounded-full animate-pulse" />
            </div>
            <div className="flex gap-6">
              <div className="h-5 w-24 bg-[hsl(var(--halcyon-surface))] rounded animate-pulse" />
              <div className="h-5 w-32 bg-[hsl(var(--halcyon-surface))] rounded animate-pulse" />
            </div>
            <div className="flex gap-3 pt-2">
              <div className="h-10 w-28 bg-[hsl(var(--halcyon-surface))] rounded-xl animate-pulse" />
              <div className="h-10 w-28 bg-[hsl(var(--halcyon-surface))] rounded-xl animate-pulse" />
              <div className="h-10 w-28 bg-[hsl(var(--halcyon-surface))] rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

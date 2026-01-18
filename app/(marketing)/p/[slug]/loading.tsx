import { Skeleton } from "@/components/ui/skeleton"

export default function ProductLoading() {
  // Use neutral colors that work with all themes
  // The actual page will load with theme-specific colors
  return (
    <div className="min-h-screen bg-background">
      {/* Creator Bar Skeleton */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start">
          {/* Left: Gallery (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-16 rounded-lg" />
              ))}
            </div>

            {/* Title and creator */}
            <div className="mt-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>

              {/* Desktop: Creator info */}
              <div className="hidden lg:flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-5 w-32" />
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-4 w-4" />
                    ))}
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>

            {/* Mobile: Price Card */}
            <div className="mt-6 lg:hidden">
              <div className="rounded-xl border border-border p-4 sm:p-6 shadow-sm bg-card space-y-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <div className="pt-4 border-t border-border space-y-3">
                  <Skeleton className="h-5 w-32" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile: Creator info */}
              <div className="mt-4 p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>

            {/* Description */}
            <div className="mt-6 space-y-2">
              <Skeleton className="h-6 w-32 mb-3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            {/* FAQ */}
            <div className="mt-8 space-y-3">
              <Skeleton className="h-6 w-64 mb-4" />
              <div className="px-2 sm:px-0 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded" />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Price Card (2 cols) - Desktop only */}
          <div className="hidden lg:block lg:col-span-2">
            <div className="sticky top-6 rounded-xl border border-border p-6 shadow-sm bg-card space-y-4">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="pt-4 border-t border-border space-y-3">
                <Skeleton className="h-5 w-32" />
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* More From Seller Section */}
      <div className="py-12 px-4 bg-background">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-7 w-48 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="py-12 px-4 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="h-7 w-32" />
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-5 w-5" />
              ))}
            </div>
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border p-4 bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((j) => (
                        <Skeleton key={j} className="h-3 w-3" />
                      ))}
                    </div>
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 px-4 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto flex justify-center">
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  )
}

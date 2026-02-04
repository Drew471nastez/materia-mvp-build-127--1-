import { Skeleton } from "@/components/ui/skeleton"

export default function ExploreLoading() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* Header skeleton */}
        <header className="mb-8">
          <Skeleton className="h-7 w-2/3 max-w-lg" />
        </header>

        {/* Featured banner skeleton */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-neutral-100" style={{ aspectRatio: "2.5 / 1", minHeight: "280px", maxHeight: "400px" }}>
          <Skeleton className="absolute inset-0" />
          <div className="absolute bottom-6 left-6 sm:left-8 md:left-10 space-y-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
          {/* Progress indicators skeleton */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-1 w-8 sm:w-12 rounded-full" />
            ))}
          </div>
        </div>

        {/* Category pills skeleton */}
        <div className="flex items-center gap-2 mt-8 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
          ))}
        </div>

        {/* Recommended section skeleton */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-7 w-40" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          </div>

          {/* Product cards skeleton */}
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
                <Skeleton className="aspect-video" />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-16 mt-4" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

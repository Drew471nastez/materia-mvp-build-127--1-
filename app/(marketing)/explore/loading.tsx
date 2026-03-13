import { Skeleton } from "@/components/ui/skeleton"

export default function ExploreLoading() {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
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

        {/* Recommended section skeleton */}
        <section className="mt-8">
          {/* Section header with search/filters */}
          <div className="flex items-center justify-between mb-5 gap-3">
            <Skeleton className="h-7 w-40" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-lg sm:w-[200px]" />
              <Skeleton className="h-9 w-28 rounded-lg hidden sm:block" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>

          {/* Product cards grid — 9 cards matching pagination */}
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <Skeleton className="aspect-video" />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination skeleton */}
          <div className="flex items-center justify-center gap-2 mt-8">
            <Skeleton className="h-8 w-8 rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-lg" />
            ))}
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </section>

        {/* Browse by Category section skeleton */}
        <section className="mt-12 pt-8 border-t border-neutral-200">
          <div className="flex items-center justify-between mb-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-9 w-28 rounded-lg hidden sm:block" />
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
            ))}
          </div>

          {/* Category products grid — 6 cards */}
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <Skeleton className="aspect-video" />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

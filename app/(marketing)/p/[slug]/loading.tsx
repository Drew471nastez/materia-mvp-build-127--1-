import { Skeleton } from "@/components/ui/skeleton"

export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Left: Gallery skeleton */}
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-16 rounded" />
              ))}
            </div>
          </div>

          {/* Right: Details skeleton */}
          <div className="space-y-6">
            <div>
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-10 w-3/4 mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-5 w-32" />
              </div>
            </div>

            <div className="flex items-baseline gap-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>

            <Skeleton className="h-12 w-full rounded-lg" />

            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            <div className="space-y-3 pt-6 border-t">
              <Skeleton className="h-6 w-40" />
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

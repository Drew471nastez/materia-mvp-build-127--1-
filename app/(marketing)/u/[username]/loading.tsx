import { Skeleton } from "@/components/ui/skeleton"

export default function StorefrontLoading() {
  return (
    <div className="min-h-screen bg-white">
      {/* Cover skeleton */}
      <Skeleton className="h-48 w-full" />

      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Creator Header skeleton */}
        <div className="flex flex-col items-center text-center">
          <Skeleton className="h-24 w-24 rounded-full -mt-12" />
          <Skeleton className="mt-4 h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-16 w-full max-w-xl" />
          <div className="mt-6 flex gap-8">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Products Grid skeleton */}
        <div className="mt-12">
          <Skeleton className="mb-6 h-7 w-24" />
          <div className="grid gap-6 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border border-border overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-20 mt-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

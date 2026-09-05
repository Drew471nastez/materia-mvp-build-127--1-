export default function MyDownloadsLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 px-2 sm:px-0 animate-in fade-in-0 duration-300 skeleton-deferred">
      {/* Header card skeleton — matches the new page header card */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-neutral-200 animate-pulse" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 animate-pulse shrink-0" />
            <div className="h-7 w-20 rounded-lg bg-neutral-100 animate-pulse mt-8 sm:mt-0" />
          </div>
          <div className="h-6 w-40 rounded bg-neutral-200 animate-pulse mb-2" />
          <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="aspect-video bg-neutral-100 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 rounded bg-neutral-200 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="border-t border-neutral-200 p-3">
              <div className="h-12 rounded-xl bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

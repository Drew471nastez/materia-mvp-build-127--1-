export default function MyDownloadsLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Header skeleton */}
      <div>
        <div className="mb-4 h-4 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-44 rounded bg-neutral-200 animate-pulse mb-2" />
            <div className="h-4 w-28 rounded bg-neutral-100 animate-pulse" />
          </div>
          <div className="h-10 w-10 rounded-xl bg-neutral-100 animate-pulse" />
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

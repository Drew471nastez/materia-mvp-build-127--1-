export default function WishlistLoading() {
  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="mb-4 h-4 w-28 rounded bg-neutral-100 animate-pulse" />
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-28 rounded bg-neutral-200 animate-pulse mb-2" />
            <div className="h-4 w-44 rounded bg-neutral-100 animate-pulse" />
          </div>
          <div className="h-10 w-10 rounded-xl bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Product cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-neutral-100 overflow-hidden bg-white">
            <div className="aspect-[4/3] bg-neutral-100 animate-pulse" />
            <div className="p-3.5 space-y-2">
              <div className="h-4 w-3/4 bg-neutral-100 rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-neutral-100 rounded animate-pulse" />
              <div className="h-4 w-1/4 bg-neutral-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

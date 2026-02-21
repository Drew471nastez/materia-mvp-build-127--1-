export default function LibraryLoading() {
  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Profile header skeleton */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-24 sm:h-28 bg-neutral-100 animate-pulse" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-8 sm:-mt-10 mb-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-4 border-white bg-neutral-200 animate-pulse" />
            <div className="h-8 w-20 rounded-lg bg-neutral-100 animate-pulse" />
          </div>
          <div className="h-6 w-40 rounded bg-neutral-200 animate-pulse mb-2" />
          <div className="h-4 w-48 rounded bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 ${i === 3 ? "col-span-2 sm:col-span-1" : ""}`}>
            <div className="h-9 w-9 rounded-xl bg-neutral-100 animate-pulse mb-3" />
            <div className="h-7 w-12 rounded bg-neutral-200 animate-pulse mb-1" />
            <div className="h-3 w-20 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="h-5 w-36 rounded bg-neutral-200 animate-pulse mb-4" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="aspect-video bg-neutral-100 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 rounded bg-neutral-200 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="border-t border-neutral-200 p-3">
              <div className="h-10 rounded-xl bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

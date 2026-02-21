export default function ProductLoading() {
  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Back link skeleton */}
      <div className="mb-5 h-4 w-36 rounded bg-neutral-100 animate-pulse" />

      {/* Product card skeleton — side-by-side */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Cover skeleton */}
          <div className="w-full md:w-1/2 aspect-[4/3] md:min-h-[340px] bg-neutral-100 animate-pulse" />

          {/* Content skeleton */}
          <div className="flex-1 p-5 sm:p-6 md:p-8 flex flex-col">
            {/* Badge */}
            <div className="h-5 w-24 rounded-full bg-neutral-100 animate-pulse mb-3" />
            {/* Title */}
            <div className="h-7 w-3/4 rounded bg-neutral-200 animate-pulse mb-2" />
            {/* Creator + date */}
            <div className="flex gap-3 mt-2">
              <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
              <div className="h-4 w-28 rounded bg-neutral-100 animate-pulse" />
            </div>

            {/* Files section */}
            <div className="mt-5 pt-4 border-t border-neutral-100">
              <div className="h-4 w-16 rounded bg-neutral-200 animate-pulse mb-3" />
              <div className="space-y-2">
                <div className="h-11 rounded-xl bg-neutral-100 animate-pulse" />
                <div className="h-11 rounded-xl bg-neutral-100 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

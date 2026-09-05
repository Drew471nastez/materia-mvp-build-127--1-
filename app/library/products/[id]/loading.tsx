export default function ProductLoading() {
  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300 skeleton-deferred">
      {/* Page header card skeleton — matches consistent subpage header */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-neutral-200 animate-pulse" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 animate-pulse shrink-0" />
            <div className="h-7 w-20 rounded-lg bg-neutral-100 animate-pulse mt-8 sm:mt-0" />
          </div>
          <div className="h-6 w-3/4 rounded bg-neutral-200 animate-pulse mb-2" />
          <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Product detail card skeleton */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Cover skeleton */}
          <div className="w-full md:w-1/2 aspect-[4/3] md:min-h-[280px] bg-neutral-100 animate-pulse" />

          {/* Content skeleton */}
          <div className="flex-1 p-5 sm:p-6 md:p-8 flex flex-col">
            {/* Badge */}
            <div className="h-5 w-24 rounded-full bg-neutral-100 animate-pulse mb-3" />
            {/* Date */}
            <div className="h-4 w-44 rounded bg-neutral-100 animate-pulse mb-4" />

            {/* Files section */}
            <div className="mt-auto pt-4 border-t border-neutral-100">
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

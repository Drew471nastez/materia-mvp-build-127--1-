import { TAB_SKELETON } from "../loading"

export default function WishlistLoading() {
  return (
    <div data-library-skeleton="" className={`max-w-5xl mx-auto px-2 sm:px-0 ${TAB_SKELETON}`}>
      {/* Header card skeleton, matching the new page header card */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-neutral-200 animate-pulse" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 animate-pulse shrink-0" />
            <div className="h-7 w-20 rounded-lg bg-neutral-100 animate-pulse mt-8 sm:mt-0" />
          </div>
          <div className="h-6 w-28 rounded bg-neutral-200 animate-pulse mb-2" />
          <div className="h-4 w-44 rounded bg-neutral-100 animate-pulse" />
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

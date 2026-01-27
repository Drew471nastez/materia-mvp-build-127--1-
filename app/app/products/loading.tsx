export default function ProductsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-7 sm:h-8 w-28 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-4 w-44 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
          <div className="w-full sm:w-32 h-11 bg-violet-200 rounded-xl animate-pulse" />
        </div>

        {/* Tab Pills & Search skeleton */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* Tab pills skeleton */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-20 bg-white border border-gray-200 rounded-xl animate-pulse shadow-sm" />
              <div className="h-8 w-12 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-8 w-20 bg-gray-100 rounded-full animate-pulse" />
            </div>
            {/* Search & Export buttons skeleton */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white border border-gray-200 rounded-lg animate-pulse shadow-sm" />
              <div className="w-9 h-9 bg-white border border-gray-200 rounded-lg animate-pulse shadow-sm" />
            </div>
          </div>
        </div>

        {/* Products grid skeleton - Mobile */}
        <div className="grid gap-4 sm:hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200/60 p-4 shadow-sm">
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="w-20 h-20 bg-gray-200 rounded-xl animate-pulse flex-shrink-0" />
                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
                    <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                </div>
                {/* Menu button */}
                <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>

        {/* Products grid skeleton - Desktop */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm"
            >
              {/* Image skeleton */}
              <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
              {/* Content skeleton */}
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
                <div className="flex items-center justify-between pt-1">
                  <div className="h-5 w-14 bg-gray-200 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

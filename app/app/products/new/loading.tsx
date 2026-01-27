export default function NewProductLoading() {
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Skeleton Header - exact match */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 z-30 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Title row */}
            <div className="flex items-center gap-2 pt-[14px] pb-3 sm:py-3">
              <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
              <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
            </div>
            {/* Pills row - matches actual pill structure */}
            <div className="py-3 pt-0 sm:pt-0.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {["About", "Media", "Content", "Settings", "SEO"].map((name, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 lg:px-5 py-2 rounded-full bg-gray-100"
                  >
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded-full animate-pulse" />
                    <div className="h-[14px] w-12 sm:w-14 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton Content - exact match to form structure */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8">
              <div className="lg:w-3/5 space-y-8 sm:space-y-12">

                {/* About section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-14 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-64 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
                    <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                  </div>
                </div>

                {/* Media section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-48 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  {/* Media upload zone placeholder */}
                  <div className="h-40 w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 animate-pulse">
                    <div className="w-10 h-10 bg-gray-200 rounded-full" />
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-8 w-24 bg-gray-200 rounded-lg" />
                  </div>
                </div>

                {/* Content section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-56 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  {/* Description editor placeholder */}
                  <div className="space-y-1.5">
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-[180px] w-full bg-gray-50 rounded-lg border border-gray-200 animate-pulse" />
                  </div>
                  {/* CTA field */}
                  <div className="space-y-1.5">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                  </div>
                  {/* Digital files section */}
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
                    <div className="h-24 w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 animate-pulse" />
                  </div>
                </div>

                {/* Variants section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-56 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  <div className="h-12 w-full bg-gray-100 rounded-xl animate-pulse" />
                </div>

                {/* Settings section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-48 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 w-14 bg-gray-200 rounded animate-pulse" />
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="h-10 sm:h-11 bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                      <div className="h-10 sm:h-11 bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                  </div>
                  {/* Toggles */}
                  <div className="space-y-3">
                    <div className="h-14 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                    <div className="h-14 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                  </div>
                </div>

                {/* SEO section skeleton */}
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="h-5 w-8 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-44 bg-gray-100 rounded mt-1 animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                      <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                      <div className="h-20 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton Footer - exact match */}
      <div className="fixed bottom-0 left-0 right-0 sm:relative bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="h-10 w-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-10 w-28 bg-violet-200 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

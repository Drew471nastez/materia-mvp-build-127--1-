export default function NewProductLoading() {
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Skeleton Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 z-30 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Title skeleton */}
            <div className="flex items-center gap-2 pt-[14px] pb-3 sm:py-3">
              <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            {/* Pills skeleton */}
            <div className="py-3 pt-0 sm:pt-0.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-9 w-20 sm:w-24 bg-gray-200 rounded-full animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8">
              <div className="lg:w-3/5 space-y-8">
                {/* About section skeleton */}
                <div className="space-y-4">
                  <div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                    <div className="h-11 w-full bg-gray-100 rounded-lg animate-pulse" />
                  </div>
                </div>

                {/* Media section skeleton */}
                <div className="space-y-4">
                  <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                  <div className="h-32 w-full bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 animate-pulse" />
                </div>

                {/* Content section skeleton */}
                <div className="space-y-4">
                  <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-36 w-full bg-gray-100 rounded-lg animate-pulse" />
                  </div>
                </div>

                {/* Settings section skeleton */}
                <div className="space-y-4">
                  <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-11 bg-gray-100 rounded-lg animate-pulse" />
                    <div className="h-11 bg-gray-100 rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton Footer */}
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

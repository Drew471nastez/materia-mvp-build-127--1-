export default function AnalyticsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa] select-none skeleton-deferred">
      {/* Announcement bar placeholder */}
      <div className="w-full bg-[#8b5cf6]">
        <div className="h-[40px] md:h-[42px]" />
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="h-8 w-32 bg-gray-100 rounded-lg" />
            <div className="flex sm:hidden h-9 w-40 bg-gray-100 rounded-full" />
          </div>

          {/* Timeframe + mode + product row skeleton */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-10 w-36 bg-gray-100 rounded-xl" />
            <div className="hidden sm:flex h-10 w-44 bg-gray-100 rounded-full" />
            <div className="h-10 w-40 bg-gray-100 rounded-xl" />
          </div>

          {/* KPI + Chart skeleton */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex overflow-hidden md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="px-3 py-3 sm:px-4 sm:py-3.5 flex-shrink-0 min-w-[130px] md:min-w-0">
                  <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                  <div className="h-6 w-20 bg-gray-100 rounded mb-1.5" />
                  <div className="h-2.5 w-24 bg-gray-50 rounded" />
                </div>
              ))}
            </div>
            <div className="border-t border-[#e5e7eb]/60 px-4 py-4">
              <div className="h-[200px] rounded-lg bg-gradient-to-b from-gray-50 to-transparent" />
            </div>
          </div>

          {/* Traffic & Device Distribution skeleton */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-36 bg-gray-100 rounded" />
                <div className="h-7 w-24 bg-gray-50 rounded-lg" />
              </div>
              <div className="h-[200px] flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gray-50" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-36 bg-gray-100 rounded" />
                <div className="h-7 w-28 bg-gray-50 rounded-lg" />
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 w-20 bg-gray-100 rounded mb-1.5" />
                      <div className="h-2 w-full bg-gray-50 rounded-full" />
                    </div>
                    <div className="h-4 w-10 bg-gray-50 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products skeleton */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="h-4 w-28 bg-gray-100 rounded mb-4" />
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 bg-gray-100 rounded mb-1.5" />
                    <div className="h-2.5 w-20 bg-gray-50 rounded" />
                  </div>
                  <div className="h-4 w-16 bg-gray-50 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Country skeleton */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="h-4 w-36 bg-gray-100 rounded mb-4" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-4 bg-gray-100 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                  <div className="flex gap-6">
                    <div className="h-3 w-10 bg-gray-50 rounded" />
                    <div className="h-3 w-8 bg-gray-50 rounded" />
                    <div className="h-3 w-12 bg-gray-50 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#fafafa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="h-8 w-32 bg-gray-200 rounded-lg" />
              <div className="h-4 w-48 bg-gray-100 rounded mt-2" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-28 bg-gray-100 rounded-xl" />
              <div className="h-9 w-9 bg-gray-100 rounded-lg" />
            </div>
          </div>

          {/* Mode toggle + Timeframe + Product selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-9 w-44 bg-gray-100 rounded-xl" />
            <div className="h-9 w-32 bg-gray-100 rounded-xl" />
            <div className="h-9 w-36 bg-gray-100 rounded-xl hidden sm:block" />
          </div>

          {/* KPI + Chart card */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* KPI Cards row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#e5e7eb]/60">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-4 py-4">
                  <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
                  <div className="h-6 w-20 bg-gray-200 rounded mb-1" />
                  <div className="h-2.5 w-24 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
            {/* Chart area */}
            <div className="border-t border-[#e5e7eb]/60 px-4 py-4">
              <div className="h-[200px] flex items-end gap-[3px]">
                {[40, 55, 30, 65, 50, 70, 35, 60, 45, 55, 40, 65, 50, 42].map((h, i) => (
                  <div key={i} className="flex-1 bg-gray-100 rounded-t" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Traffic & Device Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
              <div className="flex items-center justify-center h-[180px]">
                <div className="w-32 h-32 rounded-full bg-gray-100" />
              </div>
              <div className="space-y-2 mt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-200" />
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                    <div className="h-3 w-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="h-5 w-36 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                      <div className="h-4 w-24 bg-gray-100 rounded" />
                    </div>
                    <div className="h-4 w-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shrink-0 w-36">
                  <div className="h-24 w-full bg-gray-100 rounded-xl mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded mb-1" />
                  <div className="h-3 w-16 bg-gray-50 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Countries */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-4 bg-gray-100 rounded" />
                    <div className="h-4 w-28 bg-gray-100 rounded" />
                  </div>
                  <div className="h-4 w-12 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

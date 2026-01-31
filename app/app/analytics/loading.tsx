export default function AnalyticsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa]">
      {/* Announcement Bar Skeleton */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3">
            <div className="h-4 w-32 bg-white/20 rounded animate-pulse" />
            <div className="h-6 w-20 bg-white/30 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="h-[2px] bg-white/10" />
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3.5">
            <div className="h-10 w-32 bg-white border border-gray-200 rounded-xl animate-pulse shadow-sm" />
          </div>
          <div className="h-10 w-32 bg-white border border-gray-200 rounded-xl animate-pulse shadow-sm" />
        </div>

        {/* KPI Cards Skeleton */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>

        {/* Trend Chart Skeleton */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-5 w-48 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
          {/* Chart area with bars */}
          <div className="h-[300px] flex items-end gap-2 pt-8">
            {[40, 65, 45, 80, 55, 70, 60, 85, 50, 75, 90, 55].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                <div
                  className="w-full bg-gradient-to-t from-violet-200 to-violet-100 rounded-t animate-pulse"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Charts Row Skeleton */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Traffic Distribution */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
              <div className="h-5 w-36 bg-gray-200 rounded animate-pulse" />
            </div>
            {/* Pie chart skeleton */}
            <div className="h-[250px] flex items-center justify-center">
              <div className="w-44 h-44 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse relative">
                <div className="absolute inset-8 bg-white rounded-full" />
              </div>
            </div>
          </div>

          {/* Device Breakdown */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="space-y-4">
              {[75, 55, 30].map((w, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-14 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-200 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Traffic Sources Table Skeleton */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 flex-1 max-w-[150px] bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
                <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Visitors by Country Skeleton */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
              <div>
                <div className="h-5 w-36 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
          {/* Map skeleton */}
          <div className="relative bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] rounded-xl p-6 h-[280px] overflow-hidden">
            {/* World map outline placeholder */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                <ellipse cx="500" cy="250" rx="450" ry="200" fill="none" stroke="#9ca3af" strokeWidth="2" className="animate-pulse" />
                <ellipse cx="250" cy="200" rx="150" ry="100" fill="#e5e7eb" className="animate-pulse" />
                <ellipse cx="520" cy="220" rx="100" ry="80" fill="#e5e7eb" className="animate-pulse" />
                <ellipse cx="750" cy="200" rx="120" ry="90" fill="#e5e7eb" className="animate-pulse" />
              </svg>
            </div>
            {/* Floating dots */}
            {[
              { x: 20, y: 30 },
              { x: 45, y: 45 },
              { x: 55, y: 25 },
              { x: 75, y: 35 },
              { x: 85, y: 55 },
            ].map((pos, i) => (
              <div
                key={i}
                className="absolute w-4 h-4 bg-violet-300 rounded-full animate-pulse"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
          {/* Country list skeleton */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-200 rounded-full animate-pulse" style={{ width: `${70 - i * 10}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products Skeleton */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-5 w-28 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-44 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                <div className="w-12 h-12 rounded-lg bg-gray-200 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-48 bg-gray-100 rounded animate-pulse mb-2" />
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-200 rounded-full animate-pulse" style={{ width: `${100 - i * 15}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

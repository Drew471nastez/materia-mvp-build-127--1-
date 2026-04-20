// Dashboard loading skeleton — rendered by Next.js while the server fetches
// data. Matches the DashboardClient isLoading skeleton pixel-for-pixel so
// there is no blank-white flash: loading.tsx → DashboardClient skeleton →
// actual content all look the same during the transition.
export default function AppDashboardLoading() {
  return (
    <div className="h-full overflow-y-auto dashboard-scroll-container skeleton-deferred" style={{ background: "#f2f2f2" }}>
      {/* Announcement bar placeholder — same height as the real purple bar */}
      <div className="h-[38px] sm:h-[42px] bg-[#8b5cf6]" />

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto animate-pulse">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="h-7 w-56 bg-gray-100 rounded-lg mb-2" />
            <div className="h-4 w-40 bg-gray-50 rounded" />
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="h-10 w-36 bg-gray-100 rounded-xl" />
            <div className="h-10 w-32 bg-gray-50 rounded-lg" />
          </div>
          <div className="md:hidden flex items-center gap-2">
            <div className="h-[38px] w-24 bg-gray-50 rounded-xl" />
            <div className="h-[38px] w-32 bg-gray-100 rounded-xl" />
          </div>
        </div>

        {/* KPI + Chart skeleton */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8 overflow-hidden">
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
            <div className="h-[200px] flex items-end gap-2 px-2">
              {[40, 55, 30, 65, 45, 60, 35, 50, 70, 42].map((h, i) => (
                <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>

        {/* Promotional banner skeleton */}
        <div className="mb-8">
          <div className="h-[140px] sm:h-[160px] bg-gray-100 rounded-2xl" />
        </div>

        {/* Grid skeleton: Setup checklist + Quick actions */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Setup checklist */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-5">
              <div className="h-4 w-28 bg-gray-100 rounded" />
              <div className="h-6 w-12 bg-gray-50 rounded-full" />
            </div>
            <div className="h-1.5 w-full bg-gray-50 rounded-full mb-5" />
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-28 bg-gray-100 rounded mb-1.5" />
                    <div className="h-2.5 w-40 bg-gray-50 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Quick actions */}
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="h-16 w-16 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-36 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-52 bg-gray-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

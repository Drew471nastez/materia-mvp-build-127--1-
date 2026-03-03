// Dashboard loading skeleton — shown by Next.js while the server
// fetches data for /app. Prevents a blank white screen on first load
// in both Capacitor and the browser.
export default function AppDashboardLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[900px] mx-auto space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-36 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-violet-100 rounded-xl animate-pulse" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="h-3.5 w-16 bg-gray-100 rounded animate-pulse mb-3" />
              <div className="h-7 w-24 bg-gray-200 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-[180px] w-full bg-gray-50 rounded-xl animate-pulse" />
        </div>

        {/* Setup checklist skeleton */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-gray-100 animate-pulse shrink-0" />
                <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="h-9 w-9 bg-violet-100 rounded-xl animate-pulse mb-3" />
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-1.5" />
              <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// Dashboard loading skeleton — shown by Next.js while the server
// fetches data for /app, and also as the NativeAuthGate loadingFallback
// in Capacitor (where the session comes from Preferences, not cookies).
// Wraps content in the same dark-bg + sidebar-skeleton structure as
// the real AppLayout so there is no colour flash during session restore.
export default function AppDashboardLoading() {
  return (
    <div className="min-h-svh overflow-x-hidden bg-[#111111] app-no-scrollbar">
      {/* Sidebar skeleton — mirrors real AppSidebar width */}
      <div className="fixed inset-y-0 left-0 w-[220px] bg-[#111111] border-r border-white/5 hidden md:flex flex-col gap-3 px-3 py-4 z-20">
        <div className="h-8 w-28 bg-white/10 rounded-lg animate-pulse mb-4" />
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-9 w-full bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>

      {/* Mobile top bar skeleton */}
      <div
        className="md:hidden fixed top-0 inset-x-0 bg-[#111111] border-b border-white/5 flex items-end px-4 pb-3 gap-3 z-20"
        style={{
          height: "calc(68px + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="h-7 w-7 bg-white/10 rounded-md animate-pulse" />
        <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
      </div>

      {/* Main content area — same padding as the real layout */}
      <main
        className="h-svh bg-white rounded-t-[20px] md:rounded-none overflow-hidden md:pl-[220px]"
        style={{
          paddingTop: "calc(68px + env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          className="overflow-y-auto"
          style={{
            height: "calc(100svh - 68px - env(safe-area-inset-top, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
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
      </main>
    </div>
  )
}

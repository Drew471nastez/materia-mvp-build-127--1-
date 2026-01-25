import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa]">
      {/* Announcement Bar */}
      <div className="bg-[#8b5cf6] py-2.5 px-4">
        <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-3">
          <Skeleton className="h-4 w-48 bg-white/20" />
          <Skeleton className="h-7 w-20 rounded-full bg-white/20" />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Banner */}
        <div className="mb-8">
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Store Setup */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
            <div className="flex items-center justify-between mb-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full mb-5" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-5">
                  <Skeleton className="h-14 w-14 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-4 w-48" />
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

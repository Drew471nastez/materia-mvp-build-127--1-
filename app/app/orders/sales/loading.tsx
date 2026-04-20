import { Skeleton } from "@/components/ui/skeleton"

// Simpler, calmer skeleton — just shape placeholders for the 3 main regions.
// `skeleton-deferred` delays the reveal by 200ms so fast loads never flash it.
export default function SalesLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] skeleton-deferred">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <Skeleton className="h-3.5 w-20 mb-3" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="divide-y divide-[#e5e7eb]/60">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="hidden sm:block h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

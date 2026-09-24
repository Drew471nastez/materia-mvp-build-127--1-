export default function CouponsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header — title + subtitle + CTA */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-[26px] sm:h-[30px] w-28 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-[14px] w-56 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
          <div className="w-full sm:w-[140px] h-11 bg-violet-200/70 rounded-xl animate-pulse" />
        </div>

        {/* Coupon rows */}
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-purple-50 animate-pulse" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-[14px] w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-[18px] w-14 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="h-[12px] w-48 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="h-5 w-9 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

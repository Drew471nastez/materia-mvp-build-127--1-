export default function PayoutsLoading() {
  return (
    <div className="h-full overflow-y-auto bg-[#fafafa] skeleton-deferred">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="mb-6">
            <div className="h-8 w-28 bg-gray-100 rounded-lg mb-2" />
            <div className="h-4 w-64 bg-gray-50 rounded" />
          </div>

          {/* Chart + Withdraw panel skeleton */}
          <div className="flex flex-col lg:flex-row gap-5 mb-6">
            {/* Revenue chart skeleton */}
            <div className="flex-1 bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
                  <div className="h-7 w-32 bg-gray-100 rounded" />
                </div>
                <div className="h-9 w-32 bg-gray-50 rounded-xl" />
              </div>
              <div className="h-[180px] flex items-end gap-2 px-2">
                {[45, 60, 35, 55, 40, 65, 50, 70, 38, 58].map((h, i) => (
                  <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            {/* Withdraw panel skeleton */}
            <div className="lg:w-[24rem] xl:w-[26.5rem] shrink-0 bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
              <div className="space-y-4">
                <div>
                  <div className="h-3 w-24 bg-gray-50 rounded mb-2" />
                  <div className="h-8 w-28 bg-gray-100 rounded" />
                </div>
                <div>
                  <div className="h-3 w-28 bg-gray-50 rounded mb-2" />
                  <div className="h-7 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-11 w-full bg-gray-100 rounded-xl mt-4" />
                <div className="h-4 w-48 bg-gray-50 rounded mx-auto" />
              </div>
            </div>
          </div>

          {/* Recent activity skeleton */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
            {/* Tab bar */}
            <div className="px-5 pt-4 pb-0 border-b border-[#e5e7eb] flex items-end justify-between">
              <div className="flex items-end gap-2 -mb-px">
                <div className="h-9 w-16 bg-gray-100 rounded-t-xl" />
                <div className="h-9 w-20 bg-gray-50 rounded-t-xl" />
              </div>
              <div className="flex items-center gap-2 py-2">
                <div className="h-6 w-10 bg-gray-50 rounded" />
                <div className="flex gap-1">
                  <div className="h-7 w-7 bg-gray-50 rounded-lg" />
                  <div className="h-7 w-7 bg-gray-50 rounded-lg" />
                </div>
              </div>
            </div>
            {/* Table rows */}
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-36 bg-gray-100 rounded mb-1.5" />
                    <div className="h-2.5 w-24 bg-gray-50 rounded" />
                  </div>
                  <div className="text-right">
                    <div className="h-3.5 w-16 bg-gray-100 rounded mb-1.5" />
                    <div className="h-5 w-20 bg-gray-50 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payout method card skeleton */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100" />
              <div className="flex-1">
                <div className="h-3.5 w-28 bg-gray-100 rounded mb-1.5" />
                <div className="h-2.5 w-40 bg-gray-50 rounded" />
              </div>
              <div className="h-8 w-20 bg-gray-50 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

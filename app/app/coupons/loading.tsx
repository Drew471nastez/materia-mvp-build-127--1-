export default function CouponsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-28 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-4 w-52 bg-gray-100 rounded-md animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded-full animate-pulse shrink-0" />
        </div>

        {/* Tip banner skeleton */}
        <div className="rounded-2xl bg-purple-50/60 border border-purple-100/60 h-14 animate-pulse" />

        {/* Coupon row skeletons */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border bg-white p-4 sm:p-5"
              style={{ opacity: 1 - (i - 1) * 0.2 }}
            >
              <div className="flex items-start gap-3">
                {/* Icon circle */}
                <div className="w-10 h-10 rounded-full bg-purple-100/70 animate-pulse shrink-0" />

                <div className="flex-1 space-y-2">
                  {/* Code + badge row */}
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-5 w-14 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  {/* Details row */}
                  <div className="flex gap-4">
                    <div className="h-3.5 w-14 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3.5 w-20 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3.5 w-12 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-9 h-5 bg-gray-200 rounded-full animate-pulse" />
                  <div className="w-6 h-6 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="w-6 h-6 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

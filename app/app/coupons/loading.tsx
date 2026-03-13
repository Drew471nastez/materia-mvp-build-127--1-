export default function CouponsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[58rem] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header row — title left, "New coupon" pill right */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 pt-0.5">
            <div className="h-7 w-32 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-4 w-56 rounded-md bg-gray-100 animate-pulse" />
          </div>
          <div className="h-10 w-36 rounded-full bg-gray-200 animate-pulse shrink-0" />
        </div>

        {/* Coupon card skeletons */}
        <div className="space-y-3">
          {([1, 0.75, 0.5] as const).map((opacity, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5"
              style={{ opacity }}
            >
              <div className="flex items-start gap-3">
                {/* Icon circle */}
                <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse shrink-0" />

                <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
                  {/* Code + status badge */}
                  <div className="flex items-center gap-2.5">
                    <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
                    <div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  {/* Discount · applies to · used */}
                  <div className="flex gap-3">
                    <div className="h-3 w-14 rounded animate-pulse" style={{ backgroundColor: "rgb(243 244 246)" }} />
                    <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-11 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>

                {/* Action row: toggle + edit + delete */}
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <div className="w-9 h-5 rounded-full bg-gray-200 animate-pulse" />
                  <div className="w-7 h-7 rounded-lg bg-gray-100 animate-pulse" />
                  <div className="w-7 h-7 rounded-lg bg-gray-100 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

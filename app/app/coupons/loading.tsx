export default function CouponsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-[58rem] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 pt-0.5 min-w-0">
            <div className="h-7 w-28 sm:w-32 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-4 w-44 sm:w-56 rounded-md bg-gray-100 animate-pulse" />
          </div>
          <div className="h-10 w-32 sm:w-36 rounded-full bg-gray-200 animate-pulse shrink-0" />
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
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-200 animate-pulse shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                  {/* Code + status badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="h-4 w-16 sm:w-20 rounded bg-gray-200 animate-pulse" />
                    <div className="h-5 w-12 sm:w-14 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  {/* Detail chips */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-10 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
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

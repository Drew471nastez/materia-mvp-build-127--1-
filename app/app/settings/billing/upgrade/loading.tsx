export default function UpgradeLoading() {
  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-7 w-20 bg-gray-200 rounded animate-pulse absolute left-1/2 -translate-x-1/2" />
          <div className="h-9 w-9 bg-gray-100 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="h-9 w-64 bg-gray-200 rounded-lg animate-pulse mx-auto" />
          <div className="h-4 w-80 bg-gray-100 rounded animate-pulse mx-auto mt-3" />
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] md:gap-4 max-w-[960px] mx-auto md:items-stretch">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`bg-white rounded-3xl p-9 flex flex-col ${
                i === 2 ? "border-[1.5px] border-violet-200" : "border-[1.5px] border-neutral-200"
              }`}
            >
              {i === 2 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="h-6 w-24 bg-violet-200 rounded-full animate-pulse" />
                </div>
              )}
              <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mb-3" />
              <div className="h-10 w-16 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mb-5" />
              <div className="h-12 w-full bg-gray-200 rounded-lg animate-pulse mb-7" />
              <div className="flex flex-col gap-3 flex-1">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 bg-gray-100 rounded-full animate-pulse shrink-0" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

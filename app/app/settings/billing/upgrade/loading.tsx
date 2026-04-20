// Skeleton mirrors the real /app/settings/billing/upgrade page
// (components/app/billing/upgrade-page-client.tsx) but stays
// intentionally minimal: light-gray placeholders only — no purple
// accents, no badges, no highlighted middle card. Keeping the skeleton
// neutral makes the load → loaded transition feel calm rather than
// shifting brand colors mid-render.
export default function UpgradeLoading() {
  return (
    <div className="relative bg-white min-h-full skeleton-deferred">
      {/* Top bar — matches sticky header in upgrade-page-client.tsx */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16 relative">
          <div className="h-3.5 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-6 w-6 sm:h-7 sm:w-7 absolute left-1/2 -translate-x-1/2 rounded-[7px] bg-gray-100 animate-pulse" />
          <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Title + subtitle */}
        <div className="text-center mb-10">
          <div className="h-8 w-[260px] sm:w-[300px] rounded-lg bg-gray-100 animate-pulse mx-auto" />
          <div className="h-4 w-[240px] sm:w-[320px] rounded bg-gray-100 animate-pulse mx-auto mt-3" />
        </div>

        {/* Plan cards — all three identical, neutral light-gray */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] md:gap-4 max-w-[960px] mx-auto md:items-stretch">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-9 border-[1.5px] border-neutral-200 flex flex-col"
            >
              {/* Plan name */}
              <div className="h-5 w-20 rounded bg-gray-100 animate-pulse mb-3" />

              {/* Price */}
              <div className="h-10 w-[88px] rounded bg-gray-100 animate-pulse mb-2" />

              {/* Description */}
              <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse mb-5" />

              {/* CTA button */}
              <div className="h-[50px] w-full rounded-lg bg-gray-100 animate-pulse mb-7" />

              {/* Feature list */}
              <ul className="flex flex-col gap-2.5 flex-1">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <li key={j} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    <div
                      className="h-3 rounded bg-gray-100 animate-pulse"
                      style={{ width: `${60 + ((j * 9) % 30)}%` }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="text-center mt-10">
          <div className="h-3 w-[300px] max-w-[80%] rounded bg-gray-100 animate-pulse mx-auto" />
        </div>
      </div>
    </div>
  )
}

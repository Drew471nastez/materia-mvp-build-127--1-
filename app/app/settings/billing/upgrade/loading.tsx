// Skeleton mirrors the real /app/settings/billing/upgrade page
// (components/app/billing/upgrade-page-client.tsx) so the swap from
// loading → loaded is visually seamless. Keep the structure (sticky top
// bar, centered title + subtitle, three plan cards with the middle one
// highlighted as the "Most Popular" tier) byte-for-byte aligned with
// the real component or the layout will jolt on hand-off.
export default function UpgradeLoading() {
  return (
    <div className="relative bg-white min-h-full">
      {/* Top bar — matches sticky header in upgrade-page-client.tsx */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16 relative">
          {/* "Back to billing" — left aligned, matches real button width */}
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
            <div className="h-3.5 w-24 rounded bg-gray-200 animate-pulse hidden sm:block" />
            <div className="h-3.5 w-10 rounded bg-gray-200 animate-pulse sm:hidden" />
          </div>

          {/* Storelib logo — centered */}
          <div className="h-6 w-6 sm:h-7 sm:w-7 absolute left-1/2 -translate-x-1/2 rounded-[7px] bg-gray-200 animate-pulse" />

          {/* Close (X) button — circular */}
          <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Title + subtitle */}
        <div className="text-center mb-10">
          <div className="h-9 sm:h-10 w-[260px] sm:w-[320px] rounded-lg bg-gray-200 animate-pulse mx-auto" />
          <div className="h-4 w-[280px] sm:w-[360px] rounded bg-gray-100 animate-pulse mx-auto mt-3" />
        </div>

        {/* Plan cards — 3 columns on md+, matches real grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] md:gap-4 max-w-[960px] mx-auto md:items-stretch">
          {[0, 1, 2].map((i) => {
            const isGrowth = i === 1
            return (
              <div
                key={i}
                className={`bg-white rounded-3xl relative flex flex-col ${
                  isGrowth
                    ? "p-9 md:py-12 border-[1.5px] border-violet-200 shadow-[0_0_0_1px_#ede9fe]"
                    : "p-9 border-[1.5px] border-neutral-200"
                }`}
              >
                {/* "Most Popular" / "Recommended" badge */}
                {(isGrowth || i === 2) && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div
                      className={`h-6 w-24 rounded-full animate-pulse ${
                        isGrowth ? "bg-violet-200" : "bg-gray-200"
                      }`}
                    />
                  </span>
                )}

                {/* Plan name */}
                <div className="h-5 w-20 rounded bg-gray-200 animate-pulse mb-1.5" />

                {/* Price row — large number + /mo */}
                <div className="flex items-baseline gap-1 mb-1">
                  <div className="h-10 w-[88px] rounded bg-gray-200 animate-pulse" />
                  {!isGrowth && i !== 0 && <div className="h-4 w-8 rounded bg-gray-100 animate-pulse" />}
                  {isGrowth && <div className="h-4 w-8 rounded bg-gray-100 animate-pulse" />}
                </div>

                {/* "Free forever" / micro line */}
                <div className="h-3 w-24 rounded bg-gray-100 animate-pulse mb-1" />

                {/* Description */}
                <div className="space-y-1.5 mb-5">
                  <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                </div>

                {/* CTA button — same height & radius as real */}
                <div
                  className={`h-[50px] w-full rounded-lg animate-pulse mb-7 ${
                    isGrowth ? "bg-violet-200" : "bg-gray-200"
                  }`}
                />

                {/* Feature list — 6 rows to match the real plans */}
                <ul className="flex flex-col gap-2.5 flex-1">
                  {[0, 1, 2, 3, 4, 5].map((j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full shrink-0 mt-0.5 animate-pulse ${
                          isGrowth ? "bg-violet-200" : "bg-violet-50"
                        }`}
                      />
                      <div
                        className="h-3 rounded bg-gray-100 animate-pulse"
                        style={{ width: `${55 + ((j * 7) % 35)}%` }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div className="text-center mt-10">
          <div className="h-3 w-[320px] max-w-[80%] rounded bg-gray-100 animate-pulse mx-auto" />
        </div>
      </div>
    </div>
  )
}

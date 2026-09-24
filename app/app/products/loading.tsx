/**
 * The Products page's stand-in, for a slow load only (`skeleton-deferred`).
 * The same shapes at the same sizes as products-client.tsx: the bar with the
 * title and New product, then one card with its 48px toolbar, the table's
 * head, and 56px rows with a 40px picture. Nothing moves when the page lands.
 */
export default function ProductsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
          <div className="h-[28px] w-28 rounded-md bg-[#e9ebee] sm:h-[32px]" />
          <div className="h-8 w-[120px] rounded-lg bg-[#e4dcfb]" />
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
            <div className="h-8 w-[84px] rounded-lg bg-[#eceef1]" />
            <div className="h-8 w-[52px] rounded-lg" />
            <div className="h-8 w-[88px] rounded-lg" />
            <div className="ml-auto h-8 w-8 rounded-lg bg-[#f1f2f4]" />
            <div className="h-8 w-8 rounded-lg bg-[#f1f2f4]" />
          </div>
          <div className="h-9 border-b border-[#eef0f2] bg-[#fafbfb]" />
          <div className="divide-y divide-[#f1f2f4]">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-14 items-center gap-3 px-3">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-[#eef0f3]" />
                <div className="h-3 rounded bg-[#eef0f3]" style={{ width: [180, 140, 210, 120, 160, 190][i] }} />
                <div className="ml-auto hidden h-[22px] w-16 rounded-[7px] bg-[#f1f2f4] sm:block" />
                <div className="h-3 w-12 rounded bg-[#f1f2f4]" />
                <div className="h-8 w-[88px] rounded-lg bg-[#f1f2f4]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

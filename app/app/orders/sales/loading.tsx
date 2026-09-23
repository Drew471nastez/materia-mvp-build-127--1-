/**
 * The Orders page's shape, at the Orders page's sizes: the title row, the
 * metrics strip (96px), and the table's toolbar (48), header (36) and rows
 * (40). When the page arrives it lands in the same boxes. `skeleton-deferred`
 * waits 200ms before showing any of it, so a fast load never flashes it.
 */
export default function OrdersLoading() {
  const bone = "rounded-md bg-[#eceef1] animate-pulse"
  return (
    <div className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa] skeleton-deferred">
      <div className="orders-pane absolute inset-0 overflow-hidden">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex h-[32px] items-center justify-between sm:h-[42px]">
            <div className={`${bone} h-7 w-28`} />
            <div className={`${bone} h-8 w-[92px] rounded-lg`} />
          </div>

          <div className="mt-5 flex h-[96px] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex shrink-0 items-center pl-3 pr-2">
              <div className={`${bone} h-8 w-[92px] rounded-lg`} />
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="min-w-[152px] flex-1 shrink-0 border-l border-[#eef0f2] px-4 pt-3">
                <div className={`${bone} h-3 w-20`} />
                <div className={`${bone} mt-2.5 h-4 w-12`} />
                <div className={`${bone} mt-4 h-[3px] w-full`} />
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-3">
              <div className={`${bone} h-6 w-10 rounded-lg`} />
              <div className={`${bone} h-6 w-12 rounded-lg`} />
              <div className={`${bone} ml-auto h-6 w-14 rounded-lg`} />
            </div>
            <div className="h-9 bg-[#f7f7f8]" />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-10 items-center gap-6 border-t border-[#f0f1f3] px-3">
                <div className={`${bone} h-4 w-4 rounded-[5px]`} />
                <div className={`${bone} h-3 w-12`} />
                <div className={`${bone} h-3 w-24`} />
                <div className={`${bone} hidden h-3 w-28 sm:block`} />
                <div className={`${bone} hidden h-3 w-16 md:block`} />
                <div className={`${bone} hidden h-5 w-12 rounded-[7px] md:block`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

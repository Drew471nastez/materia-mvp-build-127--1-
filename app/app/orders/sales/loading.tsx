/**
 * Orders, while the server is still reading them. Most visits never see
 * this: `skeleton-late` keeps it invisible for the first 450ms, and the
 * router keeps a page it already has for five minutes. When it does show,
 * it is the page's outline and nothing more, in the page's own boxes, so
 * the real page lands in the same places.
 */
export default function OrdersLoading() {
  const bone = "rounded-md bg-[#eef0f2]"
  return (
    <div className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa] skeleton-late">
      <div className="orders-pane absolute inset-0 overflow-hidden">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex h-[32px] items-center justify-between sm:h-[42px]">
            <div className={`${bone} h-7 w-28`} />
            <div className={`${bone} h-8 w-[92px] rounded-lg`} />
          </div>
          <div className={`${bone} mt-4 h-8 w-[170px] rounded-lg`} />
          <div className="mt-3 h-[96px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          <div className="mt-4 h-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        </div>
      </div>
    </div>
  )
}

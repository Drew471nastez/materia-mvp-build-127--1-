/**
 * The coupon form's stand-in, for a slow load only (`skeleton-deferred`):
 * the same bar as create-coupon-client.tsx (56px, 64px from 640px) and its
 * first cards in the 640px column.
 */
const CARD = "mb-3 space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-4 sm:p-6"

export default function CouponFormLoading() {
  return (
    <div aria-hidden className="page-scroll h-full overflow-hidden bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto flex h-14 max-w-[640px] items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
        <div className="h-11 w-[66px] shrink-0 sm:hidden" />
        <div className="-ml-2 hidden h-9 w-9 sm:block" />
        <div className="min-w-0 flex-1 px-1 sm:px-0">
          <div className="h-4 w-28 rounded-md bg-[#eceef1] sm:h-5" />
          <div className="mt-1.5 h-2.5 w-16 rounded-md bg-[#f1f2f4]" />
        </div>
        <div className="hidden h-8 w-[66px] rounded-lg border border-[#e3e4e8] bg-white sm:block" />
        <div className="h-10 w-[68px] shrink-0 rounded-[10px] bg-[#e4dcfb] sm:h-8 sm:w-[60px] sm:rounded-lg" />
      </div>
      <div className="mx-auto w-full max-w-[640px] px-4 pt-3 sm:px-6 sm:pt-4">
        <div className={CARD}>
          <div className="h-4 w-12 rounded-md bg-[#eceef1]" />
          <div className="h-11 rounded-[10px] border border-[#e5e7eb] bg-white sm:h-10" />
          <div className="h-3 w-64 max-w-full rounded-md bg-[#f1f2f4]" />
        </div>
        <div className={CARD}>
          <div className="h-4 w-20 rounded-md bg-[#eceef1]" />
          <div className="h-11 rounded-[10px] bg-[#eceef1] sm:h-9" />
          <div className="h-11 rounded-[10px] border border-[#e5e7eb] bg-white sm:h-10" />
        </div>
      </div>
    </div>
  )
}

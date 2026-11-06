/**
 * THE RECEIPT WHILE IT IS READ, IN ITS OWN SHAPE.
 *
 * It was a grey circle, two bars and one small card with pulsing grey-200
 * blocks, nothing like the page that replaced it: the owner called the
 * loading "cheap". It is now the receipt's own frame at its own sizes
 * (app/receipt/[token]/receipt-view.tsx): the seller and Print, the thanks
 * and the order line, the order card with a line, a file and the totals
 * band, and the email card. Faint bars on the real white cards, and one slow
 * shimmer rather than everything blinking, so the page lands on it without
 * a jump. Deferred (.skeleton-deferred): a fast read never shows it. After
 * paying it is under the held paid screen (app/checkout/parts/success.tsx),
 * which waits for [data-receipt].
 */
const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
const BAR = "rounded-md bg-[#eceef1] animate-pulse [animation-duration:1.8s]"

export default function ReceiptLoading() {
  return (
    <main data-receipt-loading="" aria-busy="true" aria-label="Loading your receipt" className="bg-[#f5f6f8] skeleton-deferred">
      <div data-receipt-content="" className="mx-auto w-full max-w-[640px] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:pt-8">
        {/* The back chevron, the seller, and Print. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-h-[44px] items-center gap-2.5">
            <div className="h-10 w-10 rounded-full border border-[#e4e7ec] bg-white" />
            <div className="h-8 w-8 rounded-full bg-[#e4e7ec] animate-pulse [animation-duration:1.8s]" />
            <div className={`h-3.5 w-28 ${BAR}`} />
          </div>
          <div className="h-9 w-[76px] rounded-[10px] border border-[#e4e7ec] bg-white" />
        </div>

        {/* Thanks, and the order line. */}
        <div className="mt-5">
          <div className={`h-[28px] w-52 sm:h-[32px] sm:w-64 ${BAR}`} />
          <div className={`mt-2.5 h-3.5 w-48 ${BAR}`} />
        </div>

        {/* The order: a line, a file, the totals. */}
        <div className={`${CARD} mt-6 overflow-hidden`}>
          <div className="px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3.5">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-[#f1f3f5]" />
              <div className="flex-1 space-y-2 pt-1">
                <div className={`h-4 w-3/5 ${BAR}`} />
                <div className={`h-3 w-1/4 ${BAR}`} />
              </div>
              <div className={`mt-1 h-4 w-14 ${BAR}`} />
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-[#eef0f3] pt-3">
              <div className="h-9 w-9 shrink-0 rounded-lg border border-[#e9ecf0] bg-[#f7f8fa]" />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3.5 w-1/2 ${BAR}`} />
                <div className={`h-3 w-16 ${BAR}`} />
              </div>
              <div className="h-9 w-11 shrink-0 rounded-[10px] bg-[#d9dce1] sm:w-[124px]" />
            </div>
          </div>
          <div className="space-y-2.5 border-t border-[#eef0f3] bg-[#fbfbfc] px-4 py-4 sm:px-5">
            <div className="flex justify-between">
              <div className={`h-3.5 w-16 ${BAR}`} />
              <div className={`h-3.5 w-14 ${BAR}`} />
            </div>
            <div className="flex justify-between">
              <div className={`h-4 w-12 ${BAR}`} />
              <div className={`h-4 w-16 ${BAR}`} />
            </div>
          </div>
        </div>

        {/* The email. */}
        <div className={`${CARD} mt-4 flex items-start justify-between gap-3 px-4 py-4 sm:px-5`}>
          <div className="flex-1 space-y-2 pt-2">
            <div className={`h-3.5 w-3/5 ${BAR}`} />
            <div className={`h-3 w-2/5 ${BAR}`} />
          </div>
          <div className="h-9 w-[92px] rounded-[10px] border border-[#e4e7ec] bg-[#f3f4f6]" />
        </div>
      </div>
    </main>
  )
}

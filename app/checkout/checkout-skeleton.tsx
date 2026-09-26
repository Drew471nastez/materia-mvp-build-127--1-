/*
  ═══════════════════════════════════════════════════════════════════════════
   THE CHECKOUT'S SHAPE, WHILE IT IS ASKED FOR
  ═══════════════════════════════════════════════════════════════════════════
  The page's own frame, drawn at once: the white bar across the top with Back,
  the creator and Continue shopping, the grey half and the white half with its
  shadow. The blocks inside are the real page's blocks at their real sizes
  (the total, the line with its picture, the promotion code, the fields, the
  card box, Pay), so nothing moves when the page lands: its halves fade in
  over this. The blocks themselves appear only after 200ms (skeleton-deferred),
  so a quick arrival shows the frame and then the page, and never a flash of
  grey bars.
*/
export function CheckoutSkeleton() {
  const bar = "rounded-[6px] bg-[#e7e9ec]"
  const field = "h-11 rounded-[8px] border border-[#eceef1] bg-[#f7f8f9]"
  return (
    <div data-checkout-skeleton="" className="relative min-h-screen bg-white lg:bg-[#f6f7f8]" aria-busy aria-label="Loading checkout">
      <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-12px_0_32px_-16px_rgba(17,24,39,0.16)] lg:block" />
      <div className="relative z-10 bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(17,17,19,0.06),0_6px_16px_-12px_rgba(17,17,19,0.12)]">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1.5 px-4 sm:px-7 lg:h-16 lg:px-[60px]">
          <span className="grid h-11 w-11 place-items-center">
            <span className="h-9 w-9 rounded-[10px] border border-black/[0.06] bg-white shadow-[0_1px_1px_rgba(17,17,19,0.04)]" />
          </span>
          <span className="h-7 w-7 rounded-full bg-[#eceef1]" />
          <span className="ml-2 h-3.5 w-24 rounded-[5px] bg-[#eceef1]" />
          <span className="ml-auto mr-1 h-9 w-[132px] rounded-[9px] border border-[#e1e3e7] bg-white" />
        </div>
      </div>
      <div className="skeleton-deferred relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
        <div className="border-b border-black/[0.06] bg-[#f6f7f8] px-5 pb-6 pt-6 sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-12">
          <div className="checkout-shimmer-soft mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0">
            <div className={`${bar} h-4 w-32`} />
            <div className={`${bar} mt-3 h-9 w-48`} />
            <div className={`${bar} mt-3 h-8 w-28 lg:hidden`} />
            <div className="mt-6 flex items-start gap-3.5 lg:mt-10">
              <div className="h-12 w-12 shrink-0 rounded-[8px] bg-[#e1e3e7]" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className={`${bar} h-3.5 w-4/5`} />
                <div className={`${bar} h-3 w-12`} />
              </div>
              <div className={`${bar} h-3.5 w-16`} />
            </div>
            <div className="mt-6 space-y-3 border-t border-black/[0.07] pt-5">
              <div className="flex justify-between">
                <div className={`${bar} h-3.5 w-16`} />
                <div className={`${bar} h-3.5 w-16`} />
              </div>
              <div className={`${bar} h-8 w-36`} />
              <div className="flex justify-between pt-1">
                <div className={`${bar} h-3.5 w-20`} />
                <div className="h-3.5 w-4 rounded-[4px] bg-[#e7e9ec]" />
              </div>
              <div className="flex justify-between border-t border-black/[0.07] pt-4">
                <div className={`${bar} h-4 w-20`} />
                <div className={`${bar} h-4 w-20`} />
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 pt-7 sm:px-8 lg:px-16 lg:pt-12">
          <div className="checkout-shimmer-soft mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
            <div className="h-11 rounded-[8px] bg-[#f1f2f4]" />
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#eceef1]" />
              <span className="h-3 w-5 rounded-[4px] bg-[#eceef1]" />
              <span className="h-px flex-1 bg-[#eceef1]" />
            </div>
            <div className="h-4 w-40 rounded-[6px] bg-[#eceef1]" />
            <div className="mt-4 h-3 w-12 rounded-[5px] bg-[#f1f2f4]" />
            <div className={`${field} mt-2`} />
            <div className="mt-4 h-3 w-16 rounded-[5px] bg-[#f1f2f4]" />
            <div className={`${field} mt-2`} />
            <div className="mt-8 h-4 w-36 rounded-[6px] bg-[#eceef1]" />
            <div className="mt-3 h-[250px] rounded-[8px] border border-[#eceef1] bg-[#fafbfb]" />
            <div className="mt-7 h-12 rounded-[8px] bg-[#e7e9ec]" />
          </div>
        </div>
      </div>
    </div>
  )
}

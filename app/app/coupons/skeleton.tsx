"use client"

/* A client module: the bar and gutter sizes come from order-parts, which is one. */
import { GUTTER, LIST_BAR, LIST_WIDTH } from "../orders/order-parts"

/**
 * The Coupons page's stand-in, for a slow load only (`skeleton-deferred`):
 * the bar with New coupon, and the card with its views and
 * either the phone's 76px rows or the table's 56px ones, at the sizes
 * coupons-client.tsx draws them.
 */
const WIDTHS = [96, 120, 84, 132]

export default function CouponsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className={`mx-auto ${LIST_WIDTH} ${GUTTER}`}>
        <div className={LIST_BAR}>
          <div className="h-[28px] w-28 rounded-md bg-[#e9ebee] sm:h-[32px]" />
          <div className="h-11 w-[138px] rounded-xl bg-[#e4dcfb] md:h-8 md:w-[116px] md:rounded-lg" />
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex h-[52px] items-center gap-0.5 border-b border-[#eef0f2] px-2 md:h-12">
            <div className="h-9 w-[64px] rounded-[10px] bg-[#eceef1] md:h-8 md:rounded-lg" />
          </div>
          <div className="divide-y divide-[#f1f2f4] md:hidden">
            {WIDTHS.map((w, i) => (
              <div key={i} className="flex min-h-[76px] items-center gap-3 py-3 pl-4 pr-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-4 rounded bg-[#eef0f3]" style={{ width: w }} />
                    <div className="h-[22px] w-14 rounded-[7px] bg-[#f1f2f4]" />
                  </div>
                  <div className="mt-2.5 h-3 w-40 rounded bg-[#f1f2f4]" />
                </div>
                <div className="h-11 w-11 shrink-0" />
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="h-9 border-b border-[#eef0f2] bg-[#fafbfb]" />
            <div className="divide-y divide-[#f1f2f4]">
              {WIDTHS.map((w, i) => (
                <div key={i} className="flex h-14 items-center gap-6 px-3">
                  <div className="h-3.5 rounded bg-[#eef0f3]" style={{ width: w }} />
                  <div className="h-[22px] w-16 rounded-[7px] bg-[#f1f2f4]" />
                  <div className="h-3 w-16 rounded bg-[#f1f2f4]" />
                  <div className="ml-auto h-8 w-[88px] rounded-lg bg-[#f1f2f4]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

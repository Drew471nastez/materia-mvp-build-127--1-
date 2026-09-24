"use client"

/* A client module: the bar and gutter sizes come from order-parts, which is one. */
import { GUTTER, LIST_BAR, LIST_WIDTH } from "../orders/order-parts"

/**
 * The Products page's stand-in, for a slow load only (`skeleton-deferred`).
 * The same shapes at the same sizes as products-client.tsx: the bar with the
 * title and New product; on a phone the 44px search field with Export and
 * the three views, then the card of 88px rows with a 64px picture; from
 * 768px the card with its toolbar, the table's head and its 56px rows with a
 * 40px picture. Nothing moves when the page lands.
 */
const WIDTHS = [180, 140, 210, 120, 160, 190]

export default function ProductsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className={`mx-auto ${LIST_WIDTH} ${GUTTER}`}>
        <div className={LIST_BAR}>
          <div className="h-[28px] w-28 rounded-md bg-[#e9ebee] sm:h-[32px]" />
          <div className="h-11 w-[142px] rounded-xl bg-[#e4dcfb] md:h-8 md:w-[120px] md:rounded-lg" />
        </div>
        <div className="mt-1 md:hidden">
          <div className="flex gap-2">
            <div className="h-11 min-w-0 flex-1 rounded-xl border border-[#e3e5e8] bg-white" />
            <div className="h-11 w-11 shrink-0 rounded-xl border border-[#e3e5e8] bg-white" />
          </div>
          <div className="mt-3 grid h-11 grid-cols-3 rounded-xl bg-[#eceef1]">
            <div className="p-1">
              <div className="h-full rounded-[9px] bg-white" />
            </div>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-4">
          <div className="hidden h-12 items-center gap-2 border-b border-[#eef0f2] px-2 md:flex">
            <div className="h-8 w-[84px] rounded-lg bg-[#eceef1]" />
            <div className="h-8 w-[52px]" />
            <div className="h-8 w-[88px]" />
            <div className="ml-auto h-8 w-8 rounded-lg bg-[#f1f2f4]" />
            <div className="h-8 w-8 rounded-lg bg-[#f1f2f4]" />
          </div>
          <div className="md:hidden">
            {WIDTHS.map((w, i) => (
              <div key={i} className="flex min-h-[88px] items-center gap-3.5 py-3 pl-4 pr-1">
                <div className="aspect-square w-16 shrink-0 rounded-[12px] bg-[#eef0f3]" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 max-w-full rounded bg-[#eef0f3]" style={{ width: w }} />
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-3.5 w-14 rounded bg-[#f1f2f4]" />
                    <div className="h-[22px] w-14 rounded-[7px] bg-[#f1f2f4]" />
                  </div>
                </div>
                <div className="h-11 w-11 shrink-0" />
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="h-9 border-b border-[#eef0f2] bg-[#fafbfb]" />
            <div className="divide-y divide-[#f1f2f4]">
              {WIDTHS.map((w, i) => (
                <div key={i} className="flex h-14 items-center gap-3 px-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[#eef0f3]" />
                  <div className="h-3 rounded bg-[#eef0f3]" style={{ width: w }} />
                  <div className="ml-auto h-[22px] w-16 rounded-[7px] bg-[#f1f2f4]" />
                  <div className="h-3 w-12 rounded bg-[#f1f2f4]" />
                  <div className="h-8 w-[88px] rounded-lg bg-[#f1f2f4]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

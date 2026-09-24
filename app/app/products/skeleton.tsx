"use client"

/* A client module: the bar and gutter sizes come from order-parts, which is one. */
import { GUTTER, LIST_BAR, LIST_WIDTH } from "../orders/order-parts"
import { ProductsSubnav } from "./products-subnav"

/**
 * The Products page's stand-in, for a slow load only (`skeleton-deferred`).
 * The same shapes at the same sizes as products-client.tsx: the bar with the
 * title and New product, the area's tabs, then one card with its toolbar and
 * either the phone's 80px rows with a 56px picture or the table's head and
 * its 56px rows with a 40px picture. Nothing moves when the page lands.
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
        <ProductsSubnav active="products" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex h-[52px] items-center gap-1.5 border-b border-[#eef0f2] px-2 md:h-12 md:gap-2">
            <div className="h-9 w-[92px] rounded-[10px] bg-[#eceef1] md:h-8 md:w-[84px] md:rounded-lg" />
            <div className="h-9 w-[56px] md:h-8 md:w-[52px]" />
            <div className="h-9 w-[96px] md:h-8 md:w-[88px]" />
            <div className="ml-auto h-10 w-10 rounded-[10px] bg-[#f1f2f4] md:h-8 md:w-8 md:rounded-lg" />
            <div className="h-10 w-10 rounded-[10px] bg-[#f1f2f4] md:h-8 md:w-8 md:rounded-lg" />
          </div>
          <div className="divide-y divide-[#f1f2f4] md:hidden">
            {WIDTHS.map((w, i) => (
              <div key={i} className="flex min-h-[80px] items-center gap-3 py-3 pl-4 pr-1.5">
                <div className="h-14 w-14 shrink-0 rounded-xl bg-[#eef0f3]" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 max-w-full rounded bg-[#eef0f3]" style={{ width: w }} />
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-3 w-12 rounded bg-[#f1f2f4]" />
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

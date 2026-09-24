"use client"

/* A client module: the bar and gutter sizes come from order-parts, which is one. */
import { GUTTER, LIST_BAR, LIST_WIDTH } from "../orders/order-parts"

/**
 * The Products page's stand-in, for a slow load only (`skeleton-deferred`).
 * The same shapes at the same sizes as products-client.tsx: the bar with the
 * title, Export and New product at 32px; the card with its toolbar (52px on
 * a phone, 48px from 768px); on a phone 64px rows with a 40px picture, from
 * 768px the table's 36px head and its 52px rows with a 40px picture. Nothing
 * moves when the page lands.
 */
const WIDTHS = [180, 140, 210, 120, 160, 190]

export default function ProductsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className={`mx-auto ${LIST_WIDTH} ${GUTTER}`}>
        <div className={LIST_BAR}>
          <div className="h-[28px] w-28 rounded-md bg-[#e9ebee] sm:h-[32px]" />
          <div className="flex items-center gap-3 md:gap-2">
            <div className="h-8 w-8 rounded-lg border border-[#e3e4e8] bg-white sm:w-[66px]" />
            <div className="h-8 w-[104px] rounded-lg bg-[#e4dcfb]" />
          </div>
        </div>
        <div className="mt-2 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-3">
          <div className="flex h-[52px] items-center border-b border-[#eef0f2] px-1 md:h-12 md:gap-2 md:px-2">
            <div className="h-8 w-10 rounded-lg bg-[#eceef1] md:w-11" />
            <div className="h-8 w-[52px]" />
            <div className="h-8 w-12" />
            <div className="h-8 w-[70px]" />
            <div className="ml-auto h-8 w-8 rounded-lg bg-[#f1f2f4] max-md:mx-1.5" />
            <div className="h-8 w-8 rounded-lg bg-[#f1f2f4] max-md:mx-1.5" />
          </div>
          <div className="md:hidden">
            {WIDTHS.map((w, i) => (
              <div key={i} className="flex h-16 items-center gap-3 pl-3 pr-1">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-[#eef0f3]" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 max-w-full rounded bg-[#eef0f3]" style={{ width: w }} />
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-3 w-12 rounded bg-[#f1f2f4]" />
                  </div>
                </div>
                <div className="h-11 w-11 shrink-0" />
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="h-9 bg-[#f7f7f8]" />
            {WIDTHS.map((w, i) => (
              <div key={i} className="flex h-[52px] items-center gap-3 border-t border-[#f0f1f3] pl-4 pr-3">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-[#eef0f3]" />
                <div className="h-3 rounded bg-[#eef0f3]" style={{ width: w }} />
                <div className="ml-auto h-[22px] w-14 rounded-[7px] bg-[#f1f2f4]" />
                <div className="ml-10 h-3 w-12 rounded bg-[#f1f2f4]" />
                <div className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

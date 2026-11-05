"use client"

/**
 * ===========================================================================
 *  PRODUCTS › SIZE CHARTS
 * ===========================================================================
 * Every size chart the store keeps, drawn the way Collections draws its
 * list (../collections/collections-client.tsx): the same bar, column and
 * white card, a 64px row on a phone and a light table from 768px. A row
 * says what the chart measures, how many sizes it has and how many products
 * use it; the whole row opens it on a page of its own (./size-chart-page.tsx,
 * at /app/products/size-charts/<id>), as an order opens, where it can be
 * deleted too. Coming back, the list says what was done and tints the row
 * (./list-return).
 *
 * A product gets its chart in the product editor, under Size chart; the
 * help article "Set up size charts" walks through both.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { accentDepth } from "@/components/ui/depth-button"
import { GUTTER, LIST_BAR, PaneBar } from "../../orders/order-parts"
import { Pill, usePill } from "../../coupons/coupon-parts"
import { pressMark } from "@/lib/press-mark"
import type { SavedSizeChart, SizeChartTargets } from "@/components/physical/size-chart-editor"
import { LAYER_LEAVE_MS } from "@/components/app/page-layer"
import { tintReturnedRow } from "@/components/app/list-return"
import { holdLanding, prefetchAppPage } from "@/lib/ui/app-navigation"
import { newSizeChartHref, sizeChartHref, sizeChartsReturn } from "./list-return"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

/* The products page's own measures, as Collections keeps them, so the three pages are one place. */
const BAR_BUTTON_SIZE = "lg:h-[35px] lg:px-[13px] lg:text-[14.5px]"
const PAGE_WIDTH = "max-w-[1200px] lg:max-w-[1323px]"
const PAGE_GUTTER = "lg:px-[35px]"
const PAGE_BAR = "lg:min-h-[73px] lg:pb-[9px] lg:pt-[15px]"
const PRESS = "relative max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']"
const NEW_LOOK = cn(accentDepth, PRESS, "h-8 gap-1.5 rounded-lg px-3 text-[13px]", BAR_BUTTON_SIZE)

/** What a chart measures, in a few words: "Chest, Length, Sleeve · cm". */
function measures(c: SavedSizeChart): string {
  const names = c.columns.slice(1).map((x) => x.name).filter(Boolean)
  return names.length ? `${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""} · ${c.unit}` : c.unit
}

/** What else a chart is set for (round 13), in a few words: "Tees, Shirts". */
function alsoOn(c: SavedSizeChart, targets?: SizeChartTargets): string {
  const names = [...(c.collectionIds ?? []).map((id) => targets?.collections.find((x) => x.id === id)?.title).filter((x): x is string => !!x), ...(c.categories ?? [])]
  return names.length ? tt("Also on {names}", { names: `${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` }) : ""
}

const sizesWord = (n: number) => tt("{n, plural, one {# size} other {# sizes}}", { n })
const productsWord = (n: number) => tt("{n, plural, =0 {No products} one {# product} other {# products}}", { n })

export function SizeChartsClient({ ready, targets, initialCharts }: { creatorId: string; ready: boolean; rules?: boolean; targets?: SizeChartTargets; initialCharts: SavedSizeChart[] }) {
  const router = useRouter()
  /* The charts as a chart's page saved them, laid over the ones the router kept (./list-return). */
  const [list, setList] = React.useState(() => sizeChartsReturn.peek()?.charts ?? initialCharts)
  const [seen, setSeen] = React.useState(initialCharts)
  if (seen !== initialCharts) {
    setSeen(initialCharts)
    setList(initialCharts)
  }
  const [notice, say] = usePill()
  const sectionRef = React.useRef<HTMLElement>(null)
  const [returning] = React.useState(() => sizeChartsReturn.isReturning())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  React.useEffect(() => {
    const back = sizeChartsReturn.take()
    if (!back) return
    if (back.message) say(back.message)
    if (back.charts || back.deleted) router.refresh()
    if (back.id && !back.deleted) tintReturnedRow(sectionRef.current, back.id, LAYER_LEAVE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the list lands
  }, [])
  const warmed = React.useRef(new Set<string>())
  const warm = (href: string) => {
    if (warmed.current.has(href)) return
    warmed.current.add(href)
    prefetchAppPage(router, href)
  }
  /* A chart opens on its own page, rising over the list on a phone. */
  const start = (chart: SavedSizeChart | null) => sizeChartsReturn.open(router, chart ? sizeChartHref(chart.id) : newSizeChartHref())

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />
      <PaneBar width={PAGE_WIDTH} className={cn(LIST_BAR, PAGE_BAR, PAGE_GUTTER)}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">{tt("Size charts")}</h1>
        {ready && list.length > 0 ? (
          <button type="button" data-new-size-chart="" className={NEW_LOOK} onPointerEnter={() => warm(newSizeChartHref())} onClick={() => start(null)}>
            {tt("New size chart")}
          </button>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-2 md:pb-8", PAGE_WIDTH, GUTTER, PAGE_GUTTER)}>
        <section ref={sectionRef} aria-label={tt("Size charts")} data-size-charts-card="" className="relative mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2 lg:mt-[9px]">
          {!ready ? (
            <div data-not-ready="" className="flex flex-col items-center px-6 py-16 text-center md:py-14">
              <p className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Size charts are almost here")}</p>
              <p className="mt-1 max-w-[380px] text-[14px] leading-5 text-[#6b7280]">{tt("They need a database update (SQL part 283) before they can be used.")}</p>
            </div>
          ) : list.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-16 text-center md:py-14 lg:py-[62px]">
              <p className="text-[16px] font-semibold text-[#1a1a2e] md:text-[15px] lg:text-[16.5px]">{tt("No size charts yet")}</p>
              <p className="mt-1 max-w-[360px] text-[14px] leading-5 text-[#6b7280] md:text-[13px] lg:max-w-[392px] lg:text-[14.5px]">
                {tt("Write a table of measurements once, like Tees or Jeans, and show it on every product it fits. Buyers open it from Size guide.")}
              </p>
              <button type="button" onClick={() => start(null)} className={cn(NEW_LOOK, "mt-5 max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
                {tt("Create size chart")}
              </button>
            </div>
          ) : (
            <>
              <ul aria-label={tt("Size charts")} data-list="" className="md:hidden">
                {list.map((c) => (
                  <li key={c.id} data-row={c.id} className="relative flex h-16 items-center gap-3 px-4 data-[pressed]:bg-[#eef0f2] [li+&]:before:absolute [li+&]:before:left-4 [li+&]:before:right-0 [li+&]:before:top-0 [li+&]:before:h-px [li+&]:before:bg-[#eceef1]">
                    <button type="button" data-row-open="" aria-label={c.name} onClick={() => start(c)} onPointerDown={() => warm(sizeChartHref(c.id))} {...pressMark} className="absolute inset-0 z-0 cursor-pointer outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" />
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium leading-[18px] tracking-[-0.01em] text-[#1a1a2e]">{c.name}</span>
                      <span className="mt-1 block h-4 truncate text-[12px] leading-4 text-[#6b7280]">
                        {measures(c)}
                        <Sep />
                        <span className="tabular-nums">{productsWord(c.productCount)}</span>
                        {alsoOn(c, targets) ? (
                          <>
                            <Sep />
                            {alsoOn(c, targets)}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table lg:text-[14.5px]">
                <thead>
                  <tr className="h-9 text-left text-[12px] text-[#6b7280] lg:h-[40px] lg:text-[13.5px] xl:h-[44px]">
                    <th scope="col" className="border-b border-[#eef0f2] pl-4 pr-3 font-medium lg:pl-[18px] lg:pr-[13px] xl:pl-[22px]">{tt("Size chart")}</th>
                    <th scope="col" className="hidden w-[38%] border-b border-[#eef0f2] px-3 font-medium lg:table-cell lg:px-[13px]">{tt("Measures")}</th>
                    <th scope="col" className="w-[104px] border-b border-[#eef0f2] px-3 text-right font-medium lg:w-[124px] lg:px-[13px]">{tt("Sizes")}</th>
                    <th scope="col" className="w-[120px] border-b border-[#eef0f2] pl-3 pr-4 text-right font-medium lg:w-[140px] lg:pl-[13px] lg:pr-[18px] xl:pr-[22px]">{tt("Products")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr
                      key={c.id}
                      data-row={c.id}
                      onMouseEnter={() => warm(sizeChartHref(c.id))}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return
                        start(c)
                      }}
                      className="group h-14 cursor-pointer lg:h-[62px] [tr+&>td]:border-t [tr+&>td]:border-[#f1f2f4]"
                    >
                      <td className="bg-white pl-4 pr-3 group-hover:bg-[#fafafb] lg:pl-[18px] lg:pr-[13px] xl:pl-[22px]">
                        <button type="button" onClick={() => start(c)} className="block min-w-0 max-w-full cursor-pointer truncate text-left text-[13px] font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline lg:text-[14.5px]">
                          {c.name}
                        </button>
                      </td>
                      <td className="hidden truncate bg-white px-3 text-[#4b5563] group-hover:bg-[#fafafb] lg:table-cell lg:px-[13px]">
                        {measures(c)}
                        {alsoOn(c, targets) ? <span className="block truncate text-[12px] text-[#6b7280] lg:text-[13px]">{alsoOn(c, targets)}</span> : null}
                      </td>
                      <td className="whitespace-nowrap bg-white px-3 text-right tabular-nums text-[#4b5563] group-hover:bg-[#fafafb] lg:px-[13px]">{c.rows.length.toLocaleString(appLocale())}</td>
                      <td className="whitespace-nowrap bg-white pl-3 pr-4 text-right tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb] lg:pl-[13px] lg:pr-[18px] xl:pr-[22px]">{c.productCount.toLocaleString(appLocale())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div data-footer="" className="hidden h-10 items-center justify-between border-t border-[#eef0f2] px-4 md:flex lg:h-[44px] lg:px-[18px] xl:h-[48px] xl:px-[22px]">
                <span className="text-[12px] tabular-nums text-[#6b7280] lg:text-[13.5px]">{tt("{n, plural, one {# size chart} other {# size charts}}", { n: list.length })}</span>
                <span className="text-[12px] text-[#6b7280] lg:text-[13.5px]">{sizesWord(list.reduce((n, c) => n + c.rows.length, 0))}</span>
              </div>
            </>
          )}
        </section>
        <p className="mt-3 px-1 text-[13px] leading-5 text-[#6b7280]">
          {tt("Give a product its chart in the product editor, under Size chart, or set a chart for whole collections and categories here.")}{" "}
          <a href="/help/physical-products/set-up-size-charts" target="_blank" rel="noreferrer" className="font-medium text-[#4b5563] underline underline-offset-2 hover:text-[#1a1a2e]">
            {tt("How size charts work")}
          </a>
        </p>
      </div>

    </div>
  )
}

/** The middle dot between the parts of a phone row's second line. */
function Sep() {
  return (
    <span aria-hidden className="mx-1.5 text-[#c4c8ce]">
      &middot;
    </span>
  )
}

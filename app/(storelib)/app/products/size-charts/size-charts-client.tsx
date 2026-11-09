"use client"

/**
 * ===========================================================================
 *  PRODUCTS › SIZE CHARTS
 * ===========================================================================
 * Every size chart the store keeps, drawn the way Coupons draws its list
 * (../../coupons/coupons-client.tsx), so the two read as one family: the
 * pane's bar with the title and New size chart, then one card whose toolbar
 * holds the views (All, In use, Not in use, with counts). A computer gets a
 * table with an Edit button and a row menu; a phone gets a list of
 * whole-row presses, each with the same menu (a bottom sheet there).
 *
 * A row says what the chart measures, how many sizes it has and how many
 * products use it; the whole row opens it on a page of its own
 * (./size-chart-page.tsx, at /app/products/size-charts/<id>). The menu
 * edits, duplicates (a copy saved through POST /api/size-charts, without the
 * collections and categories, which stay with the first chart) or deletes,
 * asking first, as the chart's page does. Coming back from a chart, the list
 * says what was done and tints the row (./list-return).
 *
 * A product gets its chart in the product editor, under Size chart; the
 * help article "Set up size charts" walks through both.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonSecondary, card } from "../../orders/order-parts"
import { Pill, inkDepth, usePill } from "../../coupons/coupon-parts"
import { pressMark } from "@/lib/press-mark"
import { api } from "@/components/physical/ui"
import type { SavedSizeChart, SizeChartTargets } from "@/components/physical/size-chart-editor"
import { SIZE_CHART_LIMITS } from "@/lib/size-charts/model"
import { LAYER_LEAVE_MS } from "@/components/app/page-layer"
import { tintReturnedRow } from "@/components/app/list-return"
import { holdLanding, prefetchAppPage } from "@/lib/ui/app-navigation"
import { whenIdle } from "../list-return"
import { newSizeChartHref, sizeChartHref, sizeChartInUse, sizeChartsReturn } from "./list-return"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

type View = "all" | "used" | "unused"

const VIEWS: { value: View; label: string }[] = [
  { value: "all", get label() { return tt("All") } },
  { value: "used", get label() { return tt("In use") } },
  { value: "unused", get label() { return tt("Not in use") } },
]

/** In use: a product has it, or it is set for a collection or a category. */
const inUse = sizeChartInUse

/** New size chart: the Coupons button, near black, a thumb's size on a phone. */
const NEW_BUTTON = cn(inkDepth, "h-8 rounded-lg px-3 text-[13px] font-medium max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]")

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

/**
 * WHERE THE LIST WAS LEFT: the view, kept for the tab (never stored) and
 * taken up again only on a return from a chart, as Coupons does. A fresh
 * visit starts at All.
 */
let leftAt: View | null = null

export function SizeChartsClient({ ready, rules, targets, initialCharts }: { creatorId: string; ready: boolean; rules?: boolean; targets?: SizeChartTargets; initialCharts: SavedSizeChart[] }) {
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
  const [view, setView] = React.useState<View>(() => (returning && leftAt ? leftAt : "all"))
  React.useEffect(() => {
    leftAt = view
  }, [view])
  const [confirmDelete, setConfirmDelete] = React.useState<SavedSizeChart | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [duplicating, setDuplicating] = React.useState(false)
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
  /* A link's press opens it the same way; one with a modifier key, or not the main button, is left to the link. */
  const openFromLink = (chart: SavedSizeChart | null) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    start(chart)
  }

  const counts = React.useMemo(() => {
    const used = list.filter(inUse).length
    return { all: list.length, used, unused: list.length - used } satisfies Record<View, number>
  }, [list])
  const shown = view === "all" ? list : list.filter((c) => (view === "used" ? inUse(c) : !inUse(c)))

  /* Once the list has drawn and the browser is idle, New size chart and the first three rows, as Coupons does: on a phone there is no hover to start them. */
  const firstShown = React.useRef<string[]>([])
  firstShown.current = shown.slice(0, 3).map((c) => c.id)
  React.useEffect(
    () =>
      whenIdle(() => {
        warm(newSizeChartHref())
        for (const id of firstShown.current) warm(sizeChartHref(id))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit, with the rows shown when the browser is idle
    [],
  )

  // ── Actions ─────────────────────────────────────────────────────────────

  /* A copy of the table, its notes and picture, saved as a new chart. Where the chart is used stays with the first one. */
  const duplicate = async (c: SavedSizeChart) => {
    if (duplicating) return
    setDuplicating(true)
    const name = tt("{name} copy", { name: c.name }).slice(0, SIZE_CHART_LIMITS.name)
    const body = { ...(rules ? { collectionIds: [], categories: [] } : {}), name, unit: c.unit, columns: c.columns, rows: c.rows, notes: c.notes, imageUrl: c.imageUrl }
    const res = await api<{ id: string; charts: SavedSizeChart[] }>("/api/size-charts", { method: "POST", body })
    setDuplicating(false)
    if (!res.ok) return say(res.error, "error")
    if (res.data.charts) setList(res.data.charts)
    say(tt("{name} duplicated", { name: c.name }))
    /* The copy's row, tinted once it has drawn. */
    if (res.data.id) window.requestAnimationFrame(() => tintReturnedRow(sectionRef.current, res.data.id, 0))
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await api<{ charts: SavedSizeChart[] }>(`/api/size-charts/${confirmDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) return say(res.error, "error")
    setList((prev) => res.data.charts ?? prev.filter((c) => c.id !== confirmDelete.id))
    say(tt("{name} deleted", { name: confirmDelete.name }))
    setConfirmDelete(null)
    router.refresh()
  }

  const actionsFor = (c: SavedSizeChart) => [
    { label: tt("Edit"), onClick: () => start(c) },
    { label: tt("Duplicate"), onClick: () => void duplicate(c), disabled: duplicating },
    { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirmDelete(c) },
  ]

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />

      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Size charts")}</h1>
        {ready ? (
          <Link href={newSizeChartHref()} data-new-size-chart="" onClick={openFromLink(null)} onMouseEnter={() => warm(newSizeChartHref())} onTouchStart={() => warm(newSizeChartHref())} className={NEW_BUTTON}>
            <Plus className="h-[18px] w-[18px] md:h-4 md:w-4" />
            {tt("New size chart")}
          </Link>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <section ref={sectionRef} aria-label={tt("Size charts")} data-size-charts-card="" className={cn(card, "mt-3 overflow-hidden")}>
          {!ready ? (
            <div data-not-ready="" className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Size charts are almost here")}</p>
              <p className="mt-1 max-w-[340px] text-[14px] text-[#6b7280] md:text-[13px]">{tt("They need a database update (SQL part 283) before they can be used.")}</p>
            </div>
          ) : (
            <>
              <div className="flex h-[52px] items-center border-b border-[#eef0f2] px-2 md:h-12">
                <div role="tablist" aria-label={tt("Views")} className="orders-strip -my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2">
                  {VIEWS.map((option) => {
                    const selected = view === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setView(option.value)}
                        className={cn(
                          "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
                          selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
                        )}
                      >
                        {option.label}
                        <span className="tabular-nums text-[#9ca3af]">{counts[option.value]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {shown.length > 0 ? (
                <>
                  {/* A PHONE: one row per chart, the whole row a press. */}
                  <ul aria-label={tt("Size charts")} data-list="" className="divide-y divide-[#f1f2f4] md:hidden">
                    {shown.map((c) => {
                      const also = alsoOn(c, targets)
                      return (
                        <li key={c.id} data-row={c.id} className="relative flex min-h-[76px] items-center gap-3 py-3 pl-4 pr-1.5 data-[pressed]:bg-[#f6f7f8]">
                          <Link
                            href={sizeChartHref(c.id)}
                            data-row-open=""
                            aria-label={c.name}
                            onTouchStart={() => warm(sizeChartHref(c.id))}
                            onClick={openFromLink(c)}
                            {...pressMark}
                            className="absolute inset-0 z-0 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#111113]"
                          />
                          <span className="pointer-events-none min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold text-[#1a1a2e]">{c.name}</span>
                              <StatusBadge tone={inUse(c) ? "success" : "neutral"} className="shrink-0">
                                {inUse(c) ? tt("In use") : tt("Not in use")}
                              </StatusBadge>
                            </span>
                            <span className="mt-1 block truncate text-[13px] leading-5 text-[#6b7280]">
                              <span className="tabular-nums text-[#1a1a2e]">{productsWord(c.productCount)}</span>
                              {" · "}
                              {sizesWord(c.rows.length)}
                              {" · "}
                              {measures(c)}
                              {also ? ` · ${also}` : ""}
                            </span>
                          </span>
                          <ResponsiveActionMenu
                            title={c.name}
                            align="end"
                            trigger={<RowMenuButton label={tt("Actions for {name}", { name: c.name })} className="relative z-[1] h-11 w-11 rounded-xl" />}
                            items={actionsFor(c)}
                          />
                        </li>
                      )
                    })}
                  </ul>

                  {/* A COMPUTER: the table. */}
                  <table className="hidden w-full border-collapse md:table">
                    <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                      <tr>
                        <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Size chart")}</th>
                        <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Status")}</th>
                        <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Measures")}</th>
                        <th className="h-9 px-3 text-right text-[12px] font-medium text-[#4b5563]">{tt("Sizes")}</th>
                        <th className="h-9 px-3 text-right text-[12px] font-medium text-[#4b5563]">{tt("Products")}</th>
                        <th className="h-9 w-[112px] px-3" aria-label={tt("Actions")} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f2f4]">
                      {shown.map((c) => {
                        const also = alsoOn(c, targets)
                        return (
                          <tr
                            key={c.id}
                            data-row={c.id}
                            className="group cursor-pointer hover:bg-[#fafbfb]"
                            onMouseEnter={() => warm(sizeChartHref(c.id))}
                            onClick={(e) => {
                              /* The whole row opens it, except a press inside its own controls or one that bubbled up from its menu's portal. */
                              const target = e.target as HTMLElement
                              if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
                              start(c)
                            }}
                          >
                            <td className="h-14 max-w-[280px] px-3">
                              <Link href={sizeChartHref(c.id)} onClick={openFromLink(c)} className="block truncate text-[13px] font-semibold text-[#1a1a2e] hover:underline">
                                {c.name}
                              </Link>
                            </td>
                            <td className="h-14 whitespace-nowrap px-3">
                              <StatusBadge tone={inUse(c) ? "success" : "neutral"}>{inUse(c) ? tt("In use") : tt("Not in use")}</StatusBadge>
                            </td>
                            <td className="h-14 max-w-[300px] px-3 text-[13px] text-[#4b5563]">
                              <span className="block truncate">{measures(c)}</span>
                              {also ? <span className="block truncate text-[12px] text-[#6b7280]">{also}</span> : null}
                            </td>
                            <td className="h-14 whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-[#1a1a2e]">{c.rows.length.toLocaleString(appLocale())}</td>
                            <td className="h-14 whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-[#1a1a2e]">{c.productCount.toLocaleString(appLocale())}</td>
                            <td className="h-14 whitespace-nowrap px-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={sizeChartHref(c.id)} onClick={openFromLink(c)} className={buttonSecondary}>
                                  {tt("Edit")}
                                </Link>
                                <ResponsiveActionMenu title={c.name} align="end" trigger={<RowMenuButton label={tt("Actions for {name}", { name: c.name })} />} items={actionsFor(c)} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              ) : (
                <div data-empty="" className="flex flex-col items-center px-6 py-14 text-center">
                  <p className="text-[15px] font-semibold text-[#1a1a2e]">{list.length === 0 ? tt("No size charts yet") : view === "used" ? tt("No size charts in use") : tt("Every size chart is in use")}</p>
                  <p className="mt-1 max-w-[340px] text-[14px] text-[#6b7280] md:text-[13px]">
                    {list.length === 0
                      ? tt("Write a table of measurements once, like Tees or Jeans, and show it on every product it fits. Buyers open it from Size guide.")
                      : tt("A chart is in use once a product, a collection or a category has it.")}
                  </p>
                  {list.length === 0 ? (
                    <Link href={newSizeChartHref()} onClick={openFromLink(null)} onMouseEnter={() => warm(newSizeChartHref())} onTouchStart={() => warm(newSizeChartHref())} className={cn(NEW_BUTTON, "mt-4")}>
                      <Plus className="h-[18px] w-[18px] md:h-4 md:w-4" />
                      {tt("Create size chart")}
                    </Link>
                  ) : null}
                </div>
              )}
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

      {/* Delete confirm, asked as Coupons asks it. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="delete-size-chart-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="delete-size-chart-title" className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Delete {name}?", { name: confirmDelete.name })}</h3>
            <p className="mt-1.5 text-[14px] text-[#6b7280]">
              {confirmDelete.productCount > 0
                ? tt("{n, plural, one {# product loses this chart.} other {# products lose this chart.}}", { n: confirmDelete.productCount })
                : tt("No product uses this chart.")}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
                {tt("Keep it")}
              </button>
              <button
                type="button"
                data-size-chart-delete=""
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:opacity-50 sm:h-10 sm:text-[14px]"
              >
                {deleting ? tt("Deleting") : tt("Delete chart")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

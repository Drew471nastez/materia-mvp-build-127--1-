"use client"

/**
 * ===========================================================================
 *  PRODUCTS › UPSELLS AND BUNDLES
 * ===========================================================================
 * The store's offers (lib/offers), drawn the way Coupons and Collections are
 * (../coupons/coupons-client.tsx, ../products/collections): the same bar,
 * column, gutters and white card; the views as tabs with their counts and a
 * search in the card's toolbar; on a phone one row per offer, the whole row
 * one press into it; from 768px a light table with what each one is, its
 * discount, where it shows and where it stands. The page arrives with its
 * rows (./page.tsx reads them on the server), so it lands whole.
 *
 *   Bundle          two to five products bought together, for less
 *   Upsell          one product suggested on a product page, in the cart or
 *                   at the checkout, when the cart qualifies
 *   Quantity break  buy more of one product (or of a collection's), pay less
 *                   per unit, or get some free
 *
 * The order of the list is the order bundles and upsells apply in: a unit
 * already in an earlier one is never discounted again, so Move up and Move
 * down decide; a unit a quantity break also wants goes to whichever saves
 * more on it. Sold is counted, not guessed: the units of paid order lines
 * in the last 90 days that the offer saved on or that a theme added through
 * it (lib/offers/offers-server soldThrough).
 *
 * Round 60: New offer asks the kind in a small modal over this list, Add
 * product's shell (./offer-kind-chooser.tsx): a dialog from 768px, the
 * shared bottom sheet on a phone. The pick goes to the offer's own page,
 * /app/offers/new?kind=, and a row opens /app/offers/<id> (./offer-editor.tsx),
 * a layer rising over this list on a phone (./list-return). A save or a
 * delete there comes back here, laid over the rows, said in the pill, and
 * the row is tinted. /app/offers?choose=1 (where /app/offers/new with no
 * kind goes) lands with the modal open.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { accentDepth, secondaryDepth } from "@/components/ui/depth-button"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { pressMark } from "@/lib/press-mark"
import { offerState, type Offer, type OfferKind, type OfferState } from "@/lib/offers/offers"
import { GUTTER, LIST_BAR, PaneBar, RowMenuButton, StatusBadge } from "../orders/order-parts"
import { useConfirm } from "../products/new/confirm-sheet"
import { Pill, usePill } from "../coupons/coupon-parts"
import { LAYER_LEAVE_MS } from "@/components/app/page-layer"
import { rowsWithReturn, tintReturnedRow } from "@/components/app/list-return"
import { holdLanding, prefetchAppPage } from "@/lib/ui/app-navigation"
import { whenIdle } from "../products/list-return"
import { sendOffer as send } from "./offer-api"
import { OFFERS_HREF, newOfferHref, offerHref, offersReturn } from "./list-return"
import { useNewOfferChooser } from "./offer-kind-chooser"
import { KIND_WORD, OfferThumbs, STATE_TONE, STATE_WORD, contentsText, datesText, discountText, placesText, type OfferCollection, type OfferProduct } from "./offer-parts"

/* The products page's own measures, as Collections takes them, so the three pages are one place. */
const BAR_BUTTON_SIZE = "lg:h-[35px] lg:px-[13px] lg:text-[14.5px]"
const PAGE_WIDTH = "max-w-[1200px] lg:max-w-[1323px]"
const PAGE_GUTTER = "lg:px-[35px]"
const PAGE_BAR = "lg:min-h-[73px] lg:pb-[9px] lg:pt-[15px]"
const PRESS = "relative max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']"
/** New offer: the products page's violet New product, the one violet button here. */
const NEW_LOOK = cn(accentDepth, PRESS, "h-8 gap-1.5 rounded-lg px-3 text-[13px]", BAR_BUTTON_SIZE)

type View = "all" | "active" | "scheduled" | "off"
const VIEWS: { value: View; label: () => string }[] = [
  { value: "all", label: () => tt("All") },
  { value: "active", label: () => tt("Active") },
  { value: "scheduled", label: () => tt("Scheduled") },
  { value: "off", label: () => tt("Off") },
]
const viewOf = (s: OfferState): Exclude<View, "all"> => (s === "active" ? "active" : s === "scheduled" ? "scheduled" : "off")

/** The view the list was left on, taken up again only on a way back from an offer (./list-return isReturning). Kept for the tab, never stored. */
let leftAt: View | null = null

export function OffersClient({
  initialOffers,
  products,
  collections,
  currency,
  ready,
  sold,
  choose = false,
}: {
  initialOffers: Offer[]
  products: OfferProduct[]
  collections: OfferCollection[]
  currency: string
  /** SQL part 116 has run. */
  ready: boolean
  /** SQL part 230 has run (read by the offer's page; the list does not need it). */
  settingsReady?: boolean
  /** SQL part 304 has run (read by the offer's page). */
  breaksReady?: boolean
  /** Units each offer sold in the last 90 days, by its id. */
  sold: Record<string, number>
  /** Physical commerce is on (the offer page offers free shipping); the list does not need it. */
  physical?: boolean
  /** Land with the kind chooser open (the address was /app/offers/new with no kind). */
  choose?: boolean
}) {
  const router = useRouter()
  /* A save or a delete on an offer's page, laid over the rows the router kept (./list-return). */
  const [list, setList] = React.useState(() => rowsWithReturn(initialOffers, offersReturn.peek()))
  /* The server's list again (a refresh: a change of the store's currency converts fixed amounts): it is the truth from here, as Coupons does. */
  const [seen, setSeen] = React.useState(initialOffers)
  if (seen !== initialOffers) {
    setSeen(initialOffers)
    setList(initialOffers)
  }
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const [notice, say] = usePill()
  const [ask, confirmSheet] = useConfirm()
  const sectionRef = React.useRef<HTMLElement>(null)
  /* Back to the list is the list as it was, with no landing (the Coupons list's reason). */
  const [returning] = React.useState(() => offersReturn.isReturning())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  const [view, setView] = React.useState<View>(() => (returning && leftAt ? leftAt : "all"))
  React.useEffect(() => {
    leftAt = view
  }, [view])
  const [query, setQuery] = React.useState("")

  /* BACK FROM AN OFFER: say what happened, tint the row, and ask the server for the list again. */
  React.useEffect(() => {
    const back = offersReturn.take()
    if (!back) return
    if (back.message) say(back.message)
    if (back.saved || back.deleted) router.refresh()
    if (back.id && !back.deleted) tintReturnedRow(sectionRef.current, back.id, LAYER_LEAVE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the list comes back
  }, [])

  /* NEW OFFER: the kind, asked in a modal over this list (./offer-kind-chooser.tsx). */
  const { open: openChooser, warm: warmChooser, chooser } = useNewOfferChooser()
  React.useEffect(() => {
    if (!choose) return
    try {
      window.history.replaceState(window.history.state, "", OFFERS_HREF)
    } catch {
      /* The list still works on the address it had. */
    }
    openChooser()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page lands
  }, [])

  /* An offer's page, fetched whole when its row is hovered or touched, so the press finds it here. */
  const warmed = React.useRef(new Set<string>())
  const warm = (href: string) => {
    if (warmed.current.has(href)) return
    warmed.current.add(href)
    prefetchAppPage(router, href)
  }

  /* One clock for the render, so an offer does not change view between two rows. */
  const [now] = React.useState(() => new Date())
  const rows = React.useMemo(() => list.map((o) => ({ offer: o, state: offerState(o, now) })), [list, now])
  const counts = React.useMemo(() => {
    const out: Record<View, number> = { all: rows.length, active: 0, scheduled: 0, off: 0 }
    for (const r of rows) out[viewOf(r.state)]++
    return out
  }, [rows])
  const words = query.trim().toLowerCase()
  const shown = rows.filter((r) => (view === "all" || viewOf(r.state) === view) && (!words || r.offer.title.toLowerCase().includes(words) || r.offer.productIds.some((id) => byId.get(id)?.title.toLowerCase().includes(words))))

  /* Once the list has drawn and the browser is idle, the three new offer pages and the first rows: a phone has no hover to start them. */
  const firstShown = React.useRef<string[]>([])
  firstShown.current = shown.slice(0, 3).map((r) => r.offer.id)
  React.useEffect(
    () =>
      whenIdle(() => {
        warmChooser()
        for (const id of firstShown.current) warm(offerHref(id))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, after the first paint
    [],
  )

  /* OPENING AN OFFER: its own page; a new one with its kind named goes straight there, New offer asks first. */
  const start = (offer: Offer | null, kind?: OfferKind) => {
    if (!offer && !kind) return openChooser()
    offersReturn.open(router, offer ? offerHref(offer.id) : newOfferHref(kind))
  }

  const setActive = async (o: Offer, active: boolean) => {
    setList((l) => l.map((x) => (x.id === o.id ? { ...x, active } : x)))
    const r = await send("PUT", { ...o, active })
    if (r.ok === false) {
      setList((l) => l.map((x) => (x.id === o.id ? { ...x, active: o.active } : x)))
      return say((r as { error: string }).error, "error")
    }
    say(active ? tt("{title} is on", { title: o.title }) : tt("{title} is off", { title: o.title }))
  }

  const move = async (o: Offer, by: -1 | 1) => {
    const at = list.findIndex((x) => x.id === o.id)
    const to = at + by
    if (at < 0 || to < 0 || to >= list.length) return
    const next = [...list]
    next.splice(at, 1)
    next.splice(to, 0, o)
    const before = list
    setList(next)
    const r = await send("PATCH", { order: next.map((x) => x.id) })
    if (r.ok === false) {
      setList(before)
      say((r as { error: string }).error, "error")
    }
  }

  const remove = async (o: Offer) => {
    const yes = await ask({ title: tt("Delete {title}?", { title: o.title }), body: tt("It stops showing and applying at once. Orders already placed keep their discount. To stop it for now instead, turn it off."), confirm: tt("Delete"), cancel: tt("Keep it") })
    if (!yes) return
    const r = await send("DELETE", { id: o.id, title: o.title })
    if (r.ok === false) return say((r as { error: string }).error, "error")
    setList((l) => l.filter((x) => x.id !== o.id))
    say(tt("{title} deleted", { title: o.title }))
  }

  const actionsFor = (o: Offer, i: number) => [
    { label: tt("Edit"), onClick: () => start(o) },
    { label: o.active ? tt("Turn off") : tt("Turn on"), onClick: () => void setActive(o, !o.active) },
    /* The order they apply in: the first one only moves down, the last only up. */
    ...[
      ...(i > 0 ? [{ label: tt("Move up"), onClick: () => void move(o, -1) }] : []),
      ...(i >= 0 && i < list.length - 1 ? [{ label: tt("Move down"), onClick: () => void move(o, 1) }] : []),
    ].map((item, k) => (k === 0 ? { ...item, separatorBefore: true } : item)),
    { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => void remove(o) },
  ]
  const missingIn = (o: Offer) => o.productIds.some((id) => !byId.has(id)) || (o.kind === "quantity_break" && o.productIds.length === 0 && !collections.some((c) => c.id === o.triggerCollectionIds?.[0]))

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-offers="">
      <Pill notice={notice} />
      <PaneBar width={PAGE_WIDTH} className={cn(LIST_BAR, PAGE_BAR, PAGE_GUTTER)}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">{tt("Upsells and bundles")}</h1>
        {list.length > 0 && ready ? (
          <button type="button" data-offer-new="" className={NEW_LOOK} onClick={() => start(null)} onPointerEnter={warmChooser} onFocus={warmChooser}>
            <Plus aria-hidden className="h-4 w-4" />
            {tt("New offer")}
          </button>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", PAGE_WIDTH, GUTTER, PAGE_GUTTER)}>
        {!ready ? (
          <p data-sql-needed="" className="mb-3 mt-1 rounded-xl bg-[#fff8e6] px-4 py-3 text-[14px] leading-5 text-[#5c4300] md:text-[13px]">
            {tt("Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql). Run it in Supabase and come back.")}
          </p>
        ) : null}

        <section ref={sectionRef} aria-label={tt("Upsells and bundles")} data-offers-card="" className="relative mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2 lg:mt-[9px]">
          {list.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-16 text-center md:py-14 lg:py-[62px]">
              <p className="text-[16px] font-semibold text-[#1a1a2e] md:text-[15px] lg:text-[16.5px]">{tt("No offers yet")}</p>
              <p className="mt-1 max-w-[360px] text-[14px] leading-5 text-[#6b7280] md:text-[13px] lg:text-[14.5px]">{tt("Sell two or more products together for less, or suggest one more thing before someone pays.")}</p>
              {ready ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" data-offer-create="bundle" onClick={() => start(null, "bundle")} className={cn(NEW_LOOK, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
                    {tt("Create bundle")}
                  </button>
                  <button type="button" data-offer-create="checkout" onClick={() => start(null, "checkout")} className={cn(secondaryDepth, PRESS, "h-8 rounded-lg px-3 text-[13px] max-md:h-10 max-md:px-4 max-md:text-[14px]", BAR_BUTTON_SIZE)}>
                    {tt("Create upsell")}
                  </button>
                  <button type="button" data-offer-create="quantity_break" onClick={() => start(null, "quantity_break")} className={cn(secondaryDepth, PRESS, "h-8 rounded-lg px-3 text-[13px] max-md:h-10 max-md:px-4 max-md:text-[14px]", BAR_BUTTON_SIZE)}>
                    {tt("Create quantity break")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-[#eef0f2] px-2 py-2 md:h-12 md:flex-row md:items-center md:py-0">
                <div role="tablist" aria-label={tt("Views")} className="orders-strip -my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2">
                  {VIEWS.map((option) => {
                    const selected = view === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        data-view={option.value}
                        onClick={() => setView(option.value)}
                        className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]", selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]")}
                      >
                        {option.label()}
                        <span className="tabular-nums text-[#9ca3af]">{counts[option.value]}</span>
                      </button>
                    )
                  })}
                </div>
                <label className="relative block md:w-[240px]">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search offers")} aria-label={tt("Search offers")} data-offer-search="" className="h-10 w-full rounded-[10px] border border-[#e3e5e8] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] md:h-8 md:rounded-lg md:text-[13px] [&::-webkit-search-cancel-button]:hidden" />
                </label>
              </div>

              {shown.length === 0 ? (
                <p className="px-6 py-12 text-center text-[14px] text-[#6b7280] md:text-[13px]">{words ? tt("No offer matches that.") : tt("Nothing here right now.")}</p>
              ) : (
                <>
                  {/* A PHONE: one row per offer, the whole row the press, its menu at the end. */}
                  <ul aria-label={tt("Upsells and bundles")} data-list="" className="md:hidden">
                    {shown.map(({ offer: o, state }) => {
                      const dates = datesText(o, state)
                      const i = list.indexOf(o)
                      return (
                        <li key={o.id} data-row={o.id} className="relative flex min-h-[72px] items-center gap-3 py-2.5 pl-3 pr-1.5 data-[pressed]:bg-[#eef0f2] [li+&]:before:absolute [li+&]:before:left-[64px] [li+&]:before:right-0 [li+&]:before:top-0 [li+&]:before:h-px [li+&]:before:bg-[#eceef1]">
                          <button type="button" data-row-open="" aria-label={o.title} onClick={() => start(o)} onPointerDown={() => warm(offerHref(o.id))} {...pressMark} className="absolute inset-0 z-0 cursor-pointer outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" />
                          <OfferThumbs offer={o} byId={byId} />
                          <span className="pointer-events-none min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-medium leading-[18px] text-[#1a1a2e]">{o.title}</span>
                              {state !== "active" ? <StatusBadge tone={STATE_TONE[state]}>{STATE_WORD[state]()}</StatusBadge> : null}
                            </span>
                            <span className="mt-1 block truncate text-[12.5px] leading-4 text-[#6b7280]">
                              {KIND_WORD[o.kind]()} · <span className="text-[#1a1a2e]">{discountText(o, currency)}</span> · {contentsText(o, byId, collections)}
                              {sold[o.id] ? ` · ${tt("{n} sold", { n: sold[o.id] })}` : ""}
                              {dates ? ` · ${dates}` : ""}
                            </span>
                            {missingIn(o) ? <span className="mt-0.5 block text-[12px] text-[#92400e]">{tt("A product in it was deleted. Edit it to fix.")}</span> : null}
                          </span>
                          <ResponsiveActionMenu title={o.title} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title: o.title })} className="relative z-[1] h-11 w-11 rounded-xl" />} items={actionsFor(o, i)} />
                        </li>
                      )
                    })}
                  </ul>

                  {/* A COMPUTER: the table. The whole row opens it. */}
                  <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table lg:text-[14px]">
                    <thead>
                      <tr className="h-9 text-left text-[12px] text-[#6b7280] lg:h-[40px] lg:text-[13px]">
                        <th scope="col" className="border-b border-[#eef0f2] pl-4 pr-3 font-medium lg:pl-[18px]">{tt("Offer")}</th>
                        <th scope="col" className="w-[124px] border-b border-[#eef0f2] px-3 font-medium">{tt("Type")}</th>
                        <th scope="col" className="w-[140px] border-b border-[#eef0f2] px-3 font-medium">{tt("Discount")}</th>
                        <th scope="col" className="w-[116px] whitespace-nowrap border-b border-[#eef0f2] px-3 text-right font-medium" title={tt("Units sold through it in the last 90 days")}>{tt("Sold, 90 days")}</th>
                        <th scope="col" className="hidden w-[24%] border-b border-[#eef0f2] px-3 font-medium lg:table-cell">{tt("Shown on")}</th>
                        <th scope="col" className="w-[132px] border-b border-[#eef0f2] px-3 font-medium">{tt("Status")}</th>
                        <th scope="col" className="w-[56px] border-b border-[#eef0f2] pr-3" aria-label={tt("Actions")} />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(({ offer: o, state }) => {
                        const dates = datesText(o, state)
                        const i = list.indexOf(o)
                        return (
                          <tr
                            key={o.id}
                            data-row={o.id}
                            onMouseEnter={() => warm(offerHref(o.id))}
                            onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
                              start(o)
                            }}
                            className="group h-14 cursor-pointer lg:h-[62px] [tr+&>td]:border-t [tr+&>td]:border-[#f1f2f4]"
                          >
                            <td className="bg-white pl-4 pr-3 group-hover:bg-[#fafafb] lg:pl-[18px]">
                              <div className="flex min-w-0 items-center gap-3">
                                <OfferThumbs offer={o} byId={byId} />
                                <span className="min-w-0">
                                  <button type="button" onClick={() => start(o)} className="block max-w-full cursor-pointer truncate text-left font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline">
                                    {o.title}
                                  </button>
                                  <span className="block truncate text-[12px] text-[#6b7280] lg:text-[12.5px]">{missingIn(o) ? <span className="text-[#92400e]">{tt("A product in it was deleted. Edit it to fix.")}</span> : contentsText(o, byId, collections)}</span>
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap bg-white px-3 text-[#4b5563] group-hover:bg-[#fafafb]">{KIND_WORD[o.kind]()}</td>
                            <td className="truncate whitespace-nowrap bg-white px-3 text-[#1a1a2e] group-hover:bg-[#fafafb]">{discountText(o, currency)}</td>
                            <td data-offer-sold={sold[o.id] ?? 0} className="whitespace-nowrap bg-white px-3 text-right tabular-nums text-[#4b5563] group-hover:bg-[#fafafb]">{sold[o.id] ?? 0}</td>
                            <td className="hidden truncate bg-white px-3 text-[#4b5563] group-hover:bg-[#fafafb] lg:table-cell">{placesText(o)}</td>
                            <td className="bg-white px-3 group-hover:bg-[#fafafb]">
                              <span className="flex flex-col items-start gap-0.5">
                                <StatusBadge tone={STATE_TONE[state]}>{STATE_WORD[state]()}</StatusBadge>
                                {dates ? <span className="truncate text-[11.5px] text-[#6b7280]">{dates}</span> : null}
                              </span>
                            </td>
                            <td className="bg-white pr-3 text-right group-hover:bg-[#fafafb]">
                              <ResponsiveActionMenu title={o.title} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title: o.title })} />} items={actionsFor(o, i)} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )}
              <div data-footer="" className="hidden h-10 items-center border-t border-[#eef0f2] px-4 md:flex lg:h-[44px] lg:px-[18px]">
                <span className="text-[12px] tabular-nums text-[#6b7280] lg:text-[13px]">{tt("{n, plural, one {# offer} other {# offers}}", { n: list.length })}</span>
              </div>
            </>
          )}
        </section>
      </div>

      {chooser}
      {confirmSheet}
    </div>
  )
}

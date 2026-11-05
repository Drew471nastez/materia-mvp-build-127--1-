"use client"

import { couponMoney } from "./coupon-money"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { LAYER_LEAVE_MS } from "@/components/app/page-layer"
import { tintReturnedRow } from "@/components/app/list-return"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { COUPON_STATE_LABEL, couponState, type CouponState } from "@/lib/checkout/coupon-state"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonSecondary, card } from "../orders/order-parts"
import { withReturn } from "./coupon-form"
import { Pill, inkDepth, usePill } from "./coupon-parts"
import { isReturning, openCoupon, peekReturn, takeReturn } from "./list-return"
import { holdLanding } from "@/lib/ui/app-navigation"
import { pressMark } from "@/lib/press-mark"
import { whenIdle } from "../products/list-return"
import { tt } from "@/lib/i18n/text"
import { useStoreCurrencyIfSet } from "@/lib/store/currency-context"
import { appLocale, zoned } from "@/lib/i18n/format"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string
  creator_id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  product_ids: string[] | null
  usage_limit: number | null
  usage_count: number
  starts_at: string | null
  expires_at: string | null
  min_purchase_cents?: number | null
  is_active: boolean
  created_at: string
}

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url: string | null
  status: string
}

interface CouponsClientProps {
  creatorId: string
  initialCoupons: Coupon[]
  products: Product[]
  /** The store's currency: a fixed amount and a minimum are in it. */
  currency?: string
}

type View = "all" | "active" | "scheduled" | "ended"

const VIEWS: { value: View; label: string }[] = [
  { value: "all", get label() { return tt("All") } },
  { value: "active", get label() { return tt("Active") } },
  { value: "scheduled", get label() { return tt("Scheduled") } },
  { value: "ended", get label() { return tt("Ended") } },
]

/** Which view a code is listed under. Ended is expired, used up or turned off. */
const viewOf = (state: CouponState): Exclude<View, "all"> =>
  state === "active" ? "active" : state === "scheduled" ? "scheduled" : "ended"

const TONE: Record<CouponState, "success" | "neutral" | "attention"> = {
  active: "success",
  scheduled: "neutral",
  expired: "neutral",
  used_up: "neutral",
  off: "neutral",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


function discountText(c: Coupon, money: (n: number) => string) {
  return c.discount_type === "percentage" ? tt("{count}% off", { count: Number(c.discount_value) }) : tt("{amount} off", { amount: money(c.discount_value) })
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))

/** The line of dates a code has, if it has any: when it starts or ends. */
function datesText(c: Coupon, state: CouponState) {
  if (state === "scheduled" && c.starts_at) return tt("Starts {date}", { date: shortDate(c.starts_at) })
  if (c.expires_at) return `${state === "expired" ? tt("Ended") : tt("Ends")} ${shortDate(c.expires_at)}`
  return null
}

const usedText = (c: Coupon) => (c.usage_limit !== null ? tt("{usage_count} of {usage_limit} used", { usage_count: c.usage_count, usage_limit: c.usage_limit }) : tt("{usage_count} used", { usage_count: c.usage_count }))

/** New coupon: near black, a thumb's size on a phone, the Orders size from 768px. */
const NEW_BUTTON = cn(inkDepth, "h-8 rounded-lg px-3 text-[13px] font-medium max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]")

/**
 * WHERE THE LIST WAS LEFT: the view, kept for the tab (never stored) and
 * taken up again only on a return from a coupon or the browser's back
 * (./list-return isReturning). A fresh visit starts at All.
 */
let leftAt: View | null = null

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * ===========================================================================
 *  COUPONS, A PAGE OF THEIR OWN
 * ===========================================================================
 * Coupons has its own place in the app's menu (under Products) and its own
 * title. The frame is the Products and Orders one: the pane's bar with New
 * coupon, then one card whose toolbar holds the views. A computer gets a table; a
 * phone gets a list with the code, what it takes off and how often it has
 * been used, each row one press into the code's own page. Where a code
 * stands (active, scheduled, expired, used up, off) is worked out by the
 * same rule the checkout's (lib/checkout/coupons.ts).
 */
export function CouponsClient({ initialCoupons, products, currency = "USD" }: CouponsClientProps) {
  /* The store's currency as it is changed in Settings, not only the one this page was opened with. */
  const liveCurrency = useStoreCurrencyIfSet()
  const money = useMemo(() => couponMoney(liveCurrency || currency), [liveCurrency, currency])
  /* A save or a delete in the editor, laid over the rows the router kept (./list-return). */
  const [coupons, setCoupons] = useState<Coupon[]>(() => withReturn(initialCoupons, peekReturn()))
  /* The server's list again (a refresh after a change): it is the truth from here. */
  const [seen, setSeen] = useState(initialCoupons)
  if (seen !== initialCoupons) {
    setSeen(initialCoupons)
    setCoupons(initialCoupons)
  }
  /*
    BACK TO THE LIST IS THE LIST, AS IT WAS, with no landing: the Products
    list's reason (app/app/products/products-client.tsx), for the coupon
    editor's way back and the browser's. A fresh visit still lands.
  */
  const [returning] = useState(isReturning)
  useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  const [view, setView] = useState<View>(() => (returning && leftAt ? leftAt : "all"))
  useEffect(() => {
    leftAt = view
  }, [view])
  const [confirmDelete, setConfirmDelete] = useState<Coupon | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, say] = usePill()
  const router = useRouter()
  const sectionRef = useRef<HTMLElement>(null)

  /*
    BACK FROM A COUPON. Say what happened, tint the row it was (brought into
    view if the scroll left it out), and ask the server for the list again:
    the one the router kept was drawn before the save.
  */
  useEffect(() => {
    const back = takeReturn()
    if (!back) return
    if (back.message) say(back.message)
    if (back.saved || back.deleted) router.refresh()
    if (back.id && !back.deleted) tintReturnedRow(sectionRef.current, back.id, LAYER_LEAVE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* One clock for the render, so a code does not change view between two rows. */
  const [now] = useState(() => new Date())
  const rows = useMemo(
    () => coupons.map((c) => ({ coupon: c, state: couponState(c, now) })),
    [coupons, now],
  )
  const counts = useMemo(() => {
    const out: Record<View, number> = { all: rows.length, active: 0, scheduled: 0, ended: 0 }
    for (const r of rows) out[viewOf(r.state)]++
    return out
  }, [rows])
  const shown = view === "all" ? rows : rows.filter((r) => viewOf(r.state) === view)

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products])
  const appliesText = (c: Coupon) => {
    if (!c.product_ids?.length) return tt("All products")
    if (c.product_ids.length === 1) return productTitle.get(c.product_ids[0]) ?? tt("1 product")
    return tt("{length} products", { length: c.product_ids.length })
  }

  /* A coupon's page, fetched whole when its row is hovered or touched, so the press finds it here. */
  const warmed = useRef(new Set<string>())
  const warm = (href: string) => {
    if (warmed.current.has(href)) return
    warmed.current.add(href)
    prefetchAppPage(router, href)
  }
  /* Once the list has drawn and the browser is idle, New coupon and the first three rows, as the Products list does: on a phone there is no hover to start them. */
  const firstShown = useRef<string[]>([])
  firstShown.current = shown.slice(0, 3).map((r) => r.coupon.id)
  useEffect(
    () =>
      whenIdle(() => {
        warm("/app/coupons/new")
        for (const id of firstShown.current) warm(`/app/coupons/${id}`)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit, with the rows shown when the browser is idle
    [],
  )
  /*
    OPENING A COUPON SLIDES IT IN over the list on a phone (./list-return).
    A press with a modifier key, or not the main button, is left to the link.
  */
  const openFromLink = (href: string) => (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    openCoupon(router, href)
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  const setActive = async (coupon: Coupon, isActive: boolean) => {
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error || tt("The coupon could not be changed."), "error")
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? data.coupon : c)))
    say(isActive ? tt("{code} is on", { code: coupon.code }) : tt("{code} is off", { code: coupon.code }))
    router.refresh()
  }

  const copyCode = async (coupon: Coupon) => {
    try {
      await navigator.clipboard.writeText(coupon.code)
      say(tt("{code} copied", { code: coupon.code }))
    } catch {
      say(tt("The code could not be copied."), "error")
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await fetch(`/api/coupons/${confirmDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) return say(tt("The coupon could not be deleted."), "error")
    setCoupons((prev) => prev.filter((c) => c.id !== confirmDelete.id))
    say(tt("{code} deleted", { code: confirmDelete.code }))
    setConfirmDelete(null)
    router.refresh()
  }

  const actionsFor = (c: Coupon) => [
    { label: tt("Copy code"), onClick: () => copyCode(c) },
    { label: tt("Edit"), onClick: () => openCoupon(router, `/app/coupons/${c.id}`) },
    { label: c.is_active ? tt("Turn off") : tt("Turn on"), onClick: () => setActive(c, !c.is_active), separatorBefore: true },
    { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirmDelete(c) },
  ]

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />

      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Coupons")}</h1>
        <Link href="/app/coupons/new" data-new-coupon="" onClick={openFromLink("/app/coupons/new")} onMouseEnter={() => warm("/app/coupons/new")} onTouchStart={() => warm("/app/coupons/new")} className={NEW_BUTTON}>
          <Plus className="h-[18px] w-[18px] md:h-4 md:w-4" />
          {tt("New coupon")}
        </Link>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <section ref={sectionRef} aria-label={tt("Coupons")} className={cn(card, "mt-3 overflow-hidden")}>
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
              {/* A PHONE: one row per code, the whole row a press. */}
              <ul aria-label={tt("Coupons")} className="divide-y divide-[#f1f2f4] md:hidden">
                {shown.map(({ coupon, state }) => {
                  const dates = datesText(coupon, state)
                  return (
                    <li key={coupon.id} data-row={coupon.id} className="relative flex min-h-[76px] items-center gap-3 py-3 pl-4 pr-1.5 data-[pressed]:bg-[#f6f7f8]">
                      <Link
                        href={`/app/coupons/${coupon.id}`}
                        aria-label={`${coupon.code}, ${discountText(coupon, money)}`}
                        onTouchStart={() => warm(`/app/coupons/${coupon.id}`)}
                        onClick={openFromLink(`/app/coupons/${coupon.id}`)}
                        {...pressMark}
                        className="absolute inset-0 z-0 outline-none focus-visible:shadow-[inset_0_0_0_2px_#111113]"
                      />
                      <span className="pointer-events-none min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono text-[15px] font-semibold tracking-wide text-[#1a1a2e]">{coupon.code}</span>
                          <StatusBadge tone={TONE[state]}>{COUPON_STATE_LABEL[state]}</StatusBadge>
                        </span>
                        <span className="mt-1 block truncate text-[13px] leading-5 text-[#6b7280]">
                          <span className="text-[#1a1a2e]">{discountText(coupon, money)}</span>
                          {" · "}
                          {usedText(coupon)}
                          {dates ? ` · ${dates}` : ""}
                        </span>
                      </span>
                      <ResponsiveActionMenu
                        title={coupon.code}
                        align="end"
                        trigger={<RowMenuButton label={tt("Actions for {code}", { code: coupon.code })} className="relative z-[1] h-11 w-11 rounded-xl" />}
                        items={actionsFor(coupon)}
                      />
                    </li>
                  )
                })}
              </ul>

              {/* A COMPUTER: the table. */}
              <table className="hidden w-full border-collapse md:table">
                <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                  <tr>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Code")}</th>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Status")}</th>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Discount")}</th>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Applies to")}</th>
                    <th className="h-9 px-3 text-right text-[12px] font-medium text-[#4b5563]">{tt("Used")}</th>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Dates")}</th>
                    <th className="h-9 w-[112px] px-3" aria-label={tt("Actions")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f2f4]">
                  {shown.map(({ coupon, state }) => (
                    <tr
                      key={coupon.id}
                      data-row={coupon.id}
                      className="group cursor-pointer hover:bg-[#fafbfb]"
                      onMouseEnter={() => warm(`/app/coupons/${coupon.id}`)}
                      onClick={(e) => {
                        /* The whole row opens it, except a press inside its own controls or one that bubbled up from its menu's portal. */
                        const target = e.target as HTMLElement
                        if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
                        openCoupon(router, `/app/coupons/${coupon.id}`)
                      }}
                    >
                      <td className="h-14 px-3">
                        <Link href={`/app/coupons/${coupon.id}`} onClick={openFromLink(`/app/coupons/${coupon.id}`)} className="font-mono text-[13px] font-semibold tracking-wide text-[#1a1a2e] hover:underline">
                          {coupon.code}
                        </Link>
                      </td>
                      <td className="h-14 whitespace-nowrap px-3">
                        <StatusBadge tone={TONE[state]}>{COUPON_STATE_LABEL[state]}</StatusBadge>
                      </td>
                      <td className="h-14 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]">
                        {discountText(coupon, money)}
                        {coupon.min_purchase_cents ? (
                          <span className="text-[#6b7280]"> {tt("over {amount}", { amount: money(coupon.min_purchase_cents / 100) })}</span>
                        ) : null}
                      </td>
                      <td className="h-14 max-w-[220px] truncate px-3 text-[13px] text-[#4b5563]">{appliesText(coupon)}</td>
                      <td className="h-14 whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-[#1a1a2e]">
                        {coupon.usage_count}
                        {coupon.usage_limit !== null ? <span className="text-[#9ca3af]"> / {coupon.usage_limit}</span> : null}
                      </td>
                      <td className="h-14 whitespace-nowrap px-3 text-[13px] text-[#6b7280]">{datesText(coupon, state) ?? tt("No end date")}</td>
                      <td className="h-14 whitespace-nowrap px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/app/coupons/${coupon.id}`} onClick={openFromLink(`/app/coupons/${coupon.id}`)} className={buttonSecondary}>
                            {tt("Edit")}
                          </Link>
                          <ResponsiveActionMenu
                            title={coupon.code}
                            align="end"
                            trigger={<RowMenuButton label={tt("Actions for {code}", { code: coupon.code })} />}
                            items={actionsFor(coupon)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">
                {coupons.length === 0 ? tt("No coupons yet") : tt("No {value} coupons", { value: VIEWS.find((v) => v.value === view)?.label.toLowerCase() })}
              </p>
              <p className="mt-1 max-w-[340px] text-[14px] text-[#6b7280] md:text-[13px]">
                {coupons.length === 0
                  ? tt("A code a buyer types at checkout for money off, on everything or on the products you pick.")
                  : tt("Codes move here on their own as their dates and limits come round.")}
              </p>
              {coupons.length === 0 ? (
                <Link href="/app/coupons/new" onClick={openFromLink("/app/coupons/new")} onMouseEnter={() => warm("/app/coupons/new")} onTouchStart={() => warm("/app/coupons/new")} className={cn(NEW_BUTTON, "mt-4")}>
                  <Plus className="h-[18px] w-[18px] md:h-4 md:w-4" />
                  {tt("Create coupon")}
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="delete-coupon-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="delete-coupon-title" className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Delete {code}?", { code: confirmDelete.code })}</h3>
            <p className="mt-1.5 text-[14px] text-[#6b7280]">
              {tt("Buyers can no longer use it. Orders already placed with it keep their discount. To stop it for now instead, turn it off.")}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}
              >
                {tt("Cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:opacity-50 sm:h-10 sm:text-[14px]"
              >
                {deleting ? tt("Deleting") : tt("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  THE ONE BUTTON, IN THE PLACES IT IS DRAWN
 * ===========================================================================
 * The sales page offers one action (lib/../join-state.ts decides which). It
 * is drawn in a sticky card at the right from 1024px, in the page's
 * Membership section (the pricing card, with Monthly and Yearly when the
 * tier has both), and in a bar at the bottom of a phone. One provider holds
 * what they share (the interval, a press in flight, an error), so they never
 * disagree.
 *
 * WHAT A PRESS DOES
 *   open, product     a link
 *   signed out        sign in, then back here with ?join=1, where the press
 *                     is picked up again (a free join runs, a request opens
 *                     its note, a paid tier goes to checkout)
 *   join_free         POST join, then straight into the community (below)
 *   request           a note (optional) in a sheet or dialog, then POST join
 *   checkout          to the existing checkout on the chosen interval; the
 *                     server answers the same address and checks again there
 *   pending           nothing to press; "Withdraw request" is POST leave
 *
 * JOINING FEELS INSTANT (round 10, ask 33). The press answers on the next
 * frame: the button says "Joining" with a small spinner while the request
 * is out (it is never greyed out, and a second press does nothing). When the
 * server says "member" the button says "You're in" and the community comes
 * in ONE navigation: the address becomes the community's home
 * (history.pushState, which Next's router follows) and the router reads the
 * whole page again once (router.refresh), so the frame around it becomes the
 * member's and the feed fades in where the sales page was. No reload, no
 * second hop through the sales page. Anything else (an error, a request
 * that now waits for an admin) puts the button back with one line under it.
 *
 * Every write is the server's to allow (app/api/community/[communityId]/
 * join|leave): this file only says what happened, in a line under the button.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check } from "lucide-react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { Spinner } from "@/components/community/member/place-spinner"
import { LENGTHS } from "@/lib/communities/limits"
import { memberCountLabel } from "@/lib/communities/format"
import { money, pricePer, yearlySaving } from "@/lib/memberships/state"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { communityPath } from "./paths"
import type { JoinOption, JoinStateView, PublicCommunityView } from "./types"

type Interval = "month" | "year"
/** Where a press is: nothing yet, the join on its way, or in (and the community on its way). */
export type JoinPhase = "idle" | "joining" | "joined"

interface JoinCtx {
  community: PublicCommunityView
  join: JoinStateView
  interval: Interval
  setInterval: (i: Interval) => void
  busy: boolean
  phase: JoinPhase
  error: string | null
  press: () => void
  withdraw: () => void
  leave: () => void
  requestOpen: boolean
  setRequestOpen: (open: boolean) => void
  sendRequest: (note: string) => void
  leaveOpen: boolean
  setLeaveOpen: (open: boolean) => void
}

const Ctx = React.createContext<JoinCtx | null>(null)

function useJoin(): JoinCtx {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useJoin outside JoinProvider")
  return v
}

/** Both intervals on offer: the switch is drawn. */
export function bothIntervals(o: JoinOption | null): boolean {
  return !!o?.checkout?.month && !!o?.checkout?.year
}

/** The price for the chosen interval, "$19/month", or the option's own line. */
export function intervalPrice(o: JoinOption | null, interval: Interval): string {
  if (!o) return ""
  if (o.billing === "recurring") {
    if (interval === "year" && o.yearlyCents) return pricePer(o.yearlyCents, "year", o.currency)
    if (o.monthlyCents) return pricePer(o.monthlyCents, "month", o.currency)
    if (o.yearlyCents) return pricePer(o.yearlyCents, "year", o.currency)
  }
  return o.priceLine
}

/**
 * The price as the pricing card prints it: the figure large and what it is
 * per, apart ("$19" and "/month", "$249" and "once", "Free"). Null for a
 * tier with no price yet.
 */
export function priceParts(o: JoinOption | null, interval: Interval): { amount: string; per: string | null } | null {
  if (!o) return null
  if (o.kind === "free") return { amount: "Free", per: null }
  if (o.billing === "recurring") {
    const year = interval === "year" && o.yearlyCents ? o.yearlyCents : null
    const cents = year ?? o.monthlyCents ?? o.yearlyCents
    if (!cents) return null
    const per = year || !o.monthlyCents ? "/year" : "/month"
    return { amount: money(cents, o.currency), per }
  }
  if (o.priceCents) return { amount: money(o.priceCents, o.currency), per: "once" }
  return o.priceLine ? { amount: o.priceLine, per: null } : null
}

/** The button's words with the chosen interval's price in them. */
function buttonLabel(join: JoinStateView, interval: Interval): string {
  if (join.kind === "checkout" && join.option?.billing === "recurring") return `Join for ${intervalPrice(join.option, interval)}`
  return join.label
}

function checkoutHref(o: JoinOption | null, interval: Interval): string | null {
  const c = o?.checkout
  if (!c) return null
  return (interval === "year" ? c.year ?? c.month : c.month ?? c.year) ?? c.once
}

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { message: "The connection dropped. Try again." } }
  }
}

/**
 * INTO THE COMMUNITY, IN ONE NAVIGATION. The address becomes the
 * community's home (Next's router follows history.pushState) and the router
 * reads everything under it again, once: the layout gives the member's frame
 * and the page the feed. Already on the home address (the sales page is the
 * home for a visitor), the read alone does it.
 */
export function enterCommunity(slug: string, router: { refresh: () => void }) {
  const home = communityPath(slug)
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") !== home) window.history.pushState(null, "", home)
  router.refresh()
}

export function JoinProvider({ community, join, children }: { community: PublicCommunityView; join: JoinStateView; children: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [interval, setInterval] = React.useState<Interval>(() => (join.option?.checkout?.month || !join.option?.checkout?.year ? "month" : "year"))
  const [busy, setBusy] = React.useState(false)
  const [phase, setPhase] = React.useState<JoinPhase>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  const api = `/api/community/${community.id}`

  const go = React.useCallback((href: string) => router.push(href), [router])

  /*
    THE FEED ARRIVES AT THE TOP. When the member's page takes this one's place (after "You're in"), the window is put back at the top
    in the same commit, before it is painted, so the feed never appears halfway down where the sales page was read.
  */
  const phaseRef = React.useRef(phase)
  phaseRef.current = phase
  React.useLayoutEffect(
    () => () => {
      if (phaseRef.current === "joined") window.scrollTo(0, 0)
    },
    [],
  )

  const answer = React.useCallback(
    (r: { ok: boolean; data: Record<string, unknown> }) => {
      if (r.ok) {
        const state = r.data.state
        if (state === "checkout" && typeof r.data.url === "string") return go(r.data.url)
        if (state === "member") {
          setPhase("joined")
          return enterCommunity(community.slug, router)
        }
        setPhase("idle")
        router.refresh()
        return
      }
      setPhase("idle")
      if (typeof r.data.url === "string" && (r.data.error === "needs_product" || r.data.error === "manage_billing")) {
        setError(String(r.data.message || ""))
        return go(r.data.url)
      }
      setError(typeof r.data.message === "string" ? r.data.message : "That did not go through. Try again.")
    },
    [community.slug, go, router],
  )

  const joinNow = React.useCallback(
    async (note?: string) => {
      /* On the next frame: the button answers before the request leaves. */
      setBusy(true)
      setPhase("joining")
      setError(null)
      const r = await post(`${api}/join`, { note: note || undefined, interval })
      setBusy(false)
      setRequestOpen(false)
      answer(r)
    },
    [answer, api, interval],
  )

  const press = React.useCallback(() => {
    if (busy || phase !== "idle") return
    if (join.href && (join.kind === "open" || join.kind === "product" || !join.signedIn)) return go(join.href)
    if (join.kind === "join_free") return void joinNow()
    if (join.kind === "request") return setRequestOpen(true)
    if (join.kind === "checkout") {
      const href = checkoutHref(join.option, interval)
      if (href) go(href)
    }
  }, [busy, phase, go, interval, join, joinNow])

  const withdraw = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    const r = await post(`${api}/leave`)
    setBusy(false)
    answer(r)
  }, [answer, api])

  const leave = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    const r = await post(`${api}/leave`)
    setBusy(false)
    setLeaveOpen(false)
    answer(r)
  }, [answer, api])

  /* Back from signing in with ?join=1: the press they made is made again, once. */
  const picked = React.useRef(false)
  React.useEffect(() => {
    if (picked.current || params.get("join") !== "1" || !join.signedIn) return
    picked.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete("join")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    if (join.kind === "join_free" || join.kind === "request" || join.kind === "checkout") press()
  }, [join.kind, join.signedIn, params, press])

  const value: JoinCtx = {
    community,
    join,
    interval,
    setInterval,
    busy,
    phase,
    error,
    press,
    withdraw,
    leave,
    requestOpen,
    setRequestOpen,
    sendRequest: (note) => void joinNow(note),
    leaveOpen,
    setLeaveOpen,
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      <RequestDialog />
      <LeaveDialog />
    </Ctx.Provider>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1a1a2e] bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-[background-color,scale,box-shadow] duration-150 hover:bg-[#2a2a40] active:scale-[0.98] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:border-[#e5e7eb] disabled:bg-[#e5e7eb] disabled:text-[#6b7280] disabled:shadow-none motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
/* A quiet second action: text, but a 40px target, so a thumb finds it. */
const QUIET = "-mx-1 inline-flex min-h-10 items-center px-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline disabled:opacity-60"

/** The button itself, or the sentence when there is nothing to press. */
function PrimaryAction({ className, short = false }: { className?: string; /** Beside a price that already says it (the phone's bar): "Join" alone. */ short?: boolean }) {
  const { join, interval, busy, phase, press } = useJoin()
  const label = short && (join.kind === "checkout" || join.kind === "join_free") ? "Join" : buttonLabel(join, interval)
  if (join.kind === "invite_only" || join.kind === "banned" || join.kind === "closed" || join.kind === "unavailable") {
    return (
      <p data-join-state={join.kind} className={cn("flex min-h-11 items-center justify-center rounded-xl bg-[#f1f2f4] px-4 py-2.5 text-center text-[14px] font-medium text-[#4b5563]", className)}>
        {label}
      </p>
    )
  }
  if (join.kind === "pending") {
    return (
      <button type="button" disabled data-join-state="pending" className={cn(PRIMARY, className)}>
        <Check aria-hidden className="h-4 w-4" />
        {label}
      </button>
    )
  }
  if (join.kind === "open" || (join.kind === "product" && join.href)) {
    return (
      <Link href={join.href as string} data-join-state={join.kind} className={cn(PRIMARY, className)}>
        {label}
      </Link>
    )
  }
  /*
    The press is answered at once and the button keeps its colour and its size the whole way: "Joining" with a spinner while the
    request is out, "You're in" with a check once it is in. The words cross by opacity only; nothing moves.
  */
  return (
    <button type="button" onClick={press} aria-busy={busy || phase !== "idle"} data-join-state={join.kind} data-join-phase={phase} className={cn(PRIMARY, "relative", className)}>
      <span className={cn("inline-flex items-center gap-2 transition-opacity duration-150", phase === "idle" ? "opacity-100" : "opacity-0")}>{label}</span>
      {phase !== "idle" ? (
        <span aria-live="polite" className="absolute inset-0 inline-flex items-center justify-center gap-2 animate-in fade-in-0 duration-150" data-join-progress="">
          {phase === "joining" ? (
            <>
              <Spinner size={18} className="!text-white" />
              Joining
            </>
          ) : (
            <>
              <Check aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.5} />
              You&apos;re in
            </>
          )}
        </span>
      ) : null}
    </button>
  )
}

/** How long the thumb takes to slide, and the words to follow it (components/billing/plan-cards.tsx IntervalSwitch). */
const SWITCH_MS = 260
const SWITCH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * MONTHLY OR YEARLY, Storelib's switch (the billing page's: one track with a
 * white thumb that slides between the two, two equal columns, so moving it is
 * a shift by its own width and nothing is measured). Yearly carries what it
 * saves. Only when the tier is sold both ways.
 */
export function IntervalSwitch({ className, full = false }: { className?: string; full?: boolean }) {
  const { join, interval, setInterval } = useJoin()
  const o = join.option
  if (join.kind !== "checkout" || !bothIntervals(o)) return null
  const saving = yearlySaving(o?.monthlyCents ?? null, o?.yearlyCents ?? null)
  const yearly = interval === "year"
  return (
    <div
      role="radiogroup"
      aria-label="Billing"
      data-interval-choice={interval}
      className={cn("relative grid-cols-2 rounded-full bg-[#eceef1] p-1 shadow-[inset_0_1px_2px_rgba(16,24,40,0.10),inset_0_0_0_1px_rgba(16,24,40,0.04)]", full ? "grid w-full" : "inline-grid", className)}
    >
      <span
        aria-hidden
        data-interval-thumb=""
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.12),0_4px_10px_-4px_rgba(16,24,40,0.18),inset_0_-1px_0_rgba(16,24,40,0.04)] motion-reduce:!transition-none"
        style={{ translate: yearly ? "100% 0" : "0 0", transition: `translate ${SWITCH_MS}ms ${SWITCH_EASE}` }}
      />
      {(["month", "year"] as const).map((id) => {
        const on = interval === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            data-interval-option={id}
            onClick={() => setInterval(id)}
            style={{ transition: `color ${SWITCH_MS}ms ${SWITCH_EASE}` }}
            className={cn(
              "relative z-[1] inline-flex h-10 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 motion-reduce:!transition-none [-webkit-tap-highlight-color:transparent]",
              on ? "text-[#1a1a2e]" : "text-[#4b5260] hover:text-[#1a1a2e]",
            )}
          >
            {id === "month" ? "Monthly" : "Yearly"}
            {id === "year" && saving > 0 ? <span className="rounded-full bg-[#1a1a2e] px-1.5 py-px text-[10.5px] font-semibold leading-4 text-white">Save {saving}%</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** The price, large, with what it is per beside it; it follows the interval. */
function PriceLine({ className }: { className?: string }) {
  const { join, interval } = useJoin()
  const parts = priceParts(join.option, interval)
  if (!parts || join.kind === "open" || join.kind === "invite_only" || join.kind === "product") return null
  return (
    <p className={cn("flex items-baseline gap-1.5", className)} data-join-price="">
      <span className="text-[30px] font-semibold leading-9 tabular-nums tracking-[-0.02em] text-[#1a1a2e]">{parts.amount}</span>
      {parts.per ? <span className="text-[14px] font-medium text-[#6b7280]">{parts.per}</span> : null}
    </p>
  )
}

function Status() {
  const { join, error, busy, withdraw, setLeaveOpen } = useJoin()
  return (
    <>
      {error ? (
        <p role="alert" className="mt-2.5 text-[13px] leading-snug text-[#b42318]" data-join-error="">
          {error}
        </p>
      ) : null}
      {join.note ? <p className="mt-2.5 text-[13px] leading-snug text-[#6b7280]">{join.note}</p> : null}
      {join.kind === "pending" ? (
        <button type="button" onClick={withdraw} disabled={busy} className={cn(QUIET, "mt-1")}>
          Withdraw request
        </button>
      ) : null}
      {join.kind === "open" && join.manageHref ? (
        <Link href={join.manageHref} className={cn(QUIET, "mt-1")}>
          Manage your membership
        </Link>
      ) : null}
      {join.kind === "open" && join.canLeave && !join.manageHref ? (
        <button type="button" onClick={() => setLeaveOpen(true)} className={cn(QUIET, "mt-1")}>
          Leave community
        </button>
      ) : null}
    </>
  )
}

/** The sticky card, from 1024px: the cover, the name, its address, the price with Monthly and Yearly, and the button. */
export function JoinCard() {
  const { community, join } = useJoin()
  const image = community.coverUrl || community.logoUrl
  return (
    <aside data-join-card="" className="hidden lg:block">
      <div className="sticky top-[calc(var(--community-top,65px)+24px)]" data-join-card-sticky="">
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
          {image ? (
            <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={optimizedImageUrl(image, 640)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="p-5">
            <p className="text-[18px] font-semibold leading-snug tracking-[-0.005em] text-[#1a1a2e] [overflow-wrap:anywhere]">{community.name}</p>
            <p className="mt-0.5 truncate text-[13px] text-[#8a8f98]">{community.address}</p>
            {join.kind === "open" ? (
              <p className="mt-3 text-[14px] text-[#4b5563]">{join.isOwner ? "You run this community." : "You're a member."}</p>
            ) : (
              <>
                <PriceLine className="mt-4" />
                <IntervalSwitch className="mt-3" full />
              </>
            )}
            <PrimaryAction className="mt-4 w-full" />
            <Status />
            <p className="mt-4 border-t border-[#eef0f2] pt-3.5 text-[13px] tabular-nums text-[#6b7280]" data-join-card-members="">
              {memberCountLabel(community.memberCount)}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

/**
 * THE MEMBERSHIP SECTION (round 10): the way in as a pricing card in the page
 * itself, at every width. The tier's name and line, the price large
 * (following Monthly and Yearly when it is sold both ways), what it
 * includes (the tier's own benefits), and the button. `others` (the other
 * paid tiers, the products that give access) is drawn under it.
 */
export function PricingCard({ others }: { others?: React.ReactNode }) {
  const { join } = useJoin()
  const o = join.option
  if (join.kind === "open" || join.kind === "banned" || join.kind === "closed") return others ? <>{others}</> : null
  const includes = o?.benefits?.length ? o.benefits : []
  const title = join.kind === "invite_only" ? "Invite only" : join.kind === "product" ? "Comes with a product" : o?.name || "Membership"
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e3e5e9] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6" data-pricing-card={join.kind}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
            {o?.description && join.kind !== "invite_only" ? <p className="mt-0.5 max-w-[46ch] text-[13.5px] leading-snug text-[#6b7280]">{o.description}</p> : null}
          </div>
          <IntervalSwitch />
        </div>
        <PriceLine className="mt-4" />
        {includes.length && join.kind !== "invite_only" ? (
          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2" data-pricing-includes="">
            {includes.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-[#374151]">
                <Check aria-hidden className="mt-[2px] h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} />
                <span className="min-w-0 break-words">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <PrimaryAction className="mt-5 w-full sm:w-auto sm:min-w-[240px]" />
        <Status />
      </div>
      {others}
    </div>
  )
}

/** On a phone, under the media: only what happened (an error, a note, Withdraw or Leave), when there is something to say. */
export function JoinSummaryPhone() {
  const { join, error } = useJoin()
  const something = !!error || join.kind === "pending" || (join.kind === "open" && (!!join.manageHref || join.canLeave))
  if (!something) return null
  return (
    <div className="lg:hidden [&>*:first-child]:mt-0" data-join-summary="">
      <Status />
    </div>
  )
}

/**
 * THE BAR AT THE BOTTOM OF A PHONE (round 10, 63.webp: the button floated
 * over the page with the page showing around it). It is one opaque white
 * surface from its hairline to the very bottom of the screen: where the
 * phone's tab bar is shown (lib/nav/buyer-tabs.ts, --buyer-tabs-h on
 * <html>) the bar's white runs on under it, so whatever the two heights do
 * there is never a strip of page between them; where there is no tab bar it
 * ends above the home indicator. The price (with the interval) beside the
 * button, or the button alone across the width.
 */
export function JoinBarPhone() {
  const { join, interval, community } = useJoin()
  const parts = join.kind === "open" ? null : priceParts(join.option, interval)
  const wide = join.kind === "open" || join.kind === "pending" || !parts || ["invite_only", "banned", "closed", "unavailable", "product"].includes(join.kind)
  const ref = React.useRef<HTMLDivElement>(null)
  /*
    THE ROOM IT TAKES, AT THE END OF THE DOCUMENT. The footer comes after
    this page in the layout, so padding the page alone left the footer's last
    lines under the bar. What the bar covers above the tab bar (measured: it
    changes with the safe area and the text size) is given to the body as
    padding while the bar is on screen; the tab bar keeps its own room. From
    1024px the bar is not displayed, measures 0, and takes nothing.
  */
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const body = document.body
    const before = body.style.paddingBottom
    const sync = () => {
      const tabs = document.querySelector<HTMLElement>("[data-buyer-tab-bar='shown']")
      const under = tabs && tabs.offsetHeight > 0 ? tabs.offsetHeight : 0
      body.style.paddingBottom = `${Math.max(0, el.offsetHeight - under)}px`
    }
    sync()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync)
    ro?.observe(el)
    window.addEventListener("resize", sync)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", sync)
      body.style.paddingBottom = before
    }
  }, [])
  return (
    <div
      ref={ref}
      data-join-bar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white px-4 pt-3 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)] lg:hidden"
      /* Down to the screen's foot: under the tab bar where there is one, above the home indicator where there is not. */
      style={{ paddingBottom: "calc(12px + var(--buyer-tabs-h, env(safe-area-inset-bottom, 0px)))" }}
    >
      <div className="mx-auto flex max-w-[640px] items-center gap-3" data-join-bar-row="">
        {!wide && parts ? (
          <div className="min-w-0 flex-1" data-join-bar-price="">
            <p className="flex items-baseline gap-1 truncate">
              <span className="text-[18px] font-semibold tabular-nums tracking-[-0.01em] text-[#1a1a2e]">{parts.amount}</span>
              {parts.per ? <span className="text-[13px] font-medium text-[#6b7280]">{parts.per}</span> : null}
            </p>
            <p className="truncate text-[12.5px] tabular-nums text-[#6b7280]">{memberCountLabel(community.memberCount)}</p>
          </div>
        ) : null}
        <PrimaryAction className={wide ? "w-full" : "min-w-[132px] shrink-0"} short={!wide} />
      </div>
    </div>
  )
}

/* ── Dialogs ────────────────────────────────────────────────────────────── */

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

function RequestDialog() {
  const { community, requestOpen, setRequestOpen, sendRequest, busy, error } = useJoin()
  const phone = usePhone()
  const [note, setNote] = React.useState("")
  const max = LENGTHS.requestNote.max
  return (
    <SheetDialog open={requestOpen} onClose={() => setRequestOpen(false)} phone={phone} label={`Request to join ${community.name}`} className="max-w-[440px] gap-0 rounded-2xl p-6">
      <div className={phone ? "px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-1" : ""}>
        <SheetDialogTitle className="text-[18px] font-semibold text-[#1a1a2e]">Request to join</SheetDialogTitle>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">An admin of {community.name} reviews requests. Add a line about yourself if you like.</p>
        <label className="mt-4 block">
          <span className="sr-only">A note for the admins</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, max))}
            rows={4}
            placeholder="Who you are and why you'd like to join"
            className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-[16px] leading-snug text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd2] focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[15px]"
          />
        </label>
        <div className="mt-1 text-right text-[12px] tabular-nums text-[#9ca3af]">
          {note.length}/{max}
        </div>
        {error ? (
          <p role="alert" className="mt-1 text-[13px] text-[#b42318]">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={() => setRequestOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
            Cancel
          </button>
          <button type="button" onClick={() => sendRequest(note.trim())} disabled={busy} className={cn(PRIMARY, "flex-1")}>
            {busy ? "Sending" : "Send request"}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

function LeaveDialog() {
  const { community, leaveOpen, setLeaveOpen, leave, busy, error } = useJoin()
  const phone = usePhone()
  return (
    <SheetDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} phone={phone} label={`Leave ${community.name}`} className="max-w-[420px] gap-0 rounded-2xl p-6">
      <div className={phone ? "px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-1" : ""}>
        <SheetDialogTitle className="text-[18px] font-semibold text-[#1a1a2e]">Leave {community.name}?</SheetDialogTitle>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">You won't see its posts or get its notifications. Your posts stay. You can join again later.</p>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-[#b42318]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={() => setLeaveOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
            Stay
          </button>
          <button type="button" onClick={leave} disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#b42318] text-[15px] font-semibold text-white outline-none hover:bg-[#9b1d14] focus-visible:ring-2 focus-visible:ring-[#b42318]/30 disabled:opacity-60">
            {busy ? "Leaving" : "Leave"}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

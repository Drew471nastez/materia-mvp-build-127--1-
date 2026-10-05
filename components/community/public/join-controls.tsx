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
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check } from "lucide-react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { Spinner } from "@/components/community/member/place-spinner"
import { LENGTHS } from "@/lib/communities/limits"
import { LEAVE_NOTE_MAX, LEAVE_REASONS, type LeaveReason } from "@/lib/communities/leave-reasons"
import { memberCountLabel } from "@/lib/communities/format"
import { money, pricePer, yearlySaving } from "@/lib/memberships/state"
import { cn } from "@/lib/utils"
import { CheckDot } from "./check-dot"
import { goJoinAuth, isJoinAuthHref, prefetchJoinAuth } from "./join-nav"
import { communityPath, JOINED_KEY } from "./paths"
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
  leave: (why?: { reason: LeaveReason | null; note: string }) => void
  /** Part 98 is in: leaving asks why (the six reasons and a note, all optional). */
  askWhy: boolean
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
  /* The member's frame says welcome once it is drawn (shell-frame.tsx reads this, once). */
  try {
    window.sessionStorage.setItem(JOINED_KEY, slug)
  } catch {
    /* No storage: no welcome line, the community still opens. */
  }
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") !== home) window.history.pushState(null, "", home)
  router.refresh()
}

export function JoinProvider({ community, join, askWhy = false, children }: { community: PublicCommunityView; join: JoinStateView; /** Leaving asks why (round 12): only once part 98 has made the table (lib/communities/server/leave-reasons.ts). */ askWhy?: boolean; children: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [interval, setInterval] = React.useState<Interval>(() => (join.option?.checkout?.month || !join.option?.checkout?.year ? "month" : "year"))
  const [busy, setBusy] = React.useState(false)
  const [phase, setPhase] = React.useState<JoinPhase>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  const api = `/api/community/${community.id}`

  const go = React.useCallback((href: string) => goJoinAuth(router, href), [router])

  React.useEffect(() => {
    if (join.signedIn) return
    prefetchJoinAuth(router, join.href)
  }, [join.signedIn, join.href, router])

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
    if (join.href && (join.kind === "open" || join.kind === "product" || !join.signedIn)) {
      if (!join.signedIn && isJoinAuthHref(join.href)) {
        setPhase("joining")
        setError(null)
      }
      return go(join.href)
    }
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

  const leave = React.useCallback(async (why?: { reason: LeaveReason | null; note: string }) => {
    setBusy(true)
    setError(null)
    /* Why, only when they said: a reason, a note, or both. Nothing chosen is a plain leave. */
    const said = why && (why.reason || why.note.trim()) ? { reason: why.reason ?? undefined, note: why.note.trim() || undefined } : undefined
    const r = await post(`${api}/leave`, said)
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
    askWhy,
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
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1a1a2e] bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[#2a2a40] active:bg-[#10101d] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:border-[#e5e7eb] disabled:bg-[#e5e7eb] disabled:text-[#6b7280] disabled:shadow-none motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
/* A quiet second action: text, but a 40px target, so a thumb finds it. Pressed: no bump (round 11), the button only darkens. */
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
              {!join.signedIn && join.href && isJoinAuthHref(join.href) ? "Continue" : "Joining"}
            </>
          ) : (
            <>
              <DrawnCheck />
              You&apos;re in
            </>
          )}
        </span>
      ) : null}
    </button>
  )
}

/*
  THE MOMENT IT TAKES (round 12, ask 13: "a satisfying, smooth join"). The
  check beside "You're in" draws itself, one stroke over 280ms on a curve
  that settles (stroke-dashoffset, painted by the compositor's clock), while
  the words cross from "Joining" by opacity; the button keeps its size and
  its ink the whole way, so nothing bumps. Still for reduced motion.
*/
const CHECK_DRAW = "@keyframes join-check-draw{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}"
function DrawnCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" data-join-check="">
      <style>{CHECK_DRAW}</style>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={20} className="motion-safe:animate-[join-check-draw_280ms_cubic-bezier(0.22,1,0.36,1)_60ms_both]" />
    </svg>
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
  const { join, error, busy, withdraw } = useJoin()
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
    </>
  )
}

/** A quiet button in the membership row: white, a hairline and a 1px shadow, pressed by tint alone. */
const ROW_BUTTON =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e3e5e9] bg-white px-3.5 text-[13.5px] font-medium shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[#f6f7f8] active:bg-[#eef0f2] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-9 [-webkit-tap-highlight-color:transparent]"

/**
 * YOUR MEMBERSHIP (round 11, ask 25, 67.webp): where a member manages or
 * leaves, at the foot of the About page, rather than a bare "Leave
 * community" link under Open community. One row: what they are, and the one
 * thing to do: Manage for a subscription (leaving is cancelling there), else
 * Leave, which asks first (LeaveDialog).
 */
export function MembershipRow() {
  const { community, join, setLeaveOpen } = useJoin()
  if (join.kind !== "open" || join.isOwner) return null
  const what = join.role === "admin" ? "You're an admin" : join.role === "moderator" ? "You're a moderator" : "You're a member"
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-[#eceef1] bg-[#fafbfb] px-4 py-3.5 sm:px-5" data-membership-row="">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#1a1a2e]">
          {what} of {community.name}.
        </p>
        <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{join.manageHref ? "Change or cancel your plan from your library." : "Your posts stay if you leave."}</p>
      </div>
      {join.manageHref ? (
        <Link href={join.manageHref} className={cn(ROW_BUTTON, "text-[#1a1a2e]")} data-membership-manage="">
          Manage membership
        </Link>
      ) : join.canLeave ? (
        <button type="button" onClick={() => setLeaveOpen(true)} className={cn(ROW_BUTTON, "text-[#b42318]")} data-membership-leave="">
          Leave community
        </button>
      ) : null}
    </div>
  )
}

/**
 * LEAVING FROM ANOTHER PAGE (round 13: the member's Membership page). The
 * same confirm that asks why (LeaveDialog), opened by whatever button the
 * page draws; whether this member may leave at all, and whether the dialog
 * is on its way. Inside a JoinProvider.
 */
export function useLeave(): { canLeave: boolean; open: () => void; busy: boolean; error: string | null } {
  const { join, setLeaveOpen, busy, error } = useJoin()
  const open = React.useCallback(() => setLeaveOpen(true), [setLeaveOpen])
  return { canLeave: join.kind === "open" && join.canLeave, open, busy, error }
}

/**
 * The sticky card, from 1280px, in the frame's right column (round 12): the
 * name, its address, the price with Monthly and Yearly, and the button. No
 * cover: the community's card in the left column has it, a column away.
 * Under the button, the page's facts as one quiet list (round 13, ask 22:
 * `facts`, sales-page.tsx draws it), where the member count line was.
 */
export function JoinCard({ facts = null }: { facts?: React.ReactNode }) {
  const { community, join } = useJoin()
  return (
    <aside data-join-card="" className="hidden xl:block">
      <div className="sticky top-[calc(var(--community-top,65px)+24px)]" data-join-card-sticky="">
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
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
            {facts ? (
              <div className="-mb-2 mt-4 border-t border-[#eef0f2] pt-1" data-join-card-facts="">
                {facts}
              </div>
            ) : (
              <p className="mt-4 border-t border-[#eef0f2] pt-3.5 text-[13px] tabular-nums text-[#6b7280]" data-join-card-members="">
                {memberCountLabel(community.memberCount)}
              </p>
            )}
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
                <CheckDot className="-mt-px" />
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

/** On a phone, under the media: only what happened (an error, a note, Withdraw), when there is something to say. Leave is in Your membership. */
export function JoinSummaryPhone() {
  const { join, error } = useJoin()
  const something = !!error || join.kind === "pending"
  if (!something) return null
  return (
    <div className="xl:hidden [&>*:first-child]:mt-0" data-join-summary="">
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
    ON THE BODY, NOT IN THE PAGE (round 12). A page arriving in the member's
    frame rises a few px by `translate` (shell-frame.tsx ARRIVE), and for
    those frames the page's box is where a fixed bar inside it is placed: the
    bar rode down the page and jumped back. Portalled to the body it is fixed
    to the screen whatever the page does. The server's HTML (and the frame
    that hydrates it) draws it in place, where nothing moves the page.
  */
  const onClient = React.useSyncExternalStore(noSubscribe, () => true, () => false)
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
  }, [onClient])
  const bar = (
    <div
      ref={ref}
      data-join-bar=""
      data-community-fixed-foot=""
      /* Until the side card takes over (1280px); a member's "Open community" only on a phone and a tablet, where there is no left column. */
      className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white px-4 pt-3 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)]", join.kind === "open" ? "lg:hidden" : "xl:hidden")}
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
  return onClient ? createPortal(bar, document.body) : bar
}

const noSubscribe = () => () => {}

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

/*
  LEAVING (round 11 asked first; round 12 asks why). Once part 98 is in, the
  dialog offers six calm answers (lib/communities/leave-reasons.ts) as one
  list of rows, none chosen, and a note field under them; neither is needed,
  Leave works with nothing chosen. What they say goes to the people who run
  the community (their dashboard's "Why people left") and to nobody else.
  Before part 98 it is the plain question it was.
*/
const REASON_ROW =
  "flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] leading-snug outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] sm:min-h-10 sm:text-[14px]"

function LeaveDialog() {
  const { community, leaveOpen, setLeaveOpen, leave, busy, error, askWhy } = useJoin()
  const phone = usePhone()
  const [reason, setReason] = React.useState<LeaveReason | null>(null)
  const [note, setNote] = React.useState("")
  /* A fresh question each time it opens. */
  React.useEffect(() => {
    if (!leaveOpen) return
    setReason(null)
    setNote("")
  }, [leaveOpen])
  return (
    <SheetDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} phone={phone} label={`Leave ${community.name}`} className={cn("gap-0 rounded-2xl p-6", askWhy ? "max-w-[460px]" : "max-w-[420px]")}>
      <div className={phone ? "px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-1" : ""} data-leave-dialog="" data-leave-asks={askWhy ? "why" : undefined}>
        <SheetDialogTitle className="text-[18px] font-semibold text-[#1a1a2e]">Leave {community.name}?</SheetDialogTitle>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">You won&apos;t see its posts or get its notifications. Your posts stay, and you can join again later.</p>
        {askWhy ? (
          <div className="mt-5" data-leave-why="">
            <p id="leave-why" className="text-[14px] font-medium text-[#1a1a2e]">
              What made you leave? <span className="font-normal text-[#8a8f98]">Optional</span>
            </p>
            <div role="radiogroup" aria-labelledby="leave-why" className="mt-2.5 space-y-1.5">
              {LEAVE_REASONS.map((r) => {
                const on = reason === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setReason(on ? null : r.key)}
                    data-leave-reason={r.key}
                    className={cn(REASON_ROW, on ? "border-[#1a1a2e] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "border-[#e6e8ec] bg-white text-[#374151] hover:bg-[#fafbfc] active:bg-[#f4f5f7]")}
                  >
                    {/* The choice's dot: a ring, filled with a smaller ink dot when chosen (scale only, so nothing moves). */}
                    <span aria-hidden className={cn("relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e]" : "border-[#c9ccd2]")}>
                      <span className={cn("h-2 w-2 rounded-full bg-[#1a1a2e] transition-[scale,opacity] duration-150 ease-out motion-reduce:transition-none", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
                    </span>
                    <span className="min-w-0">{r.label}</span>
                  </button>
                )
              })}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">A note for the people who run it</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, LEAVE_NOTE_MAX))}
                rows={2}
                maxLength={LEAVE_NOTE_MAX}
                placeholder="Anything you'd like them to know"
                className="block w-full resize-none rounded-xl border border-[#e6e8ec] bg-white px-3.5 py-2.5 text-[16px] leading-snug text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd2] focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[14.5px]"
                data-leave-note=""
              />
            </label>
            <p className="mt-1.5 text-[12.5px] text-[#8a8f98]">Only the people who run {community.name} see this.</p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-[#b42318]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={() => setLeaveOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#e3e5e9] bg-white text-[15px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color] duration-150 hover:bg-[#f8f9fa] active:bg-[#eef0f2] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]">
            Stay
          </button>
          {/* The press answers at once: Leaving with a spinner, the same size and colour, and a second press does nothing. */}
          <button
            type="button"
            onClick={() => {
              if (!busy) leave(askWhy ? { reason, note } : undefined)
            }}
            aria-busy={busy}
            data-leave-confirm=""
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#a61f15] bg-[#b42318] text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.10)] outline-none transition-[background-color] duration-150 hover:bg-[#a11f15] active:bg-[#8f1b12] focus-visible:ring-2 focus-visible:ring-[#b42318]/30 [-webkit-tap-highlight-color:transparent]"
          >
            {busy ? (
              <>
                <Spinner size={16} className="!text-white" />
                Leaving
              </>
            ) : (
              "Leave"
            )}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

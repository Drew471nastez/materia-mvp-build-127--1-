"use client"

/**
 * ===========================================================================
 *  THE ONE BUTTON, IN THE THREE PLACES IT IS DRAWN
 * ===========================================================================
 * The sales page offers one action (lib/../join-state.ts decides which). It
 * is drawn in a sticky card at the right from 1024px, in a bar pinned to the
 * bottom of a phone (above the home indicator: env(safe-area-inset-bottom)),
 * and the phone also gets the facts and the monthly or yearly choice in the
 * page itself, under the tagline, where the card would have said them. One
 * provider holds what they share (the interval, a press in flight, an error),
 * so the three never disagree.
 *
 * WHAT A PRESS DOES
 *   open, product     a link
 *   signed out        sign in, then back here with ?join=1, where the press
 *                     is picked up again (a free join runs, a request opens
 *                     its note, a paid tier goes to checkout)
 *   join_free         POST join, then the page again: a member sees the feed
 *   request           a note (optional) in a sheet or dialog, then POST join
 *   checkout          to the existing checkout on the chosen interval; the
 *                     server answers the same address and checks again there
 *   pending           nothing to press; "Withdraw request" is POST leave
 *
 * Every write is the server's to allow (app/api/community/[communityId]/
 * join|leave): this file only says what happened, in a line under the button.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { LENGTHS } from "@/lib/communities/limits"
import { memberCountLabel } from "@/lib/communities/format"
import { pricePer, yearlySaving } from "@/lib/memberships/state"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import type { JoinOption, JoinStateView, PublicCommunityView } from "./types"

type Interval = "month" | "year"

interface JoinCtx {
  community: PublicCommunityView
  join: JoinStateView
  interval: Interval
  setInterval: (i: Interval) => void
  busy: boolean
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

/** Both intervals on offer: the toggle is drawn. */
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

export function JoinProvider({ community, join, children }: { community: PublicCommunityView; join: JoinStateView; children: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [interval, setInterval] = React.useState<Interval>(() => (join.option?.checkout?.month || !join.option?.checkout?.year ? "month" : "year"))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  const api = `/api/community/${community.id}`

  const go = React.useCallback((href: string) => router.push(href), [router])

  const answer = React.useCallback(
    (r: { ok: boolean; data: Record<string, unknown> }) => {
      if (r.ok) {
        const state = r.data.state
        if (state === "checkout" && typeof r.data.url === "string") return go(r.data.url)
        router.refresh()
        return
      }
      if (typeof r.data.url === "string" && (r.data.error === "needs_product" || r.data.error === "manage_billing")) {
        setError(String(r.data.message || ""))
        return go(r.data.url)
      }
      setError(typeof r.data.message === "string" ? r.data.message : "That did not go through. Try again.")
    },
    [go, router],
  )

  const joinNow = React.useCallback(
    async (note?: string) => {
      setBusy(true)
      setError(null)
      const r = await post(`${api}/join`, { note: note || undefined, interval })
      setBusy(false)
      setRequestOpen(false)
      answer(r)
    },
    [answer, api, interval],
  )

  const press = React.useCallback(() => {
    if (busy) return
    if (join.href && (join.kind === "open" || join.kind === "product" || !join.signedIn)) return go(join.href)
    if (join.kind === "join_free") return void joinNow()
    if (join.kind === "request") return setRequestOpen(true)
    if (join.kind === "checkout") {
      const href = checkoutHref(join.option, interval)
      if (href) go(href)
    }
  }, [busy, go, interval, join, joinNow])

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
  "inline-flex h-11 items-center justify-center rounded-xl bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white outline-none transition-[background-color,scale] duration-150 hover:bg-[#2a2a40] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:bg-[#e5e7eb] disabled:text-[#6b7280] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
/* A quiet second action: text, but a 40px target, so a thumb finds it. */
const QUIET = "-mx-1 inline-flex min-h-10 items-center px-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline disabled:opacity-60"

/** The button itself, or the sentence when there is nothing to press. */
function PrimaryAction({ className }: { className?: string }) {
  const { join, interval, busy, press } = useJoin()
  const label = buttonLabel(join, interval)
  if (join.kind === "invite_only" || join.kind === "banned" || join.kind === "closed" || join.kind === "unavailable") {
    return (
      <p data-join-state={join.kind} className={cn("rounded-xl bg-[#f1f2f4] px-4 py-3 text-center text-[14px] font-medium text-[#4b5563]", className)}>
        {label}
      </p>
    )
  }
  if (join.kind === "pending") {
    return (
      <button type="button" disabled data-join-state="pending" className={cn(PRIMARY, className)}>
        <Check aria-hidden className="mr-1.5 h-4 w-4" />
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
  return (
    <button type="button" onClick={press} disabled={busy} aria-busy={busy} data-join-state={join.kind} className={cn(PRIMARY, className)}>
      {busy ? "One moment" : label}
    </button>
  )
}

/** Monthly or yearly, when the tier offers both. */
function IntervalChoice({ className }: { className?: string }) {
  const { join, interval, setInterval } = useJoin()
  const o = join.option
  if (join.kind !== "checkout" || !bothIntervals(o)) return null
  const saving = yearlySaving(o?.monthlyCents ?? null, o?.yearlyCents ?? null)
  const choices: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: saving > 0 ? `Yearly, save ${saving}%` : "Yearly" },
  ]
  return (
    <div role="radiogroup" aria-label="Billing" data-interval-choice="" className={cn("grid grid-cols-2 gap-1 rounded-xl bg-[#f1f2f4] p-1", className)}>
      {choices.map((c) => {
        const on = interval === c.id
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setInterval(c.id)}
            className={cn(
              "h-10 rounded-[9px] px-2 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
              on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

function Status() {
  const { join, error, busy, withdraw, setLeaveOpen } = useJoin()
  return (
    <>
      {error ? (
        <p role="alert" className="mt-2.5 text-[13px] leading-snug text-[#b42318]">
          {error}
        </p>
      ) : null}
      {join.note && join.kind !== "invite_only" ? <p className="mt-2.5 text-[13px] leading-snug text-[#6b7280]">{join.note}</p> : null}
      {join.kind === "invite_only" && join.note ? <p className="mt-2.5 text-[13px] leading-snug text-[#6b7280]">{join.note}</p> : null}
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

/** "1.2k members · $19/month", the two facts the card leads with. */
function Facts({ className }: { className?: string }) {
  const { community, join, interval } = useJoin()
  const price = join.kind === "open" ? null : join.option ? intervalPrice(join.option, interval) : null
  const parts = [memberCountLabel(community.memberCount), price].filter(Boolean)
  return (
    <p className={cn("text-[14px] tabular-nums text-[#6b7280]", className)} data-join-facts="">
      {parts.join(" · ")}
    </p>
  )
}

/** The sticky card, from 1024px. */
export function JoinCard() {
  const { community, join } = useJoin()
  const image = community.coverUrl || community.logoUrl
  return (
    <aside data-join-card="" className="hidden lg:block">
      <div className="sticky top-[88px]">
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
          {image ? (
            <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={optimizedImageUrl(image, 640)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="p-5">
            <p className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{community.name}</p>
            {community.creator ? (
              <div className="mt-1.5 flex items-center gap-2">
                <AppAvatar src={community.creator.avatarUrl} name={community.creator.name} alt="" size={20} />
                <p className="min-w-0 truncate text-[13px] text-[#6b7280]">by {community.creator.name}</p>
              </div>
            ) : null}
            <Facts className="mt-3" />
            {join.option?.billing === "recurring" && join.kind === "checkout" ? <IntervalChoice className="mt-4" /> : null}
            <PrimaryAction className="mt-4 w-full" />
            <Status />
          </div>
        </div>
      </div>
    </aside>
  )
}

/** On a phone, in the page under the tagline: the facts and the interval, where the card would have said them. */
export function JoinSummaryPhone() {
  return (
    <div className="mt-4 lg:hidden" data-join-summary="">
      <Facts />
      <IntervalChoice className="mt-3" />
      <div className="[&>*:first-child]:mt-0">
        <Status />
      </div>
    </div>
  )
}

/** The bar at the bottom of a phone: the price and the button, above the home indicator. */
export function JoinBarPhone() {
  const { join, interval, community } = useJoin()
  const price = join.kind === "open" || !join.option ? null : intervalPrice(join.option, interval)
  const wide = join.kind === "open" || join.kind === "pending" || !price || ["invite_only", "banned", "closed", "unavailable", "product"].includes(join.kind)
  const ref = React.useRef<HTMLDivElement>(null)
  /*
    THE ROOM IT TAKES, AT THE END OF THE DOCUMENT. The footer comes after
    this page in the layout, so padding the page alone left the footer's last
    lines under the bar. The bar's own height is measured (it changes with the
    safe area and the text size) and given to the body as padding while the
    bar is on screen: one number, read in one place. From 1024px the bar is
    not displayed, measures 0, and takes nothing.
  */
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const body = document.body
    const before = body.style.paddingBottom
    const sync = () => {
      body.style.paddingBottom = `${el.offsetHeight}px`
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
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto flex max-w-[640px] items-center gap-3">
        {/* Whose button it is, beside it: the price is already in the button's words. */}
        {!wide ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{community.name}</p>
            <p className="truncate text-[12.5px] tabular-nums text-[#6b7280]">{memberCountLabel(community.memberCount)}</p>
          </div>
        ) : null}
        <PrimaryAction className={wide ? "w-full" : "shrink-0"} />
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

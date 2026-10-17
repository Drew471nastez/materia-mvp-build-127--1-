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
 *
 * QUESTIONS BEFORE JOINING (round 32). When the community asks questions
 * (GET join-questions, asked as the page arrives for a signed in visitor who
 * can join), the press opens them in the same sheet or dialog first, for a
 * free join and a paid one as well as a request; the answers go with POST
 * join, which checks them again and answers the question it did not accept
 * (answers_needed), and only then joins, asks or sends to checkout.
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
import { JOIN_TRIAL_LABEL, memberCountLabel } from "@/lib/communities/format"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { yearlySaving } from "@/lib/memberships/state"
import { cn } from "@/lib/utils"
import { gaCommunityJoin } from "@/lib/communities/client/ga-events"
import { draftComplete, type AnswerDraft, type JoinQuestion } from "@/lib/communities/join-questions"
import { JoinQuestionFields } from "./join-questions-form"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { CardSummary } from "./card-summary"
import { CommunityShareButton } from "./share-community"
import { CommunityCheckout, PlanPicker } from "./join-flow"
import { cardPrice, planIntervals, plansPrice, type PlanInterval } from "./plan-words"

export { plansPrice }
import { isNativeApp } from "@/lib/platform-utils"
import { CheckDot } from "./check-dot"
import { goJoinAuth, isJoinAuthHref, prefetchJoinAuth } from "./join-nav"
import { communityPath, JOINED_KEY } from "./paths"
import { bothIntervals, buttonLabel, intervalPrice, priceParts } from "./join-words"
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
  press: () => void | Promise<void>
  withdraw: () => void
  leave: (why?: { reason: LeaveReason | null; note: string }) => void
  /** Part 98 is in: leaving asks why (the six reasons and a note, all optional). */
  askWhy: boolean
  requestOpen: boolean
  setRequestOpen: (open: boolean) => void
  sendRequest: (note: string, answers?: AnswerDraft) => void
  /** The community's questions before joining: null until they are known. */
  questions: JoinQuestion[] | null
  /** The question the server did not accept. */
  invalid: string | null
  leaveOpen: boolean
  setLeaveOpen: (open: boolean) => void
  /** Round AF: the plan chosen in the plan picker, while its questions or note are asked. */
  picked: JoinOption | null
  /** Round AG: a member on a free plan moves to a paid one: the picker (several) or the checkout (one). */
  upgrade: () => void
  upgradePlans: JoinOption[]
}

const Ctx = React.createContext<JoinCtx | null>(null)

function useJoin(): JoinCtx {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useJoin outside JoinProvider")
  return v
}

/* The price and button words are pure (./join-words), so a test reads them without this file's checkout. */
export { bothIntervals, buttonLabel, intervalPrice, priceParts }

/* ── Round AF: where the plan picker and the checkout are, in the address ── */

type Flow = { kind: "plans" } | { kind: "pay"; planId: string; interval: PlanInterval } | null
const FLOW_KEYS = ["join", "plan", "interval"] as const

function flowFrom(search: string): Flow {
  const q = new URLSearchParams(search)
  if (q.get("join") === "plans") return { kind: "plans" }
  const plan = q.get("plan")
  if (q.get("join") === "pay" && plan) return { kind: "pay", planId: plan, interval: q.get("interval") === "year" ? "year" : "month" }
  return null
}

function flowUrl(flow: Flow): string {
  const url = new URL(window.location.href)
  for (const k of FLOW_KEYS) url.searchParams.delete(k)
  if (flow?.kind === "plans") url.searchParams.set("join", "plans")
  if (flow?.kind === "pay") {
    url.searchParams.set("join", "pay")
    url.searchParams.set("plan", flow.planId)
    url.searchParams.set("interval", flow.interval)
  }
  return url.pathname + url.search + url.hash
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
  /* The app's next sign-in opens here (lib/account/app-open). Best effort, never blocks the feed. */
  try {
    void fetch("/api/account/app-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: home }),
    })
  } catch {
    /* Offline: the community still opens. */
  }
  /* The store's Google Analytics hears the join, when the store has it (lib/communities/client/ga-events.ts). */
  if (typeof window !== "undefined") gaCommunityJoin(window, slug)
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") !== home) window.history.pushState(null, "", home)
  router.refresh()
}

export function JoinProvider({ community, join, askWhy = false, preview = false, children }: { community: PublicCommunityView; join: JoinStateView; /** Leaving asks why (round 12): only once part 98 has made the table (lib/communities/server/leave-reasons.ts). */ askWhy?: boolean; /** Round AG: the owner's preview; a pick says what would happen and does nothing. */ preview?: boolean; children: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [interval, setInterval] = React.useState<Interval>(() => (join.option?.checkout?.month || !join.option?.checkout?.year ? "month" : "year"))
  const [busy, setBusy] = React.useState(false)
  const [phase, setPhase] = React.useState<JoinPhase>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  const api = `/api/community/${community.id}`
  /* Round AF: the plan picker and the checkout. */
  const [flow, setFlowState] = React.useState<Flow>(null)
  const [pickedPlan, setPicked] = React.useState<JoinOption | null>(null)
  const pickedRef = React.useRef<JoinOption | null>(null)
  pickedRef.current = pickedPlan
  const [pickPending, setPickPending] = React.useState<string | null>(null)
  const [previewNote, setPreviewNote] = React.useState<string | null>(null)
  /*
    Round AG: SOMEBODY ALREADY IN on a free plan picks from the paid plans (an upgrade); everybody else from the plans the
    join offers. One list, so the picker, the checkout's "All plans" and an arrival from signing in read the same.
  */
  const member = join.kind === "open"
  const upgradePlans = React.useMemo(() => (member ? community.options.filter((o) => o.kind === "paid" && !!o.checkout && !!o.tierId) : []), [member, community.options])
  const plans = React.useMemo(() => (member ? upgradePlans : join.plans ?? []), [member, upgradePlans, join.plans])
  /** Opens (or moves) the flow; a new step is a history entry, so Back steps out of it. */
  const openFlow = React.useCallback((next: Flow, replace = false) => {
    setFlowState(next)
    try {
      const url = flowUrl(next)
      if (replace) window.history.replaceState({ ...(window.history.state ?? {}), joinFlow: !!next }, "", url)
      else window.history.pushState({ ...(window.history.state ?? {}), joinFlow: true }, "", url)
    } catch {
      /* The address stays as it is; the flow still opens. */
    }
  }, [])
  const closeFlow = React.useCallback(() => {
    setPickPending(null)
    if (window.history.state?.joinFlow) {
      window.history.back()
      return
    }
    openFlow(null, true)
  }, [openFlow])
  React.useEffect(() => {
    const pop = () => setFlowState(flowFrom(window.location.search))
    window.addEventListener("popstate", pop)
    return () => window.removeEventListener("popstate", pop)
  }, [])
  const [questions, setQuestions] = React.useState<JoinQuestion[] | null>(null)
  const [invalid, setInvalid] = React.useState<string | null>(null)

  /* In the owner's preview nothing leaves the page: a press that would sign in or pay shows the plans instead. */
  const go = React.useCallback(
    (href: string) => {
      if (preview) return void openFlow(plans.length ? { kind: "plans" } : null)
      goJoinAuth(router, href)
    },
    [router, preview, openFlow, plans.length],
  )

  /* The questions, asked once as the page arrives for somebody who can join, so a press opens them at once. */
  const canAsk = join.signedIn && (join.kind === "join_free" || join.kind === "request" || join.kind === "checkout")
  const asking = React.useRef<Promise<JoinQuestion[]> | null>(null)
  const loadQuestions = React.useCallback(
    (fresh = false): Promise<JoinQuestion[]> => {
      if (asking.current && !fresh) return asking.current
      const ask = fetch(`${api}/join-questions`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { questions: [] }))
        .then((d: { questions?: unknown }) => (Array.isArray(d.questions) ? (d.questions as JoinQuestion[]) : []))
        .catch(() => [] as JoinQuestion[])
      asking.current = ask
      void ask.then(setQuestions)
      return ask
    },
    [api],
  )
  React.useEffect(() => {
    if (canAsk) void loadQuestions()
  }, [canAsk, loadQuestions])

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
        if (state === "checkout" && typeof r.data.url === "string") {
          /* The community's own checkout for the plan, on this page (./join-flow); the app's shell keeps the store checkout. */
          const plan = pickedRef.current ?? join.option
          setPhase("idle")
          if (plan?.tierId && plan.kind === "paid" && plan.billing === "recurring" && !isNativeApp()) {
            const offers = planIntervals(plan)
            return openFlow({ kind: "pay", planId: plan.tierId, interval: offers.includes(interval) ? interval : offers[0] ?? "month" }, !!window.history.state?.joinFlow)
          }
          return go(r.data.url)
        }
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
    [community.slug, go, router, interval, join.option, openFlow],
  )

  const joinNow = React.useCallback(
    async (note?: string, answers?: AnswerDraft) => {
      /* On the next frame: the button answers before the request leaves. */
      setBusy(true)
      setPhase("joining")
      setError(null)
      const r = await post(`${api}/join`, { note: note || undefined, interval, tierId: pickedRef.current?.tierId ?? undefined, answers })
      setBusy(false)
      /* An answer the server did not accept: the questions stay open (asked again, in case they changed), pointing at it. */
      if (!r.ok && r.data.error === "answers_needed") {
        setPhase("idle")
        setInvalid(typeof r.data.field === "string" ? r.data.field : null)
        setError(typeof r.data.message === "string" ? r.data.message : "Answer the questions to continue.")
        const fresh = await loadQuestions(true)
        if (fresh.length) setRequestOpen(true)
        return
      }
      setInvalid(null)
      setRequestOpen(false)
      answer(r)
    },
    [answer, api, interval, loadQuestions],
  )

  const press = React.useCallback(async () => {
    if (busy || phase !== "idle") return
    /* Several plans: the plan picker, signed in or not (looking costs nothing; signing in comes with the pick). */
    if (plans.length > 1 && (join.kind === "join_free" || join.kind === "checkout" || join.kind === "request")) {
      setError(null)
      return openFlow({ kind: "plans" })
    }
    if (join.href && (join.kind === "open" || join.kind === "product" || !join.signedIn)) {
      return go(join.href)
    }
    if (join.kind === "request") return setRequestOpen(true)
    if (join.kind !== "join_free" && join.kind !== "checkout") return
    /* The questions first, when the community asks any (known since the page arrived, or a moment more). */
    let asked = questions
    if (!asked) {
      setBusy(true)
      asked = await loadQuestions()
      setBusy(false)
    }
    if (asked.length) {
      setError(null)
      return setRequestOpen(true)
    }
    if (join.kind === "join_free") return void joinNow()
    /* One paid plan: the community's own checkout, on this page (the app's shell keeps the store checkout). */
    const one = join.option
    if (one?.tierId && one.billing === "recurring" && !isNativeApp()) {
      const offers = planIntervals(one)
      return openFlow({ kind: "pay", planId: one.tierId, interval: offers.includes(interval) ? interval : offers[0] ?? "month" })
    }
    const href = checkoutHref(join.option, interval)
    if (href) go(href)
  }, [busy, phase, go, interval, join, joinNow, questions, loadQuestions, plans.length, openFlow])

  /*
    A PLAN PICKED in the plan picker. Signed out: sign in, then back here with the pick made again (?join=pick&plan=).
    Then, as one plan would: the questions or the request note first when there are any (asked over the page, the picker
    out of the way), a free plan joined, a paid one into the checkout. The server checks the plan again on every step.
  */
  const pick = React.useCallback(
    async (plan: JoinOption) => {
      if (busy || phase !== "idle" || !plan.tierId) return
      if (preview) {
        setPreviewNote(plan.kind === "free" ? `Visitors join ${plan.name} here, after signing in.` : `Visitors go to checkout for ${plan.name} here. Nothing is charged in a preview.`)
        return
      }
      setPicked(plan)
      pickedRef.current = plan
      setError(null)
      if (!join.signedIn) {
        const back = `${communityPath(community.slug)}?join=pick&plan=${encodeURIComponent(plan.tierId)}`
        return go(`/login?next=${encodeURIComponent(back)}`)
      }
      /* Already in: no questions or request again, straight to paying for the plan (round AG). */
      if (join.kind === "open") {
        if (plan.kind !== "paid") return openFlow(null, true)
        if (isNativeApp() || plan.billing !== "recurring") {
          const href = checkoutHref(plan, interval)
          if (href) go(href)
          return
        }
        const offers = planIntervals(plan)
        openFlow({ kind: "pay", planId: plan.tierId, interval: offers.includes(interval) ? interval : offers[0] ?? "month" })
        return
      }
      let asked = questions
      if (!asked) {
        setPickPending(plan.tierId)
        asked = await loadQuestions()
        setPickPending(null)
      }
      if (join.kind === "request" || asked.length) {
        openFlow(null, true)
        return setRequestOpen(true)
      }
      if (plan.kind === "free") {
        setPickPending(plan.tierId)
        await joinNow()
        setPickPending(null)
        return
      }
      /* A one time price, or the app's shell: the store checkout, as before (the community's own checkout sells subscriptions). */
      if (isNativeApp() || plan.billing !== "recurring") {
        const href = checkoutHref(plan, interval)
        if (href) go(href)
        return
      }
      const offers = planIntervals(plan)
      openFlow({ kind: "pay", planId: plan.tierId, interval: offers.includes(interval) ? interval : offers[0] ?? "month" })
    },
    [busy, phase, preview, join.signedIn, join.kind, community.slug, go, questions, loadQuestions, openFlow, joinNow, interval],
  )

  /* The flow in the address on arrival (a refresh, a shared link, back from signing in with a pick). */
  const arrived = React.useRef(false)
  React.useEffect(() => {
    if (arrived.current) return
    arrived.current = true
    const q = new URLSearchParams(window.location.search)
    if (q.get("join") === "pick") {
      const plan = plans.find((p) => p.tierId === q.get("plan")) ?? (join.option?.tierId === q.get("plan") ? join.option : null)
      openFlow(null, true)
      if (plan && join.signedIn) void pick(plan)
      return
    }
    const at = flowFrom(window.location.search)
    if (!at) return
    if (at.kind === "plans" && plans.length < (preview ? 1 : 2)) return openFlow(null, true)
    if (at.kind === "pay" && !join.signedIn) return openFlow(plans.length > 1 ? { kind: "plans" } : null, true)
    if (at.kind === "pay") {
      const plan = plans.find((p) => p.tierId === at.planId) ?? (join.option?.tierId === at.planId ? join.option : null)
      if (plan) {
        setPicked(plan)
        pickedRef.current = plan
      }
    }
    setFlowState(at)
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Paid and let in by the server (the payment's sync): into the community, the flow out of the address. */
  const joinedByPayment = React.useCallback(() => {
    try {
      const url = new URL(window.location.href)
      for (const k of [...FLOW_KEYS, "sub"]) url.searchParams.delete(k)
      window.history.replaceState(window.history.state, "", url.pathname + url.search)
    } catch {
      /* The community still opens. */
    }
    setFlowState(null)
    setPhase("joined")
    enterCommunity(community.slug, router)
  }, [community.slug, router])

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
    if (join.kind === "join_free" || join.kind === "request" || join.kind === "checkout") void press()
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
    sendRequest: (note, answers) => void joinNow(note, answers),
    questions,
    invalid,
    leaveOpen,
    setLeaveOpen,
    picked: pickedPlan,
    upgradePlans,
    upgrade: () => {
      if (upgradePlans.length > 1) openFlow({ kind: "plans" })
      else if (upgradePlans[0]) void pick(upgradePlans[0])
    },
  }
  const backToPlans = plans.length > 1 ? () => openFlow({ kind: "plans" }, true) : null
  return (
    <Ctx.Provider value={value}>
      {children}
      <RequestDialog />
      <LeaveDialog />
      {flow?.kind === "plans" && plans.length > (preview ? 0 : 1) ? <PlanPicker community={community} plans={plans} onClose={closeFlow} onPick={(p) => void pick(p)} pending={pickPending} error={error} preview={preview ? previewNote ?? "Preview: this is what visitors see when they press Join." : null} /> : null}
      {flow?.kind === "pay" && join.signedIn ? (
        <CommunityCheckout
          community={community}
          planId={flow.planId}
          interval={flow.interval}
          onInterval={(i) => {
            setInterval(i)
            openFlow({ kind: "pay", planId: flow.planId, interval: i }, true)
          }}
          onClose={closeFlow}
          onBack={backToPlans}
          onJoined={joinedByPayment}
        />
      ) : null}
    </Ctx.Provider>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1a1a2e] bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[#2a2a40] active:bg-[#10101d] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:border-[#e5e7eb] disabled:bg-[#e5e7eb] disabled:text-[#6b7280] disabled:shadow-none motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
/* A quiet second action: text, but a 40px target, so a thumb finds it. Pressed: no bump (round 11), the button only darkens. */
const QUIET = "-mx-1 inline-flex min-h-10 items-center px-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline disabled:opacity-60"

/*
  THE CREATOR'S OWN BUTTON (round 33, lib/communities/page-look.ts). Their words take the place of the page's own on a
  button that joins, asks or pays (never on Open community, a pending request or a sentence), and its style is theirs:
  ink (the page's own), the community's colour from its logo (darkened until white reads on it at 4.5:1), or an outline.
  Pending keeps the quiet disabled look whatever the style.
*/
const OUTLINE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1a1a2e] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[#f6f7f8] active:bg-[#eef0f2] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
const BRAND = "hover:brightness-[0.94] active:brightness-[0.88]"

/** Whether this button is one the creator's words and style apply to. */
export function ownButton(kind: JoinStateView["kind"]): boolean {
  return kind === "join_free" || kind === "request" || kind === "checkout"
}

function lookOf(community: PublicCommunityView, kind: JoinStateView["kind"]): { className: string; style: React.CSSProperties | undefined; ink: boolean } {
  const look = community.joinLook
  if (!look || !ownButton(kind) || look.style === "ink") return { className: PRIMARY, style: undefined, ink: false }
  if (look.style === "outline") return { className: OUTLINE, style: undefined, ink: true }
  return look.brand ? { className: cn(PRIMARY, BRAND), style: { backgroundColor: look.brand, borderColor: look.brand }, ink: false } : { className: PRIMARY, style: undefined, ink: false }
}

/** The creator's line under the button, when there is one and the button is theirs. */
function JoinNote({ className }: { className?: string }) {
  const { community, join } = useJoin()
  const note = community.joinLook?.note
  if (!note || !ownButton(join.kind)) return null
  return (
    <p className={cn("mt-2 text-center text-[13px] leading-snug text-[#6b7280]", className)} data-join-note="">
      {note}
    </p>
  )
}

/**
 * The button itself, or the sentence when there is nothing to press. Round 26: the same words wherever it is drawn
 * (the side card, the phone's bar), the creator's own when they wrote some, else the configuration's.
 */
function PrimaryAction({ className }: { className?: string }) {
  const { community, join, interval, busy, phase, press } = useJoin()
  const own = ownButton(join.kind) ? community.joinLook?.label?.trim() || "" : ""
  const label = own || buttonLabel(join, interval)
  const look = lookOf(community, join.kind)
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
    <button type="button" onClick={() => void press()} aria-busy={busy || phase !== "idle"} data-join-state={join.kind} data-join-phase={phase} data-join-style={community.joinLook?.style ?? "ink"} style={look.style} className={cn(look.className, "relative", className)}>
      <span className={cn("inline-flex items-center gap-2 transition-opacity duration-150", phase === "idle" ? "opacity-100" : "opacity-0")}>{label}</span>
      {phase !== "idle" ? (
        <span aria-live="polite" className="absolute inset-0 inline-flex items-center justify-center gap-2 animate-in fade-in-0 duration-150" data-join-progress="">
          {phase === "joining" ? (
            <>
              <Spinner size={18} className={look.ink ? "!text-[#1a1a2e]" : "!text-white"} />
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
  /* Several plans: each says its own price in the plan picker, and the checkout has the switch. */
  if ((join.plans?.length ?? 0) > 1) return null
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
  /* Round AG: with several plans the picker shows the prices; the card shows the button alone, never "Free or 1 paid plan". */
  const parts = (join.plans?.length ?? 0) > 1 ? null : priceParts(join.option, interval)
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
  /*
    ROUND AH: ONE PLACE FOR THE PLAN. The community's own Membership page
    (components/community/member/membership.tsx) shows the plan, its dates,
    Upgrade, Cancel and Manage billing; this row goes there, and a member on
    a free plan can upgrade from right here.
  */
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-[#eceef1] bg-[#fafbfb] px-4 py-3.5 sm:px-5" data-membership-row="">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#1a1a2e]">
          {what} of {community.name}.
        </p>
        <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{join.manageHref ? "Your plan, billing, upgrade or cancel." : "Your plan and notifications, or leave."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <UpgradeButton className={cn(ROW_BUTTON, "text-[#1a1a2e]")} />
        <Link href={`${communityPath(community.slug)}/membership`} className={cn(ROW_BUTTON, "text-[#1a1a2e]")} data-membership-manage="">
          Manage membership
        </Link>
        {!join.manageHref && join.canLeave ? (
          <button type="button" onClick={() => setLeaveOpen(true)} className={cn(ROW_BUTTON, "text-[#b42318]")} data-membership-leave="">
            Leave
          </button>
        ) : null}
      </div>
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
 * "POWERED BY" UNDER THE CARD (round 26, the owner's section 5): small, light grey, the Storelib mark and name, a link
 * to storelib.com. Only where the side card is drawn (from 1280px), so never on a phone.
 */
function PoweredBy() {
  return (
    <p className="mt-3.5 flex items-center justify-center gap-1.5 text-[12px] text-[#9ca3af]" data-powered-by="">
      <span>Powered by</span>
      <a
        href="https://storelib.com"
        target="_blank"
        rel="noopener"
        aria-label="Storelib"
        className="-my-1.5 inline-flex items-center gap-1 rounded-md py-1.5 font-semibold text-[#8a8f98] outline-none transition-colors duration-150 hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
      >
        <StorelibLogo size={14} alt="" className="[--storelib-logo-radius:3.5px]" />
        Storelib
      </a>
    </p>
  )
}

/**
 * THE INFO CARD, from 1280px, sticky in the frame's right column (round 12; round 26 for the owner's section 5): the
 * cover with Share in its corner (when the community may be shared, about-facts.ts canShareCommunity), the logo, the
 * name and its address, the short description (clamped, with More), the social icons, the price with Monthly and
 * Yearly and the one button, then the quiet facts (admins, since when, who runs it). "Powered by" Storelib under it.
 * `links` and `summary` come drawn from the sheet (sales-page.tsx), which knows the Page editor's placeholders.
 */
export function JoinCard({ facts = null, summary = null, links = null, share = false }: { facts?: React.ReactNode; summary?: React.ReactNode; links?: React.ReactNode; share?: boolean }) {
  const { community, join } = useJoin()
  const shareButton = share ? <CommunityShareButton slug={community.slug} name={community.name} onCover={!!community.coverUrl} /> : null
  return (
    <aside data-join-card="" className="hidden xl:block">
      <div className="sticky top-[calc(var(--community-top,65px)+24px)]" data-join-card-sticky="">
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]" data-join-card-box="">
          {/* The community's cover and picture, here rather than in a second card on the left (round 15). */}
          {community.coverUrl ? (
            <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]" data-join-card-cover="">
              <div className="absolute inset-0" data-page-block="cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={optimizedImageUrl(community.coverUrl, 640)} alt="" style={community.coverPosition ? { objectPosition: community.coverPosition } : undefined} className="absolute inset-0 h-full w-full object-cover" decoding="async" />
              </div>
              {shareButton ? <div className="absolute right-3 top-3">{shareButton}</div> : null}
            </div>
          ) : null}
          <div className="p-5">
            <div className="flex items-center gap-3">
              {community.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImageUrl(community.logoUrl, 96)} alt="" width={44} height={44} data-page-block="logo" className="h-11 w-11 shrink-0 rounded-[10px] object-cover shadow-[0_0_0_1px_rgba(16,24,40,0.07),0_1px_2px_rgba(16,24,40,0.1)]" decoding="async" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-semibold leading-snug tracking-[-0.005em] text-[#1a1a2e] [overflow-wrap:anywhere]" data-page-block="name">{community.name}</p>
                <a href={community.url} className="mt-0.5 block truncate text-[13px] text-[#8a8f98] hover:text-[#4b5563]">{community.address}</a>
              </div>
              {/* No cover to sit on: Share at the end of the name's row. */}
              {shareButton && !community.coverUrl ? <div className="shrink-0 self-start">{shareButton}</div> : null}
            </div>
            {summary ? <div className="mt-3.5">{summary}</div> : null}
            {join.kind === "open" ? (
              join.isOwner ? (
                <p className="mt-4 text-[14px] text-[#4b5563]">You run this community.</p>
              ) : (
                /* Round AH: a member reaches their plan, billing, upgrade and cancel from the card. */
                <Link href={`${communityPath(community.slug)}/membership`} className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#f6f7f8] px-3.5 py-2.5 text-[14px] text-[#1a1a2e] transition-colors hover:bg-[#eef0f2]" data-join-card-membership="">
                  <span className="min-w-0 truncate">You&apos;re a member</span>
                  <span className="shrink-0 text-[13px] font-medium text-[#4b5563]">Your membership &rsaquo;</span>
                </Link>
              )
            ) : (
              <>
                <PriceLine className="mt-4" />
                <IntervalSwitch className="mt-3" full />
              </>
            )}
            <div data-page-block="join">
              <PrimaryAction className="mt-4 w-full" />
              <JoinNote />
              <Status />
            </div>
            {/* Round 27, the owner: the website and social pages under the button (Join, or Open community for a member), not above the price. */}
            {links ? (
              <div className="mt-4 [&_[data-community-links]]:justify-start" data-join-card-links="">
                {links}
              </div>
            ) : null}
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
        <PoweredBy />
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
  const several = (join.plans?.length ?? 0) > 1
  const includes = several ? [] : o?.benefits?.length ? o.benefits : []
  const title = join.kind === "invite_only" ? "Invite only" : join.kind === "product" ? "Comes with a product" : several ? "Plans" : o?.name || "Membership"
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e3e5e9] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6" data-pricing-card={join.kind}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
            {several ? (
              <p className="mt-0.5 max-w-[46ch] text-[13.5px] leading-snug text-[#6b7280]" data-pricing-plans="">
                {(join.plans ?? []).map((p) => (p.kind === "free" ? (/free/i.test(p.name) ? p.name : `${p.name} free`) : `${p.name} ${cardPrice(p).amount}${cardPrice(p).per ?? ""}`)).join(" · ")}
              </p>
            ) : o?.description && join.kind !== "invite_only" ? <p className="mt-0.5 max-w-[46ch] text-[13.5px] leading-snug text-[#6b7280]">{o.description}</p> : null}
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
        <div data-page-block="join" className="sm:inline-block">
          <PrimaryAction className="mt-5 w-full sm:w-auto sm:min-w-[240px]" />
          <JoinNote />
        </div>
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
/**
 * WHERE THE PHONE'S BAR IS FIXED (round 33): the document's body, or the body of the Page editor's preview frame, so the
 * bar is fixed to the preview's screen and never to the editor's own.
 */
export const JoinSurface = React.createContext<HTMLElement | null>(null)

export function JoinBarPhone() {
  const { join, interval, community } = useJoin()
  const surface = React.useContext(JoinSurface)
  /*
    Round 26: the button says what the side card's says ("Join $24/month", "Start free trial", "Choose plan"), so the
    price is not said again beside it: the community's name and its members are, or, for a trial, what comes after it,
    or, with several plans, what they start from.
  */
  const wide = !(join.kind === "checkout" || join.kind === "join_free" || join.kind === "request")
  const several = (join.plans?.length ?? 0) > 1
  const from = several ? plansPrice(join.plans ?? []) : null
  const trial = !several && join.kind === "checkout" && join.label === JOIN_TRIAL_LABEL && join.option?.trialDays ? join.option.trialDays : 0
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
    const doc = el.ownerDocument
    const body = doc.body
    const view = doc.defaultView ?? window
    const before = body.style.paddingBottom
    const sync = () => {
      const tabs = doc.querySelector<HTMLElement>("[data-buyer-tab-bar='shown']")
      const under = tabs && tabs.offsetHeight > 0 ? tabs.offsetHeight : 0
      body.style.paddingBottom = `${Math.max(0, el.offsetHeight - under)}px`
    }
    sync()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync)
    ro?.observe(el)
    view.addEventListener("resize", sync)
    return () => {
      ro?.disconnect()
      view.removeEventListener("resize", sync)
      body.style.paddingBottom = before
    }
  }, [onClient, surface])
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
      <div className="mx-auto flex max-w-[640px] items-center gap-3" data-join-bar-row="" data-page-block="join">
        {!wide ? (
          <div className="min-w-0 flex-1" data-join-bar-about="">
            <p className="truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">{trial ? `${trial} days free` : community.name}</p>
            <p className="truncate text-[12.5px] tabular-nums text-[#6b7280]">{trial ? `Then ${intervalPrice(join.option, interval)}` : from ? `${from.amount}${from.per ? (from.per.startsWith("/") ? from.per : ` ${from.per}`) : ""}` : memberCountLabel(community.memberCount)}</p>
          </div>
        ) : null}
        <PrimaryAction className={wide ? "w-full" : "max-w-[62%] shrink-0 px-4"} />
      </div>
      <JoinNote className={cn("mx-auto mt-1.5 max-w-[640px] text-[12.5px]", !wide && "text-right")} />
    </div>
  )
  return onClient ? createPortal(bar, surface ?? document.body) : bar
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

/**
 * THE JOIN FORM (round 32): a request's note, and the community's questions
 * before joining when it has any, for a request, a free join or a paid one.
 * The title, the line under it and the button say which: "Request to join"
 * and Send request, or "Before you join" and Join or Continue to payment.
 * The button waits for every required question. The questions scroll
 * between the title and the buttons, so the buttons never leave the screen.
 */
function RequestDialog() {
  const { community, join: joinState, requestOpen, setRequestOpen, sendRequest, busy, error, questions, invalid, picked } = useJoin()
  /* A plan picked in the plan picker decides what comes next: a request stays a request, otherwise it is that plan's join or payment. */
  const join = picked && joinState.kind !== "request" ? { ...joinState, kind: picked.kind === "free" ? ("join_free" as const) : ("checkout" as const) } : joinState
  const phone = usePhone()
  const [note, setNote] = React.useState("")
  const [draft, setDraft] = React.useState<AnswerDraft>({})
  const max = LENGTHS.requestNote.max
  const asked = questions ?? []
  const request = join.kind === "request"
  const ready = draftComplete(asked, draft)
  const title = request ? "Request to join" : "Before you join"
  const line = request
    ? asked.length
      ? `An admin of ${community.name} reviews requests. Answer a few questions first.`
      : `An admin of ${community.name} reviews requests. Add a line about yourself if you like.`
    : join.kind === "checkout"
      ? `${community.name} asks new members a few questions. You pay on the next page.`
      : `${community.name} asks new members a few questions.`
  const action = request ? (busy ? "Sending" : "Send request") : join.kind === "checkout" ? (busy ? "Opening checkout" : "Continue to payment") : busy ? "Joining" : "Join"
  return (
    <SheetDialog open={requestOpen} onClose={() => setRequestOpen(false)} phone={phone} label={request ? `Request to join ${community.name}` : `Join ${community.name}`} className={cn("gap-0 rounded-2xl p-0", asked.length ? "max-w-[480px]" : "max-w-[440px]")}>
      <div className="flex max-h-[min(80vh,720px)] min-h-0 flex-col" data-join-form={join.kind} data-join-form-questions={asked.length}>
        <div className={phone ? "px-5 pt-1" : "px-6 pt-6"}>
          <SheetDialogTitle className="text-[18px] font-semibold text-[#1a1a2e]">{title}</SheetDialogTitle>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{line}</p>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto pb-1 pt-4", phone ? "px-5" : "px-6")} data-join-form-body="">
          {asked.length ? (
            <JoinQuestionFields questions={asked} draft={draft} onChange={setDraft} invalid={invalid} disabled={busy} />
          ) : (
            <>
              <label className="block">
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
            </>
          )}
        </div>
        <div className={cn("border-t border-[#f1f2f4] pt-3", phone ? "px-5 pb-[calc(16px+env(safe-area-inset-bottom,0px))]" : "px-6 pb-5")} data-join-form-foot="">
          {error ? (
            <p role="alert" className="mb-2.5 text-[13px] text-[#b42318]" data-join-form-error="">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setRequestOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
              Cancel
            </button>
            <button type="button" onClick={() => sendRequest(note.trim(), asked.length ? draft : undefined)} disabled={busy || !ready} className={cn(PRIMARY, "flex-1")} data-join-form-send="">
              {action}
            </button>
          </div>
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

/**
 * Round AG: "Upgrade" for a member on a free plan (the Membership page): the paid plans in the picker, or straight to
 * the one there is. Nothing when the community sells no paid plan.
 */
export function UpgradeButton({ className }: { className?: string }) {
  const { join, upgrade, upgradePlans, busy } = useJoin()
  if (join.kind !== "open" || upgradePlans.length === 0) return null
  const one = upgradePlans.length === 1 ? upgradePlans[0] : null
  const trial = one?.trialDays ?? 0
  return (
    <button type="button" onClick={upgrade} disabled={busy} className={className ?? PRIMARY} data-membership-upgrade="">
      {one ? (trial > 0 ? `Start ${trial}-day free trial of ${one.name}` : `Upgrade to ${one.name}`) : "Upgrade your plan"}
    </button>
  )
}

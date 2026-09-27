"use client"

/**
 * ===========================================================================
 *  HOME'S THREE CARDS: GETTING STARTED, THE GUIDE, AND YOUR PLAN
 * ===========================================================================
 * Under the Pro plan banner.
 *
 * GETTING STARTED is the seven steps of lib/home/progress, each read off the
 * account on the server and asked for again when Home is landed on
 * (use-home-progress), never ticked by hand. What is left comes first and
 * what is done drops to the bottom, crossed out, so the step at the top is
 * always the next one, and it alone carries the arrow. When all seven are
 * done the same card turns into the CHALLENGES, the next things that grow a
 * store, counted the same way and drawn the same way, with how far each has
 * got. At its foot, the three ways a buyer pays, on tiles that lift.
 *
 * Every step and challenge that is a page is an AppLink
 * (components/app/app-link): it moves exactly like a row in the sidebar.
 * The two that are done here are buttons: the guide, and the first sale,
 * which opens the share panel.
 *
 * THE GUIDE is the way in for somebody who does not know where to start, so
 * pressing it points at Getting started: the card gives a small press, and
 * Getting started bumps (scrolled into view first when it is off screen)
 * with its next step lit for a moment. Opening it is itself a step, kept on
 * the account.
 *
 * YOUR PLAN is the plan the account is on, by the name Billing uses, and the
 * lines are that plan's own, from lib/billing/plans.ts, the same table the
 * pricing cards read. On Free the button is Upgrade to Pro.
 *
 * HOVER, AND ITS STAND IN ON A PHONE. The lift (the card rising a little
 * with a deeper shadow on a layer of its own, the tiles tipping, the guide's
 * light drifting, the plan's clouds drifting) is CSS in
 * app/globals.css (HOME CARDS), on opacity, translate,
 * rotate and scale only, and behind (hover: hover) and (pointer: fine), so a
 * tap never leaves it stuck. A phone cannot hover, so there it plays by
 * itself (useHoverAutoplay): the same motion, the same rules, on a card that
 * has been at least 60% on screen for two seconds, and again every five
 * while it stays there.
 */
import { ArrowRight, Check, Play } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AppLink } from "@/components/app/app-link"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { OFFERED_PLANS, planDisplayName, planHighlights } from "@/lib/billing/plans"
import type { HomeProgress, ProgressItem } from "@/lib/home/progress"
import { APP_PAGE_KEPT_MS, prefetchAppPage } from "@/lib/ui/app-navigation"
import { PayPalMark, StripeMark, VisaMark } from "./payment-marks"

export const GETTING_STARTED_ID = "getting-started"

let bumpTimer = 0

/**
 * Points at Getting started: scrolled into view when it is not on screen,
 * then a bump. The attribute is taken off and put back so a second press
 * plays it again.
 */
export function bumpGettingStarted() {
  const card = document.getElementById(GETTING_STARTED_ID)
  if (!card) return
  const box = card.getBoundingClientRect()
  const offScreen = box.top < 56 || box.bottom > window.innerHeight
  const play = () => {
    card.removeAttribute("data-bump")
    void card.offsetWidth
    card.setAttribute("data-bump", "")
  }
  window.clearTimeout(bumpTimer)
  if (offScreen) {
    card.scrollIntoView({ behavior: "smooth", block: "center" })
    bumpTimer = window.setTimeout(play, 420)
  } else play()
}

/*
  No overflow-hidden on the card itself: the deeper shadow of the lift is a
  layer of its own (::before in globals.css) that has to show outside the
  card. What must be clipped (the tiles, the plan's band, the guide's
  thumbnail) is clipped where it is drawn.
*/
const CARD = "home-card relative flex flex-col rounded-[20px] border border-[#e6e7eb] bg-white"

/* ─── Playing the hover on a touch screen ──────────────────────────────── */

/** On screen this long before the first play... */
export const AUTOPLAY_AFTER_MS = 2000
/** ...then every this long while it stays there... */
export const AUTOPLAY_EVERY_MS = 6000
/** ...held lifted this long, then let go: the time a hover takes to arrive and be seen. */
export const AUTOPLAY_HOLD_MS = 2200
/** How much of the card has to be on screen. */
export const AUTOPLAY_IN_VIEW = 0.6

/**
 * The hover's motion, played on a card where nothing can hover. It sets
 * `data-play` on the card, which globals.css lifts exactly as `:hover` does,
 * and takes it off AUTOPLAY_HOLD_MS later, which lets it settle exactly as
 * leaving does.
 *
 * It runs only while all of this holds: the device has no hover (a mouse
 * never sees it), the card is at least 60% on screen (IntersectionObserver),
 * no finger is on it, the tab is showing, and nobody asked for less motion.
 * The moment one stops holding, every timer is cleared and the card settles;
 * nothing runs for a card that is off screen. When they hold again the two
 * seconds start over. A play that falls while a sheet covers the page is
 * skipped, so nothing moves under the sheet while it is dragged.
 */
export function useHoverAutoplay<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === "undefined" || typeof IntersectionObserver !== "function" || !window.matchMedia) return
    const mouse = window.matchMedia("(hover: hover) and (pointer: fine)")
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)")
    let inView = false
    let touching = false
    let start = 0
    let cycle = 0
    let settle = 0
    const letGo = () => {
      window.clearTimeout(settle)
      settle = 0
      el.removeAttribute("data-play")
    }
    const play = () => {
      /* A sheet or a dialog over the page covers the card: the shared sheet marks <html>, Radix's scroll lock marks <body>. */
      if (document.documentElement.hasAttribute("data-app-sheet-up") || document.body.hasAttribute("data-scroll-locked")) return
      el.setAttribute("data-play", "")
      window.clearTimeout(settle)
      settle = window.setTimeout(letGo, AUTOPLAY_HOLD_MS)
    }
    const stop = () => {
      window.clearTimeout(start)
      window.clearInterval(cycle)
      start = 0
      cycle = 0
      letGo()
    }
    const sync = () => {
      const may = inView && !touching && document.visibilityState === "visible" && !mouse.matches && !calm.matches
      if (!may) {
        stop()
        return
      }
      if (start || cycle) return
      start = window.setTimeout(() => {
        start = 0
        play()
        cycle = window.setInterval(play, AUTOPLAY_EVERY_MS)
      }, AUTOPLAY_AFTER_MS)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = !!entry && entry.isIntersecting && entry.intersectionRatio >= AUTOPLAY_IN_VIEW - 0.001
        sync()
      },
      { threshold: [0, AUTOPLAY_IN_VIEW, 1] },
    )
    io.observe(el)
    /* A finger on the card, scrolling or about to tap: it holds still until the finger lifts. */
    const down = () => {
      touching = true
      sync()
    }
    const up = () => {
      if (!touching) return
      touching = false
      sync()
    }
    el.addEventListener("touchstart", down, { passive: true })
    window.addEventListener("touchend", up, { passive: true })
    window.addEventListener("touchcancel", up, { passive: true })
    document.addEventListener("visibilitychange", sync)
    mouse.addEventListener?.("change", sync)
    calm.addEventListener?.("change", sync)
    return () => {
      stop()
      io.disconnect()
      el.removeEventListener("touchstart", down)
      window.removeEventListener("touchend", up)
      window.removeEventListener("touchcancel", up)
      document.removeEventListener("visibilitychange", sync)
      mouse.removeEventListener?.("change", sync)
      calm.removeEventListener?.("change", sync)
    }
  }, [])
  return ref
}

/**
 * THE NEXT STEP IS FETCHED AHEAD, once the card has been seen: the press
 * most likely to come lands on the next frame, the way the pill's four
 * pages do (they are fetched when it mounts). One page, once per
 * APP_PAGE_KEPT_MS, and only a page of /app.
 */
function useWarmWhenSeen(ref: React.RefObject<HTMLElement | null>, href: string | null) {
  const router = useRouter()
  useEffect(() => {
    const el = ref.current
    if (!el || !href || !(href === "/app" || href.startsWith("/app/")) || typeof IntersectionObserver !== "function") return
    let warmedAt = 0
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || Date.now() - warmedAt < APP_PAGE_KEPT_MS) return
      warmedAt = Date.now()
      prefetchAppPage(router, href)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, href, router])
}

/* ─── Getting started, then the challenges ─────────────────────────────── */

export function GettingStartedCard({
  progress,
  onGuide,
  onShare,
}: {
  progress: HomeProgress
  /** Opens the guide: the step "How to get started". */
  onGuide?: () => void
  /** Opens the share panel; without it the sale steps are links to Orders. */
  onShare?: () => void
}) {
  const challenges = progress.phase === "challenges"
  const items = challenges ? progress.challenges : progress.steps
  const done = challenges ? progress.challengesDone : progress.completed
  const total = items.length
  const ordered = [...items.filter((s) => !s.done), ...items.filter((s) => s.done)]
  const next = ordered.find((s) => !s.done)
  const cardRef = useHoverAutoplay<HTMLElement>()
  useWarmWhenSeen(cardRef, next?.href ?? null)

  /*
    A STEP THAT IS DONE MOVES, IT DOES NOT JUMP. When one ticks while the
    card is on screen (the guide pressed, a refresh after a domain was
    verified) the rows swap places: each is drawn where it was and slides to
    where it is, on transform, the rest of the page untouched.
  */
  const listRef = useRef<HTMLUListElement>(null)
  const tops = useRef(new Map<string, number>())
  const orderKey = ordered.map((s) => `${s.id}:${s.done ? 1 : 0}`).join(",")
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"))
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    for (const row of rows) {
      const id = row.dataset.row!
      const top = row.offsetTop
      const before = tops.current.get(id)
      tops.current.set(id, top)
      if (calm || before == null || before === top || typeof row.animate !== "function") continue
      row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
        duration: 420,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      })
    }
  }, [orderKey])

  /* Setup done while on screen: the challenges come in on a fade, once. */
  const phaseRef = useRef(progress.phase)
  useLayoutEffect(() => {
    if (phaseRef.current === progress.phase) return
    phaseRef.current = progress.phase
    const list = listRef.current
    if (!list || typeof list.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    tops.current.clear()
    list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" })
  }, [progress.phase])

  const title = challenges ? "Challenges" : "Getting started"
  return (
    <section
      ref={cardRef}
      id={GETTING_STARTED_ID}
      data-phase={progress.phase}
      aria-labelledby="getting-started-title"
      className={`${CARD} min-h-[392px]`}
    >
      <div className="relative z-10 px-5 pt-5">
        <div className="flex items-center justify-between">
          <h2 id="getting-started-title" className="text-[14px] font-semibold text-[#1a1a2e]">
            {title}
          </h2>
          <span data-progress-count="" className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
            {done} of {total}
          </span>
        </div>
        <div
          className="mt-3 h-[5px] overflow-hidden rounded-full bg-[#eef0f3]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={challenges ? "Challenges done" : "Setup progress"}
        >
          {/* Full width, moved back by what is left: it grows on translate, and keeps its round end. */}
          <div
            className="h-full w-full rounded-full bg-[#1a1a2e] transition-[translate] duration-700 ease-out"
            style={{ translate: `${(done / Math.max(1, total) - 1) * 100}% 0` }}
          />
        </div>
      </div>

      <ul ref={listRef} className="relative z-10 mt-2.5 px-2.5">
        {ordered.map((item) => (
          <li key={item.id} data-row={item.id}>
            <ProgressRow item={item} isNext={item === next} onGuide={onGuide} onShare={onShare} />
          </li>
        ))}
      </ul>

      <PaymentTiles />
    </section>
  )
}

/** "3/10", or "$120/$1,000" for money. */
function countText(item: ProgressItem): string | null {
  if (item.done || item.target == null || item.target <= 1) return null
  const current = item.current ?? 0
  if (item.unit === "cents") {
    const money = (cents: number) => `$${Math.floor(cents / 100).toLocaleString("en-US")}`
    return `${money(current)}/${money(item.target)}`
  }
  return `${current}/${item.target}`
}

function ProgressRow({
  item,
  isNext,
  onGuide,
  onShare,
}: {
  item: ProgressItem
  isNext: boolean
  onGuide?: () => void
  onShare?: () => void
}) {
  const row = `flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left outline-none transition-colors duration-150 hover:bg-[#f5f6f7] focus-visible:bg-[#f5f6f7] [-webkit-tap-highlight-color:transparent]`
  const count = countText(item)
  const body: ReactNode = (
    <>
      {item.done ? (
        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-[#b9bec7]">
          <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <span className="h-[17px] w-[17px] shrink-0 rounded-full border-[1.5px] border-[#c9cdd4] bg-white" />
      )}
      <span
        className={
          item.done
            ? "min-w-0 flex-1 truncate text-[13px] text-[#9ca3af] line-through decoration-[#b9bec7]"
            : `min-w-0 flex-1 truncate text-[13px] ${isNext ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]"}`
        }
      >
        {item.label}
        {item.done && <span className="sr-only"> (done)</span>}
      </span>
      {count && <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{count}</span>}
      {isNext && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-[#e3e5e9] bg-white text-[#6b7280] shadow-[0_1px_1px_rgba(16,24,40,0.05)]">
          <ArrowRight className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
        </span>
      )}
    </>
  )
  const nextProps = isNext ? { "data-next-step": "" } : {}

  const press = item.action === "guide" ? onGuide : item.action === "share" ? onShare : undefined
  if (press) {
    return (
      <button type="button" onClick={press} className={row} {...nextProps}>
        {body}
      </button>
    )
  }
  /* A sale step with no address to share yet: Orders, where sales are. */
  const href = item.href ?? (item.action === "share" ? "/app/orders" : "/app")
  return (
    <AppLink href={href} className={row} {...nextProps}>
      {body}
    </AppLink>
  )
}

/**
 * PayPal, Visa and Stripe on their tiles, tipped, part of the Stripe tile
 * past the card's edge. The room they take is held in the card's flow; the
 * tiles themselves sit in a layer the card's own shape clips, so the card
 * needs no overflow of its own and its lift can show outside it.
 */
function PaymentTiles() {
  return (
    <>
      <div aria-hidden="true" className="mt-auto h-[118px] shrink-0" />
      <div aria-hidden="true" className="home-guide-clip pointer-events-none absolute inset-0 overflow-hidden rounded-[19px]">
        <div className="absolute inset-x-0 bottom-0 h-[118px]">
          <div
            data-pay-tile="visa"
            className="absolute bottom-[-15px] left-[40%] flex h-[74px] w-[112px] items-center justify-center rounded-[16px] bg-[#0f0f12] text-white"
          >
            <VisaMark className="w-[58px]" />
          </div>
          <div
            data-pay-tile="paypal"
            className="absolute bottom-[20px] left-[9%] flex h-[78px] w-[78px] items-center justify-center rounded-[20px] bg-white"
          >
            <PayPalMark className="h-[40px] w-auto" />
          </div>
          <div
            data-pay-tile="stripe"
            className="absolute bottom-[13px] right-[-7px] flex h-[72px] w-[104px] items-center justify-center rounded-[16px] bg-[#635bff] text-white"
          >
            <StripeMark className="w-[58px]" />
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── The guide ────────────────────────────────────────────────────────── */

export function SetupGuideCard({ onOpen }: { onOpen?: () => void }) {
  const ref = useHoverAutoplay<HTMLButtonElement>()
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen ?? bumpGettingStarted}
      className={`${CARD} home-guide min-h-[300px] cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]`}
    >
      <span className="px-6 pt-6 text-[13px] font-medium text-[#6b7280]">Store setup guide</span>
      <span className="mt-1.5 max-w-[15ch] px-6 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em] text-[#111114] sm:text-[28px]">
        How to get started with your store
      </span>

      {/* The card's own shape clips the thumbnail where it runs off the corner. */}
      <span aria-hidden="true" className="home-guide-clip pointer-events-none absolute inset-0 overflow-hidden rounded-[19px]">
        <span className="home-guide-thumb absolute bottom-[-18px] right-[-18px] flex aspect-[16/10.5] w-[78%] max-w-[320px] flex-col justify-between overflow-hidden rounded-[18px] p-4">
          <span className="home-guide-light" />
          <span className="relative flex items-center gap-1.5">
            <StorelibLogo size={18} alt="" />
            <span className="text-[12px] font-medium text-white/80">Storelib</span>
          </span>
          <span className="relative flex items-end justify-between gap-3 pb-3 pr-3">
            <span className="text-[22px] font-semibold leading-[1.08] tracking-[-0.015em] text-white">
              Welcome to
              <br />
              Storelib
            </span>
            <span className="home-guide-play flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15">
              <Play className="ml-0.5 h-4 w-4 fill-white text-white" aria-hidden="true" />
            </span>
          </span>
        </span>
      </span>
    </button>
  )
}

/* ─── Your plan ────────────────────────────────────────────────────────── */

/** What the plan includes, from the same table the pricing cards read. */
function linesFor(planId: string): string[] {
  const offered = OFFERED_PLANS.find((p) => p.id === planId)
  if (offered) return offered.features
  if (planId === "pro") return planHighlights("pro")
  return OFFERED_PLANS[0].features
}

export function PlanCard({ planId }: { planId: string }) {
  const free = !planId || planId === "free"
  const id = free ? "free" : planId
  const lines = linesFor(id)
  const ref = useHoverAutoplay<HTMLElement>()

  return (
    <section ref={ref} aria-labelledby="your-plan-title" className={`${CARD} min-h-[392px]`}>
      {/* The deep violet sky it first had, clouded and grained, its clouds drifting on hover (globals.css, home-plan-head). */}
      <div className="home-plan-head flex h-[46px] shrink-0 items-center rounded-t-[19px] px-5">
        <h2 id="your-plan-title" className="text-[13.5px] font-semibold text-white">
          Your Plan
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#111114]">{planDisplayName(id)}</p>
        <p className="mt-2 text-[12.5px] text-[#9ca3af]">Included in your plan</p>

        <div className="relative mt-3.5 min-h-[96px] flex-1 overflow-hidden">
          {/* 2px in from the left and 1px down: the checks' 1px ring sits outside their circle, and the list clips. */}
          <ul className="space-y-[9px] pl-[2px] pt-px">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-[20px] text-[#1f2230]">
                {/* A light grey circle with a lit top edge, the check in the page's grey: one size for every line. */}
                <span data-plan-check="" className="home-plan-check mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full">
                  <Check className="h-[11px] w-[11px] text-[#6b7280]" strokeWidth={2.75} aria-hidden="true" />
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {/* The last lines go soft, as if the list ran on past the card. */}
          <div aria-hidden="true" className="home-plan-fade pointer-events-none absolute inset-x-0 bottom-0 h-[64px]" />
        </div>

        <AppLink
          href={free ? "/app/settings/billing/upgrade" : "/app/settings/billing"}
          className="mt-4 inline-flex h-11 w-full shrink-0 items-center justify-center rounded-[12px] bg-[#16161a] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-colors duration-150 hover:bg-[#2a2a31] active:bg-[#0b0b0d] focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]"
        >
          {free ? "Upgrade to Pro" : "Manage plan"}
        </AppLink>
      </div>
    </section>
  )
}

/* ─── The row ──────────────────────────────────────────────────────────── */

/**
 * Three across from 1280 up, where the column beside the 240px sidebar is
 * wide enough for three. Below that, Getting started and Your Plan side by
 * side with the guide across the width under them; on a phone, one under
 * another in the order they read.
 */
export function HomeCards({
  progress,
  planId,
  onGuide,
  onShare,
}: {
  progress: HomeProgress
  planId: string
  onGuide?: () => void
  onShare?: () => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
      <GettingStartedCard progress={progress} onGuide={onGuide} onShare={onShare} />
      <div className="grid sm:order-last sm:col-span-2 xl:order-none xl:col-span-1">
        <SetupGuideCard onOpen={onGuide} />
      </div>
      <PlanCard planId={planId} />
    </div>
  )
}

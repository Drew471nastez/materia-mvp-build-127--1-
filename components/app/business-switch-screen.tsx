"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import AppColdStart from "@/app/app/cold-start"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { playEntrance } from "@/components/app/app-stage"
import { NAV_ENTER_EASE } from "@/lib/ui/app-navigation"
import { cn } from "@/lib/utils"
import {
  ARRIVAL_BUSY_MIN_AREA,
  ARRIVAL_CAP_MS,
  ARRIVAL_SETTLE_CAP_MS,
  clearSwitchCookie,
  handoverAt,
  HANDOVER_MS,
  LINE_FADE_MS,
  LINE_MIN_MS,
  LINE_RISE_PX,
  lineShowsAt,
  SCREEN_IN_MS,
  SCREEN_OUT_MS,
  spinDelay,
  switchLine,
  type SwitchStep,
} from "@/lib/businesses/switch-screen"

/**
 * ===========================================================================
 *  THE SCREEN OF A SWITCH, ON BOTH SIDES OF THE RELOAD
 * ===========================================================================
 * The shell's own empty frame (app/app/cold-start: the header's #111111, the
 * rail from md, the content area's #f8f9fa with its rounded top on a phone),
 * the light gray spinner in the place every slow page and cold start puts it,
 * and one line under it saying which step of the switch is happening
 * (lib/businesses/switch-screen). Nothing else: no card, no photo that might
 * decode a frame late on the other side, no second spinner.
 *
 *   ON THE PAGE YOU WERE ON (SwitchingScreen, from the account menu). Up on
 *   the frame after the press, over everything, the menu too, on a 140ms
 *   fade. If the switch fails it fades away over the business you are
 *   still in, and the menu under it says why.
 *
 *   ON THE NEW /app (BusinessSwitchArrival, from app/app/layout.tsx). The
 *   server's HTML draws it with the line the other page ended on, so the
 *   swap of documents shows nothing. It stays until the new /app can be
 *   drawn whole: the shell and its page in place, the fonts, the pictures
 *   of the first screen decoded, the first screen's big loading parts
 *   (the chart) answered, or ARRIVAL_SETTLE_CAP_MS, whichever comes first.
 *   Then one 200ms fade, with the page under it taking the stage's own 2px
 *   rise (app-stage playEntrance), the rise only: the screen's fade is the
 *   page's fade, and fading both would multiply them.
 *
 *   A NEW BUSINESS (SwitchingScreen with `mode="create"`, then
 *   NewBusinessScreen on /signup/success). The same spinner and the same
 *   line at the same height, on the plain white the setup is drawn on
 *   rather than in the app's frame: "Setting up your new business" while
 *   the server makes it, "Opening your new business" once the browser holds
 *   its session, and the same words on the setup page's first frame. When
 *   the setup's first step opens, the spinner and the line fade out under
 *   it and the white stays, so no frame shows the page behind.
 *
 * A line changes by fading: the old one out and up 4px, the new one in from
 * 4px below, a little after, so the two never sit on top of each other at
 * half strength. Opacity and translate only. With reduced motion there is
 * no movement: the lines swap on opacity alone and the screen comes and goes
 * without a fade, as the slow page's surface does.
 */

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/* ── The line ───────────────────────────────────────────────────────────── */

type Line = { key: string; text: string; id: number }

function Lines({ lineKey, text }: { lineKey: string; text: string }) {
  const [items, setItems] = useState<Line[]>(() => [{ key: lineKey, text, id: 0 }])
  const els = useRef(new Map<number, HTMLElement>())
  const last = items[items.length - 1]
  /* A new line: the one before it stays for its fade out, anything older goes at once. */
  if (last.key !== lineKey) setItems([last, { key: lineKey, text, id: last.id + 1 }])

  useLayoutEffect(() => {
    if (items.length < 2) return
    const [out, into] = items
    const outEl = els.current.get(out.id)
    const inEl = els.current.get(into.id)
    const still = reducedMotion()
    const drop = () => setItems((now) => (now[now.length - 1]?.id === into.id ? [now[now.length - 1]] : now))
    if (!outEl || !inEl || typeof inEl.animate !== "function") { drop(); return }
    const rise = still ? 0 : LINE_RISE_PX
    const from = Number(getComputedStyle(outEl).opacity)
    for (const a of outEl.getAnimations()) a.cancel()
    outEl.animate(
      [{ opacity: from, translate: "0 0" }, { opacity: 0, translate: `0 ${-rise}px` }],
      { duration: LINE_FADE_MS * 0.7, easing: "ease-in", fill: "forwards" },
    )
    const inAnim = inEl.animate(
      [{ opacity: 0, translate: `0 ${rise}px` }, { opacity: 1, translate: "0 0" }],
      { duration: LINE_FADE_MS, delay: LINE_FADE_MS * 0.4, easing: NAV_ENTER_EASE, fill: "backwards" },
    )
    inAnim.onfinish = drop
    const t = window.setTimeout(drop, LINE_FADE_MS * 1.4 + 120)
    return () => window.clearTimeout(t)
  }, [items])

  return (
    <div className="grid w-full justify-items-center">
      {items.map((l) => (
        <p
          key={l.id}
          ref={(el) => { if (el) els.current.set(l.id, el); else els.current.delete(l.id) }}
          data-switch-line={l.key}
          aria-hidden={l !== items[items.length - 1] || undefined}
          className="max-w-full truncate text-center text-[15px] font-medium leading-[22px] text-[#1a1a2e] [grid-area:1/1]"
        >
          {l.text}
        </p>
      ))}
    </div>
  )
}

/* ── The screen ─────────────────────────────────────────────────────────── */

/**
 * `spin`: the spinner's turn (lib/businesses/switch-screen spinDelay), set on
 * the screen itself on the page you were on. The new document's HTML sets it
 * on <html> before its first paint instead (SWITCH_SPIN_SCRIPT), when there
 * is nothing drawn yet for it to restyle; set on the <html> of a page already
 * drawn, it would restyle the whole page in the frame the screen comes up in.
 */
/** Where the screen is drawn: the app's own frame for a switch, plain white for a new business's setup. */
export type ScreenSurface = "app" | "plain"

function Screen({
  step,
  name,
  ready,
  spin,
  screenRef,
  surface = "app",
  leaving = false,
}: {
  step: SwitchStep
  name: string
  ready: boolean
  spin?: string
  screenRef?: React.Ref<HTMLDivElement>
  surface?: ScreenSurface
  /** The page under it is taking over: the spinner and the line fade out, the surface stays. */
  leaving?: boolean
}) {
  const text = switchLine(step, name, { ready })
  /* The spinner exactly where PageSpinner puts it (40% down), the line under it without moving it. */
  const middle = (
    <div
      data-switch-middle=""
      className={cn(
        "grid h-full w-full grid-rows-[2fr_auto_3fr] justify-items-center transition-opacity ease-out motion-reduce:transition-none",
        leaving && "opacity-0",
      )}
      style={{ transitionDuration: `${HANDOVER_MS}ms` }}
    >
      <div className="relative row-start-2">
        <span aria-hidden className="block">
          <ActivitySpinner label="" />
        </span>
        <div className="absolute left-1/2 top-full ml-[-150px] mt-4 w-[300px]">
          <Lines lineKey={step} text={text} />
        </div>
      </div>
    </div>
  )
  return (
    <div
      ref={screenRef}
      data-business-switch-screen=""
      data-surface={surface}
      data-step={step}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      className="fixed inset-0 z-[500] touch-none select-none"
      style={spin ? ({ "--switch-spin-delay": spin } as React.CSSProperties) : undefined}
    >
      {surface === "app" ? <AppColdStart>{middle}</AppColdStart> : <div className="absolute inset-0 bg-white">{middle}</div>}
    </div>
  )
}

/* ── The steps, one line at a time ──────────────────────────────────────── */

/**
 * The step on screen, moved on by the switch's real steps and held to the
 * rules of lib/businesses/switch-screen: a later step's line only once it
 * has lasted LINE_AFTER_MS (unless it is to show at once), and never before
 * the line on screen has had LINE_MIN_MS.
 */
function useSteps(first: SwitchStep) {
  const [step, setStep] = useState<SwitchStep>(first)
  const shownAt = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const go = useCallback((next: SwitchStep, { atOnce = false }: { atOnce?: boolean } = {}) => {
    window.clearTimeout(timer.current)
    const now = performance.now()
    const at = lineShowsAt(now, shownAt.current, { atOnce })
    const show = () => {
      shownAt.current = performance.now()
      setStep(next)
    }
    if (at <= now) show()
    else timer.current = window.setTimeout(show, at - now)
  }, [])
  /* The step now on screen began at `at` (the first, already drawn). */
  const shown = useCallback((at: number) => { shownAt.current = at }, [])
  /* No more lines: a step still waiting to show never does. When the line on screen has had its time. */
  const settle = useCallback((readyAt: number) => {
    window.clearTimeout(timer.current)
    return handoverAt(readyAt, shownAt.current)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { step, go, shown, settle }
}

/* ── On the page you were on ────────────────────────────────────────────── */

export type SwitchingHandle = {
  /** The server said yes and the browser now asks for the other business's /app. */
  opening: () => void
  /** The switch did not happen: the screen goes, over the business you are still in. */
  fail: () => void
}

/**
 * The screen from the account menu, drawn over the whole page. `onGone` once
 * a failed switch's screen has faded away. `handle` is how the switch moves
 * it on. `mode="create"` is New business: its own two lines, on the plain
 * white its setup is drawn on.
 */
export function SwitchingScreen({
  name,
  ready,
  handleRef,
  onGone,
  mode = "switch",
}: {
  name: string
  ready: boolean
  handleRef: React.MutableRefObject<SwitchingHandle | null>
  onGone: () => void
  mode?: "switch" | "create"
}) {
  const creating = mode === "create"
  const { step, go, shown } = useSteps(creating ? "creating" : "asking")
  const ref = useRef<HTMLDivElement>(null)
  /* Its spinner's turn, from the wall clock, as the new document's will be. */
  const [spin] = useState(() => spinDelay(Date.now(), reducedMotion()))

  /* Up before it is painted, and already a frame into its fade on the first
     frame that shows it: a fade that starts at 0 spends the frame after the
     press drawing nothing. */
  useLayoutEffect(() => {
    shown(performance.now())
    const el = ref.current
    if (!el || reducedMotion() || typeof el.animate !== "function") return
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SCREEN_IN_MS, easing: "ease-out" })
    a.currentTime = 1000 / 60
  }, [shown])

  useEffect(() => {
    handleRef.current = {
      opening: () => go(creating ? "starting" : "opening", { atOnce: true }),
      fail: () => {
        const el = ref.current
        if (!el || reducedMotion() || typeof el.animate !== "function") { onGone(); return }
        const from = Number(getComputedStyle(el).opacity)
        for (const a of el.getAnimations()) a.cancel()
        let done = false
        const end = () => { if (!done) { done = true; onGone() } }
        el.animate([{ opacity: from }, { opacity: 0 }], { duration: SCREEN_OUT_MS, easing: NAV_ENTER_EASE, fill: "forwards" }).onfinish = end
        window.setTimeout(end, SCREEN_OUT_MS + 150)
      },
    }
    return () => { handleRef.current = null }
  }, [creating, go, handleRef, onGone])

  /* Only ever drawn after a press, so there is a document to put it in. */
  return createPortal(<Screen step={step} name={name} ready={ready} spin={spin} screenRef={ref} surface={creating ? "plain" : "app"} />, document.body)
}

/* ── On the new /app ────────────────────────────────────────────────────── */

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Until `test` is true, checked once a frame, or `by` (performance.now() time). */
async function until(test: () => boolean, by: number) {
  while (!test() && performance.now() < by) await frame()
}

/** A promise, or `by`, whichever comes first. */
function within(p: Promise<unknown> | undefined, by: number) {
  if (!p) return Promise.resolve()
  return Promise.race([p.catch(() => undefined), new Promise((r) => window.setTimeout(r, Math.max(0, by - performance.now())))])
}

function onFirstScreen(el: Element) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
}

/**
 * THE NEW /app IS READY TO DRAW. Not "the script has run": the page under
 * the screen is what the eye will see the moment it goes, so it has to be
 * the page, whole.
 *
 *   THE SHELL AND ITS PAGE. The /app HTML is the cold start's frame until
 *   the language is known (components/app/app-layout-wrapper), and the
 *   native app can be on its session gate: the header, the rail and a page
 *   in the content area, and no frame of the cold start left.
 *   THE FONTS, so no line rewraps as the screen goes.
 *   THE PICTURES of the first screen, the header's photo above all: fetched
 *   and decoded, so none of them pops in after the fade.
 *   THE FIRST SCREEN'S BIG LOADING PARTS, marked aria-busy (Home's chart
 *   while its first figures come): answered.
 *
 * The last three share ARRIVAL_SETTLE_CAP_MS: a slow picture never keeps
 * anybody on the screen. The whole thing gives up at ARRIVAL_CAP_MS.
 */
async function whenAppReady(screen: HTMLElement): Promise<void> {
  const start = performance.now()
  const outside = (el: Element) => !screen.contains(el)
  await until(() => {
    const scroll = document.querySelector(".app-content-scroll")
    if (!scroll?.firstElementChild) return false
    return !Array.from(document.querySelectorAll("[data-app-cold-start]")).some(outside)
  }, start + ARRIVAL_CAP_MS)
  const by = performance.now() + ARRIVAL_SETTLE_CAP_MS
  await within((document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready, by)
  const pictures = Array.from(document.images).filter((img) => outside(img) && onFirstScreen(img))
  await within(Promise.all(pictures.map((img) => (typeof img.decode === "function" ? img.decode().catch(() => undefined) : undefined))), by)
  await until(() => !Array.from(document.querySelectorAll('[aria-busy="true"]')).some((el) => {
    if (!outside(el) || !onFirstScreen(el)) return false
    const r = el.getBoundingClientRect()
    return r.width * r.height >= ARRIVAL_BUSY_MIN_AREA
  }), by)
  /* One frame for whatever that last answer drew. */
  await frame()
}

/**
 * The screen as the new /app's HTML draws it, `name` from the cookie the
 * switch left (lib/businesses/switch-screen SWITCH_COOKIE). It opens on the
 * line the page before ended on, says "Loading your dashboard" only if the
 * page takes long enough to read it, and hands over once the page is ready.
 */
export function BusinessSwitchArrival({ name }: { name: string }) {
  const { step, go, shown, settle } = useSteps("opening")
  const ref = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    /* "Opening" has been up since the page before: it can give way at once. */
    shown(performance.now() - LINE_MIN_MS)
    go("arriving")
    const secure = location.protocol === "https:"
    const finish = () => {
      if (cancelled) return
      cancelled = true
      document.cookie = clearSwitchCookie({ secure })
      setGone(true)
    }
    whenAppReady(el).then(async () => {
      if (cancelled) return
      const at = settle(performance.now())
      if (at > performance.now()) await new Promise((r) => window.setTimeout(r, at - performance.now()))
      if (cancelled) return
      /* The page takes the stage's rise under the fade: the fade is the screen's. */
      const outer = document.querySelector<HTMLElement>(".app-content-scroll")
      if (outer) playEntrance(outer, { fade: false })
      if (reducedMotion() || typeof el.animate !== "function") { finish(); return }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HANDOVER_MS, easing: NAV_ENTER_EASE, fill: "forwards" }).onfinish = finish
      window.setTimeout(finish, HANDOVER_MS + 150)
    })
    return () => { cancelled = true }
  }, [go, settle, shown])

  if (gone) return null
  return <Screen step={step} name={name} ready screenRef={ref} />
}

/* ── On the new business's setup ────────────────────────────────────────── */

/**
 * The screen as /signup/success draws it for a new business (`?business=new`,
 * lib/businesses/switch-client createBusiness): from its first HTML, while it
 * finds the session, and under the setup once that opens. The same surface,
 * spinner and line as the menu's last frame ("Opening your new business"),
 * so the reload between them shows nothing. `leaving` once the setup's first
 * step is up: the spinner and the line fade out under it, the white stays.
 */
export function NewBusinessScreen({ leaving = false }: { leaving?: boolean }) {
  return <Screen step="starting" name="" ready={false} surface="plain" leaving={leaving} />
}

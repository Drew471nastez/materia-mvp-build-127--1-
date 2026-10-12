"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ShellHeaderStill, STILL_AVATAR } from "@/components/app/shell-header-still"
import { avatarSource } from "@/components/app/app-avatar"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { AppTopCorners } from "@/components/app/app-top-corners"
import { playEntrance } from "@/components/app/app-stage"
import { NAV_ENTER_EASE } from "@/lib/ui/app-navigation"
import { cn } from "@/lib/utils"
import {
  ARRIVAL_BUSY_MIN_AREA,
  ARRIVAL_CAP_MS,
  ARRIVAL_HARD_CAP_MS,
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
  SWITCH_HTML_CLASS,
  SWITCH_SCREEN_ID,
  switchLine,
  type SwitchStep,
} from "@/lib/businesses/switch-screen"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE SCREEN OF A SWITCH, ON BOTH SIDES OF THE RELOAD
 * ===========================================================================
 * ONE SURFACE, NOT A HALF DRAWN SHELL. This used to be the cold start's own
 * frame (app/app/cold-start): the bar, the shell's empty white rail from md,
 * and the grey content area beside it with its rounded corner. On a cold
 * start that frame is the point, because the shell really is about to be
 * drawn there and nothing else is on the glass. In the middle of a switch it
 * read as a break: the page you were on had a full sidebar, and the moment
 * you pressed, that column emptied to white with nothing in it while a grey
 * panel sat beside it with a curve cut into its corner. The owner saw it as
 * one screen torn in two ("the sidebar there, it's cut").
 *
 * So the switch has its own surface (SwitchSurface): the app's own bar along
 * the top, exactly the height and colour the shell's header has at this
 * width, with the header's rounded corners hanging from it, and under it one
 * field from edge to edge (the page's #f8f9fa on a phone, white from md,
 * SwitchSurface below). No rail, no seam, no second colour: nothing
 * of the shell is half drawn, because nothing of the shell is drawn at all.
 * The bar stays because it is the one part of the app that is the same on
 * both sides of the switch, so the screen coming up and going away changes
 * nothing up there, and on a phone the status bar keeps the dark it is
 * drawn against. A new business's setup is drawn on plain white
 * (`surface="plain"` below), without the bar, as that page is.
 *
 * On it, the light gray spinner in the place every slow page and cold start
 * puts it (40% down, PageSpinner's rows) and one line under it saying which
 * step of the switch is happening (lib/businesses/switch-screen). Nothing
 * else: no card, no photo that might decode a frame late on the other side,
 * no second spinner.
 *
 * THE BAR IS NOT AN EMPTY BAND. "There's the black top bar there showing,
 * which I don't understand why." The frame's bar used to be bare black from
 * the press to the new page. It draws the business you are going to now,
 * its photo and its name where the real header puts them, with the icons on
 * the right (components/app/shell-header-still), from the cookie's name and
 * photo on the new document too. The photo was fetched and decoded when the
 * menu's list opened, so it is there on the first frame on both sides.
 *
 * WHY THE SWITCH IS STILL A NEW DOCUMENT: see lib/businesses/switch-client.
 * In short, the app keeps per account things outside React that only a new
 * document is sure to empty.
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
 *   NewBusinessScreen on /signup/success). The same white, the same spinner
 *   and the same line at the same height, without the app's bar, because
 *   the setup it opens on has no bar of its own to hold still under it:
 *   "Setting up your new business" while the server makes it, "Opening
 *   your new business" once the browser holds its session, and the same
 *   words on the setup page's first frame. When the setup's first step
 *   opens, the spinner and the line fade out under it and the white stays,
 *   so no frame shows the page behind.
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
      [{ opacity: from, translate: "0 0" }, { opacity: 0, translate: tt("0 {value}px", { value: -rise }) }],
      { duration: LINE_FADE_MS * 0.7, easing: "ease-in", fill: "forwards" },
    )
    const inAnim = inEl.animate(
      [{ opacity: 0, translate: tt("0 {rise}px", { rise }) }, { opacity: 1, translate: "0 0" }],
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

/** Try again comes in on the line's own fade, a little after it. */
function fadeIn(el: HTMLElement | null) {
  if (!el || reducedMotion() || typeof el.animate !== "function") return
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LINE_FADE_MS, delay: LINE_FADE_MS * 0.4, easing: NAV_ENTER_EASE, fill: "backwards" })
}

/**
 * `spin`: the spinner's turn (lib/businesses/switch-screen spinDelay), set on
 * the screen itself on the page you were on. The new document's HTML sets it
 * on <html> before its first paint instead (SWITCH_SPIN_SCRIPT), when there
 * is nothing drawn yet for it to restyle; set on the <html> of a page already
 * drawn, it would restyle the whole page in the frame the screen comes up in.
 */
/** Where the screen is drawn: the page's own field under the app's bar for a switch, plain white for a new business's setup. */
export type ScreenSurface = "app" | "plain"

/**
 * ===========================================================================
 *  THE SURFACE A SWITCH IS DRAWN ON
 * ===========================================================================
 * The app's bar, and one field under it from edge to edge: the page's own
 * #f8f9fa on a phone, white from md.
 *
 * THE BAR is the shell's own: 68px under the status bar on a phone, 58px
 * from md, #111111 and #131316, read with env(safe-area-inset-top) so a
 * browser gets 0, the same way app/app/cold-start.tsx and the two headers
 * in components/app/sidebar.tsx write it. The corners are not drawn here
 * at all: they come from the one component that draws them everywhere
 * (components/app/app-top-corners), in this bar's own colour through
 * `text-`, at the one radius in app/globals.css, so a switch can never
 * curve by a different amount than the page it is waiting for.
 *
 * Keeping the bar is what makes the screen come and go without anything
 * moving: the page you were on has this bar, the page you are going to has
 * it, so the fade in and the fade out only ever change what is under it.
 *
 * THE FIELD runs the full width from the bar's bottom edge down, under the
 * bar's two corners, so there is no rail, no edge and no second colour
 * anywhere on it. It is one surface with a spinner on it, which is what a
 * screen that is waiting should look like; the shell's shape belongs to the
 * page, and the page draws it itself a moment later.
 *
 * ON A PHONE IT IS THE PAGE'S OWN #f8f9fa. "At some point in that timeline
 * of switching, a glitch, a refresh flash thing." Filmed at 390 (scripts/
 * check-business-switch.mjs), the phone's field was white while every page
 * it sits between is #f8f9fa at that width: the page you were on, the new
 * /app's shell and its cold start. So the screen came up as a lighter sheet
 * and went away into a darker one, the whole glass changing tone twice.
 * Now it is the page's colour, the same pixels as the shell it hands over
 * to, and the only thing that changes at the hand over is the page's own
 * content arriving. From md it stays white edge to edge: there the owner
 * asked for no rail and no grey panel beside it ("the sidebar there, it's
 * cut"), and the switch was not what glitched.
 *
 * THE ORDER THE TWO ARE WRITTEN IN IS THE ORDER THEY ARRIVE. A browser draws
 * a document it has only half read, so a screen written white-first showed a
 * frame of the spinner and the line on white with no bar at all. The bar is
 * written first now and the white begins under it.
 */
function SwitchSurface({ children, header }: { children?: ReactNode; header?: ReactNode }) {
  return (
    <div data-switch-surface="" className="absolute inset-0">
      {/* The bar before the white, and the white only under it. A browser
          draws a document it has read half of, so the order the two fields
          are written in is the order they arrive on the glass. This used to
          be one white box from edge to edge with the bar written after it,
          and a frame caught between the two (measured at 1440, the document
          in two parts) was the spinner and the line on white with NO BAR AT
          ALL: white where the bar is on every other frame of the switch. The
          bar is first now and the white starts under it, so no frame can
          have one without the other. z-10 because the corners hang below the
          bar over the white, and the white is written after them. */}
      <div className="absolute inset-x-0 top-0 z-10 h-[calc(68px+env(safe-area-inset-top,0px))] bg-[#111111] text-[#111111] md:h-[calc(58px+env(safe-area-inset-top,0px))] md:bg-[#131316] md:text-[#131316]">
        <AppTopCorners />
        {/* The business you are going to, drawn where the real header puts it: the bar is never an empty band. */}
        {header}
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] bg-[#f8f9fa] md:top-[calc(58px+env(safe-area-inset-top,0px))] md:bg-white">
        {children}
      </div>
    </div>
  )
}

function Screen({
  step,
  name,
  photo = null,
  ready,
  spin,
  screenRef,
  surface = "app",
  leaving = false,
  problem = null,
}: {
  step: SwitchStep
  name: string
  /** The business's photo, for the bar (components/app/shell-header-still). */
  photo?: string | null
  ready: boolean
  spin?: string
  screenRef?: React.Ref<HTMLDivElement>
  surface?: ScreenSurface
  /** The page under it is taking over: the spinner and the line fade out, the surface stays. */
  leaving?: boolean
  /** The new page never came: one line saying so in place of the step, and Try again under it. */
  problem?: { text: string; onRetry: () => void } | null
}) {
  const text = problem ? problem.text : switchLine(step, name, { ready })
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
        {/* The line before the spinner in the markup (it is placed under it all the same): a document painted before it is fully read shows the words first. */}
        <div className="absolute left-1/2 top-full ml-[-150px] mt-4 flex w-[300px] flex-col items-center">
          <Lines lineKey={problem ? "problem" : step} text={text} />
          {problem && (
            <button
              type="button"
              ref={fadeIn}
              onClick={problem.onRetry}
              data-switch-retry=""
              className="mt-4 h-10 rounded-full bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white [-webkit-tap-highlight-color:transparent] active:opacity-80"
            >
              {tt("Try again")}
            </button>
          )}
        </div>
        {/* Nothing is on its way while it says it did not open: the spinner goes, on opacity, and keeps its room so nothing moves. */}
        <span aria-hidden className={cn("block transition-opacity duration-200", problem && "opacity-0")}>
          <ActivitySpinner label="" />
        </span>
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
      aria-busy={!leaving && !problem}
      className="fixed inset-0 z-[500] touch-none select-none"
      style={spin ? ({ "--switch-spin-delay": spin } as React.CSSProperties) : undefined}
    >
      {surface === "app" ? <SwitchSurface header={<ShellHeaderStill name={name} photo={photo} />}>{middle}</SwitchSurface> : <div className="absolute inset-0 bg-white">{middle}</div>}
      {/* THE SCREEN IS ALL THERE. The new document's <head> asks the browser
          not to draw until this element is parsed (lib/businesses/switch-
          screen, rel=expect), so the page before — the same screen — stays on
          the glass until then. It is the LAST thing in the screen and not the
          screen itself, because a browser lets go of that rule the moment the
          element it names is in the document: on the screen's own box that is
          its opening tag, with the bar, the spinner and the line still to
          come, and a frame drawn there was measured as the two fields with
          nothing on them. Here there is nothing left to parse. It draws
          nothing and takes no room. */}
      <span aria-hidden="true" id={SWITCH_SCREEN_ID} />
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
  /**
   * The browser holds the new business but its page never came. The screen
   * stays (the page under it is the business before, no longer yours to use
   * as it was), says so in one line, and `retry` asks for the page again.
   */
  stall: (retry: () => void) => void
}

/**
 * The screen from the account menu, drawn over the whole page. `onGone` once
 * a failed switch's screen has faded away. `handle` is how the switch moves
 * it on. `mode="create"` is New business: its own two lines, on the plain
 * white its setup is drawn on.
 */
export function SwitchingScreen({
  name,
  photo = null,
  ready,
  handleRef,
  onGone,
  mode = "switch",
}: {
  name: string
  photo?: string | null
  ready: boolean
  handleRef: React.MutableRefObject<SwitchingHandle | null>
  onGone: () => void
  mode?: "switch" | "create"
}) {
  const creating = mode === "create"
  const { step, go, shown } = useSteps(creating ? "creating" : "asking")
  const ref = useRef<HTMLDivElement>(null)
  const [problem, setProblem] = useState<{ text: string; onRetry: () => void } | null>(null)
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
      opening: () => {
        setProblem(null)
        go(creating ? "starting" : "opening", { atOnce: true })
      },
      stall: (retry) => setProblem({ text: creating ? tt("Your new business did not open") : tt("{name} did not open", { name }), onRetry: retry }),
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
  }, [creating, go, handleRef, name, onGone])

  /* Only ever drawn after a press, so there is a document to put it in. */
  return createPortal(<Screen step={step} name={name} photo={photo} ready={ready} spin={spin} screenRef={ref} surface={creating ? "plain" : "app"} problem={problem} />, document.body)
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
 * anybody on the screen. The shell gets ARRIVAL_CAP_MS.
 *
 * NEVER HANDED OVER TO THE COLD START. If the shell is not there by then
 * because the app's session gate is still at work (components/native-auth-
 * gate, finding the session on the device), handing over would put the
 * cold start's frame on the glass: the bar with nothing in it and a grey
 * panel, then the page. So the screen stays until the gate has ended, one
 * way or the other (the page, its own "Cannot reach the server" with Try
 * again, or a page load of its own), which the gate itself bounds at ten
 * seconds. `by` (from ARRIVAL_HARD_CAP_MS) bounds the whole wait all the
 * same.
 */
async function whenAppReady(screen: HTMLElement, by: number): Promise<void> {
  const start = performance.now()
  const outside = (el: Element) => !screen.contains(el)
  const coldStart = () => Array.from(document.querySelectorAll("[data-app-cold-start]")).some(outside)
  const shell = () => !!document.querySelector(".app-content-scroll")?.firstElementChild && !coldStart()
  await until(shell, Math.min(by, start + ARRIVAL_CAP_MS))
  if (!shell() && coldStart()) await until(() => !coldStart(), by)
  const settleBy = Math.min(by, performance.now() + ARRIVAL_SETTLE_CAP_MS)
  await within((document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready, settleBy)
  const pictures = Array.from(document.images).filter((img) => outside(img) && onFirstScreen(img))
  await within(Promise.all(pictures.map((img) => (typeof img.decode === "function" ? img.decode().catch(() => undefined) : undefined))), settleBy)
  await until(() => !Array.from(document.querySelectorAll('[aria-busy="true"]')).some((el) => {
    if (!outside(el) || !onFirstScreen(el)) return false
    const r = el.getBoundingClientRect()
    return r.width * r.height >= ARRIVAL_BUSY_MIN_AREA
  }), settleBy)
  /* One frame for whatever that last answer drew. */
  await frame()
}

/**
 * The script takes over from the HTML's own limit (lib/businesses/switch-
 * screen SWITCH_ARRIVAL_SCRIPT): the screen is this component's to end now,
 * and the timer that would have taken it away without React is stopped.
 */
function takeOverFromHtml() {
  const w = window as Window & { __slSwitchOwned?: boolean; __slSwitchGiveUp?: number }
  w.__slSwitchOwned = true
  if (w.__slSwitchGiveUp) window.clearTimeout(w.__slSwitchGiveUp)
}

/**
 * The screen as the new /app's HTML draws it, `name` from the cookie the
 * switch left (lib/businesses/switch-screen SWITCH_COOKIE). It opens on the
 * line the page before ended on, says "Loading your dashboard" only if the
 * page takes long enough to read it, and hands over once the page is ready.
 *
 * IT ALWAYS ENDS, AND ENDING CLEARS THE COOKIE. Every way out goes through
 * `end`: the hand over, ARRIVAL_HARD_CAP_MS on a timer that does not depend
 * on frames being drawn, the page being shown again from the back and
 * forward cache (the switch is long over by then), and this component going
 * away before any of those. Before this script runs at all, the HTML has its
 * own limit (SWITCH_ARRIVAL_SCRIPT), for a phone whose script never loads.
 *
 * ONLY FROM A DOCUMENT'S OWN HTML. The layout draws it whenever the cookie
 * is sent, and the cookie is sent with the router's own requests as well as
 * the page's. Drawn fresh by the router (a refresh inside /app within the
 * cookie's half minute) it draws nothing and clears the cookie: a screen
 * that is not already on the glass is never put there by a background
 * request.
 */
export function BusinessSwitchArrival({ name, photo = null }: { name: string; photo?: string | null }) {
  const [live] = useState(() => typeof document === "undefined" || !!document.getElementById(SWITCH_SCREEN_ID))
  const { step, go, shown, settle } = useSteps("opening")
  const ref = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    takeOverFromHtml()
    const el = ref.current
    const secure = location.protocol === "https:"
    let over = false
    const clear = () => {
      document.cookie = clearSwitchCookie({ secure })
      /* The canvas goes back to the app's own (app/globals.css
         html.switch-arriving, html.app-layout): the switch is over. */
      document.documentElement.classList.remove(SWITCH_HTML_CLASS)
    }
    const end = () => {
      if (over) return
      over = true
      clear()
      setGone(true)
    }
    if (!live || !el) {
      end()
      return
    }
    const hard = window.setTimeout(end, ARRIVAL_HARD_CAP_MS)
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) end()
    }
    window.addEventListener("pageshow", onShow)
    /* "Opening" has been up since the page before: it can give way at once. */
    shown(performance.now() - LINE_MIN_MS)
    go("arriving")
    const by = performance.now() + ARRIVAL_HARD_CAP_MS - HANDOVER_MS - 150
    whenAppReady(el, by).then(async () => {
      if (over) return
      const at = settle(performance.now())
      if (at > performance.now()) await new Promise((r) => window.setTimeout(r, at - performance.now()))
      if (over) return
      /* The page takes the stage's rise under the fade: the fade is the screen's. */
      const outer = document.querySelector<HTMLElement>(".app-content-scroll")
      if (outer) playEntrance(outer, { fade: false })
      if (reducedMotion() || typeof el.animate !== "function") { end(); return }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HANDOVER_MS, easing: NAV_ENTER_EASE, fill: "forwards" }).onfinish = end
      window.setTimeout(end, HANDOVER_MS + 150)
    })
    return () => {
      window.clearTimeout(hard)
      window.removeEventListener("pageshow", onShow)
      if (!over) {
        over = true
        clear()
      }
    }
  }, [go, live, settle, shown])

  if (gone || !live) return null
  return (
    <>
      <StillPhotoPreload photo={photo} />
      <Screen step={step} name={name} photo={photo} ready screenRef={ref} />
    </>
  )
}

/**
 * THE PHOTO IS ASKED FOR FROM THE <head>. The bar's photo is in the cookie,
 * so the server knows it before it writes a byte of the page: a preload for
 * each bar's size (the phone's and the computer's, each only at its own
 * width) is hoisted into the head by React and fetched before the screen's
 * markup is parsed, and the bar's <img> finds it there and draws with it
 * (decoding="sync") instead of a frame later.
 */
function StillPhotoPreload({ photo }: { photo: string | null }) {
  const phone = avatarSource(photo, STILL_AVATAR.phone)
  const desktop = avatarSource(photo, STILL_AVATAR.desktop)
  return (
    <>
      {phone ? <link rel="preload" as="image" href={phone.src} imageSrcSet={phone.srcSet} imageSizes={phone.sizes} media="(max-width: 767.98px)" fetchPriority="high" /> : null}
      {desktop ? <link rel="preload" as="image" href={desktop.src} imageSrcSet={desktop.srcSet} imageSizes={desktop.sizes} media="(min-width: 768px)" fetchPriority="high" /> : null}
    </>
  )
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

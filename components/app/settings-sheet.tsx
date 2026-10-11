"use client"

/**
 * ===========================================================================
 *  SETTINGS AS ONE LARGE SHEET OVER THE DASHBOARD
 * ===========================================================================
 * A big sheet that rises over the page, a handle at its top, a close button,
 * its own scroll, and the sections grouped down its left side (settings-
 * form-new.tsx draws the groups). Settings keeps its address, so a link, a
 * reload and the browser's Back all still work.
 *
 *   OVER THE PAGE  opened from inside /app, the sheet is caught by app/app/
 *                  @sheet/(.)settings and drawn OVER the page it was opened
 *                  from, which stays mounted under it: nothing behind goes
 *                  blank on the way in, and closing is a Back to a page that
 *                  never left, so nothing reloads in view on the way out.
 *                  This is `overlay`. Opened on its own (a reload, an email
 *                  link) it stands over the shell and closing goes to the
 *                  dashboard, through a still copy of the sheet so the
 *                  dashboard's arrival is hidden behind it.
 *   DRAG           the top strip follows a finger or a mouse, and on a touch
 *                  screen so does the content itself once it is scrolled to
 *                  its top and the finger keeps pulling down, as an iOS sheet
 *                  does. Transform only, written once a frame, with the
 *                  sheet's height read when the finger lands and not on every
 *                  move. Let go past a quarter of its height, or with a flick,
 *                  and it goes; anywhere else it springs back.
 *   CLOSE          the button, Escape, a click on the dimmed page, or the
 *                  drag.
 *   SCROLL         inside the sheet only, contained. Below 1024px, where it
 *                  is a page under the app's header, it does not rubber band
 *                  at all ("the top overscroll is very flexible"): the same
 *                  overscroll-behavior none as every other /app scroller.
 *                  Once it has moved, its
 *                  top edge fades and softly blurs what passes under it
 *                  rather than cutting it off at a hard line.
 *   MOTION         up from below the screen on the app's sheet curve, and
 *                  back down on close; with reduced motion it simply appears
 *                  and goes.
 *
 * At rest the sheet carries no transform, so the bars fixed inside it (the
 * save bar) stay fixed to the screen, not to the sheet. The phone's nav pill
 * stays above it (z 55 over this 54).
 */
import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { backThen } from "@/lib/navigation/go-back"
import { hasUnsaved, requestLeave } from "@/lib/settings/unsaved-guard"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 420
const OUT_MS = 300
/*
  THE WAY OUT LEAVES AT SPEED. On the way in's curve (fast, then a long soft
  landing) a close dropped most of the way in its first 100ms and then crept
  the last of the sheet off the bottom for 200ms more, with the page waiting
  under it: the owner's "laggy". Closed by the button, Escape or the dim, it
  now gathers for a beat and goes, done in 260ms. A drag let go keeps the
  speed it was let go at (EASE), so there is no stop between finger and fall.
*/
const OUT_EASE = "cubic-bezier(0.4, 0, 0.7, 0.2)"
const CLOSE_MS = 260
/** A release this fast downward closes the sheet whatever the distance (px per ms). */
const FLICK = 0.55
/** How far a finger must pull down on content at its top before the sheet, not the page, is what moves. */
const PULL_SLOP = 6

/*
  BELOW 1024px SETTINGS IS A PAGE, NOT A SHEET (round V, the owner: "like it
  was before, the whole settings page, with those pill shapes"). The same
  component and the same address, drawn edge to edge from the top with a
  Back at its head: no handle, no drag, no dim, and it comes and goes with a
  short fade, as every other page of the app does. Read when it is needed,
  never stored, so turning a tablet changes it at once.
*/
const PAGE_QUERY = "(max-width: 1023.98px)"
function asPage(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(PAGE_QUERY).matches
}
const PAGE_IN_MS = 200
const PAGE_OUT_MS = 150

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** A touch that starts on one of these is the control's, not the sheet's. */
const OWN_GESTURE = "input[type=range], textarea, [contenteditable=true], [data-no-sheet-drag], [role=slider]"

export function SettingsSheet({ children, label = "Settings", overlay = false }: { children: React.ReactNode; label?: string; overlay?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const panel = React.useRef<HTMLDivElement>(null)
  const scrim = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const leaving = React.useRef(false)
  const [scrolled, setScrolled] = React.useState(false)

  /*
    A LINK INSIDE THE SHEET TO ANOTHER PAGE. A slot keeps what it last drew
    through a step that does not match it, so over any other address this
    draws nothing and the page that was opened is simply the page.
  */
  const here = !overlay || pathname === "/app/settings"

  /* In: up from below the screen, once, on the first frame, on the compositor. */
  React.useLayoutEffect(() => {
    const el = panel.current
    if (!here || !el || reducedMotion() || typeof el.animate !== "function") return
    if (asPage()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PAGE_IN_MS, easing: "ease-out" })
      return
    }
    el.animate([{ transform: "translate3d(0, 100%, 0)" }, { transform: "translate3d(0, 0, 0)" }], { duration: IN_MS, easing: EASE })
    scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS, easing: "ease-out" })
  }, [here])

  /* Opened on its own, closing loads the dashboard: fetched now so it is ready when the sheet starts to leave. */
  React.useEffect(() => {
    if (overlay) return
    router.prefetch("/app")
    try {
      const from = document.referrer ? new URL(document.referrer) : null
      if (from && from.origin === window.location.origin && from.pathname !== window.location.pathname) router.prefetch(from.pathname + from.search)
    } catch {
      /* nothing to prefetch */
    }
  }, [router, overlay])

  const closeNow = React.useCallback(
    (from = 0, speed = 0) => {
      if (leaving.current) return
      leaving.current = true
      const el = panel.current
      const motion = !!el && !reducedMotion() && typeof el.animate === "function"
      const h = el?.offsetHeight || window.innerHeight
      /* A flick leaves at the speed it was let go at, never slower than the plain close. */
      const ms = speed > 0 ? Math.max(160, Math.min(OUT_MS, (h - from) / speed)) : from > 0 ? OUT_MS : CLOSE_MS
      /* From rest it leaves at speed; from a drag it carries on from the finger. */
      const ease = from > 0 || speed > 0 ? EASE : OUT_EASE

      if (overlay) {
        /*
          OVER THE PAGE: the sheet itself goes down, and only when it is gone
          does the address go Back. The page under it never left, so there is
          nothing to load and nothing to flash.
        */
        /* Through the back watch, so a Back that goes nowhere still leaves for the dashboard. */
        const back = () => {
          if (window.history.length > 1) backThen(() => router.replace("/app"))
          else router.replace("/app")
        }
        if (!el || !motion) return back()
        const a = asPage()
          ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: PAGE_OUT_MS, easing: "ease-in", fill: "forwards" })
          : el.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: `translate3d(0, ${h}px, 0)` }], { duration: ms, easing: ease, fill: "forwards" })
        scrim.current?.animate([{ opacity: scrim.current.style.opacity || "1" }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" })
        let done = false
        const finish = () => {
          if (done) return
          done = true
          back()
        }
        a.onfinish = finish
        window.setTimeout(finish, ms + 120)
        return
      }

      const go = () => {
        /* Back to where it was opened from, when that was a page of ours; a cold open goes to the dashboard. */
        let ours = false
        try {
          ours = !!document.referrer && new URL(document.referrer).origin === window.location.origin
        } catch {
          ours = false
        }
        /* Through the back watch, so a Back that goes nowhere still lands on the dashboard. */
        if (ours && window.history.length > 1) backThen(() => router.push("/app"))
        else router.push("/app")
      }
      const root = el?.parentElement
      if (!el || !root || !motion) return go()
      /*
        OPENED ON ITS OWN: the page it goes to arrives under a still copy of
        the sheet, outside React, that slides down over it. The arrival is
        never in view.
      */
      const scrolledTo = scroller.current?.scrollTop ?? 0
      const ghost = root.cloneNode(true) as HTMLElement
      ghost.removeAttribute("data-settings-sheet-root")
      ghost.setAttribute("aria-hidden", "true")
      ghost.style.pointerEvents = "none"
      ghost.querySelectorAll("[role=dialog]").forEach((n) => n.removeAttribute("role"))
      document.body.appendChild(ghost)
      const ghostPanel = ghost.querySelector<HTMLElement>("[data-settings-sheet]")
      const ghostScrim = ghost.querySelector<HTMLElement>("[data-settings-sheet-scrim]")
      const ghostScroller = ghost.querySelector<HTMLElement>("[data-settings-sheet-scroll]")
      if (ghostScroller) ghostScroller.scrollTop = scrolledTo
      if (ghostPanel) ghostPanel.style.transform = `translate3d(0, ${from}px, 0)`
      go()
      const remove = () => ghost.remove()
      if (!ghostPanel) return remove()
      const a = ghostPanel.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: `translate3d(0, ${Math.max(h, from + 1)}px, 0)` }], { duration: ms, easing: ease, fill: "forwards" })
      ghostScrim?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" })
      a.onfinish = remove
      window.setTimeout(remove, ms + 200)
    },
    [router, overlay],
  )

  /*
    NOT WITH CHANGES THAT AREN'T SAVED (lib/settings/unsaved-guard.ts). Every
    way out (the button, Escape, the dim, a drag let go past the line) asks
    first: Save, Discard or Keep editing (components/app/settings/leave-
    guard.tsx). A drag that asked springs back to rest while the question is
    up, and the sheet only goes once Save or Discard has been chosen.
  */
  const close = React.useCallback(
    (from = 0, speed = 0) => {
      if (leaving.current) return
      if (!hasUnsaved()) return closeNow(from, speed)
      const el = panel.current
      if (el && from !== 0) {
        el.style.transform = ""
        if (!reducedMotion() && typeof el.animate === "function") el.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration: 260, easing: EASE })
      }
      if (scrim.current) scrim.current.style.opacity = ""
      requestLeave(() => closeNow())
    },
    [closeNow],
  )

  React.useEffect(() => {
    if (!here) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      /* Not over a dialog or a sheet of its own. */
      if (document.querySelector("[role=dialog][aria-modal=true]:not([data-settings-sheet])")) return
      close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close, here])

  /*
    THE PAGE UNDER IT DOES NOT SCROLL WHILE THE SHEET IS UP, and does not move
    sideways either. Only the sheet's own content scrolls.

      the window   held (overflow hidden) wherever the page's own document
                   could scroll. When it showed a scroll bar, its room is
                   kept (scrollbar-gutter), so the page keeps its width; when
                   it showed none, nothing is added.
      the shell    on its own the sheet is inside the shell's scroller, and
                   that is held too (globals.css, data-settings-sheet-up).
      the dim      a wheel or a finger on the dimmed page, or on the handle,
                   scrolls nothing at all: it used to reach the document and
                   move the header and the sidebar behind the sheet.
  */
  React.useLayoutEffect(() => {
    if (!here) return
    const html = document.documentElement
    html.setAttribute("data-settings-sheet-up", overlay ? "over" : "page")
    /*
      Only a document that can scroll is held. /app's own never does (the
      shell scrolls inside itself), and putting overflow on the root anyway
      laid the whole page under the sheet out again, once in the frame the
      sheet first draws and once more as it goes.
    */
    if (html.scrollHeight <= html.clientHeight) return () => html.removeAttribute("data-settings-sheet-up")
    const bar = window.innerWidth - html.clientWidth
    const was = { overflow: html.style.overflow, gutter: html.style.getPropertyValue("scrollbar-gutter") }
    if (bar > 0) html.style.setProperty("scrollbar-gutter", "stable")
    html.style.overflow = "hidden"
    return () => {
      html.removeAttribute("data-settings-sheet-up")
      html.style.overflow = was.overflow
      if (was.gutter) html.style.setProperty("scrollbar-gutter", was.gutter)
      else html.style.removeProperty("scrollbar-gutter")
    }
  }, [here, overlay])

  React.useEffect(() => {
    const root = scrim.current?.parentElement
    if (!here || !root) return
    const outside = (e: Event) => {
      const box = scroller.current
      if (box && e.target instanceof Node && box.contains(e.target)) return
      /* A dialog of its own over the sheet (a picker, a confirm) scrolls as it likes. */
      if (e.target instanceof Element && e.target.closest("[role=dialog][aria-modal=true]:not([data-settings-sheet])")) return
      if (e.cancelable) e.preventDefault()
    }
    root.addEventListener("wheel", outside, { passive: false })
    root.addEventListener("touchmove", outside, { passive: false })
    return () => {
      root.removeEventListener("wheel", outside)
      root.removeEventListener("touchmove", outside)
    }
  }, [here])

  /* ── The drag ─────────────────────────────────────────────────────────── */
  const drag = React.useRef<{ y: number; t: number; dy: number; v: number; h: number; frame: number } | null>(null)

  const paint = React.useCallback(() => {
    const d = drag.current
    const el = panel.current
    if (!d || !el) return
    d.frame = 0
    el.style.transform = `translate3d(0, ${d.dy}px, 0)`
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / d.h))
  }, [])

  const begin = React.useCallback((y: number) => {
    const el = panel.current
    /* A page does not drag. */
    if (!el || leaving.current || asPage()) return false
    el.getAnimations?.().forEach((a) => a.cancel())
    drag.current = { y, t: performance.now(), dy: 0, v: 0, h: el.offsetHeight || window.innerHeight, frame: 0 }
    return true
  }, [])

  const follow = React.useCallback(
    (y: number) => {
      const d = drag.current
      if (!d) return
      const now = performance.now()
      const raw = y - d.y
      /* Down follows the finger; up gives a little and stops, as an iOS sheet does. */
      const dy = raw >= 0 ? raw : -Math.min(24, Math.sqrt(-raw) * 2)
      /* Speed smoothed over the last moves, so one uneven event is not a flick. */
      const v = (dy - d.dy) / Math.max(1, now - d.t)
      d.v = d.v * 0.4 + v * 0.6
      d.dy = dy
      d.t = now
      if (!d.frame) d.frame = requestAnimationFrame(paint)
    },
    [paint],
  )

  const release = React.useCallback(() => {
    const d = drag.current
    const el = panel.current
    if (!d || !el) return
    drag.current = null
    if (d.frame) cancelAnimationFrame(d.frame)
    /* A finger that stopped before letting go is not a flick. */
    const v = performance.now() - d.t > 90 ? 0 : d.v
    if (d.dy > d.h * 0.25 || v > FLICK) {
      el.style.transform = `translate3d(0, ${d.dy}px, 0)`
      close(d.dy, Math.max(v, 0))
      return
    }
    /* Back up, then no transform at all, so what is fixed inside stays fixed to the screen. */
    if (reducedMotion() || typeof el.animate !== "function" || d.dy === 0) {
      el.style.transform = ""
      if (scrim.current) scrim.current.style.opacity = ""
      return
    }
    el.style.transform = ""
    el.animate([{ transform: `translate3d(0, ${d.dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration: 260, easing: EASE })
    if (scrim.current) {
      scrim.current.animate([{ opacity: scrim.current.style.opacity || "1" }, { opacity: 1 }], { duration: 260, easing: "ease-out" })
      scrim.current.style.opacity = ""
    }
  }, [close])

  /* The top strip: a finger or a mouse. */
  const pointerId = React.useRef<number | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || leaving.current) return
    if ((e.target as HTMLElement).closest("button, a, input")) return
    if (!begin(e.clientY)) return
    pointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return
    follow(e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return
    pointerId.current = null
    release()
  }

  /*
    THE CONTENT, ON A TOUCH SCREEN. At its top, a finger that keeps pulling
    down takes the sheet with it rather than stretching a scroll that has
    nowhere to go. Anywhere else, and in any other direction, it is the
    content's own scroll, untouched.
  */
  React.useEffect(() => {
    const box = scroller.current
    if (!here || !box) return
    let start: { y: number; x: number; top: number; skip: boolean } | null = null
    let pulling = false
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || leaving.current) return
      const t = e.touches[0]
      const target = e.target as Element | null
      start = { y: t.clientY, x: t.clientX, top: box.scrollTop, skip: !!target?.closest?.(OWN_GESTURE) || !!document.querySelector("[role=dialog][aria-modal=true]:not([data-settings-sheet])") }
      pulling = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start || start.skip || e.touches.length !== 1) return
      const t = e.touches[0]
      const dy = t.clientY - start.y
      if (!pulling) {
        if (box.scrollTop > 0 || start.top > 0) return
        if (dy < PULL_SLOP || Math.abs(t.clientX - start.x) > dy) return
        /* From where the finger was when it crossed the slop, so the first frame is not a jump. A browser holds the
           first moves back until the finger has gone a little way, and the sheet takes up that way at once. */
        if (!begin(start.y + PULL_SLOP)) return
        pulling = true
      }
      if (e.cancelable) e.preventDefault()
      follow(t.clientY)
    }
    const onEnd = () => {
      if (pulling) release()
      pulling = false
      start = null
    }
    box.addEventListener("touchstart", onStart, { passive: true })
    box.addEventListener("touchmove", onMove, { passive: false })
    box.addEventListener("touchend", onEnd)
    box.addEventListener("touchcancel", onEnd)
    return () => {
      box.removeEventListener("touchstart", onStart)
      box.removeEventListener("touchmove", onMove)
      box.removeEventListener("touchend", onEnd)
      box.removeEventListener("touchcancel", onEnd)
    }
  }, [here, begin, follow, release])

  /* The soft top edge: shown once the content has moved under it. */
  React.useEffect(() => {
    const box = scroller.current
    if (!here || !box) return
    let frame = 0
    const read = () => {
      frame = 0
      setScrolled(box.scrollTop > 2)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    box.addEventListener("scroll", onScroll, { passive: true })
    read()
    return () => {
      box.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [here])

  if (!here) return null

  return (
    /*
      BELOW 1024px, WHERE A PAGE IS: under the app's own header and beside
      its rail, as Settings was before it became a sheet. The header with its
      rounded corners stays drawn over it (z 49 under the header's 50), and
      the nav pill stays over it (55). On a phone that is 68px of header, from
      768px 58px and the 240px rail, the same offsets as <main>.
    */
    <div
      className={cn(
        "fixed inset-0 z-[54]",
        "max-lg:z-[49] max-lg:top-[calc(68px+env(safe-area-inset-top,0px))] md:max-lg:top-[calc(58px+env(safe-area-inset-top,0px))] md:max-lg:left-[240px]",
      )}
      data-settings-sheet-root=""
      data-settings-sheet-mode={overlay ? "over" : "page"}
    >
      <div ref={scrim} aria-hidden className="absolute inset-0 bg-[#0f1115]/30 max-lg:hidden" onClick={() => close()} data-settings-sheet-scrim="" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-settings-sheet=""
        data-sheet-root=""
        className={cn(
          /*
            THE WHOLE WIDTH, AND NOT THE WHOLE HEIGHT. Edge to edge at every
            width; it stops well short of the top, so the page it came from
            stays in sight above it and it reads as a sheet over that page,
            not a page of its own.
          */
          "absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px] bg-[#fafafa] shadow-[0_-10px_40px_-18px_rgba(15,17,21,0.30)]",
          "lg:top-[max(64px,12vh)]",
          /* Below 1024px: the page area itself, square, on the app's own grey (the header above keeps the safe area). */
          "max-lg:top-0 max-lg:rounded-none max-lg:bg-[#fafafa] max-lg:shadow-none",
        )}
      >
        {/* The handle and the strip it sits in: the part of the sheet that drags, a thumb's height so it is easy to find. */}
        <div
          className={cn(
            "relative z-[3] flex h-11 shrink-0 cursor-grab touch-none select-none items-center justify-center bg-[#fafafa] transition-shadow duration-200 ease-out active:cursor-grabbing",
            /* A page has no handle and no Back strip: the header, the nav pill and the system Back are its way out, as on every other page. */
            "max-lg:hidden",
            scrolled && "shadow-[0_1px_0_rgba(15,17,21,0.06)]",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-settings-sheet-handle=""
        >
          <span aria-hidden className="h-[5px] w-10 rounded-full bg-[#d4d6db] max-lg:hidden" />
          <button
            type="button"
            onClick={() => close()}
            aria-label="Close settings"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#4b5563] outline-none transition-colors hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 max-lg:hidden sm:right-3 [-webkit-tap-highlight-color:transparent]"
            data-settings-sheet-close=""
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {/*
            THE TOP EDGE OF THE SCROLL. A hairline under the handle's strip
            once the content has moved, the way an iOS sheet's bar sits over
            what scrolls under it. It used to be a blurred fade over the
            first 24px, which cut the section column and the first line of a
            card in half as they passed and read as clipped.
          */}
          {/* Its own scroll, with the app's slim light bar (globals.css, .wb-slim-scroll). */}
          <div
            ref={scroller}
            className="wb-slim-scroll absolute inset-0 overflow-y-auto overflow-x-clip overscroll-contain [scrollbar-gutter:stable] max-lg:overscroll-none"
            data-settings-sheet-scroll=""
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

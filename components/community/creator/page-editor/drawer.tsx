"use client"

/**
 * ===========================================================================
 *  THE PAGE EDITOR ON A NARROW SCREEN: A DRAWER THAT STAYS (round 27)
 * ===========================================================================
 * The owner: "at smaller widths or zoomed in it switches to the phone like
 * layout with a bar at the bottom; that must be better, more manageable,
 * smoothly draggable in real time, like the website builder's editor."
 *
 * Round 26 had two things at the foot of a narrow screen: a bar (Edit page,
 * the state, Save) and, opened from it, a modal sheet over the page whose
 * scrim closed it on the first tap on the page. Now there is one: a drawer
 * docked at the foot that never leaves, the website builder's mobile sheet
 * in small (components/website-builder/mobile-editor-sheet.tsx, with its
 * arithmetic, ./sheet-gestures.ts):
 *
 *   THREE RESTING PLACES  the foot (only its head: the name of what is being
 *                         edited, the state, Save), half the screen (the
 *                         page above it stays in sight and can be pressed),
 *                         and nearly all of it, for a long field
 *   DRAGGED IN REAL TIME  its head follows the finger (or the mouse), one
 *                         translate per move, written on the event, never
 *                         through React; let go, it carries on at the
 *                         finger's speed to where a throw that fast would
 *                         stop (snapTarget, snapMotion) on the compositor
 *   A TAP ON THE GRIP     steps it: the foot to half, half to nearly all,
 *                         and back to half; Escape inside it lowers it
 *   A TAP IS TAKEN ON THE LIFT  (chip-hit.ts's rule, the community's tabs'):
 *                         measured, Chromium sent no click at all for a
 *                         finger's tap on the grip after a drag (pointerup
 *                         and touchend came, click never did), so the tap
 *                         did nothing. A finger that lifts within the tap's
 *                         slop on a button in the head presses it there and
 *                         then; a click that still follows is let go.
 *   NEVER MODAL           nothing dims the page and nothing covers it but
 *                         the drawer itself, so a press on another part of
 *                         the page opens that part, the drawer staying up
 *
 * It sits above the phone's navigation pill and the home indicator (and on
 * the keyboard when one is up, --kb-inset), over the content area only on a
 * tablet (clear of the rail). Its whole height is laid out once; the three
 * places are offsets of one translate, so moving it lays nothing out. The
 * list inside scrolls on its own, with room at its foot for the part of the
 * drawer below the screen, so the last field can always be reached.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { DETENTS, TOP_GAP, drawerOffsets, type Detent } from "./layout"

export type { Detent } from "./layout"
import { curveCss, dragPosition, isTap, releaseVelocity, snapMotion, snapTarget, tapTarget, DRAG_THRESHOLD_PX, type Sample } from "@/components/website-builder/sheet-gestures"
import { CLICK_AFTER_MS } from "@/components/community/member/chip-hit"

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Where it is now, mid glide included: the second value of its computed translate ("0px 348px"). */
function currentY(el: HTMLElement): number {
  const t = getComputedStyle(el).translate
  if (!t || t === "none") return 0
  const parts = t.split(/\s+/)
  return parts.length > 1 ? parseFloat(parts[1]) || 0 : 0
}

export function EditorDrawer({ detent, onDetent, head, children, label }: { detent: Detent; onDetent: (d: Detent) => void; head: React.ReactNode; children: React.ReactNode; label: string }) {
  const shell = React.useRef<HTMLElement>(null)
  const sheet = React.useRef<HTMLDivElement>(null)
  const grip = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const offsets = React.useRef<Record<Detent, number>>({ full: 0, half: 0, peek: 0 })
  const detentRef = React.useRef(detent)
  const onDetentRef = React.useRef(onDetent)
  onDetentRef.current = onDetent
  const anim = React.useRef<Animation | null>(null)
  const [ready, setReady] = React.useState(false)

  /** Moves it to `y`, from wherever it is now, on the compositor. */
  const glide = React.useCallback((y: number, velocity = 0) => {
    const el = sheet.current
    if (!el) return
    const from = anim.current ? currentY(el) : parseFloat(el.dataset.y ?? "0") || 0
    anim.current?.cancel()
    anim.current = null
    el.style.translate = `0 ${y}px`
    el.dataset.y = String(y)
    const settle = () => {
      if (body.current) body.current.style.paddingBottom = `${Math.round(y)}px`
    }
    /* Growing, the list keeps its room until the drawer has arrived; lowering, it gets it at once. */
    if (y > from) settle()
    if (reducedMotion() || Math.abs(y - from) < 0.5) return settle()
    const motion = snapMotion(y - from, velocity)
    const a = el.animate([{ translate: `0 ${from}px` }, { translate: `0 ${y}px` }], { duration: motion.ms, easing: curveCss(motion.curve) })
    anim.current = a
    a.onfinish = () => {
      if (anim.current === a) anim.current = null
      settle()
    }
  }, [])

  /* ── Its size: the room between the app's bar and the foot, measured, and the three places from it ── */
  React.useLayoutEffect(() => {
    const el = shell.current
    const g = grip.current
    if (!el || !g) return
    let raf = 0
    const measure = () => {
      raf = 0
      const pane = document.querySelector<HTMLElement>(".orders-pane")
      const top = (pane ? pane.getBoundingClientRect().top : 0) + TOP_GAP
      const vv = window.visualViewport
      const bottom = el.getBoundingClientRect().bottom
      const screen = vv ? vv.offsetTop + vv.height : window.innerHeight
      const height = Math.max(g.offsetHeight + 120, Math.min(bottom, screen) - top)
      el.style.height = `${Math.round(height)}px`
      const next = drawerOffsets(height, g.offsetHeight)
      offsets.current = next
      /* Where its top is at each place, for the stage above it (./page-editor.tsx useStage). */
      const foot = el.getBoundingClientRect().bottom
      el.dataset.peekTop = String(Math.round(foot - (height - next.peek)))
      el.dataset.halfTop = String(Math.round(foot - (height - next.half)))
      if (!anim.current && sheet.current) {
        const y = next[detentRef.current]
        sheet.current.style.translate = `0 ${y}px`
        sheet.current.dataset.y = String(y)
        if (body.current) body.current.style.paddingBottom = `${y}px`
      }
      el.dispatchEvent(new CustomEvent("page-drawer:measured", { bubbles: true }))
    }
    measure()
    setReady(true)
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    const ro = new ResizeObserver(soon)
    ro.observe(g)
    window.addEventListener("resize", soon)
    window.visualViewport?.addEventListener("resize", soon)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("resize", soon)
      window.visualViewport?.removeEventListener("resize", soon)
    }
  }, [])

  /* Asked from outside (a part pressed on the page, Save waiting on a field): it glides there. */
  React.useEffect(() => {
    if (detentRef.current === detent) return
    detentRef.current = detent
    glide(offsets.current[detent])
  }, [detent, glide])

  /* ── The drag, on the grip and the head: pointer events, one translate per move ── */
  React.useEffect(() => {
    const g = grip.current
    const el = sheet.current
    if (!g || !el) return
    let id: number | null = null
    let startY = 0
    let startX = 0
    let startT = 0
    let touch = false
    let pressed: HTMLButtonElement | null = null
    /* The button pressed on a finger's lift, and when: its own click, if the browser still sends one, is let go. */
    let took: { el: HTMLElement; at: number } | null = null
    let startAt = 0
    let at = 0
    let dragging = false
    let samples: Sample[] = []
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || id !== null) return
      id = e.pointerId
      startY = e.clientY
      startX = e.clientX
      startT = e.timeStamp
      touch = e.pointerType !== "mouse"
      pressed = (e.target as Element | null)?.closest?.("button") ?? null
      /* Caught mid glide: from where it is, which the running animation says. */
      if (anim.current) {
        const y = currentY(el)
        anim.current.cancel()
        anim.current = null
        el.style.translate = `0 ${y}px`
        el.dataset.y = String(y)
      }
      startAt = parseFloat(el.dataset.y ?? "0") || 0
      at = startAt
      dragging = false
      samples = [{ y: e.clientY, t: e.timeStamp }]
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const dy = e.clientY - startY
      if (!dragging) {
        if (Math.abs(dy) < DRAG_THRESHOLD_PX) return
        dragging = true
        g.setPointerCapture(e.pointerId)
        el.setAttribute("data-dragging", "")
      }
      e.preventDefault()
      at = dragPosition(startAt + dy, 0, offsets.current.peek)
      /* Written on the event, not the next frame: a frame of lag is what makes a drawer trail the finger. */
      el.style.translate = `0 ${at}px`
      el.dataset.y = String(at)
      samples.push({ y: e.clientY, t: e.timeStamp })
      if (samples.length > 12) samples.shift()
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      if (!dragging) {
        /* A finger's tap on a button in the head: pressed here, on the lift (A TAP IS TAKEN ON THE LIFT, above). */
        const still = isTap({ distance: Math.hypot(e.clientX - startX, e.clientY - startY), ms: e.timeStamp - startT, cancelled: e.type === "pointercancel" })
        if (touch && still && pressed && g.contains(pressed) && !pressed.disabled) {
          took = { el: pressed, at: performance.now() }
          pressed.click()
        }
        return
      }
      dragging = false
      el.removeAttribute("data-dragging")
      /* The press that ended a drag is not also a press on whatever it began on (Save, the grip). */
      const swallow = (c: Event) => {
        c.stopPropagation()
        c.preventDefault()
      }
      g.addEventListener("click", swallow, { capture: true, once: true })
      window.setTimeout(() => g.removeEventListener("click", swallow, { capture: true }), 0)
      const o = offsets.current
      const stops = DETENTS.map((d) => o[d])
      const v = e.type === "pointercancel" ? 0 : releaseVelocity(samples, e.timeStamp)
      const index = snapTarget({ offsets: stops, current: at, velocity: v, totalDelta: e.clientY - startY })
      const next = DETENTS[index]
      detentRef.current = next
      glide(o[next], v)
      /* The editor hears about it once the glide is on the screen: its render never shares the first frames of the move. */
      if (next !== detent) requestAnimationFrame(() => requestAnimationFrame(() => onDetentRef.current(next)))
    }
    /* The browser's own click after a tap already taken on the lift: let go, so nothing is pressed twice. */
    const late = (c: MouseEvent) => {
      if (!c.isTrusted || !took || performance.now() - took.at > CLICK_AFTER_MS || !took.el.contains(c.target as Node)) return
      took = null
      c.stopPropagation()
      c.preventDefault()
    }
    g.addEventListener("click", late, true)
    g.addEventListener("pointerdown", down)
    g.addEventListener("pointermove", move)
    g.addEventListener("pointerup", up)
    g.addEventListener("pointercancel", up)
    return () => {
      g.removeEventListener("click", late, true)
      g.removeEventListener("pointerdown", down)
      g.removeEventListener("pointermove", move)
      g.removeEventListener("pointerup", up)
      g.removeEventListener("pointercancel", up)
    }
  }, [detent, glide])

  const step = () => {
    const o = offsets.current
    const stops = DETENTS.map((d) => o[d])
    const next = DETENTS[tapTarget(stops, parseFloat(sheet.current?.dataset.y ?? "0") || 0)]
    detentRef.current = next
    glide(o[next])
    requestAnimationFrame(() => requestAnimationFrame(() => onDetentRef.current(next)))
  }

  return (
    <section
      ref={shell}
      role="region"
      aria-label={label}
      data-page-drawer=""
      data-detent={detent}
      /* J27's rule (round 27): every bar fixed at the foot of /app says so, and the Setup pill steps aside. The drawer is always up. */
      data-app-foot="up"
      onKeyDown={(e) => {
        if (e.key === "Escape" && detent !== "peek") {
          e.stopPropagation()
          onDetent("peek")
        }
      }}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-[620px] px-2.5",
        "bottom-[max(var(--kb-inset,0px),calc(var(--app-nav-top,0px)+8px),calc(env(safe-area-inset-bottom)+8px))]",
        "md:bottom-[max(var(--kb-inset,0px),12px,env(safe-area-inset-bottom))] md:left-[var(--app-rail-w,240px)] md:px-6",
        ready ? "" : "invisible",
      )}
    >
      {/*
        The part of the drawer below its foot (all of it but the head at the foot, half of it at half) is cut off at the
        foot with the card's own rounded corners, so it never lies over the navigation pill; its edge is drawn there.
      */}
      <div className="relative h-full min-h-0 [clip-path:inset(-48px_-48px_0_-48px_round_0_0_16px_16px)]">
        <div
          ref={sheet}
          className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e5e7eb]/80 bg-white shadow-[0_-6px_28px_-14px_rgba(17,24,39,0.30),0_2px_8px_-2px_rgba(17,24,39,0.08)] [will-change:translate]"
          data-page-sheet=""
        >
          <div ref={grip} className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing" data-page-drawer-grip="">
            <button
              type="button"
              onClick={step}
              aria-label={detent === "full" ? tt("Show less of the editor") : tt("Show more of the editor")}
              aria-expanded={detent !== "peek"}
              className="flex h-4 w-full items-end justify-center outline-none focus-visible:[&>span]:bg-[#9ca3af] [-webkit-tap-highlight-color:transparent]"
              data-page-drawer-handle=""
            >
              <span aria-hidden className="block h-[4px] w-9 rounded-full bg-[#d4d6db]" />
            </button>
            {head}
          </div>
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f1f2f4]" data-page-sheet-body="" inert={detent === "peek" ? true : undefined}>
            {children}
          </div>
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-[16px] border-x border-b border-[#e5e7eb]/80" />
      </div>
    </section>
  )
}

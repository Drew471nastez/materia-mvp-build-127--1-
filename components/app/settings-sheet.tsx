"use client"

/**
 * ===========================================================================
 *  SETTINGS AS ONE LARGE SHEET OVER THE DASHBOARD
 * ===========================================================================
 * Asked for in the shape of a reference the owner sent: a big white sheet
 * that rises over the page, a handle at its top, a close button, its own
 * scroll, and the sections grouped down its left side (settings-form-new.tsx
 * draws the groups). Settings keeps its address, so a link, a reload and the
 * browser's Back all still work; the sheet is how the page is drawn.
 *
 *   DRAG       the handle and the top strip follow a finger or a mouse
 *              (pointer events, so both), on transform only. Let go past a
 *              quarter of the sheet's height, or with a downward flick, and
 *              it goes; anywhere else it springs back.
 *   CLOSE      the button, Escape, a click on the dimmed page, or the drag:
 *              back to the page it was opened from when there is one, else
 *              the dashboard.
 *   SCROLL     inside the sheet only, contained, so a scroll that reaches
 *              its end does not move the page under it or turn into Back.
 *   MOTION     it rises 24px into place over 280ms on the app's sheet curve
 *              and leaves the same way; with reduced motion it simply
 *              appears and goes.
 *
 * At rest the sheet carries no transform, so the bars fixed inside it (the
 * save bar) stay fixed to the screen, not to the sheet. The phone's nav pill
 * stays above it (z 55 over this 54).
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 280
const OUT_MS = 220
/** A release this fast downward closes the sheet whatever the distance (px per ms). */
const FLICK = 0.55

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function SettingsSheet({ children, label = "Settings" }: { children: React.ReactNode; label?: string }) {
  const router = useRouter()
  const panel = React.useRef<HTMLDivElement>(null)
  const scrim = React.useRef<HTMLDivElement>(null)
  const leaving = React.useRef(false)

  /* In: 24px up and in, once, on the first frame. */
  React.useLayoutEffect(() => {
    const el = panel.current
    if (!el || reducedMotion() || typeof el.animate !== "function") return
    el.animate([{ transform: "translate3d(0, 24px, 0)", opacity: 0.6 }, { transform: "translate3d(0, 0, 0)", opacity: 1 }], { duration: IN_MS, easing: EASE })
    scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS, easing: "ease-out" })
  }, [])

  const close = React.useCallback(
    (from = 0) => {
      if (leaving.current) return
      leaving.current = true
      const go = () => {
        /* Back to where it was opened from, when that was a page of ours; a cold open goes to the dashboard. */
        let ours = false
        try {
          ours = !!document.referrer && new URL(document.referrer).origin === window.location.origin
        } catch {
          ours = false
        }
        if (ours && window.history.length > 1) router.back()
        else router.push("/app")
      }
      const el = panel.current
      if (!el || reducedMotion() || typeof el.animate !== "function") return go()
      const h = el.offsetHeight || window.innerHeight
      const a = el.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: `translate3d(0, ${Math.max(h, from + 1)}px, 0)` }], { duration: OUT_MS, easing: EASE, fill: "forwards" })
      scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: "ease-out", fill: "forwards" })
      a.onfinish = go
      window.setTimeout(go, OUT_MS + 120)
    },
    [router],
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      /* Not over a dialog or a sheet of its own. */
      if (document.querySelector("[role=dialog][aria-modal=true]:not([data-settings-sheet])")) return
      close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  /* The page under it does not scroll while the sheet is up. */
  React.useLayoutEffect(() => {
    const html = document.documentElement
    html.setAttribute("data-settings-sheet-up", "")
    return () => html.removeAttribute("data-settings-sheet-up")
  }, [])

  /* ── The drag: the handle strip, with a finger or a mouse ─────────────── */
  const drag = React.useRef<{ id: number; y: number; t: number; dy: number; v: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || leaving.current) return
    if ((e.target as HTMLElement).closest("button, a, input")) return
    drag.current = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0, v: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = panel.current
    if (!d || d.id !== e.pointerId || !el) return
    const now = performance.now()
    const raw = e.clientY - d.y
    /* Down follows the finger; up gives a little and stops, as an iOS sheet does. */
    const dy = raw >= 0 ? raw : -Math.min(24, Math.sqrt(-raw) * 2)
    d.v = (dy - d.dy) / Math.max(1, now - d.t)
    d.dy = dy
    d.t = now
    el.style.transform = `translate3d(0, ${dy}px, 0)`
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / (el.offsetHeight || 1)))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = panel.current
    if (!d || d.id !== e.pointerId || !el) return
    drag.current = null
    const h = el.offsetHeight || window.innerHeight
    if (d.dy > h * 0.25 || d.v > FLICK) {
      close(d.dy)
      return
    }
    /* Back up, then no transform at all, so what is fixed inside stays fixed to the screen. */
    if (reducedMotion() || typeof el.animate !== "function") {
      el.style.transform = ""
      if (scrim.current) scrim.current.style.opacity = ""
      return
    }
    const a = el.animate([{ transform: `translate3d(0, ${d.dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration: 240, easing: EASE })
    el.style.transform = ""
    if (scrim.current) {
      scrim.current.animate([{ opacity: scrim.current.style.opacity || "1" }, { opacity: 1 }], { duration: 240, easing: "ease-out" })
      scrim.current.style.opacity = ""
    }
    void a
  }

  return (
    <div className="fixed inset-0 z-[54]" data-settings-sheet-root="">
      <div ref={scrim} aria-hidden className="absolute inset-0 bg-[#0f1115]/30" onClick={() => close()} data-settings-sheet-scrim="" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-settings-sheet=""
        data-sheet-root=""
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[22px] bg-[#fafafa] shadow-[0_-12px_48px_-16px_rgba(15,17,21,0.28)]",
          "top-[max(10px,env(safe-area-inset-top))] md:top-4 lg:inset-x-4 lg:top-5 xl:inset-x-6",
        )}
      >
        {/* The handle and the strip it sits in: the part of the sheet that drags. */}
        <div
          className="relative flex h-9 shrink-0 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-settings-sheet-handle=""
        >
          <span aria-hidden className="h-[5px] w-10 rounded-full bg-[#d4d6db]" />
          <button
            type="button"
            onClick={() => close()}
            aria-label="Close settings"
            className="absolute right-2 top-1.5 flex h-10 w-10 items-center justify-center rounded-full text-[#4b5563] outline-none transition-colors hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:right-3 [-webkit-tap-highlight-color:transparent]"
            data-settings-sheet-close=""
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [scrollbar-gutter:stable]" data-settings-sheet-scroll="">
          {children}
        </div>
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  THE CHOSEN PILL'S INK, GLIDING FROM ONE PILL TO THE NEXT (round 15)
 * ===========================================================================
 * The owner: the fill is "too direct ... too fast, or flashy". On main it was
 * a crossfade in place (each pill's own ink fading out while the next one
 * faded in over 150ms), which reads as a blink between two places. Round 16
 * on main had tried one ink that glides (components/ui/pill-glider.tsx, since
 * removed), but it moved by `width`, which the browser draws on the page's own
 * thread: while the new list was being built (two frames after the tap) the
 * glide stood still and then jumped.
 *
 * This one moves on the compositor alone. The ink is three pieces: a round
 * end the pill's height on each side and a plain body between them. Moving it
 * to another pill is a translate of each end and a translate and scale of
 * the body (chip-hit.ts inkParts), so a round end never stretches and nothing
 * waits for the page's thread. GLIDE_MS on iOS's own deceleration curve.
 *
 * AT REST each pill draws its own ink (space-chips.tsx Fill, with its shadow),
 * so the server's paint and a page with no script are right. During a glide
 * the row carries data-ink-gliding, which hides every pill's own ink in the
 * same frame this one appears where the old pill was; when the glide ends the
 * chosen pill's own ink is back and this one goes, again in one frame, at the
 * same place, so nothing blinks. The words cross over on opacity too
 * (space-chips.tsx LABEL), timed so the white arrives with the ink.
 *
 * Reduced motion: no glide, the ink is simply on the new pill.
 */
import { useLayoutEffect, useRef } from "react"
import { BODY, GLIDE_EASE, GLIDE_MS, inkParts } from "./chip-hit"

const INK = "pointer-events-none absolute left-0 top-0 bg-[#1a1a2e] [will-change:translate,scale]"

interface Placed {
  left: number
  top: number
  width: number
  h: number
}

export function ChipInk({ active }: { active: string | null }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef<Placed | null>(null)
  const timer = useRef(0)

  useLayoutEffect(() => {
    const ink = ref.current
    const row = ink?.parentElement
    if (!ink || !row) return
    const on = row.querySelector<HTMLElement>("[data-space-chip][aria-current=page]")
    const now: Placed | null = on ? { left: on.offsetLeft, top: on.offsetTop, width: on.offsetWidth, h: on.offsetHeight } : null
    const from = last.current
    last.current = now
    const [start, body, end] = Array.from(ink.children) as HTMLElement[]
    const draw = (p: Placed) => {
      const parts = inkParts(p.left, p.width, p.h)
      for (const cap of [start, end]) {
        cap.style.width = `${p.h}px`
        cap.style.height = `${p.h}px`
      }
      body.style.height = `${p.h}px`
      start.style.translate = `${parts.start}px ${p.top}px`
      end.style.translate = `${parts.end}px ${p.top}px`
      body.style.translate = `${parts.body}px ${p.top}px`
      body.style.scale = `${parts.scale} 1`
    }
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const settle = () => {
      window.clearTimeout(timer.current)
      row.removeAttribute("data-ink-gliding")
      ink.style.opacity = "0"
    }
    if (!now || !from || still || (from.left === now.left && from.width === now.width)) {
      settle()
      return
    }
    /* Where the old pill was, with no transition; then, after the browser has that, where the new one is, eased. */
    for (const part of [start, body, end]) part.style.transition = "none"
    draw(from)
    ink.style.opacity = "1"
    row.setAttribute("data-ink-gliding", "")
    void ink.offsetWidth
    const t = `translate ${GLIDE_MS}ms ${GLIDE_EASE}, scale ${GLIDE_MS}ms ${GLIDE_EASE}`
    for (const part of [start, body, end]) part.style.transition = t
    draw(now)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(settle, GLIDE_MS + 40)
  }, [active])

  /* A font arriving or a name changing moves the pills: the next glide starts from where the pill really is. */
  useLayoutEffect(() => {
    const ink = ref.current
    const row = ink?.parentElement
    if (!row || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const on = row.querySelector<HTMLElement>("[data-space-chip][aria-current=page]")
      last.current = on ? { left: on.offsetLeft, top: on.offsetTop, width: on.offsetWidth, h: on.offsetHeight } : null
    })
    ro.observe(row)
    return () => {
      ro.disconnect()
      window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <span ref={ref} aria-hidden data-chip-ink="" className="pointer-events-none absolute inset-0 z-[1] opacity-0">
      <span className={`${INK} rounded-full`} />
      <span className={`${INK} origin-left shadow-[0_1px_2px_rgba(16,24,40,0.2),0_2px_5px_-2px_rgba(16,24,40,0.22)]`} style={{ width: BODY }} />
      <span className={`${INK} rounded-full`} />
    </span>
  )
}

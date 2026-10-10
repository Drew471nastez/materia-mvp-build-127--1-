"use client"

/**
 * ===========================================================================
 *  THE PAGE SHEET, DRAWN (round 16)
 * ===========================================================================
 * page-sheet.ts holds the numbers; this puts them on the screen. Two halves:
 *
 *   <SheetBackdrop>   what lies between the community and the sheet, inside
 *                     the sheet's own fixed layer: the dim, and the dark
 *                     bands and rounded corners round the receded community.
 *   sheetStage()      the driver. It moves the sheet, the backdrop's parts
 *                     and the community itself (the community's frame,
 *                     [data-community-shell], by `scale` and `translate`)
 *                     to any `p`, by a finger (set) or on the spring (run),
 *                     and lets the community go again (release).
 *
 * The community is moved only while the sheet moves. At rest the sheet
 * covers it and it carries no style of ours, so a fixed element inside it
 * (a toast, the push prompt) is never re-anchored by a scale left on its
 * frame for as long as a post is open.
 */
import { forwardRef } from "react"
import { CORNER_PX, FALLBACK_EASE, RECEDE_DIM, SURROUND, sheetFrame, springEasing, type SheetFrame, type SheetScene } from "./page-sheet"

const BAND = "pointer-events-none absolute"

/** The dim, the bands and the corners, in the sheet's layer under the sheet. Hidden until a move draws them. */
export const SheetBackdrop = forwardRef<HTMLDivElement>(function SheetBackdrop(_props, ref) {
  const corner = (at: string) => ({ width: CORNER_PX, height: CORNER_PX, background: `radial-gradient(circle at ${at}, transparent ${CORNER_PX - 0.5}px, ${SURROUND} ${CORNER_PX}px)`, opacity: 0 })
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-sheet-backdrop="">
      <div className={`${BAND} inset-0`} style={{ backgroundColor: `rgba(0, 0, 0, ${RECEDE_DIM})`, opacity: 0 }} data-sheet-dim="" />
      <div className={`${BAND} inset-x-0 bottom-full h-full`} style={{ backgroundColor: SURROUND }} data-sheet-band="top" />
      <div className={`${BAND} inset-x-0 top-full h-full`} style={{ backgroundColor: SURROUND }} data-sheet-band="bottom" />
      <div className={`${BAND} inset-y-0 right-full w-full`} style={{ backgroundColor: SURROUND }} data-sheet-band="left" />
      <div className={`${BAND} inset-y-0 left-full w-full`} style={{ backgroundColor: SURROUND }} data-sheet-band="right" />
      <div className={`${BAND} left-0 top-0`} style={corner("100% 100%")} data-sheet-corner="tl" />
      <div className={`${BAND} right-0 top-0`} style={corner("0% 100%")} data-sheet-corner="tr" />
      <div className={`${BAND} bottom-0 left-0`} style={corner("100% 0%")} data-sheet-corner="bl" />
      <div className={`${BAND} bottom-0 right-0`} style={corner("0% 0%")} data-sheet-corner="br" />
    </div>
  )
})

/** Whether this browser takes `linear()` easing (Safari 17.2+, Chrome 113+); the spring needs it. */
function springOk(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)")
  } catch {
    return false
  }
}

/** The community's frame, the thing that eases back. Null outside a community (then only the dim and the bands move). */
export function communityFrame(): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLElement>("[data-community-shell]")
}

type Part = { el: HTMLElement; at: (f: SheetFrame) => Keyframe }

export interface SheetStage {
  /** Everything at `p`, now (a finger). */
  set(p: number): void
  /** From `from` to `to` on the spring (or `easing`); resolves when it has arrived, or was cancelled by a finger. */
  run(from: number, to: number, ms: number, opts?: { velocity?: number; easing?: string; hold?: boolean }): Promise<void>
  /** Stop every move where it is (a finger caught it). */
  stop(): void
  /** The community let go: no scale, no shift, nothing of ours on it. The dim and the bands hidden. */
  release(): void
  /** Where p is now, as last set or reached. */
  at(): number
}

/**
 * The driver for one sheet. `sheet` is the element that slides (its offset is added to where it rests), `backdrop` the
 * <SheetBackdrop>, `community` what eases back (communityFrame(), or null).
 */
export function sheetStage(sheet: HTMLElement, backdrop: HTMLElement | null, community: HTMLElement | null): SheetStage {
  let p = 0
  let scene: SheetScene | null = null
  let live: Animation[] = []
  const measure = (): SheetScene => {
    const width = window.innerWidth
    const height = window.innerHeight
    /* The community's box as laid out, with any scale of ours taken off first, so its middle is where layout put it. */
    let boxCenterX = width / 2
    let boxCenterY = height / 2
    if (community?.isConnected) {
      for (const a of community.getAnimations()) if ((a as Animation & { __sheet?: boolean }).__sheet) a.cancel()
      community.style.scale = ""
      community.style.translate = ""
      const r = community.getBoundingClientRect()
      boxCenterX = r.left + r.width / 2
      boxCenterY = r.top + r.height / 2
    }
    return { width, height, boxCenterX, boxCenterY }
  }
  const parts = (): Part[] => {
    const out: Part[] = [{ el: sheet, at: (f) => ({ translate: `0px ${f.sheetY}px` }) }]
    if (community?.isConnected) out.push({ el: community, at: (f) => ({ translate: `${f.shiftX}px ${f.shiftY}px`, scale: `${f.scale}` }) })
    if (backdrop) {
      const q = (sel: string) => backdrop.querySelector<HTMLElement>(sel)
      const add = (el: HTMLElement | null, at: Part["at"]) => el && out.push({ el, at })
      add(q("[data-sheet-dim]"), (f) => ({ opacity: f.dim }))
      add(q('[data-sheet-band="top"]'), (f) => ({ translate: `0px ${f.bandY}px` }))
      add(q('[data-sheet-band="bottom"]'), (f) => ({ translate: `0px ${-f.bandY}px` }))
      add(q('[data-sheet-band="left"]'), (f) => ({ translate: `${f.bandX}px 0px` }))
      add(q('[data-sheet-band="right"]'), (f) => ({ translate: `${-f.bandX}px 0px` }))
      add(q('[data-sheet-corner="tl"]'), (f) => ({ translate: `${f.bandX}px ${f.bandY}px`, opacity: f.corners }))
      add(q('[data-sheet-corner="tr"]'), (f) => ({ translate: `${-f.bandX}px ${f.bandY}px`, opacity: f.corners }))
      add(q('[data-sheet-corner="bl"]'), (f) => ({ translate: `${f.bandX}px ${-f.bandY}px`, opacity: f.corners }))
      add(q('[data-sheet-corner="br"]'), (f) => ({ translate: `${-f.bandX}px ${-f.bandY}px`, opacity: f.corners }))
    }
    return out
  }
  /* Every move stopped where it is, its place kept inline; p read back from where the sheet was caught. */
  const stop = () => {
    if (!live.length) return
    for (const a of live) {
      try {
        a.commitStyles?.()
      } catch {
        /* An element that left the page has nothing to keep. */
      }
      a.cancel()
    }
    live = []
    const y = parseFloat((sheet.style.translate || "0px 0px").split(" ")[1] ?? "0")
    if (scene && Number.isFinite(y)) p = Math.max(0, Math.min(1, 1 - y / scene.height))
  }
  const setAll = (q: number) => {
    scene ??= measure()
    const f = sheetFrame(q, scene)
    for (const part of parts()) {
      const k = part.at(f)
      for (const [name, value] of Object.entries(k)) part.el.style.setProperty(name, String(value))
    }
    p = q
  }
  return {
    set(q) {
      stop()
      setAll(q)
    },
    run(from, to, ms, opts = {}) {
      stop()
      scene ??= measure()
      const easing = opts.easing ?? (springOk() ? springEasing(ms, opts.velocity ?? 0) : FALLBACK_EASE)
      const a = sheetFrame(from, scene)
      const b = sheetFrame(to, scene)
      setAll(to)
      for (const el of [sheet, community]) if (el) el.style.willChange = "translate, scale"
      live = parts().map((part) => {
        const anim = part.el.animate([part.at(a), part.at(b)], { duration: ms, easing, fill: opts.hold ? "forwards" : "none" })
        if (part.el === community) (anim as Animation & { __sheet?: boolean }).__sheet = true
        return anim
      })
      p = to
      const main = live[0]
      return new Promise<void>((done) => {
        let over = false
        const end = () => {
          if (over) return
          over = true
          for (const el of [sheet, community]) if (el) el.style.willChange = ""
          done()
        }
        main.onfinish = end
        main.oncancel = end
        /* A page in the background draws no frames: it still arrives. */
        window.setTimeout(end, ms + 250)
      })
    },
    stop,
    release() {
      stop()
      if (community) {
        for (const a of community.getAnimations()) if ((a as Animation & { __sheet?: boolean }).__sheet) a.cancel()
        community.style.scale = ""
        community.style.translate = ""
        community.style.willChange = ""
      }
      if (backdrop) for (const el of Array.from(backdrop.querySelectorAll<HTMLElement>("[data-sheet-dim], [data-sheet-band], [data-sheet-corner]"))) {
        for (const a of el.getAnimations()) a.cancel()
        el.style.translate = ""
        el.style.opacity = el.hasAttribute("data-sheet-band") ? "" : "0"
      }
      scene = null
    },
    at: () => p,
  }
}

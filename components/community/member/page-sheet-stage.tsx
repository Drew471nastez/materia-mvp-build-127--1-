"use client"

/**
 * ===========================================================================
 *  THE COMPOSER'S SHEET, DRAWN ON THE COMPOSITOR (rounds 16 and 17)
 * ===========================================================================
 * page-sheet.ts holds the numbers; this puts them on the screen. Two halves:
 *
 *   <SheetBackdrop>   a light dim between the community and the sheet
 *   sheetStage()      the driver: the sheet to any `p` by a finger (set) or
 *                     on the spring (run), and the dim with it
 *
 * ROUND 17 (ARCH17, THE ENGINE). Round 16 also eased the whole community
 * back behind the sheet (a scale and a shift on [data-community-shell],
 * the frame of every place, document tall) and drew dark bands and corners
 * round it. On an iPhone a document tall layer scaled every frame is what
 * stutters, and the opened post's open measured with it stopped for 344ms.
 * The composer keeps its sheet (a task rising from the foot reads apart from
 * a post opening out of its card), but nothing behind it moves now: only the
 * sheet's `translate` and the dim's `opacity`, Web Animations the compositor
 * runs to the end whatever the main thread is doing, with `will-change` only
 * while it moves.
 */
import { forwardRef } from "react"
import { FALLBACK_EASE, RECEDE_DIM, springEasing } from "./page-sheet"

/** The dim, in the sheet's layer under the sheet. Hidden until a move draws it. */
export const SheetBackdrop = forwardRef<HTMLDivElement>(function SheetBackdrop(_props, ref) {
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0" data-sheet-backdrop="">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: `rgba(0, 0, 0, ${RECEDE_DIM})`, opacity: 0 }} data-sheet-dim="" />
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

export interface SheetStage {
  /** The sheet and the dim at `p`, now (a finger). */
  set(p: number): void
  /** From `from` to `to` on the spring (or `easing`); resolves when it has arrived, or was cancelled by a finger. */
  run(from: number, to: number, ms: number, opts?: { velocity?: number; easing?: string; hold?: boolean }): Promise<void>
  /** Stop every move where it is (a finger caught it). */
  stop(): void
  /** The dim hidden and nothing of ours left moving. */
  release(): void
  /** Where p is now, as last set or reached. */
  at(): number
}

/** The driver for one sheet. `sheet` is what slides (its offset is added to where it rests), `backdrop` the <SheetBackdrop>. */
export function sheetStage(sheet: HTMLElement, backdrop: HTMLElement | null): SheetStage {
  let p = 0
  let height = 0
  let live: Animation[] = []
  const dim = () => backdrop?.querySelector<HTMLElement>("[data-sheet-dim]") ?? null
  const H = () => (height ||= window.innerHeight)
  const sheetY = (q: number) => `0px ${Math.round((1 - Math.max(0, Math.min(1, q))) * H() * 10) / 10}px`
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
    if (Number.isFinite(y)) p = Math.max(0, Math.min(1, 1 - y / H()))
  }
  const setAll = (q: number) => {
    sheet.style.translate = sheetY(q)
    const d = dim()
    if (d) d.style.opacity = String(Math.max(0, Math.min(1, q)))
    p = q
  }
  return {
    set(q) {
      stop()
      setAll(q)
    },
    run(from, to, ms, opts = {}) {
      stop()
      const easing = opts.easing ?? (springOk() ? springEasing(ms, opts.velocity ?? 0) : FALLBACK_EASE)
      setAll(to)
      sheet.style.willChange = "translate"
      const d = dim()
      live = [sheet.animate([{ translate: sheetY(from) }, { translate: sheetY(to) }], { duration: ms, easing, fill: opts.hold ? "forwards" : "none" })]
      if (d) live.push(d.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing, fill: opts.hold ? "forwards" : "none" }))
      p = to
      const main = live[0]
      return new Promise<void>((done) => {
        let over = false
        const end = () => {
          if (over) return
          over = true
          sheet.style.willChange = ""
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
      sheet.style.willChange = ""
      const d = dim()
      if (d) {
        for (const a of d.getAnimations()) a.cancel()
        d.style.opacity = "0"
      }
      height = 0
    },
    at: () => p,
  }
}

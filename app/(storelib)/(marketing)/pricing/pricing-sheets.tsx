"use client"

/*
  THE SHEETS (landing round 13, the owner's screen recording of a pricing page):
  as the plan cards scroll away, the next section rises over them as a sheet
  with rounded top corners, and the next rises over that one the same way.

  HOW. Each sheet but the last is position: sticky, its top set so that it
  stops once its BOTTOM reaches the foot of the screen (a sheet taller than
  the screen scrolls through first, then waits there while the next one
  covers it). The browser does all of it on its scroll: no scroll listener,
  nothing moved from script, nothing laid out as the page scrolls.

  The one number script gives it is each sheet's own height, measured by a
  ResizeObserver whenever that height changes (a font arriving, a question
  opening, a turned phone) and written once as --pz-h. Until it is known a
  sheet is not sticky, so a page without script simply scrolls.

  As a sheet comes over the one before, that one darkens a little: an overlay
  whose opacity follows the rising sheet's own view timeline, a scroll driven
  animation the compositor runs. Where the browser has no scroll driven
  animations (iOS before 26), the sheets stack the same, without the shade.

  WHAT A COVERED SHEET STOPS DOING. A sheet stuck under the next one is still
  "on screen" to an IntersectionObserver, which knows nothing of what covers
  it. So one observer watches a 1px line at the top of every sheet: once the
  line of sheet n+1 is past the top of the screen (120px past, so it wakes
  again before any of it shows on the way back), sheet n is marked
  data-pz-covered and its loops pause. That attribute is the only record:
  the stack keeps no React state, so covering a sheet re-renders nothing.
  A section whose loops run from script (the bento's globe and store strip)
  reads it with useSheetCovered, which watches its own sheet's attribute and
  re-renders only that section, only when its own sheet changes.

  Under reduced motion the sheets do not stick and nothing shades: the page
  scrolls as a plain column of rounded sheets.
*/

import { startTransition, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react"

export type SheetTone = "light" | "dark"
export interface Sheet {
  id: string
  tone: SheetTone
  node: ReactNode
}

/** Whether the sheet `ref` sits in is wholly covered by the next one: its data-pz-covered, watched by a MutationObserver. */
export function useSheetCovered(ref: RefObject<HTMLElement | null>): boolean {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const sheet = ref.current?.closest<HTMLElement>("[data-pz-sheet]")
    if (!sheet || typeof MutationObserver !== "function") return
    /* As a transition, like usePlatformSection: the section re-renders in slices between frames, not as one long task mid scroll. The CSS loops already read the attribute. */
    const read = () => {
      const on = sheet.hasAttribute("data-pz-covered")
      startTransition(() => setCovered(on))
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(sheet, { attributes: true, attributeFilter: ["data-pz-covered"] })
    return () => mo.disconnect()
  }, [ref])
  return covered
}

/** How far past the top of the screen the next sheet's top must be before this one counts as covered. */
const COVER_SLACK_PX = 120

export function SheetStack({ sheets }: { sheets: readonly Sheet[] }) {
  const stack = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = stack.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-pz-sheet]"))

    /* Each sheet's height, written when it changes. */
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement
          const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight)
          const v = `${h}px`
          if (el.style.getPropertyValue("--pz-h") !== v) el.style.setProperty("--pz-h", v)
        }
        if (!root.hasAttribute("data-pz-ready")) root.setAttribute("data-pz-ready", "")
      })
      els.forEach((el) => ro!.observe(el))
    }

    /*
      The site's bar stays at the top of the screen on this page, so a row
      that sticks inside a sheet (the compare table's plans) sticks under it.
      Its height is measured here, when it changes, and shared as --pz-head;
      a bar that scrolls away counts as none. The layout swaps its stand in
      for the real bar after hydration (conditional-header), so the bar is
      looked up again whenever the layout's own children change.
    */
    let barRo: ResizeObserver | null = null
    let barMo: MutationObserver | null = null
    if (typeof ResizeObserver === "function") {
      let bar: HTMLElement | null = null
      const writeHead = () => {
        const pos = bar && bar.isConnected ? getComputedStyle(bar).position : ""
        const v = `${bar && (pos === "sticky" || pos === "fixed") ? Math.round(bar.getBoundingClientRect().height) : 0}px`
        if (root.style.getPropertyValue("--pz-head") !== v) root.style.setProperty("--pz-head", v)
      }
      barRo = new ResizeObserver(writeHead)
      const attach = () => {
        const next = document.getElementById("platform-header-root")
        if (next === bar) return
        if (bar) barRo!.unobserve(bar)
        bar = next
        if (bar) barRo!.observe(bar)
        else writeHead()
      }
      attach()
      const shell = document.getElementById("platform-header-root")?.parentElement
      if (shell && typeof MutationObserver === "function") {
        barMo = new MutationObserver(attach)
        barMo.observe(shell, { childList: true })
      }
    }

    /* Which sheets are wholly covered: sheet n is, while the line at the top of sheet n+1 is above the screen. */
    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver === "function") {
      const lines = els.map((el) => el.querySelector<HTMLElement>(":scope > [data-pz-line]"))
      const state = els.map(() => false)
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const i = lines.indexOf(e.target as HTMLElement)
            if (i < 1) continue
            const isCovered = !e.isIntersecting && e.boundingClientRect.top < 0
            if (state[i - 1] !== isCovered) {
              state[i - 1] = isCovered
              const prev = els[i - 1]
              if (isCovered) prev.setAttribute("data-pz-covered", "")
              else prev.removeAttribute("data-pz-covered")
            }
          }
        },
        { rootMargin: `${COVER_SLACK_PX}px 0px 0px 0px`, threshold: 0 },
      )
      lines.forEach((line, i) => {
        if (line && i > 0) io!.observe(line)
      })
    }
    return () => {
      ro?.disconnect()
      barRo?.disconnect()
      barMo?.disconnect()
      io?.disconnect()
    }
  }, [sheets.length])

  return (
    <div ref={stack} className="pz-stack" data-pz-stack="">
      <style href="pz-sheets" precedence="default">
        {SHEETS_CSS}
      </style>
      {sheets.map((s, i) => (
        <div
          key={s.id}
          data-pz-sheet={s.id}
          data-pz-tone={s.tone}
          className="pz-sheet"
          style={{ "--pz-i": i + 1 } as CSSProperties}
        >
          <span aria-hidden="true" data-pz-line="" className="pz-line" />
          {s.node}
          {i < sheets.length - 1 ? <span aria-hidden="true" className="pz-dim" /> : null}
        </div>
      ))}
    </div>
  )
}

/*
  The sheet's corner radius, and how far each sheet tucks under the one
  before (its own radius), so the corners always show the sheet behind.
*/
export const SHEETS_CSS = `
.pz-stack{position:relative;--pz-r:clamp(22px,3vw,44px);timeline-scope:--pz-2,--pz-3,--pz-4,--pz-5}
.pz-sheet{position:relative;z-index:var(--pz-i);isolation:isolate}
.pz-sheet[data-pz-tone="light"]{background:#fff;color:#18181b}
.pz-sheet[data-pz-tone="dark"]{background:#0c0b10;color:#fff}
.pz-sheet:not(:last-child){padding-bottom:var(--pz-r)}
.pz-sheet + .pz-sheet{margin-top:calc(-1 * var(--pz-r));border-radius:var(--pz-r) var(--pz-r) 0 0;overflow:clip;box-shadow:0 -1px 0 rgba(15,14,19,.06),0 -22px 48px -30px rgba(15,14,19,.35)}
.pz-sheet[data-pz-tone="dark"] + .pz-sheet{box-shadow:0 -1px 0 rgba(255,255,255,.04)}
.pz-line{position:absolute;left:0;right:0;top:0;height:1px;pointer-events:none}
/* Sticky once its height is known: it stops when its foot reaches the foot of the screen (svh, so iOS's bar never moves it). */
.pz-stack[data-pz-ready] > .pz-sheet:not(:last-child){position:sticky;top:min(0px,calc(100svh - var(--pz-h,100svh)))}
.pz-dim{position:absolute;z-index:50;left:0;right:0;bottom:0;height:100svh;max-height:100%;pointer-events:none;background:#0c0b10;opacity:0}
/* Sheet k names its view timeline --pz-k; the shade on sheet k-1 follows it. (The <style> is hoisted to <head>, so the sheets are the stack's only children.) */
.pz-sheet:nth-child(2){view-timeline:--pz-2 block}
.pz-sheet:nth-child(3){view-timeline:--pz-3 block}
.pz-sheet:nth-child(4){view-timeline:--pz-4 block}
.pz-sheet:nth-child(5){view-timeline:--pz-5 block}
@supports (animation-timeline:view()){
  .pz-dim{animation:pz-dim linear both;animation-range:entry 0% entry 100%}
  .pz-sheet:nth-child(1) > .pz-dim{animation-timeline:--pz-2}
  .pz-sheet:nth-child(2) > .pz-dim{animation-timeline:--pz-3}
  .pz-sheet:nth-child(3) > .pz-dim{animation-timeline:--pz-4}
  .pz-sheet:nth-child(4) > .pz-dim{animation-timeline:--pz-5}
}
@keyframes pz-dim{to{opacity:var(--pz-shade,.12)}}
.pz-sheet[data-pz-tone="dark"]{--pz-shade:.5}
@media (prefers-reduced-motion:reduce){
  .pz-stack[data-pz-ready] > .pz-sheet:not(:last-child){position:relative;top:auto}
  .pz-dim{display:none}
}
`

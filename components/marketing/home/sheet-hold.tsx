"use client"

/*
  THE PRICING SHEET COMES UP OVER THE SHOWCASE (landing round 14, the owner):
  "the white pricing and plans section should arrive as a modal sheet: as you
  scroll, the section before it holds and the pricing section rises over it
  as a rounded sheet, very smooth", like the sheets on /pricing
  (app/(storelib)/(marketing)/pricing/pricing-sheets.tsx), drawn the same way.

  Put <SheetHold /> first inside the sheet that rises (a ScrollRevealPanel).
  It marks the block before that sheet (here the dark showcase) to hold:

    position: sticky, its top set so it stops once its FOOT reaches the foot
    of the screen (a block taller than the screen scrolls through first, then
    waits there), and the sheet after it, in the page's flow as it always
    was, scrolls up over it with its rounded top. The browser does it all on
    its scroll: no scroll listener, nothing moved from script, nothing laid
    out as the page scrolls.

  The one number script gives it is the held block's height, from a
  ResizeObserver whenever that height changes (the showcase mounting, a font,
  a turned phone), written once as --hold-h. Until it is known nothing
  sticks, so a page without script simply scrolls as before.

  As the sheet comes up the held block darkens a little: an overlay whose
  opacity follows the rising sheet's own view timeline (compositor only;
  without scroll driven animations the sheet simply rises with no shade).

  ONCE IT IS WHOLLY COVERED, IT IS NOT DRAWN. A held block under the sheet is
  still "on screen" to every IntersectionObserver inside it, so its loops
  would run on unseen. A 1px line at the top of the sheet is watched; once it
  is 120px above the screen the held block is marked data-hold-covered and
  hidden (visibility, so nothing is laid out again), and it is shown again
  before any of it can be seen on the way back.

  Under reduced motion nothing sticks and nothing shades: the sheet laps over
  the block before by its corners as every other join on the page does.
*/

import { useEffect, useRef } from "react"

/** How far above the screen the sheet's top must be before the held block counts as covered. */
const COVER_SLACK_PX = 120

export const SHEET_HOLD_CSS = `
[data-landing-story]{timeline-scope:--home-hold}
@media (prefers-reduced-motion:no-preference){
  [data-sheet-hold][data-hold-ready]{position:sticky;top:min(0px,calc(100svh - var(--hold-h,100svh)))}
}
[data-sheet-hold][data-hold-covered]{visibility:hidden}
.sheet-hold-line{position:absolute;left:0;right:0;top:0;height:1px;pointer-events:none}
[data-hold-rise]{view-timeline:--home-hold block}
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    [data-sheet-hold][data-hold-ready]::after{content:"";position:absolute;z-index:2147483646;left:0;right:0;bottom:0;height:100svh;max-height:100%;pointer-events:none;background:#000;opacity:0;animation:sheet-hold-dim linear both;animation-timeline:--home-hold;animation-range:entry 0% entry 100%}
  }
}
@keyframes sheet-hold-dim{to{opacity:.45}}
`

export function SheetHold() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const line = ref.current
    const sheet = line?.parentElement
    if (!line || !sheet) return
    let held = sheet.previousElementSibling as HTMLElement | null
    while (held && !held.matches("[data-sheet],[data-sheet-backdrop]")) held = held.previousElementSibling as HTMLElement | null
    if (!held) return
    const block = held
    block.setAttribute("data-sheet-hold", "")
    sheet.setAttribute("data-hold-rise", "")

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver((entries) => {
        const e = entries[entries.length - 1]
        const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? block.offsetHeight)
        const v = `${h}px`
        if (block.style.getPropertyValue("--hold-h") !== v) block.style.setProperty("--hold-h", v)
        if (!block.hasAttribute("data-hold-ready")) block.setAttribute("data-hold-ready", "")
      })
      ro.observe(block)
    }

    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        ([e]) => {
          const covered = !e.isIntersecting && e.boundingClientRect.top < 0
          if (covered !== block.hasAttribute("data-hold-covered")) block.toggleAttribute("data-hold-covered", covered)
        },
        { rootMargin: `${COVER_SLACK_PX}px 0px 0px 0px`, threshold: 0 },
      )
      io.observe(line)
    }
    return () => {
      ro?.disconnect()
      io?.disconnect()
      for (const a of ["data-sheet-hold", "data-hold-ready", "data-hold-covered"]) block.removeAttribute(a)
      block.style.removeProperty("--hold-h")
      sheet.removeAttribute("data-hold-rise")
    }
  }, [])
  return (
    <>
      <style href="sheet-hold" precedence="default">
        {SHEET_HOLD_CSS}
      </style>
      <span ref={ref} aria-hidden="true" className="sheet-hold-line" data-sheet-hold-line="" />
    </>
  )
}

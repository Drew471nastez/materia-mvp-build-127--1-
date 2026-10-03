"use client"

/**
 * ===========================================================================
 *  THE SECTION STORELIB AI IS WORKING ON, MARKED WHERE IT IS
 * ===========================================================================
 * While a run changes a section, that section carries a faint diagonal sheen
 * that passes over it every couple of seconds, so the creator can see which
 * part of the page is being worked on without reading the chat. When the run
 * ends, each section it changed gets a violet ring that fades out once.
 *
 * DRAWN BESIDE THE PAGE, NOT INSIDE IT. A section's own box is the page's
 * (lib/website-builder/sections/SectionRenderer.tsx): giving it a class and a
 * `position` to hang an overlay off would change what the creator is
 * designing, and the header has no box of its own at all. So this is one
 * zero height layer after the page, in the same scrolling content, with a
 * box per section laid exactly over it. Both scroll together, so nothing is
 * moved by script while the canvas scrolls; a box is measured again only
 * when something changes size (ResizeObserver), and a sticky header is
 * followed on scroll only while it is one of the sections being marked.
 *
 * The sheen is transform and opacity on a pseudo element, on the
 * compositor. Every box is `pointer-events: none`: a click goes to the
 * section under it, a wheel or a finger scrolls the canvas. Under reduced
 * motion the sheen is a still tint and the ring is simply shown, then gone.
 * CSS: `.wb-ai-layer`, `.wb-ai-work` in app/globals.css.
 */

import * as React from "react"

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const same = (a: Box | undefined, b: Box) => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** How long a finished section's ring is shown: `wb-ai-settle` in app/globals.css. */
export const SETTLE_MS = 1400

/**
 * `label` is what the run is about, "Editing Pricing" or "New section: Hero
 * with flag", said in the chat over its steps. It is drawn once, on the first
 * section being worked on, at its top left: a small violet tag, the same
 * words the chat uses, so the canvas and the chat name the same thing.
 */
export function AiWorkingOverlay({ working, settled, label }: { working: readonly string[]; settled: readonly string[]; label?: string }) {
  const layer = React.useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = React.useState<Record<string, Box>>({})
  const ids = React.useMemo(() => [...new Set([...working, ...settled])], [working, settled])
  const key = ids.join("|")

  React.useLayoutEffect(() => {
    const anchor = layer.current
    if (!anchor || ids.length === 0) {
      setBoxes((was) => (Object.keys(was).length ? {} : was))
      return
    }
    let frame = 0
    const measure = () => {
      frame = 0
      const origin = anchor.getBoundingClientRect()
      setBoxes((was) => {
        const next: Record<string, Box> = {}
        let changed = Object.keys(was).length !== ids.length
        for (const id of ids) {
          const el = document.getElementById(`wb-section-${id}`)
          if (!el) {
            changed = changed || id in was
            continue
          }
          const r = el.getBoundingClientRect()
          const box = { x: Math.round(r.left - origin.left), y: Math.round(r.top - origin.top), w: Math.round(r.width), h: Math.round(r.height) }
          next[id] = same(was[id], box) ? was[id] : box
          changed = changed || next[id] !== was[id]
        }
        return changed ? next : was
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()

    /* Anything that changes size moves what is below it: the page itself, and every marked section. */
    const sized = new ResizeObserver(schedule)
    const content = anchor.parentElement
    if (content) sized.observe(content)
    for (const id of ids) {
      const el = document.getElementById(`wb-section-${id}`)
      if (el) sized.observe(el)
    }
    /* A section that arrives, leaves or is redrawn under a new element is found again. */
    const changed = content ? new MutationObserver(schedule) : null
    if (content && changed) changed.observe(content, { childList: true, subtree: false })

    /* Only a sticky section moves against the page while it scrolls. */
    const scroller = document.getElementById("wb-preview-root")
    const sticky = ids.some((id) => {
      const el = document.getElementById(`wb-section-${id}`)
      return !!el && getComputedStyle(el).position === "sticky"
    })
    if (sticky) scroller?.addEventListener("scroll", schedule, { passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      sized.disconnect()
      changed?.disconnect()
      if (sticky) scroller?.removeEventListener("scroll", schedule)
    }
    // `key` stands for `ids`: the same sections in a new array are not a reason to measure again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  /* The tag goes on the first section being worked on that has a box. */
  const tagged = label ? working.find((id) => boxes[id]) : undefined
  return (
    <div ref={layer} className="wb-ai-layer" aria-hidden data-ai-layer="">
      {ids.map((id) => {
        const box = boxes[id]
        if (!box) return null
        return (
          <div
            key={id}
            className="wb-ai-work"
            data-ai-work={working.includes(id) ? "working" : "settled"}
            data-section={id}
            style={{ width: box.w, height: box.h, transform: `translate3d(${box.x}px, ${box.y}px, 0)` }}
          >
            {id === tagged && (
              <span
                data-ai-label=""
                className="absolute left-3 top-3 max-w-[calc(100%-24px)] truncate rounded-full bg-[#8b5cf6] px-2.5 py-1 text-[12px] font-medium leading-4 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
              >
                {label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

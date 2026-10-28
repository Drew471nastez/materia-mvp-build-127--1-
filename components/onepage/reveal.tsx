"use client"

/**
 * ===========================================================================
 *  A BOX THAT OPENS TO ITS HEIGHT AND CLOSES TO NOTHING
 * ===========================================================================
 * Round 40. Show all in the Products tab, and the Remove question under a
 * block's settings, both added rows that used to appear in one frame and
 * push everything under them down at once. This opens them.
 *
 *   THE HEIGHT IS MEASURED, NOT GUESSED. The box goes from wherever it is
 *   now (half way through a close, say) to the height of what is inside,
 *   on a Web Animation, then lets go to `auto` so a row that grows later is
 *   not cut. Closing is the same backwards, down to 0.
 *
 *   WHAT IS INSIDE FADES, IT DOES NOT SLIDE. Only the box's height and the
 *   content's opacity change, so text never moves sideways or scales.
 *
 *   CLOSED IS GONE FOR A KEYBOARD AND A SCREEN READER. `inert` and
 *   aria-hidden, once the close has finished; and focus that was inside
 *   goes back to whoever asked (`returnFocus`), not to the page's top.
 *
 *   BUILT THE FIRST TIME IT OPENS. Until then nothing inside is rendered,
 *   so a list of forty products costs four rows on the first draw.
 *
 * Under reduced motion it opens and closes at once.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export const REVEAL_OPEN_MS = 300
export const REVEAL_CLOSE_MS = 240
/** iOS's sheet curve: leaves quickly, lands softly (components/ui/bottom-sheet SHEET_EASE). */
export const REVEAL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function Reveal({
  open,
  id,
  className,
  returnFocus,
  children,
}: {
  open: boolean
  id?: string
  className?: string
  /** Where focus goes when the box closes with focus inside it (the button that closed it). */
  returnFocus?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const [built, setBuilt] = React.useState(open)
  if (open && !built) setBuilt(true)
  /* Closed and finished: inert and hidden. Kept in step with `open` only once a close has run. */
  const [shut, setShut] = React.useState(!open)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const animRef = React.useRef<Animation[]>([])
  const first = React.useRef(true)

  React.useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return
    if (first.current) {
      first.current = false
      box.style.height = open ? "auto" : "0px"
      inner.style.opacity = open ? "1" : "0"
      return
    }
    const from = box.getBoundingClientRect().height
    for (const a of animRef.current) a.cancel()
    animRef.current = []
    if (open) setShut(false)
    else if (returnFocus?.current && box.contains(document.activeElement)) returnFocus.current.focus({ preventScroll: true })
    const to = open ? inner.scrollHeight : 0
    const done = () => {
      box.style.height = open ? "auto" : "0px"
      box.style.willChange = ""
      if (!open) setShut(true)
    }
    box.style.height = `${to}px`
    inner.style.opacity = open ? "1" : "0"
    if (reducedMotion() || typeof box.animate !== "function" || Math.abs(to - from) < 1) {
      done()
      return
    }
    box.style.willChange = "height"
    const ms = open ? REVEAL_OPEN_MS : REVEAL_CLOSE_MS
    const a = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms, easing: REVEAL_EASE })
    const fade = inner.animate(
      open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: open ? ms : ms * 0.6, easing: "cubic-bezier(0.4, 0, 0.2, 1)", delay: open ? 40 : 0, fill: "backwards" },
    )
    animRef.current = [a, fade]
    a.onfinish = done
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => () => { for (const a of animRef.current) a.cancel() }, [])

  return (
    <div
      ref={boxRef}
      id={id}
      data-reveal={open ? "open" : "shut"}
      aria-hidden={shut ? true : undefined}
      inert={shut ? true : undefined}
      /* No height or opacity in the props: React would write them in the commit, before the effect has read where the box was. */
      className={cn("overflow-hidden", className)}
    >
      <div ref={innerRef}>
        {built ? children : null}
      </div>
    </div>
  )
}

/**
 * A BOX THAT FOLLOWS ITS CONTENT'S HEIGHT. A dialog whose view changes
 * (the thumbnail's choices, then Choose icon) jumped from one height to the
 * other in a frame. Wrapped in this, the change is a glide: the content's
 * new height is seen after layout and before paint (a ResizeObserver), and
 * the box goes there from the height it had.
 */
export function AutoHeight({ children, className }: { children: React.ReactNode; className?: string }) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner || typeof ResizeObserver === "undefined") return
    let last = inner.offsetHeight
    let anim: Animation | null = null
    const ro = new ResizeObserver(() => {
      const next = inner.offsetHeight
      const from = anim ? box.getBoundingClientRect().height : last
      last = next
      if (Math.abs(from - next) < 1 || reducedMotion() || typeof box.animate !== "function") return
      anim?.cancel()
      anim = box.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: REVEAL_OPEN_MS, easing: REVEAL_EASE })
      anim.onfinish = () => { anim = null }
    })
    ro.observe(inner)
    return () => {
      ro.disconnect()
      anim?.cancel()
    }
  }, [])
  return (
    <div ref={boxRef} data-auto-height="" className={cn("overflow-hidden", className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

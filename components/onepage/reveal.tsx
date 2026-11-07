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
 *
 * ROUND AL, `follow` ("make sure that collapsible animation in and out is
 * very smooth and clean"). A block's settings measured their height in the
 * frame they were built, but the editor inside keeps growing for a moment
 * after (a picker that loads, a preview that lands), so the open ran to the
 * first height and then jumped to the real one when it let go to `auto`;
 * and Settings to Layout changed the height in one frame. With `follow`,
 * a ResizeObserver sees the new height after layout and before paint: an
 * open still running is aimed at it from where it is, with the time it has
 * left, and an open box glides to it (a change of FOLLOW_MIN_PX or more, so
 * a line typed into a text box is never held back).
 *
 * ROUND 41, A BLOCK'S SETTINGS IN THE LINKS TAB ("when I click on a block
 * to close its settings, make it smoother and cleaner"). They were there or
 * not, so a close took the whole panel away in one frame and every card
 * under it jumped up. They open and close in this box now, with two more
 * things a list of forty cards needs:
 *
 *   `unmountWhenShut`  what is inside is let go once a close has finished,
 *                      so a closed card keeps no editor alive.
 *   `data-reveal-closing` while a close runs, so a scroll worked out at the
 *                      same moment (the next card opening under it) can take
 *                      off the height that is about to go (revealSettledTop).
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export const REVEAL_OPEN_MS = 300
export const REVEAL_CLOSE_MS = 280
/** iOS's sheet curve: leaves quickly, lands softly (components/ui/bottom-sheet SHEET_EASE). */
export const REVEAL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/**
 * Round 41: a close starts gently and settles gently. On the sheet curve a
 * 305px panel lost 250px in its first three frames (scripts/check-onepage-r41.mjs),
 * which reads as a snap, not a close.
 */
export const REVEAL_CLOSE_EASE = "cubic-bezier(0.45, 0, 0.2, 1)"
/** An open box glides to a new height only when it changes by this much. */
export const FOLLOW_MIN_PX = 40

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function Reveal({
  open,
  id,
  className,
  returnFocus,
  unmountWhenShut = false,
  follow = false,
  children,
}: {
  open: boolean
  id?: string
  className?: string
  /** Where focus goes when the box closes with focus inside it (the button that closed it). */
  returnFocus?: React.RefObject<HTMLElement | null>
  /** Let go of the children once a close has finished (they are built again on the next open). */
  unmountWhenShut?: boolean
  /** Keep up with what is inside as it grows or shrinks while open (round AL). */
  follow?: boolean
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
  /* The open that is running: when it started and the height it is going to, so `follow` can aim it again. */
  const opening = React.useRef<{ began: number; to: number } | null>(null)

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
      opening.current = null
      box.style.height = open ? "auto" : "0px"
      box.style.willChange = ""
      delete box.dataset.revealClosing
      if (!open) {
        setShut(true)
        if (unmountWhenShut) setBuilt(false)
      }
    }
    if (!open) box.dataset.revealClosing = ""
    else delete box.dataset.revealClosing
    box.style.height = `${to}px`
    inner.style.opacity = open ? "1" : "0"
    if (reducedMotion() || typeof box.animate !== "function" || Math.abs(to - from) < 1) {
      done()
      return
    }
    box.style.willChange = "height"
    const ms = open ? REVEAL_OPEN_MS : REVEAL_CLOSE_MS
    const a = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms, easing: open ? REVEAL_EASE : REVEAL_CLOSE_EASE })
    const fade = inner.animate(
      open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: open ? ms : ms * 0.6, easing: "cubic-bezier(0.4, 0, 0.2, 1)", delay: open ? 40 : 0, fill: "backwards" },
    )
    animRef.current = [a, fade]
    a.onfinish = done
    opening.current = open ? { began: performance.now(), to } : null
    /*
      Round AL: a block's editor is built in the same moment it opens, and
      its effects run in the next frames; a clock running through them threw
      half the height into one frame (scripts/check-onepage-editor-al3.mjs).
      With `follow` the open waits two frames, at its first height, and then
      plays from the start.
    */
    if (open && follow) {
      a.pause()
      fade.pause()
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (animRef.current[0] !== a) return
        a.play()
        fade.play()
        if (opening.current) opening.current.began = performance.now()
      }))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
    FOLLOWING WHAT IS INSIDE (round AL). Seen after layout and before paint,
    so the new height is never drawn for a frame before the glide starts.
  */
  React.useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!follow || !open || !box || !inner || typeof ResizeObserver === "undefined") return
    let last = inner.offsetHeight
    let glide: Animation | null = null
    const ro = new ResizeObserver(() => {
      const next = inner.offsetHeight
      const run = opening.current
      if (run) {
        /* An open still running: from where it is now to the new height, in the time it had left. */
        if (Math.abs(next - run.to) < 1) return
        const from = box.getBoundingClientRect().height
        const left = Math.max(140, REVEAL_OPEN_MS - (performance.now() - run.began))
        const height = animRef.current[0]
        height?.cancel()
        box.style.height = `${next}px`
        run.to = next
        const a = box.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: left, easing: REVEAL_CLOSE_EASE })
        a.onfinish = () => {
          opening.current = null
          box.style.height = "auto"
          box.style.willChange = ""
        }
        animRef.current = [a, ...animRef.current.slice(1)]
        last = next
        return
      }
      const from = glide ? box.getBoundingClientRect().height : last
      last = next
      if (Math.abs(from - next) < FOLLOW_MIN_PX || reducedMotion() || typeof box.animate !== "function") return
      glide?.cancel()
      glide = box.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: REVEAL_OPEN_MS, easing: REVEAL_EASE })
      glide.onfinish = () => { glide = null }
    })
    ro.observe(inner)
    return () => {
      ro.disconnect()
      glide?.cancel()
    }
  }, [follow, open])

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
 * Where `el`'s top will be once every box that is closing right now has
 * closed: its top now, less the height still to go of each closing box above
 * it. A scroll to a card that opens while the one above it closes aims there.
 */
export function revealSettledTop(el: HTMLElement): number {
  const top = el.getBoundingClientRect().top
  let gone = 0
  for (const box of Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-closing]"))) {
    if (el.contains(box)) continue
    const r = box.getBoundingClientRect()
    if (r.bottom <= top + 0.5) gone += r.height
  }
  return top - gone
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

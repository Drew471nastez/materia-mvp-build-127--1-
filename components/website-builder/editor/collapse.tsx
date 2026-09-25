"use client"

/**
 * ===========================================================================
 *  A GROUP THAT OPENS AND CLOSES, RATHER THAN APPEARING AND VANISHING
 * ===========================================================================
 * "The animation when I close a tab in general settings." There was none:
 * the groups under Theme opened with a short fade and closed in one frame,
 * so everything under a closing group jumped up by the height of a form.
 *
 * Both ways are a height now, from wherever the box is to wherever it is
 * going, with the content fading and settling a few pixels as it comes. The
 * height is animated with the Web Animations API from measured pixels, so
 * an interrupted open closes from the height it had reached and never jumps
 * to either end first. The content leaves the DOM once it has closed: a
 * closed group costs nothing, which matters when it is a form of twenty
 * fields.
 *
 * WHAT IS OPEN WHEN THIS FIRST DRAWS IS SHOWN OPEN, with no entrance. Coming
 * back to Theme with Typography left open shows Typography, it does not play
 * its opening again (scripts/check-sidebar-tabs.mjs holds that).
 *
 * `prefers-reduced-motion` gets the end state at once.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export const COLLAPSE_OPEN_MS = 240
export const COLLAPSE_CLOSE_MS = 200
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * How much of the box can be seen from its top down (to the foot of the
 * scroller it is in, or of the screen, whichever is higher, and a few pixels
 * past it), and how much of the scroller's content is below what it shows.
 */
function visibleRoom(el: HTMLElement): { room: number; slack: number } {
  let bottom = window.innerHeight
  let slack = Infinity
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if (overflow === "auto" || overflow === "scroll") {
      bottom = Math.min(bottom, p.getBoundingClientRect().bottom)
      slack = Math.max(0, p.scrollHeight - p.clientHeight - p.scrollTop)
      break
    }
  }
  return { room: Math.max(0, bottom - el.getBoundingClientRect().top + 8), slack }
}

export function Collapse({
  open,
  children,
  className,
  innerClassName,
  onlyVisible = false,
}: {
  open: boolean
  /** A function is called only while the content is in, so a closed group builds nothing. */
  children: ReactNode | (() => ReactNode)
  className?: string
  innerClassName?: string
  /**
   * Move only the part of the height that is on screen, and let the rest
   * arrive or go at once, out of sight. For a long form in a scroller (the
   * sidebar's groups). Off, the whole height moves, which is what a caller
   * that reads the opened height at COLLAPSE_OPEN_MS expects.
   */
  onlyVisible?: boolean
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  /** Whether the content is in the DOM: from the start of an open to the end of a close. */
  const [present, setPresent] = useState(open)
  const running = useRef<Animation[]>([])
  const startFrame = useRef(0)
  const opening = useRef(false)
  const first = useRef(true)

  const stop = () => {
    if (startFrame.current) cancelAnimationFrame(startFrame.current)
    startFrame.current = 0
    for (const a of running.current) a.cancel()
    running.current = []
  }

  /** From the height the box has right now, to `to`. */
  const run = (to: number | "content", done?: () => void) => {
    const el = outer.current
    const body = inner.current
    if (!el || !body) {
      done?.()
      return
    }
    const measured = el.getBoundingClientRect().height
    stop()
    const full = to === "content" ? body.getBoundingClientRect().height : to
    /*
      WITH `onlyVisible`, ONLY WHAT CAN BE SEEN MOVES. Theme's Colors group
      is nearly two thousand pixels tall, and on this curve a quarter of a
      second covers a quarter of any distance in one frame: five hundred
      pixels at once, which is a jump however smooth the curve. What is below
      the foot of the scroller is out of sight, so it arrives (or goes) at
      once, and the height moves only across the part on screen. A close
      takes the hidden part away only where there is scroll room under it, so
      the scroller never has to pull its content down to make up for it.
      scripts/check-sidebar-revert.mjs reads the frames.
    */
    const { room, slack } = onlyVisible ? visibleRoom(el) : { room: Infinity, slack: 0 }
    const from = to === 0 ? measured - Math.min(Math.max(0, measured - room), slack) : Math.min(measured, room)
    const target = Math.min(full, room)
    if (reducedMotion() || Math.abs(target - from) < 1) {
      el.style.height = ""
      el.style.overflow = ""
      done?.()
      return
    }
    const growing = target > from
    el.style.overflow = "hidden"
    const box = el.animate([{ height: `${from}px` }, { height: `${target}px` }], {
      duration: growing ? COLLAPSE_OPEN_MS : COLLAPSE_CLOSE_MS,
      easing: EASE,
      fill: "forwards",
    })
    const content = body.animate(
      growing
        ? [{ opacity: 0, transform: "translate3d(0, -4px, 0)" }, { opacity: 1, transform: "none" }]
        : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translate3d(0, -4px, 0)" }],
      { duration: growing ? COLLAPSE_OPEN_MS : COLLAPSE_CLOSE_MS * 0.8, easing: EASE, fill: "forwards" },
    )
    /*
      THE CLOCK STARTS ONCE THE FIRST FRAME HAS BEEN DRAWN. Opening a group
      builds its whole form in this same task, and closing one lays out the
      whole panel again in the frame after it; either frame can be forty
      milliseconds late. A clock that started with the task spent those on
      nothing, and the first frame anybody saw was two thirds of the way.
      Held at its first keyframe through that frame, and running from the
      one after it, so every step after the first is a frame's worth.
    */
    box.pause()
    content.pause()
    startFrame.current = requestAnimationFrame(() => {
      startFrame.current = requestAnimationFrame(() => {
        startFrame.current = 0
        if (running.current[0] !== box) return
        const now = document.timeline.currentTime
        box.startTime = now
        content.startTime = now
      })
    })
    running.current = [box, content]
    box.onfinish = () => {
      if (growing) {
        /* Back to the height of whatever is in it, so the content can grow or shrink on its own. */
        running.current = []
        box.cancel()
        content.cancel()
        el.style.overflow = ""
      }
      /*
        A close keeps its last frame (height 0, content faded) until React has
        taken the content out. Cancelling here would put the full height back
        for the frame before that render, which is a flash of the whole form.
      */
      done?.()
    }
  }

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (open) {
      opening.current = true
      if (present) {
        /* Reopened while closing: grow back from where it is. */
        opening.current = false
        run("content")
      } else setPresent(true)
    } else if (present) {
      opening.current = false
      run(0, () => setPresent(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* The content has just been put in: open from nothing to its height. */
  useLayoutEffect(() => {
    if (!present || !opening.current) return
    opening.current = false
    const el = outer.current
    if (el) {
      el.style.height = "0px"
      el.style.overflow = "hidden"
    }
    run("content", () => {
      if (outer.current) outer.current.style.height = ""
    })
    if (el) el.style.height = ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present])

  useLayoutEffect(() => () => stop(), [])

  if (!present) return null
  return (
    <div ref={outer} className={className} data-collapse={open ? "open" : "closing"}>
      {/* `flow-root`, so a margin on the first or last thing inside is part of
          the height measured, not collapsed through it and added a frame late. */}
      <div ref={inner} className={cn("flow-root", innerClassName)}>
        {typeof children === "function" ? (children as () => ReactNode)() : children}
      </div>
    </div>
  )
}

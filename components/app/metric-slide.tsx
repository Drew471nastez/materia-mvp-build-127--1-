"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * ===========================================================================
 *  THE CHART COMES IN FROM THE SIDE THE TAB IS ON
 * ===========================================================================
 * The metric strip above both charts is a row you can scroll sideways, and
 * tapping along it changed the plot underneath with a cut. Asked for: the
 * chart should slide in from the left or the right depending on which way you
 * moved along the row, the way a paged view does.
 *
 * So the direction is not a guess, it is the distance between the two tabs in
 * their own order: a tab to the RIGHT of the one you were on brings its chart
 * in from the right, and a tab to the left brings it in from the left. Moving
 * two tabs at once is the same gesture as moving one, because what is being
 * said is "further that way", not "further by that much".
 *
 * WHY THE WEB ANIMATIONS API AND NOT A CLASS. A CSS animation restarts only
 * when its name changes, so tapping right, then right again, would play once
 * and then sit still — the second tap has the same class as the first. The
 * usual answer is to force a reflow between them, which is a layout on the
 * main thread in the middle of a tap. `element.animate()` restarts on every
 * call by construction, composites transform and opacity like any other
 * animation, and hands back a handle to cancel a half-played one when a
 * second tap lands on top of the first.
 *
 * WHY A LAYOUT EFFECT. It runs after React has put the new chart in the DOM
 * and before the browser paints, so the first frame anyone sees is already
 * offset. From an ordinary effect the new chart paints once in its final
 * place and then jumps aside to slide back, which is a flash.
 *
 * ON A PHONE ONLY, which is where it was asked for. On a desktop the strip is
 * a row of columns with a highlight on the active one, a different affordance
 * that does not read as paging, and a pointer that clicked a tab is already
 * looking at it.
 */

/** Long enough to read as movement, short enough not to be in the way. */
const DURATION_MS = 320
/** The same curve the app's sheets and the nav pill settle on. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/**
 * How far it starts from its place. Small on purpose: the chart is most of
 * the card's width, and a shift big enough to "reveal" it would be a shift
 * big enough to look like the card itself had moved.
 */
const SHIFT_PX = 28

export function MetricSlide({
  slot,
  order,
  className,
  children,
}: {
  /** Which tab's content this is, right now. */
  slot: string
  /** The tabs in the order they are drawn, which is what decides the direction. */
  order: readonly string[]
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const previous = useRef(slot)
  const running = useRef<Animation | null>(null)
  const unclip = useRef(0)

  useLayoutEffect(() => {
    const from = previous.current
    if (from === slot) return
    previous.current = slot

    const node = ref.current
    if (!node || typeof node.animate !== "function") return
    /* Phones only, and never when the person has asked for less motion. */
    if (!window.matchMedia("(max-width: 767px)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const was = order.indexOf(from)
    const now = order.indexOf(slot)
    if (was < 0 || now < 0 || was === now) return
    const direction = now > was ? 1 : -1

    /* A second tap lands on the first one's animation, not beside it. */
    running.current?.cancel()

    /*
      Clipped only while it moves. A permanent overflow: hidden would cut the
      active dot's shadow at the plot's edges, and leaving it unclipped lets
      the shifted chart widen the page for a third of a second, which the
      surrounding scroller would answer with a sideways pan.
    */
    node.style.overflow = "hidden"

    const animation = node.animate(
      [
        { transform: `translate3d(${direction * SHIFT_PX}px, 0, 0)`, opacity: 0 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: DURATION_MS, easing: EASE },
    )
    running.current = animation

    /*
      THE CLIP IS GIVEN BACK ON A TIMER, NOT ON THE ANIMATION'S OWN EVENT.

      `finish` and `cancel` are queued against the animation's timeline, and a
      timeline that never advances never queues them — which is not only the
      headless case this is measured in. A backgrounded tab, a page frozen by
      the system while a sheet is up, an element taken out of the document
      mid-move: in every one of those the event does not arrive and the
      container stays clipped for the rest of its life, cutting the active
      dot's shadow at the plot's edge with nothing left to explain why.

      A timer owes nothing to the compositor. It is cleared by the cleanup
      below, so a second tap does not restore the clip the second move is
      still using.
    */
    window.clearTimeout(unclip.current)
    unclip.current = window.setTimeout(() => {
      if (running.current === animation) running.current = null
      node.style.overflow = ""
    }, DURATION_MS + 40)
  }, [slot, order])

  /* On the way out, and before every move: never leave it clipped. */
  useLayoutEffect(() => () => {
    window.clearTimeout(unclip.current)
    running.current?.cancel()
    if (ref.current) ref.current.style.overflow = ""
  }, [])

  return (
    <div ref={ref} data-metric-slide="" className={className}>
      {children}
    </div>
  )
}

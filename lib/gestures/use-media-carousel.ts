"use client"

/**
 * ===========================================================================
 *  ONE CAROUSEL ENGINE, AND IT IS NOT OURS
 * ===========================================================================
 * The gallery's swipe was written here twice and rewritten twice more. The
 * last pass got the obvious fault out of it — the drag offset was React state,
 * so every touchmove re-rendered the whole gallery — and the strip did then
 * track a finger exactly. It still did not feel right, and the reasons are the
 * parts a hand-rolled gesture always misses:
 *
 *   NO MOMENTUM. The release snapped with a fixed 300ms transition whatever
 *   the hand did. A real carousel carries the speed of the flick into the
 *   settle, so a fast flick lands fast and a slow drag eases.
 *
 *   NO POINTER EVENTS. touchstart/touchmove only, so a trackpad or a stylus
 *   dragged nothing, and the mouse path was a separate 50px threshold with
 *   its own behaviour.
 *
 *   NO RESIZE HANDLING, no re-measure when a picture decoded and changed the
 *   box, no scroll-snap arithmetic beyond one slide at a time.
 *
 * Embla is the standard answer and it was ALREADY A DEPENDENCY of this
 * project, unused: it is what shadcn/ui's carousel is built on, it is about
 * 10KB, it has no dependencies of its own, and it does all of the above. So
 * this is a deletion rather than an addition — lib/gestures/use-swipe-track
 * and the viewer's second copy of it both go.
 *
 * WHAT THIS ADDS ON TOP, which is only the two decisions that are ours:
 *
 *   THE INDEX STAYS WITH THE CALLER. The gallery has thumbnails, arrows, dots
 *   and an autoplay timer that all move the strip, and the viewer is kept in
 *   step with the gallery underneath it. So the index is a prop, this reports
 *   changes out, and it follows the prop back in.
 *
 *   A JUMP OF MORE THAN ONE DOES NOT SCROLL THERE. Pressing the fourth
 *   thumbnail would otherwise drag every picture in between across the box.
 *   Embla's `scrollTo` takes a `jump` flag for exactly this, so adjacent
 *   moves slide and anything further cuts.
 */

import * as React from "react"
import useEmblaCarousel from "embla-carousel-react"

/**
 * How long a programmatic move takes. Embla's unit is not milliseconds, it is
 * a factor on its own easing; 22 is a little quicker than the default 25 and
 * lands close to the 300ms the strip used to use.
 */
const SCROLL_DURATION = 22

export interface MediaCarousel {
  /** On the element that clips. Embla measures and transforms inside it. */
  viewportRef: (node: HTMLElement | null) => void
  /** Present once Embla has mounted. Null on the server and on first render. */
  api: ReturnType<typeof useEmblaCarousel>[1]
  /** False when the gesture that just ended moved the strip, so a swipe is
   *  not also a tap. */
  clickAllowed: () => boolean
  scrollPrev: () => void
  scrollNext: () => void
  scrollTo: (index: number) => void
}

export function useMediaCarousel({
  index,
  count,
  onIndexChange,
  loop = false,
  enabled = true,
}: {
  index: number
  count: number
  onIndexChange: (next: number) => void
  /** Whether the last slide leads back to the first. */
  loop?: boolean
  /** Off where there is nothing to swipe. */
  enabled?: boolean
}): MediaCarousel {
  const [viewportRef, api] = useEmblaCarousel({
    active: enabled && count > 1,
    loop: loop && count > 1,
    align: "start",
    /**
     * `false`, not "trimSnaps". The slides are the full width of the
     * viewport, so there is nothing to trim, and trimming with one slide
     * disables the whole thing.
     */
    containScroll: false,
    duration: SCROLL_DURATION,
    /* A drag is a slide, never a free scroll that stops between two. */
    dragFree: false,
    /* Watch for the box changing, which it does when a picture decodes. */
    watchResize: true,
  })

  /** Read in effects that must not re-subscribe every time the caller renders. */
  const notify = React.useRef(onIndexChange)
  notify.current = onIndexChange

  /* Out: Embla settled somewhere, tell the caller. */
  React.useEffect(() => {
    if (!api) return
    const onSelect = () => notify.current(api.selectedScrollSnap())
    api.on("select", onSelect)
    api.on("reInit", onSelect)
    return () => {
      api.off("select", onSelect)
      api.off("reInit", onSelect)
    }
  }, [api])

  /*
    In: something other than a drag moved the index — a thumbnail, an arrow,
    a dot, the autoplay timer, or the viewer closing on a different picture.

    The guard is what stops the two from fighting: a drag sets the index
    through the effect above, and without this check that would scroll Embla
    to where it already is and cancel its own settle.
  */
  React.useEffect(() => {
    if (!api) return
    const at = api.selectedScrollSnap()
    if (at === index) return
    api.scrollTo(index, Math.abs(at - index) > 1)
  }, [api, index])

  /**
   * WAS THAT A TAP, OR THE END OF A DRAG.
   *
   * Embla 7 had `clickAllowed()` and 8 does not, so it is assembled from the
   * events it does emit. `scroll` fires only when the strip actually moves,
   * so a pointer that went down, moved the strip, and came up is a drag; a
   * pointer that went down and came up without the strip moving is a tap. The
   * click the browser sends immediately afterwards reads the same flag, and
   * the next `pointerDown` clears it.
   */
  const dragged = React.useRef(false)
  const pointerDown = React.useRef(false)
  React.useEffect(() => {
    if (!api) return
    const onDown = () => {
      pointerDown.current = true
      dragged.current = false
    }
    const onScroll = () => {
      if (pointerDown.current) dragged.current = true
    }
    const onUp = () => {
      pointerDown.current = false
    }
    api.on("pointerDown", onDown).on("scroll", onScroll).on("pointerUp", onUp)
    return () => {
      api.off("pointerDown", onDown).off("scroll", onScroll).off("pointerUp", onUp)
    }
  }, [api])

  const clickAllowed = React.useCallback(() => !dragged.current, [])
  const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api])
  const scrollNext = React.useCallback(() => api?.scrollNext(), [api])
  const scrollTo = React.useCallback(
    (to: number) => {
      if (!api) return
      api.scrollTo(to, Math.abs(api.selectedScrollSnap() - to) > 1)
    },
    [api],
  )

  return { viewportRef, api, clickAllowed, scrollPrev, scrollNext, scrollTo }
}

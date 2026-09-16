"use client"

/**
 * ===========================================================================
 *  ONE SWIPER, SHARED BY THE GALLERY AND THE FULL-SCREEN VIEWER
 * ===========================================================================
 * This gesture has now been written four ways: by hand twice, then as a
 * shared hook over embla-carousel. Each rewrite fixed the fault before it and
 * introduced a feel of its own, and the reason is that "smooth" is not one
 * property — it is momentum, resistance at the ends, how a short flick is
 * told from a slow drag, what a mouse does, what happens when a picture
 * decodes and changes the box.
 *
 * Swiper is the library that answers all of those the way a shop expects,
 * and it is what was asked for by name. Everything below is its defaults plus
 * the handful of decisions that belong to this product.
 *
 * ---------------------------------------------------------------------------
 *  THE SAME ON A DESKTOP, WHICH IS NOT SWIPER'S DEFAULT ASSUMPTION
 * ---------------------------------------------------------------------------
 * `simulateTouch` and `grabCursor` are on, so a mouse drags the strip exactly
 * as a finger does. Before this the desktop path was a separate pair of
 * handlers with a 50px threshold and no movement at all until it fired, so
 * the same gallery behaved like two different components depending on what
 * you were holding.
 *
 * ---------------------------------------------------------------------------
 *  A JUMP OF MORE THAN ONE DOES NOT SLIDE
 * ---------------------------------------------------------------------------
 * Pressing the fourth thumbnail would otherwise drag every picture in between
 * across the box. `slideToIndex` passes 0 for the speed when the move is
 * further than a neighbour, which is what a gallery with thumbnails does
 * everywhere else.
 *
 * ---------------------------------------------------------------------------
 *  AND THE RULE THAT WOULD KILL IT ON EVERY PHONE
 * ---------------------------------------------------------------------------
 * globals.css sets `transform: none !important` AND `transition-property:
 * none !important` on every descendant of a `.group` on a touch-only device,
 * to stop hover lifts sticking after a tap. Swiper moves `.swiper-wrapper`
 * by transform and animates it with a transition, so both halves of that rule
 * would apply to it: the strip would not move under a finger, and a
 * programmatic slide would jump rather than slide. The rule now names
 * `.swiper-wrapper` as an exception, next to the note explaining why.
 *
 * That is the single most important line in this file's blast radius. It is
 * invisible on every desktop and breaks the gallery for everybody on a phone,
 * which is exactly how this component shipped broken once before.
 */
import * as React from "react"
import { Swiper, SwiperSlide } from "swiper/react"
import type { Swiper as SwiperClass } from "swiper"

import "swiper/css"

export { SwiperSlide }
export type { SwiperClass }

/**
 * How long a programmatic slide takes, in milliseconds. A drag is not this —
 * a release carries its own velocity into the settle, which is the whole
 * reason for using a real engine.
 */
export const SLIDE_SPEED_MS = 320

export interface MediaSwiperHandle {
  /** Move to a slide. Neighbours slide; anything further cuts. */
  slideToIndex: (next: number, currentIndex: number) => void
  /** False for the moment after a drag, so a swipe is not also a tap. */
  clickAllowed: () => boolean
  swiper: SwiperClass | null
}

export function useMediaSwiper(): [
  React.MutableRefObject<SwiperClass | null>,
  MediaSwiperHandle,
] {
  const ref = React.useRef<SwiperClass | null>(null)

  const slideToIndex = React.useCallback((next: number, currentIndex: number) => {
    const swiper = ref.current
    if (!swiper || swiper.destroyed) return
    if (swiper.activeIndex === next) return
    /* A neighbour slides; a thumbnail four along would smear the ones between. */
    swiper.slideTo(next, Math.abs(next - currentIndex) > 1 ? 0 : SLIDE_SPEED_MS)
  }, [])

  /**
   * `allowClick` is Swiper's own answer to "was that a tap or the end of a
   * drag", and it is a documented part of the instance rather than something
   * reached out of its internals. It is false for the click that ends a drag.
   */
  const clickAllowed = React.useCallback(() => {
    const swiper = ref.current
    if (!swiper || swiper.destroyed) return true
    return swiper.allowClick !== false
  }, [])

  return [ref, { slideToIndex, clickAllowed, get swiper() { return ref.current } }]
}

/**
 * The strip. The caller supplies `<SwiperSlide>` children and owns the index,
 * because the gallery has thumbnails, arrows, dots and an autoplay timer that
 * all move it, and the viewer is kept in step with the gallery underneath it.
 */
export function MediaSwiper({
  onSwiper,
  onIndexChange,
  enabled = true,
  className,
  children,
}: {
  onSwiper: (swiper: SwiperClass) => void
  onIndexChange: (index: number) => void
  /** Off when there is only one picture, so a stray drag does nothing. */
  enabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Swiper
      className={className}
      onSwiper={onSwiper}
      onSlideChange={(swiper) => onIndexChange(swiper.activeIndex)}
      slidesPerView={1}
      spaceBetween={0}
      speed={SLIDE_SPEED_MS}
      /*
        ZERO, WHICH IS SWIPER'S OWN DEFAULT AND IS THE POINT.

        `threshold` is movement swallowed before the strip starts moving, and
        every pixel of it is the picture sitting behind the finger for the
        whole gesture. Measured with a real touch drag at 5: the finger was
        110px in and the strip was at 92px, a constant 18px behind. At 0 the
        picture is attached to the finger from the first pixel, which is what
        1:1 tracking means and what the demos do.

        The axis lock does not need it — Swiper decides direction from the
        angle of the first movement (`touchAngle`), not from a dead zone.
      */
      threshold={0}
      /* The rubber band at the first and last picture. Swiper's own default. */
      resistance
      resistanceRatio={0.5}
      /* A mouse drags it exactly as a finger does. */
      simulateTouch={enabled}
      allowTouchMove={enabled}
      grabCursor={enabled}
      /* The page still scrolls under a finger that started on a picture;
         Swiper sets `touch-action: pan-y` for a horizontal strip itself. */
      watchSlidesProgress
    >
      {children}
    </Swiper>
  )
}

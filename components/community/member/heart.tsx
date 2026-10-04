"use client"

/**
 * ===========================================================================
 *  THE HEART (round 10)
 * ===========================================================================
 * A like's icon, a little bigger than the other icons in a post's footer.
 * Two hearts in one box: the outline always, and a filled one over it that
 * grows into it on a like (a short overshoot, then rest) and shrinks away on
 * an unlike. The icon itself gives one small beat when it fills. Only the
 * icon moves, never the button around it, and only by scale and opacity on
 * the compositor; the count beside it stays where it is.
 *
 * Nothing moves on the first draw or when a post is read again with the
 * same answer: only a change of `on` while drawn beats.
 */
import { Heart } from "lucide-react"
import { useLayoutEffect, useRef } from "react"

const BEAT_MS = 380

/**
 * The button around it carries `group/like` and aria-pressed: the fill follows
 * that one attribute (no class or attribute of its own changes on a press,
 * so a press restyles the button and nothing else). `on` only starts the beat.
 */
export function LikeHeart({ on, size = 20, strokeWidth = 1.75 }: { on: boolean; size?: number; strokeWidth?: number }) {
  const box = useRef<HTMLSpanElement>(null)
  const was = useRef(on)
  useLayoutEffect(() => {
    if (was.current === on) return
    was.current = on
    const el = box.current
    if (!on || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ scale: "1" }, { scale: "1.2", offset: 0.35 }, { scale: "0.95", offset: 0.7 }, { scale: "1" }], { duration: BEAT_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" })
  }, [on])
  return (
    <span ref={box} className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden data-heart="">
      <Heart className="absolute inset-0 h-full w-full" strokeWidth={strokeWidth} />
      <Heart
        className="absolute inset-0 h-full w-full scale-[0.4] fill-current opacity-0 transition-[scale,opacity] duration-150 ease-out group-aria-pressed/like:scale-100 group-aria-pressed/like:opacity-100 group-aria-pressed/like:duration-[280ms] group-aria-pressed/like:ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
        strokeWidth={strokeWidth}
        data-heart-fill=""
      />
    </span>
  )
}

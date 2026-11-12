"use client"

import { useCallback, useEffect, useRef } from "react"
import { RailMotion, SHOWCASE_MOTION } from "@/lib/ui/rail-motion"

/*
  THE SHOWCASE'S MOTION (round 60). One controller (lib/ui/rail-motion) owns
  the rail's position: dragging, release momentum, settling, the trackpad,
  the wheel, the keys and autoplay. It replaces Keen Slider here, whose drag,
  release animation and the autoplay timer around it were three systems
  moving one position.

  What it snaps to depends on the width, as before: from 768px a complete
  wide, OnePage, wide group comes to rest; on a phone each card does, its
  left edge on the page's gutter.
*/
const PHONE = "(max-width: 767px)"

export function useShowcaseMotion() {
  const rail = useRef<RailMotion | null>(null)
  const node = useRef<HTMLDivElement | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  const attach = useCallback((el: HTMLDivElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    node.current = el
    if (!el) return
    const section = el.closest<HTMLElement>("[data-build-showcase]")
    const viewport = el.parentElement ?? el
    const phone = matchMedia(PHONE)
    const groups = () => [...el.querySelectorAll<HTMLElement>(".build-showcase-group")]
    const slides = () => [...el.querySelectorAll<HTMLElement>(".build-showcase-slide")]
    const parts = () => (phone.matches ? { items: slides(), snaps: slides() } : { items: groups(), snaps: groups() })

    /* Whatever the native scroller was moved to before the script came is undone, then it stops scrolling. */
    el.scrollLeft = 0
    el.dataset.railReady = "true"
    const { items, snaps } = parts()
    const motion = new RailMotion(el, items, snaps, SHOWCASE_MOTION, {
      onMoving: (moving) => {
        section?.toggleAttribute("data-showcase-browsing", moving)
        if (moving) section?.removeAttribute("data-showcase-pristine")
      },
      onDragging: (dragging) => {
        if (dragging) el.dataset.dragging = "true"
        else delete el.dataset.dragging
      },
      onIndex: (index) => {
        el.dataset.showcaseIndex = String(index)
      },
    })
    rail.current = motion

    /* Layout changes (a resize, the phone breakpoint, images arriving) are measured once and never during motion. */
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = parts()
        motion.measure(next.items, next.snaps)
      })
    }
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
    resize?.observe(viewport)
    phone.addEventListener("change", remeasure)

    /* Autoplay only while half the rail is on screen; the first sight of it plays the cards' entrance. */
    const seen =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.target === el) {
                  motion.setVisible(entry.intersectionRatio >= 0.5)
                  if (entry.isIntersecting) viewport.setAttribute("data-showcase-entered", "")
                } else if (entry.isIntersecting) section?.setAttribute("data-showcase-entered", "")
              }
            },
            { threshold: [0, 0.1, 0.5] },
          )
        : null
    seen?.observe(el)
    const heading = section?.querySelector(".build-showcase-top")
    if (heading) seen?.observe(heading)
    if (!seen) motion.setVisible(true)

    cleanup.current = () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      seen?.disconnect()
      phone.removeEventListener("change", remeasure)
      motion.dispose()
      rail.current = null
      delete el.dataset.railReady
    }
  }, [])

  useEffect(() => () => cleanup.current?.(), [])

  return attach
}

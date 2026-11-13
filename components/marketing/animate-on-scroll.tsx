"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

/**
 * The marketing pages' scroll-in: a block rises and fades in once as it
 * reaches the screen. Moved out of bento-grid.tsx (wave 12) so a section that
 * uses it no longer pulls the old bento, its globe loader and its pictures
 * into its chunk.
 */

// Lightweight scroll-reveal animations — opacity and transform only.
// No blur or filter (causes paint lag on low-end devices).
// Wave 13 perf: 2D transforms. A translate3d at rest made every revealed
// block a compositor layer of its own for good; the transition still runs
// on the compositor.
type ScrollAnimVariant =
  | "fade-up"
  | "fade-up-scale"
  | "slide-left"
  | "slide-right"
  | "blur-in"   // kept for API compat — just does fade-up now
  | "zoom-in"

const HIDDEN: Record<ScrollAnimVariant, CSSProperties> = {
  "fade-up":       { opacity: 0, transform: "translate(0, 24px)" },
  "fade-up-scale": { opacity: 0, transform: "translate(0, 20px) scale(0.98)" },
  "slide-left":    { opacity: 0, transform: "translate(-30px, 0)" },
  "slide-right":   { opacity: 0, transform: "translate(30px, 0)" },
  "blur-in":       { opacity: 0, transform: "translate(0, 16px)" },
  "zoom-in":       { opacity: 0, transform: "scale(0.96)" },
}
const VISIBLE: Record<ScrollAnimVariant, CSSProperties> = {
  "fade-up":       { opacity: 1, transform: "translate(0, 0)" },
  "fade-up-scale": { opacity: 1, transform: "translate(0, 0) scale(1)" },
  "slide-left":    { opacity: 1, transform: "translate(0, 0)" },
  "slide-right":   { opacity: 1, transform: "translate(0, 0)" },
  "blur-in":       { opacity: 1, transform: "translate(0, 0)" },
  "zoom-in":       { opacity: 1, transform: "scale(1)" },
}

function AnimateOnScroll({
  children,
  className = "",
  variant = "fade-up",
  delay = 0,
}: {
  children: ReactNode
  className?: string
  variant?: ScrollAnimVariant
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== "function" || matchMedia("(prefers-reduced-motion:reduce)").matches) { setVisible(true); return }
    // Keep server-rendered/in-view content readable, even before hydration.
    // Wave 13 perf: where the block is comes from the observer's first report,
    // made after the browser has laid the page out, not from measuring it as
    // it mounts (a forced layout of the whole page, 30 ms and more at 4x CPU).
    // Only a block below the screen is hidden, to rise as it arrives.
    let first = true
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (first) {
          first = false
          const r = entry.boundingClientRect
          const below = r.top >= (entry.rootBounds?.height ?? innerHeight) + 80
          const skipped = r.top === 0 && r.height === 0 && r.width === 0
          if (entry.isIntersecting || !(below || skipped)) { obs.disconnect(); return }
          setVisible(false)
          return
        }
        if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
      },
      { threshold: 0.05, rootMargin: "0px 0px 80px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-story-reveal=""
      data-story-visible={visible}
      className={className}
      style={{
        ...(visible ? VISIBLE[variant] : HIDDEN[variant]),
        transition: `opacity 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, transform 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  )
}

export { AnimateOnScroll }


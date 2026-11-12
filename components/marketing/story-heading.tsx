"use client"

import { useEffect, useRef, type CSSProperties } from "react"

// All editorial headings share one passive listener and one scheduled frame.
// Offscreen headings do no scroll work; there is no continuous animation loop.
function createHeadingMotion() {
  const nodes = new Set<HTMLElement>()
  const active = new Set<HTMLElement>()
  const motion = matchMedia("(prefers-reduced-motion: reduce)")
  let frame = 0
  const paint = () => {
    frame = 0
    if (document.hidden) return
    const updates = Array.from(motion.matches ? nodes : active, (node) => {
      const rect = node.getBoundingClientRect()
      const progress = motion.matches
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              (innerHeight - rect.top - 64) /
                (innerHeight * 0.68 + rect.height * 0.25),
            ),
          )
      return { node, progress: progress.toFixed(3) }
    })
    // Read all geometry before any writes, avoiding layout thrashing.
    for (const { node, progress } of updates) {
      if (node.style.getPropertyValue("--story-progress") !== progress)
        node.style.setProperty("--story-progress", progress)
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const node = entry.target as HTMLElement
              if (entry.isIntersecting) active.add(node)
              else {
                active.delete(node)
                if (entry.boundingClientRect.bottom < 0)
                  node.style.setProperty("--story-progress", "1")
              }
            }
            schedule()
          },
          { rootMargin: "80px 0px", threshold: 0 },
        )
      : null
  window.addEventListener("scroll", schedule, { passive: true })
  window.addEventListener("resize", schedule)
  document.addEventListener("visibilitychange", schedule)
  motion.addEventListener("change", schedule)
  return {
    add(node: HTMLElement) {
      nodes.add(node)
      active.add(node)
      observer?.observe(node)
      schedule()
      return () => {
        nodes.delete(node)
        active.delete(node)
        observer?.unobserve(node)
        if (!nodes.size) {
          cancelAnimationFrame(frame)
          observer?.disconnect()
          window.removeEventListener("scroll", schedule)
          window.removeEventListener("resize", schedule)
          document.removeEventListener("visibilitychange", schedule)
          motion.removeEventListener("change", schedule)
          headingMotion = undefined
        }
      }
    },
  }
}
let headingMotion: ReturnType<typeof createHeadingMotion> | undefined

/** Server-rendered, readable copy; scroll progressively inks each word. */
export function StoryHeading({
  text,
  accent = [],
  as: Tag = "h2",
  id,
  className = "",
  dark = false,
  showcase = false,
}: {
  text: string
  accent?: string[]
  as?: "h1" | "h2" | "h3"
  id?: string
  className?: string
  dark?: boolean
  showcase?: boolean
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!ref.current) return
    headingMotion ??= createHeadingMotion()
    return headingMotion.add(ref.current)
  }, [])
  const words = text.trim().split(/\s+/)
  return (
    <Tag
      ref={ref}
      id={id}
      className={`story-heading ${className}`}
      data-story-heading=""
      data-story-dark={dark || undefined}
      aria-label={text}
    >
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span key={`${word}-${i}`}>
            <span
              data-story-word=""
              data-showcase-word={showcase ? "" : undefined}
              data-story-accent={
                accent.includes(
                  word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase(),
                ) || undefined
              }
              style={
                {
                  "--word-index": i,
                  "--word-count": words.length,
                } as CSSProperties
              }
            >
              {word}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </Tag>
  )
}

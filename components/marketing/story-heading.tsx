"use client"

import { useEffect, useRef, type CSSProperties } from "react"

// All editorial headings share one passive listener and one scheduled frame.
// Offscreen headings do no scroll work; there is no continuous animation loop.
function createHeadingMotion() {
  const nodes = new Set<HTMLElement>()
  const active = new Set<HTMLElement>()
  const details = new WeakMap<
    HTMLElement,
    {
      section: HTMLElement | null
      gallery: Element | null
      progress: string
      reveal: string
    }
  >()
  const motion = matchMedia("(prefers-reduced-motion: reduce)")
  let frame = 0
  let viewportWidth = document.documentElement.clientWidth
  let viewportHeight = innerHeight
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
              (viewportHeight - rect.top - 64) /
                (viewportHeight * 0.68 + rect.height * 0.25),
            ),
          )
      const entry = details.get(node)!
      const { section, gallery } = entry
      const reveal = gallery
        ? motion.matches
          ? 1
          : Math.max(
              0,
              Math.min(
                1,
                (viewportHeight - gallery.getBoundingClientRect().top) /
                  Math.min(260, viewportHeight * 0.55),
              ),
            )
        : 1
      return {
        node,
        entry,
        section,
        reveal: reveal.toFixed(3),
        progress: progress.toFixed(3),
      }
    })
    // Read all geometry before any writes, avoiding layout thrashing.
    for (const { node, entry, section, reveal, progress } of updates) {
      if (entry.progress !== progress) {
        node.style.setProperty("--story-progress", progress)
        entry.progress = progress
      }
      if (section && entry.reveal !== reveal) {
        section.style.setProperty("--showcase-reveal", reveal)
        entry.reveal = reveal
      }
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const resize = () => {
    const width = document.documentElement.clientWidth
    if (
      width !== viewportWidth ||
      (!matchMedia("(pointer:coarse)").matches && width >= 1024)
    ) {
      viewportWidth = width
      viewportHeight = innerHeight
      schedule()
    }
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
                if (entry.boundingClientRect.bottom < 0) {
                  node.style.setProperty("--story-progress", "1")
                  const cached = details.get(node)
                  if (cached) cached.progress = "1"
                }
              }
            }
            schedule()
          },
          { rootMargin: "80px 0px", threshold: 0 },
        )
      : null
  window.addEventListener("scroll", schedule, { passive: true })
  window.addEventListener("resize", resize)
  document.addEventListener("visibilitychange", schedule)
  motion.addEventListener("change", schedule)
  return {
    add(node: HTMLElement) {
      const section = node.hasAttribute("data-story-showcase")
        ? node.closest<HTMLElement>("[data-build-showcase]")
        : null
      details.set(node, {
        section,
        gallery: section?.querySelector(".build-showcase-viewport") || null,
        progress: "",
        reveal: "",
      })
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
          window.removeEventListener("resize", resize)
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
      data-story-showcase={showcase || undefined}
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
            {showcase && i === 5 ? (
              <br className="showcase-heading-break" />
            ) : null}
          </span>
        ))}
      </span>
    </Tag>
  )
}

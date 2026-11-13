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
      /*
        On the gallery itself, the only thing that reads it. Set on the whole
        section it was inherited by every card, picture and caption in it, so
        each scroll frame restyled all of them to fade one box.
      */
      if (section && entry.gallery && entry.reveal !== reveal) {
        ;(entry.gallery as HTMLElement).style.setProperty("--showcase-reveal", reveal)
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
        /* Round 61: the gallery fades in once on entry (build-showcase.tsx); nothing reads a scroll-linked reveal any more. */
        gallery: null,
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

/*
 * Where the browser has scroll-driven animations, a heading inks and rises by
 * itself (app/globals.css, "story-heading-rise" and "story-heading-ink"): the
 * same progress, from the same positions, with no script on each frame. The
 * rise then runs on the compositor; set from script, a transform that changes
 * every frame of a scroll made Chromium re-layer the whole page each frame
 * (5 to 15 ms at 4x CPU). The script keeps browsers without scroll-driven
 * animations and a heading inside a box that clips by scrolling (overflow:
 * hidden or auto), whose view timeline would follow that box instead of the
 * page; those are marked data-story-js, which the stylesheet leaves alone.
 * Wave 13: the showcase heading inks from the scroll again, the same way.
 */
function inkedByCss(node: HTMLElement) {
  if (typeof CSS === "undefined" || !CSS.supports("animation-timeline: view()")) return false
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el)
    if (/hidden|auto|scroll/.test(overflowX + overflowY)) return false
  }
  return true
}

/*
 * Wave 13 perf: whether a heading is in a clipping box is asked when it
 * first comes within a screen of the viewport, from an IntersectionObserver
 * callback, which runs after the browser has laid the page out, so reading
 * computed styles there costs nothing. Asked while a section mounted (the
 * effect), it made the browser restyle and lay out the whole page there and
 * then: 40 to 100 ms at 4x CPU for each section that arrived.
 */
let nearWatcher: IntersectionObserver | null = null
const nearCallbacks = new WeakMap<Element, () => void>()
function whenNear(node: HTMLElement, cb: () => void): () => void {
  if (typeof IntersectionObserver !== "function") {
    cb()
    return () => {}
  }
  nearWatcher ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        nearWatcher?.unobserve(entry.target)
        const done = nearCallbacks.get(entry.target)
        nearCallbacks.delete(entry.target)
        done?.()
      }
    },
    { rootMargin: "100% 0px" },
  )
  nearCallbacks.set(node, cb)
  nearWatcher.observe(node)
  return () => {
    nearCallbacks.delete(node)
    nearWatcher?.unobserve(node)
  }
}

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
    const node = ref.current
    if (!node) return
    /* Wave 13: the showcase heading is inked by the scroll like the others (round 61 had it stand still, fully inked). */
    let remove: (() => void) | undefined
    const decide = () => {
      if (inkedByCss(node)) return
      node.setAttribute("data-story-js", "")
      headingMotion ??= createHeadingMotion()
      remove = headingMotion.add(node)
    }
    if (typeof CSS === "undefined" || !CSS.supports("animation-timeline: view()")) {
      decide()
      return () => remove?.()
    }
    const stopWatching = whenNear(node, decide)
    return () => {
      stopWatching()
      remove?.()
    }
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
          </span>
        ))}
      </span>
    </Tag>
  )
}

"use client"

import { useEffect, useRef, type CSSProperties } from "react"

/*
 * THE SCRIPTED FALLBACK (landing round 7, the owner: "make the filling as you
 * scroll into the headings feel more smooth and clean"). Only browsers
 * without scroll-driven animations, and a heading inside a box that clips by
 * scrolling, come here. One passive scroll listener and one frame for all of
 * them, and nothing is measured on a frame: where a heading sits on the page
 * is read from the IntersectionObserver's own entries (handed over after the
 * browser has laid out, so free) and kept, and each frame works the progress
 * out from scrollY alone and writes one number, --story-progress. The words'
 * colour and the rise are worked out from it by the stylesheet (STORY_CSS).
 */
function createHeadingMotion() {
  const nodes = new Set<HTMLElement>()
  const active = new Set<HTMLElement>()
  const state = new WeakMap<HTMLElement, { top: number; height: number; progress: string }>()
  const motion = matchMedia("(prefers-reduced-motion: reduce)")
  let frame = 0
  let viewportWidth = document.documentElement.clientWidth
  let viewportHeight = innerHeight
  const write = (node: HTMLElement, value: number) => {
    const entry = state.get(node)
    const progress = value.toFixed(3)
    if (!entry || entry.progress === progress) return
    node.style.setProperty("--story-progress", progress)
    entry.progress = progress
  }
  const paint = () => {
    frame = 0
    if (document.hidden) return
    const y = scrollY
    for (const node of motion.matches ? nodes : active) {
      const entry = state.get(node)
      if (!entry || entry.top < 0) continue
      write(
        node,
        motion.matches
          ? 1
          : Math.max(0, Math.min(1, (viewportHeight - (entry.top - y) - 64) / (viewportHeight * 0.68 + entry.height * 0.25))),
      )
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const resize = () => {
    const width = document.documentElement.clientWidth
    if (width !== viewportWidth || (!matchMedia("(pointer:coarse)").matches && width >= 1024)) {
      viewportWidth = width
      viewportHeight = innerHeight
      schedule()
    }
  }
  /* Several thresholds, so a heading's kept position is refreshed as it crosses the screen (a section mounting above it moves it). */
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            const y = scrollY
            for (const entry of entries) {
              const node = entry.target as HTMLElement
              const kept = state.get(node)
              if (kept) {
                kept.top = entry.boundingClientRect.top + y
                kept.height = entry.boundingClientRect.height
              }
              if (entry.isIntersecting) active.add(node)
              else {
                active.delete(node)
                if (entry.boundingClientRect.bottom < 0) write(node, 1)
              }
            }
            schedule()
          },
          { rootMargin: "80px 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
        )
      : null
  window.addEventListener("scroll", schedule, { passive: true })
  window.addEventListener("resize", resize)
  document.addEventListener("visibilitychange", schedule)
  motion.addEventListener("change", schedule)
  return {
    add(node: HTMLElement) {
      /* top -1 until the observer reports where the heading is: nothing is painted from a guess. */
      state.set(node, { top: -1, height: 0, progress: "" })
      nodes.add(node)
      observer?.observe(node)
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

/*
 * HOW A WORD FILLS (landing round 7). It was a hard edge wiped across each
 * word in turn (a background-clip:text gradient), so the heading filled in
 * visible steps, one word at a time, and every frame repainted a gradient
 * per word. Now each word only changes colour, from the muted grey to its
 * ink, along a smoothstep, and the next two or so words are already on their
 * way while one finishes, so the fill runs through the line as one soft wave.
 * Everything is derived from the single number --story-progress (the
 * scroll-driven animation in app/globals.css, or the fallback above), and
 * only colour and the heading's rise (a transform) move.
 */
export const STORY_CSS = `
@supports (color:color-mix(in oklab,red 50%,blue)) {
  .story-heading[data-story-heading] [data-story-word][data-story-word] {
    --word-on:clamp(0,(var(--story-progress,0) * (var(--word-count) + 2.4) - var(--word-index)) / 2.4,1);
    --word-mix:calc(var(--word-on) * var(--word-on) * (3 - 2 * var(--word-on)) * 100%);
    background:none;-webkit-background-clip:border-box;background-clip:border-box;
    color:color-mix(in oklab,var(--word-target) var(--word-mix),var(--story-muted));
  }
}
@media (forced-colors:active) {.story-heading[data-story-heading] [data-story-word][data-story-word] {color:CanvasText}}
`
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
      <style href="story-heading" precedence="default">
        {STORY_CSS}
      </style>
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

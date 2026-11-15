"use client"

import { useEffect, useRef, type CSSProperties } from "react"

/*
 * THE FALLBACK INKS ONCE (landing round 9, the owner: "on mobile, as I
 * scroll, headings glitch, move and stutter"). Browsers without scroll-driven
 * animations (every iPhone before iOS 26) and a heading inside a box that
 * clips by scrolling come here. Round 7 followed the scroll from script: a
 * scroll listener and a frame that wrote --story-progress, which the heading's
 * 12px rise and every word's colour were worked out from. A phone scrolls on
 * its own thread and tells the page late, so the heading was moved a frame or
 * more behind the scroll it was following: it shook. Now nothing follows the
 * scroll here. One IntersectionObserver marks a heading when it comes on
 * screen (data-story-inked), and the stylesheet runs --story-progress from 0
 * to 1 as a transition (STORY_CSS), so the words ink as the same soft wave,
 * once, and the heading never moves. A heading already passed is inked at
 * once. No scroll listener, no frame, no layout read.
 */
function createHeadingInk() {
  const nodes = new Set<HTMLElement>()
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const node = entry.target as HTMLElement
              /* On screen, or already above it (flung past, or the page restored further down). */
              if (!entry.isIntersecting && entry.boundingClientRect.bottom >= 0) continue
              node.setAttribute("data-story-inked", "")
              observer?.unobserve(node)
            }
          },
          { rootMargin: "0px 0px -10% 0px" },
        )
      : null
  return {
    add(node: HTMLElement) {
      nodes.add(node)
      if (observer) observer.observe(node)
      else node.setAttribute("data-story-inked", "")
      return () => {
        nodes.delete(node)
        observer?.unobserve(node)
        if (!nodes.size) {
          observer?.disconnect()
          headingInk = undefined
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
 *
 * Landing round 9: a heading in the fallback does not rise at all and inks by
 * a transition of that number (it is a registered <number>, app/globals.css
 * @property; a browser that cannot run it inks the heading in one step). And
 * on a touch screen no heading rises, in either path: a phone's scroll runs
 * ahead of the page's own thread, and Safari runs scroll-driven animations on
 * that thread, so a transform tied to the scroll trails it and the heading
 * shakes. The colour may trail by a frame; nobody sees that. The rule names
 * the class alone (three times, for weight), so a heading a section writes
 * itself (the ideas' turning lines) stands still too.
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
.story-heading[data-story-heading][data-story-js] {transform:none}
.story-heading[data-story-heading][data-story-js] > span {--story-progress:0}
.story-heading[data-story-heading][data-story-js][data-story-inked] > span {--story-progress:1}
@media (prefers-reduced-motion:no-preference) {
  .story-heading[data-story-heading][data-story-js] > span {transition:--story-progress 1.1s cubic-bezier(.3,0,.25,1)}
}
@media (hover:none) and (pointer:coarse) {
  .story-heading.story-heading.story-heading {animation:none;transform:none}
}
`
let headingInk: ReturnType<typeof createHeadingInk> | undefined

/*
 * Where the browser has scroll-driven animations, a heading inks and rises by
 * itself (app/globals.css, "story-heading-rise" and "story-heading-ink"): the
 * same progress, from the same positions, with no script on each frame. The
 * rise then runs on the compositor; set from script, a transform that changes
 * every frame of a scroll made Chromium re-layer the whole page each frame
 * (5 to 15 ms at 4x CPU). The script keeps browsers without scroll-driven
 * animations and a heading inside a box that clips by scrolling (overflow:
 * hidden or auto), whose view timeline would follow that box instead of the
 * page; those are marked data-story-js, which the stylesheet leaves alone,
 * and ink once as they come on screen (createHeadingInk).
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
      headingInk ??= createHeadingInk()
      remove = headingInk.add(node)
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

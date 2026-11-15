"use client"

import { useEffect, useRef, type ReactNode } from "react"

/*
  ONE ENTRANCE FOR THE WHOLE PAGE (landing round 8, the owner: "the sections
  should appear more smooth and clean, animated, and headings more
  interesting"). A section's heading comes up word by word and its lead line
  and main block follow it, once, the first time each scrolls into view:
  opacity and the `translate` property only (it composes with any transform
  a section already sets on the same element), 650ms on one curve.

  Nothing is hidden by the server's markup. A block is hidden only by this
  script, and only when the first report about it says it is wholly below
  the screen (or inside a lazy box the browser is still skipping, which
  reports an empty rectangle), so a visitor without script, a block already on screen when
  the page wakes, and one the page was restored past are never hidden and
  never flash. Under reduced motion nothing is hidden at all (the stylesheet
  keys the hidden state on prefers-reduced-motion: no-preference). One
  IntersectionObserver for all of them; each block is let go after it shows.

  NOT TWICE. A block that already has an entrance of its own is left alone:
  anything inside an AnimateOnScroll ([data-story-reveal]: pricing, the
  questions), the platform sections' own risers ([class*="__reveal"]:
  analytics, the apps, the app), the everything and how it works cards (only
  their headings are listed), the ideas heading's turning lines (.ideas-h),
  the checkout's scroll scene and the showcase's heading.
*/
export const REVEAL_HEADINGS = ".story-heading:not([data-story-showcase]):not(.ideas-h),.ev-h,.cmh-h,.fcta-title"
export const REVEAL_BODIES = [
  ".um-sub",
  ".um-rows",
  ".ideas-sub",
  ".ideas-tabs-row",
  ".ideas-stage",
  "#audience-ownership [class*='__points']",
  "#audience-ownership [class*='__mock']",
  ".ait-lede",
  ".ait-term",
  ".cmm-card",
  ".cme-card",
  ".fcta-note",
].join(",")
const REVEAL_SELECTOR = `${REVEAL_HEADINGS},${REVEAL_BODIES}`
const OWN_ENTRANCE = "[data-story-reveal],[class*='__reveal']"

/** Pause decorative loops outside the viewport and in background tabs; give each section its entrance. */
export function LandingStory({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const sync = () =>
      root.toggleAttribute("data-story-paused", document.hidden)
    sync()
    document.addEventListener("visibilitychange", sync)
    const watched = new Set<HTMLElement>()
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                (entry.target as HTMLElement).dataset.storyInView = String(
                  entry.isIntersecting,
                )
            },
            { rootMargin: "100px 0px" },
          )
        : null

    /* The entrance. First report: wholly below the screen -> hidden ("wait"); anything else is let go as it is. Later: on screen -> "in". */
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    const seen = new WeakSet<Element>()
    const reveal =
      typeof IntersectionObserver === "function" && !reduced
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const el = entry.target as HTMLElement
                if (!seen.has(el)) {
                  seen.add(el)
                  /* An empty rectangle: the block sits in a lazy box the browser is skipping (content-visibility: auto), which it only does far off screen. */
                  const box = entry.boundingClientRect
                  const skipped = box.width === 0 && box.height === 0
                  if (!entry.isIntersecting && (skipped || box.top > innerHeight)) {
                    el.dataset.reveal = "wait"
                    continue
                  }
                  if (!entry.isIntersecting) {
                    reveal?.unobserve(el)
                    continue
                  }
                }
                if (entry.isIntersecting) {
                  if (el.dataset.reveal === "wait") el.dataset.reveal = "in"
                  reveal?.unobserve(el)
                }
              }
            },
            { rootMargin: "0px 0px -8% 0px" },
          )
        : null
    const revealed = new WeakSet<Element>()

    const discover = (node: Node) => {
      if (!(node instanceof Element)) return
      const candidates = node.matches("[data-story-section]")
        ? [node, ...node.querySelectorAll("[data-story-section]")]
        : node.querySelectorAll("[data-story-section]")
      for (const candidate of candidates) {
        const section = candidate as HTMLElement
        if (!watched.has(section)) {
          watched.add(section)
          observer?.observe(section)
        }
      }
      if (!reveal) return
      const targets = node.matches(REVEAL_SELECTOR)
        ? [node, ...node.querySelectorAll(REVEAL_SELECTOR)]
        : node.querySelectorAll(REVEAL_SELECTOR)
      for (const target of targets) {
        if (revealed.has(target)) continue
        revealed.add(target)
        if (target.closest(OWN_ENTRANCE) || target.querySelector(OWN_ENTRANCE)) continue
        reveal.observe(target)
      }
    }
    discover(root)
    // Only inspect added subtrees. FAQ text, counters and other small updates
    // no longer cause a scan of the entire landing page.
    const additions = new MutationObserver((records) => {
      let removed = false
      for (const record of records) {
        record.addedNodes.forEach(discover)
        if (record.removedNodes.length) removed = true
      }
      if (removed)
        for (const node of watched) {
          if (!root.contains(node)) {
            watched.delete(node)
            observer?.unobserve(node)
          }
        }
    })
    additions.observe(root, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      reveal?.disconnect()
      additions.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])
  return (
    <div ref={ref} data-landing-story="">
      <style href="home-bands" precedence="default">
        {BAND_CSS}
      </style>
      <style href="home-reveal" precedence="default">
        {REVEAL_CSS}
      </style>
      {children}
    </div>
  )
}

/*
  THE ENTRANCE'S STYLES (landing round 8). The words of a story heading are
  inline blocks at all times (so a word can move, and so nothing reflows when
  the script marks the heading); the padding and the equal negative margin
  keep each word's box as tall as the glyphs without changing the line.
  Hidden means opacity 0 and 28px lower (a word: half its height lower), and
  "in" runs back to rest; a heading's words follow each other 40ms apart
  (at most ten steps, so a long heading still lands in about a second), a
  lead line follows its heading by 90ms and a main block by 170ms.
*/
const EASE = "cubic-bezier(.22,1,.36,1)"
export const REVEAL_CSS = `
[data-landing-story] .story-heading:not([data-story-showcase]):not(.ideas-h) [data-story-word]{display:inline-block;padding-block:.08em;margin-block:-.08em}
@media (prefers-reduced-motion:no-preference){
  [data-landing-story] [data-reveal]{transition:opacity .65s ${EASE} var(--reveal-delay,0ms),translate .65s ${EASE} var(--reveal-delay,0ms)}
  [data-landing-story] [data-reveal="wait"]{opacity:0;translate:0 28px}
  [data-landing-story] :is(.um-sub,.ideas-sub,.ideas-tabs-row,.ait-lede,.fcta-note,[class*="__points"])[data-reveal]{--reveal-delay:90ms}
  [data-landing-story] :is(.um-rows,.ideas-stage,.ait-term,.cmm-card,.cme-card,[class*="__mock"])[data-reveal]{--reveal-delay:170ms}
  [data-landing-story] .story-heading[data-reveal]{transition:none}
  [data-landing-story] .story-heading[data-reveal="wait"]{opacity:1;translate:none}
  [data-landing-story] .story-heading[data-reveal] [data-story-word]{transition:opacity .6s ${EASE},translate .7s ${EASE};transition-delay:calc(min(var(--word-index,0),10) * 40ms)}
  [data-landing-story] .story-heading[data-reveal="wait"] [data-story-word]{opacity:0;translate:0 .5em}
}
`

/*
  THE PAGE'S GROUNDS (landing round 3, the owner). The page's base is dark;
  the light sections ride on white sheets and one stretch on a purple one,
  each a rounded surface that rises over the dark by the page's own scroll
  (components/marketing/scroll-reveal-panel.tsx, which replaced the wave 14
  bands and their scroll-driven scale: the owner's spec allows no scaling).

  A purple sheet is also [data-band="purple"]. A band only recolours: the
  sections inside keep their own markup and mocks, and the rules below turn
  their white wrapper clear and their words light (--band-ink, --band-muted
  and --band-line are set by the sheet). The business section is on white
  now, as it was designed, so nothing here touches it.
*/
export const BAND_CSS = `
[data-band] .story-heading{--story-ink:#fff;--story-muted:rgba(255,255,255,.34);--story-accent:#c4b5fd}
[data-band="purple"] .story-heading{font-weight:400;letter-spacing:-.05em}

/* Analytics and the world map, on purple: the white wrappers clear, the light cards kept as cards. (Round 4: the app and the closing call are on the page's dark close and draw themselves for dark.) */
[data-band] #analytics-showcase{background:transparent;color:#fff}
[data-band] .cmm{background:transparent;color:#fff}
/* Landing round 8: the map card keeps its hairline ring but casts no shadow on purple. Its 80px drop shadow ran past the foot of its lazy box, whose paint containment (content-visibility) cut it off in a straight line ten pixels above the next sheet's rounded top: the darker band with a hard edge at the join. */
[data-band] .cmm-card{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
`

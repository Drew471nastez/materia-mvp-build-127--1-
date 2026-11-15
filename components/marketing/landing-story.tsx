"use client"

import { useEffect, useRef, type ReactNode } from "react"

/*
  ONE ENTRANCE FOR THE WHOLE PAGE (landing round 8, the owner: "the sections
  should appear more smooth and clean, animated, and headings more
  interesting"). A section's heading comes up word by word and its lead line
  and main block follow it, once, the first time each scrolls into view:
  opacity and the `translate` property only (it composes with any transform
  a section already sets on the same element), 500ms on one curve.

  LANDING ROUND 9, the owner: "when I scroll too fast, sections appear as
  white blank containers", and on a phone "headings glitch, move and
  stutter, or elements of sections". Both were this entrance. A block
  waiting for it is invisible, and it then took 650ms and up to 170ms more
  to arrive: flung through, a section went by as an empty white box, or
  half faded. And on a phone a heading had three motions at once (each word
  rising, the heading's own rise with the scroll, the ink). So:

    flung or late, no entrance: a waiting block that comes on screen while
    the page is moving fast (FAST_PX_PER_MS, from one passive scroll
    listener that reads no layout), or that is already well up the screen
    when the browser reports it, or that comes in from above, is simply
    shown, with no transition at all;

    while the page is moving fast nothing new is hidden;

    on a phone nothing moves: a heading fades as one piece (no words coming
    up) and a block only fades, 380ms.

  THE SECTIONS' OWN ENTRANCES, FLUNG (landing round 9). The blocks left
  alone above are hidden by their own stylesheets until their own observers
  see them, and then take 700 to 900ms and a stagger to arrive: the cards of
  Make the work and of how it works (.ev-card, .cmh-card, shown by data-in),
  everything that rises in the platform sections (.reveal under a section
  root, shown by the root's data-platform-in: your audience, the apps, the
  app, what is working) and AnimateOnScroll's blocks (pricing, the
  questions). Flung through, these were the tallest blank white boxes on the
  page: Make the work alone is two screens of invisible cards. They stay
  the sections' own, but while the page is being flung this script answers
  for them: each one within a screen and a half of the screen (FLUNG_AHEAD)
  is given its own mark at once (data-in, data-platform-in), with its
  transition switched off for two frames (data-reveal-now), so it is simply
  there when it scrolls in. At reading speed nothing here runs and each
  section's entrance plays as its track wrote it.

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
/** Landing round 9: faster than this (px per ms: about a screen and a half a second on a phone) the page is being flung, and nothing waits for an entrance. */
export const FAST_PX_PER_MS = 1.4
/** Landing round 9: a waiting block first reported on screen with its top above this share of the screen's height has been on screen for a while already: shown at once. */
export const LATE_ABOVE = 0.5
const OWN_ENTRANCE = "[data-story-reveal],[class*='__reveal']"
/** Landing round 9: the blocks with an entrance of their own that are shown at once when the page is flung: the two card grids, a platform section's root, an AnimateOnScroll block. */
export const FLUNG_OWN = ".ev-card,.cmh-card,[class*='__root'],[data-story-reveal]"
/** Landing round 9: how far ahead of the screen (and behind it) a flung page shows them. */
export const FLUNG_AHEAD = "150% 0px 150% 0px"

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

    /* The entrance. First report: wholly below the screen -> hidden ("wait"); anything else is let go as it is. Later: on screen -> "in", or shown at once when flung. */
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    const seen = new WeakSet<Element>()
    /* How fast the page is moving, from the scroll events themselves (scrollY and a clock: no layout). */
    let lastY = window.scrollY
    let lastAt = performance.now()
    let speed = 0
    const onScroll = () => {
      const now = performance.now()
      const y = window.scrollY
      const dt = now - lastAt
      if (dt > 0) speed = dt > 120 ? 0 : Math.abs(y - lastY) / dt
      lastY = y
      lastAt = now
      if (speed > FAST_PX_PER_MS && near.size) for (const el of [...near]) showNow(el)
    }
    const fast = () => speed > FAST_PX_PER_MS && performance.now() - lastAt < 160
    const show = (el: HTMLElement) => {
      delete el.dataset.reveal
      reveal?.unobserve(el)
    }
    /*
      Flung: every block near the screen that is still waiting for an
      entrance (this script's, or a section's own) is shown now, with no
      transition. `near` is kept by one observer a screen and a half out, so
      nothing is measured here; a block is handled once and then let go.
    */
    const near = new Set<HTMLElement>()
    const showNow = (el: HTMLElement) => {
      near.delete(el)
      ahead?.unobserve(el)
      if (el.dataset.reveal === "wait") return show(el)
      if ("reveal" in el.dataset) return
      if (el.hasAttribute("data-story-reveal")) {
        /* AnimateOnScroll keeps its state in React: the stylesheet shows the block, for good. */
        el.setAttribute("data-reveal-now", "")
        return
      }
      const card = el.matches(".ev-card,.cmh-card")
      if (card ? "in" in el.dataset : el.hasAttribute("data-platform-in")) return
      el.setAttribute("data-reveal-now", "")
      if (card) el.dataset.in = ""
      else el.setAttribute("data-platform-in", "")
      requestAnimationFrame(() => requestAnimationFrame(() => el.removeAttribute("data-reveal-now")))
    }
    const ahead =
      typeof IntersectionObserver === "function" && !reduced
        ? new IntersectionObserver(
            (entries) => {
              const flung = fast()
              for (const entry of entries) {
                const el = entry.target as HTMLElement
                if (!entry.isIntersecting) near.delete(el)
                else if (flung) showNow(el)
                else near.add(el)
              }
            },
            { rootMargin: FLUNG_AHEAD },
          )
        : null
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
                  if (!entry.isIntersecting && (skipped || box.top > innerHeight) && !fast()) {
                    el.dataset.reveal = "wait"
                    ahead?.observe(el)
                    continue
                  }
                  if (!entry.isIntersecting) {
                    reveal?.unobserve(el)
                    continue
                  }
                }
                if (entry.isIntersecting) {
                  /* Flung past, reported late (already well up the screen) or coming in from above: shown as it is, no entrance. */
                  if (el.dataset.reveal === "wait" && !fast() && entry.boundingClientRect.top > innerHeight * LATE_ABOVE) el.dataset.reveal = "in"
                  else delete el.dataset.reveal
                  reveal?.unobserve(el)
                  ahead?.unobserve(el)
                  near.delete(el)
                } else if (el.dataset.reveal === "wait" && entry.boundingClientRect.height > 0 && entry.boundingClientRect.bottom < 0) show(el)
              }
            },
            { rootMargin: "0px 0px -5% 0px" },
          )
        : null
    if (reveal) window.addEventListener("scroll", onScroll, { passive: true })
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
      if (ahead) {
        const own = node.matches(FLUNG_OWN) ? [node, ...node.querySelectorAll(FLUNG_OWN)] : node.querySelectorAll(FLUNG_OWN)
        for (const block of own) {
          if (revealed.has(block)) continue
          revealed.add(block)
          ahead.observe(block)
        }
      }
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
      ahead?.disconnect()
      window.removeEventListener("scroll", onScroll)
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
  Hidden means opacity 0 and 18px lower (a word: half its height lower), and
  "in" runs back to rest; a heading's words follow each other 40ms apart
  (at most ten steps, so a long heading still lands in under a second), a
  lead line follows its heading by 60ms and a main block by 120ms.

  Landing round 9: shorter (500ms, it was 650, and the delays 90 and 170),
  and on a phone or any touch screen nothing moves: the heading fades as one
  piece, its words stay where they are, and a block only fades (380ms).
*/
const EASE = "cubic-bezier(.22,1,.36,1)"
export const REVEAL_CSS = `
[data-landing-story] .story-heading:not([data-story-showcase]):not(.ideas-h) [data-story-word]{display:inline-block;padding-block:.08em;margin-block:-.08em}
@media (prefers-reduced-motion:no-preference){
  [data-landing-story] [data-reveal]{transition:opacity .5s ${EASE} var(--reveal-delay,0ms),translate .5s ${EASE} var(--reveal-delay,0ms)}
  [data-landing-story] [data-reveal="wait"]{opacity:0;translate:0 18px}
  [data-landing-story] :is(.um-sub,.ideas-sub,.ideas-tabs-row,.ait-lede,.fcta-note,[class*="__points"])[data-reveal]{--reveal-delay:60ms}
  [data-landing-story] :is(.um-rows,.ideas-stage,.ait-term,.cmm-card,.cme-card,[class*="__mock"])[data-reveal]{--reveal-delay:120ms}
  [data-landing-story] .story-heading[data-reveal]{transition:none}
  [data-landing-story] .story-heading[data-reveal="wait"]{opacity:1;translate:none}
  [data-landing-story] .story-heading[data-reveal] [data-story-word]{transition:opacity .5s ${EASE},translate .55s ${EASE};transition-delay:calc(min(var(--word-index,0),10) * 40ms)}
  [data-landing-story] .story-heading[data-reveal="wait"] [data-story-word]{opacity:0;translate:0 .5em}
  [data-landing-story] [data-reveal-now],[data-landing-story] [data-reveal-now] [class*="__reveal"]{transition:none!important}
  [data-landing-story] [data-reveal-now][data-story-reveal]{opacity:1!important;transform:none!important}
  @media (max-width:767px),(hover:none) and (pointer:coarse){
    [data-landing-story] [data-reveal][data-reveal]{transition:opacity .38s ease-out;translate:none}
    [data-landing-story] .story-heading[data-reveal="wait"]{opacity:0}
    [data-landing-story] .story-heading[data-reveal] [data-story-word][data-story-word]{transition:none;opacity:1;translate:none}
  }
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

"use client"

import { useEffect, useRef, type ReactNode } from "react"

/** Pause decorative loops outside the viewport and in background tabs. */
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
      additions.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])
  return (
    <div ref={ref} data-landing-story="">
      <style href="home-bands" precedence="default">
        {BAND_CSS}
      </style>
      {children}
    </div>
  )
}

/*
  THE PAGE'S GROUNDS (landing round 3, the owner). The page's base is dark;
  the light sections ride on white sheets and two stretches on purple ones,
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

/* Analytics, the world map and the app, on purple: the white wrappers clear, the light cards kept as cards. */
[data-band] #analytics-showcase,[data-band] #app-anywhere{background:transparent;color:#fff}
[data-band] .cmm{background:transparent;color:#fff}
[data-band] .cmm-card{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 40px 80px -40px rgba(8,2,24,.9)}

/* The closing call, on purple: light words, a white button. */
[data-band] .fcta{background:transparent}
[data-band] .fcta-title{color:#fff}
[data-band] .fcta-title em{color:#c4b5fd}
[data-band] .fcta-note{color:#cdc2f7}
[data-band] .fcta-primary{background:#fff;color:#18181b}
[data-band] .fcta-primary:hover{background:#ede9fe}
[data-band] .fcta-secondary{background:transparent;color:#fff;border-color:rgba(255,255,255,.28)}
[data-band] .fcta-secondary:hover{border-color:#fff}
[data-band] .fcta-btn:focus-visible{outline-color:#fff}
`

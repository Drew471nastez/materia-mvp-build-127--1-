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
  THE PAGE'S RHYTHM (wave 14, the owner): white sections, then a band of
  colour, then white again. Two kinds of band:

    black   inset from the page's edges with large rounded corners, the
            heading centred (as in the owner's black-band reference);
    purple  the deep brand purple, edge to edge, rounded at the top and the
            bottom, rising into place as it arrives (his purple reference).

  A band only recolours: the sections inside keep their own markup and mocks,
  and the rules below turn their white wrapper clear and their words light.
  The band sits outside each lazy section's measured box, so those heights
  (home/lazy-sections.tsx) are unchanged. The arrival is a scroll-driven CSS
  animation of transform alone: no script, nothing runs while it is still,
  and it is off for reduced motion and in browsers without view timelines.
*/
export type BandTone = "black" | "purple"

export function StoryBand({ tone, children }: { tone: BandTone; children: ReactNode }) {
  return <div data-band={tone}>{children}</div>
}

export const BAND_CSS = `
[data-band]{position:relative;isolation:isolate;--band-ink:#fff;--band-line:rgba(255,255,255,.16);color:#fff;transform-origin:50% 0}
[data-band="black"]{--band-muted:#a1a1aa;margin-inline:clamp(8px,1.4vw,20px);padding-block:clamp(4px,1.6vw,24px);border-radius:clamp(28px,3.2vw,48px);background:#050506}
[data-band="purple"]{--band-muted:#cdc2f7;padding-block:clamp(8px,2.4vw,40px);border-radius:clamp(32px,3.4vw,48px);background:radial-gradient(70% 45% at 85% 0%,rgba(124,58,237,.42) 0%,rgba(124,58,237,0) 70%),radial-gradient(60% 40% at 0% 100%,rgba(91,33,182,.35) 0%,rgba(91,33,182,0) 70%),#24104f}
[data-band] + [data-band]{margin-top:clamp(16px,2vw,28px)}
[data-band] .story-heading{--story-ink:#fff;--story-muted:rgba(255,255,255,.34);--story-accent:#c4b5fd}
[data-band="purple"] .story-heading{font-weight:400;letter-spacing:-.05em}
[data-band="black"] .story-heading{--story-muted:#5d5d66;--story-accent:#b79bff}
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    [data-band]{animation:band-rise linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
  }
}
@keyframes band-rise{from{transform:translate3d(0,40px,0) scale(.955)}to{transform:none}}

/* Every kind of business, on black: its words light, the pills dark, the heading centred. */
[data-band] .biz{background:transparent;color:#fafafa}
[data-band] .biz-card{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 28px 56px -30px rgba(0,0,0,.9)}
[data-band] .biz .smk-pill{color:#d4d4d8}
[data-band] .biz .smk-pill:hover{background:rgba(255,255,255,.1);color:#fff}
[data-band] .biz .smk-pill[aria-selected="true"]{background:#fff;color:#18181b;box-shadow:none}
[data-band] .biz .smk-pill:focus-visible{outline-color:#c4b5fd}
@media(min-width:768px){
  [data-band] .biz-in{text-align:center}
  [data-band] .biz .biz-h{margin-inline:auto}
  [data-band] .biz-tabs.smk-pills{background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  [data-band] .biz-stage{text-align:left}
}
@media(max-width:767px){
  [data-band] .biz-tabs .smk-pill{background:rgba(255,255,255,.09)}
  [data-band] .biz-tabs .smk-pill[aria-selected="true"]{background:#fff}
}

/* Analytics, the world map and the app, on purple: the white wrappers clear, the light cards kept as cards. */
[data-band] #analytics-showcase,[data-band] #app-anywhere{background:transparent;color:#fff}
[data-band] .cmm{background:transparent;color:#fff}
[data-band] .cmm-card{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 40px 80px -40px rgba(8,2,24,.9)}
`

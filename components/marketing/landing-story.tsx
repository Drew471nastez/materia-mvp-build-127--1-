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
      {children}
    </div>
  )
}

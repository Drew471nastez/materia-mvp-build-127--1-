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
    const scan = () => {
      for (const node of root.querySelectorAll<HTMLElement>(
        "[data-story-section]",
      )) {
        if (!watched.has(node)) {
          watched.add(node)
          observer?.observe(node)
        }
      }
      for (const node of watched) {
        if (!root.contains(node)) {
          observer?.unobserve(node)
          watched.delete(node)
        }
      }
    }
    scan()
    // Dynamically imported sections can arrive after the first paint.
    const additions = new MutationObserver(scan)
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

"use client"

/**
 * The website's blog in an imported theme's canvas: read from the builder's
 * blog route (app/api/website-builder/themes/[installId]/blog/canvas) once a
 * page wants it (its Blog or Post template, a featured blog section), and
 * read again when the tab comes back into view, so a post published in
 * Website settings shows without a reload. Before the database update or
 * any blog, nothing: the canvas draws as before.
 */
import { useEffect, useState } from "react"
import type { CanvasBlog } from "@/lib/storelib-theme/compat/canvas-blog"

const kept = new Map<string, CanvasBlog>()

export function useCanvasBlog(installId: string, wanted: boolean): CanvasBlog | null {
  const [data, setData] = useState<CanvasBlog | null>(() => kept.get(installId) ?? null)
  useEffect(() => {
    if (!wanted || !installId) return
    let alive = true
    const read = () =>
      fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/blog/canvas`, { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<CanvasBlog>) : null))
        .then((j) => {
          if (!alive || !j || !j.settings || !j.listing) return
          const before = kept.get(installId)
          if (before && JSON.stringify(before) === JSON.stringify(j)) return
          kept.set(installId, j)
          setData(j)
        })
        .catch(() => undefined)
    if (kept.has(installId)) setData(kept.get(installId)!)
    void read()
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [wanted, installId])
  return wanted ? data : null
}

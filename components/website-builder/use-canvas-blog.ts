"use client"
/**
 * ===========================================================================
 *  THE BLOG IN THE BUILDER'S CANVAS
 * ===========================================================================
 * The Blog and Blog post templates, and a Blog posts section on any page,
 * draw the creator's posts (lib/website-builder/blog-page.ts). The canvas
 * reads them from GET blog/canvas (lib/site-blog, blueprint §C): the live
 * and scheduled posts, or, while the blog has none, three sample posts so
 * the layout can be arranged. Sample posts are flagged and only the canvas
 * ever asks for them: a live page never shows one.
 *
 * And GET blog, for the link picker: the blog's address and its categories,
 * once the blog has a post a visitor can open (lib/website-builder/
 * link-targets.ts). Before SQL part 355 both answer 503 and nothing here
 * changes the editor.
 */
import { useEffect, useMemo, useState } from "react"
import { canvasBlogData, type BlogCanvasPayload } from "@/lib/website-builder/blog-page"
import type { StorefrontArticleFull, StorefrontBlog } from "@/lib/storelib-theme/types"

const kept = new Map<string, BlogCanvasPayload | null>()

/** The blog and the post for the canvas, while a page wants them. `wanted` false reads nothing. */
export function useCanvasBlog(installId: string, wanted: boolean, pageKey: string): { blog: StorefrontBlog | null; article: StorefrontArticleFull | null } | undefined {
  const key = installId
  const [payload, setPayload] = useState<BlogCanvasPayload | null | undefined>(() => kept.get(key))
  useEffect(() => {
    if (!wanted || !installId) return
    let alive = true
    const read = () =>
      fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/blog/canvas`, { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<BlogCanvasPayload>) : null))
        .then((j) => {
          if (!alive) return
          const next = j && j.settings && j.listing ? j : null
          kept.set(key, next)
          setPayload(next)
        })
        .catch(() => undefined)
    if (kept.has(key)) setPayload(kept.get(key))
    void read()
    /* Back from writing a post in Website Settings, or in another tab: the canvas shows it. */
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    const onSaved = () => void read()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("storelib:blog-changed", onSaved)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("storelib:blog-changed", onSaved)
    }
  }, [wanted, key, installId])
  return useMemo(() => (wanted && payload ? canvasBlogData(payload, pageKey) : undefined), [wanted, payload, pageKey])
}

/** What GET blog says the link picker needs: the blog's address and its categories, when it has a post to open. */
export interface BlogLinkInfo {
  handle: string
  categories: { slug: string; name: string }[]
}

export function useBlogLinkInfo(installId: string, enabled: boolean): BlogLinkInfo | null {
  const [info, setInfo] = useState<BlogLinkInfo | null>(null)
  useEffect(() => {
    if (!enabled || !installId) return
    let alive = true
    fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/blog`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { settings?: { handle?: string }; categories?: { slug?: string; name?: string; postCount?: number }[]; counts?: Record<string, number> } | null) => {
        if (!alive || !j?.settings?.handle) return
        const visible = (j.counts?.published ?? 0) + (j.counts?.scheduled ?? 0)
        if (visible <= 0) return setInfo(null)
        setInfo({
          handle: j.settings.handle,
          categories: (j.categories ?? []).filter((c) => typeof c.slug === "string" && typeof c.name === "string").map((c) => ({ slug: c.slug as string, name: c.name as string })),
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [installId, enabled])
  return info
}

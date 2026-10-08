"use client"

import { useEffect } from "react"
import { feedListHref, feedSpaceUrlsActive } from "@/lib/community/feed-space-address"

/** On a phone, /space/<x> becomes /community/<slug>?space=<x> on the home feed. */
export function SpaceFeedRedirect({ slug, spaceSlug }: { slug: string; spaceSlug: string }) {
  useEffect(() => {
    if (!feedSpaceUrlsActive()) return
    const base = `/community/${slug}`
    const href = feedListHref(base, { kind: "space", slug: spaceSlug })
    if (window.location.pathname + window.location.search === href) return
    window.location.replace(href)
  }, [slug, spaceSlug])
  return null
}

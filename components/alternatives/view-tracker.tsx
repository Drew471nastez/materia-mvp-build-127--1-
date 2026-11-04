"use client"

import { useEffect } from "react"
import { trackAlternatives } from "@/lib/alternatives/track"

/** Says once that a comparison page (or the hub, slug null) was opened. Draws nothing. */
export function ComparisonViewTracker({ slug }: { slug: string | null }) {
  useEffect(() => {
    trackAlternatives("Comparison viewed", { page: slug ?? "hub" })
  }, [slug])
  return null
}

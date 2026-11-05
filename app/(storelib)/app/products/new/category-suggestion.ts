"use client"

/**
 * ===========================================================================
 *  THE EDITOR'S SUGGESTED CATEGORY
 * ===========================================================================
 * What the category field pins as "Suggested", from the title, the
 * description and the pictures.
 *
 *   THE KEYWORDS answer first, in the browser, once typing pauses
 *   (KEYWORDS_MS). Nothing to wait for and nothing to fail.
 *
 *   THE MODEL answers once the fields have settled (SETTLE_MS), through
 *   /api/app/products/category-suggestion, and from then on its answer is
 *   the one shown, until a newer one arrives: an old answer is better than a
 *   flicker back to the keywords while the next one is on its way.
 *
 * Never on a keystroke, never blocking one: a request in flight is abandoned
 * when the fields change, and every answer is kept by what it was asked
 * about (contentKey), so going back to words already asked about asks
 * nothing. A route that says no (signed out, rate limited, not there) is
 * not asked again this visit; the keywords carry on alone.
 */

import { useEffect, useMemo, useState } from "react"
import { contentKey, keywordSuggestion, plainText, SUGGEST_LIMITS, type Suggestion, type SuggestInput } from "@/lib/products/category-suggest"
import { isCategoryFor, type CategoryKind } from "@/lib/products/category-groups"
import type { MediaItem } from "./editor-form"

const KEYWORDS_MS = 300
const SETTLE_MS = 1200
const ROUTE = "/api/app/products/category-suggestion"

/** Answers by content, for the whole visit to /app (a module, not a component). */
const answers = new Map<string, string | null>()
let routeRefused = false

export function useCategorySuggestion(title: string, description: string, media: MediaItem[], kind: CategoryKind = "digital"): string | null {
  const imageUrls = media.filter((m) => m.type === "image" && /^https:\/\//.test(m.url)).slice(0, SUGGEST_LIMITS.images).map((m) => m.url)
  const imagesKey = imageUrls.join("\n")
  const input = useMemo<SuggestInput>(
    () => ({ title: title.trim().slice(0, SUGGEST_LIMITS.title), text: plainText(description).slice(0, SUGGEST_LIMITS.text), images: imagesKey ? imagesKey.split("\n") : [], kind }),
    [title, description, imagesKey, kind],
  )
  const key = useMemo(() => contentKey(input), [input])
  const hasWords = `${input.title} ${input.text}`.trim().length >= 3

  const [keywords, setKeywords] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setKeywords(keywordSuggestion(`${input.title} ${input.text}`, input.kind)), KEYWORDS_MS)
    return () => window.clearTimeout(t)
  }, [input])

  useEffect(() => {
    if (!hasWords && input.images.length === 0) {
      setSuggested(null)
      return
    }
    if (answers.has(key)) {
      const known = answers.get(key) ?? null
      if (known) setSuggested(known)
      return
    }
    if (routeRefused) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        })
        if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) {
          routeRefused = true
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as Suggestion
        const category = isCategoryFor(data?.category, input.kind ?? "digital") ? data.category : null
        answers.set(key, category)
        if (!ctrl.signal.aborted && category) setSuggested(category)
      } catch {
        /* Offline, or abandoned because the fields changed: the keywords stand. */
      }
    }, SETTLE_MS)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [key, input, hasWords])

  return suggested ?? keywords
}

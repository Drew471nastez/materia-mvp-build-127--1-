"use client"

/**
 * Storelib Reviews in the builder's canvas: what the page's review sections
 * draw (lib/reviews/storefront.ts), read from /api/reviews/storefront once a
 * page has one, for the product being previewed on a product page. The
 * store's real reviews, or sample ones while it has none. Kept per product
 * for the session, and read again when the tab comes back into view, so a
 * review approved in another tab shows without a reload.
 */
import { useEffect, useState } from "react"

const kept = new Map<string, Record<string, unknown>>()

export function useCanvasReviews(wanted: boolean, productId: string | null): Record<string, unknown> | undefined {
  const key = productId ?? ""
  const [data, setData] = useState<Record<string, unknown> | undefined>(() => kept.get(key))
  useEffect(() => {
    if (!wanted) return
    let alive = true
    const read = () =>
      fetch(`/api/reviews/storefront${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { reviews?: Record<string, unknown> } | null) => {
          if (!alive || !j?.reviews) return
          kept.set(key, j.reviews)
          setData(j.reviews)
        })
        .catch(() => undefined)
    if (kept.has(key)) setData(kept.get(key))
    void read()
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [wanted, key, productId])
  return wanted ? data : undefined
}

"use client"

/**
 * ===========================================================================
 *  PRODUCTS THAT DID NOT LOAD ARE ASKED FOR AGAIN BY THE BROWSER (round AU)
 * ===========================================================================
 * Explore and its category pages are one HTML for everybody and the CDN holds
 * it (next.config.mjs edgeRule /explore). When the server had no catalogue
 * and no last good one (lib/explore/catalogue-cache.ts), that HTML has an
 * empty grid, and it used to say "No products found" to everybody the CDN
 * handed it to for the next five minutes.
 *
 * The page says so instead (`catalogueUnavailable`), and the browser asks the
 * server again: router.refresh() is a React Server Components request, which
 * the CDN never holds (NEVER_HELD, the `rsc` header), so it reaches a fresh
 * render. Twice, a few seconds apart; then a Try again for the visitor. A
 * device that is offline waits until it is back online.
 */
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

/** How long after the page (and after the first refresh) the browser asks again. */
export const CATALOGUE_RETRY_AFTER_MS = [3000, 8000] as const

export type CatalogueRetry = { state: "retrying" | "gave-up" | null; retry: () => void }

export function useCatalogueRetry(unavailable: boolean): CatalogueRetry {
  const router = useRouter()
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!unavailable || tries >= CATALOGUE_RETRY_AFTER_MS.length) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const ask = () => {
      timer = setTimeout(() => {
        setTries((n) => n + 1)
        router.refresh()
      }, CATALOGUE_RETRY_AFTER_MS[tries])
    }
    const online = () => {
      window.removeEventListener("online", online)
      ask()
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) window.addEventListener("online", online)
    else ask()
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener("online", online)
    }
  }, [unavailable, tries, router])

  /* A press asks now, and once more after the last wait if that one fails too. */
  const retry = useCallback(() => {
    setTries(CATALOGUE_RETRY_AFTER_MS.length - 1)
    router.refresh()
  }, [router])

  if (!unavailable) return { state: null, retry }
  return { state: tries >= CATALOGUE_RETRY_AFTER_MS.length ? "gave-up" : "retrying", retry }
}

"use client"

/**
 * The page behind this one, fetched while the person is still reading.
 *
 * Back from a product or a community was a fresh server render: the router
 * only keeps a dynamic page it has already been given, and a client
 * navigation does not update document.referrer, so the page behind was
 * asked for at the moment of the press. The path we just left is remembered
 * here and read in full as soon as the next page is on screen.
 */
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { prefetchHref } from "@/lib/nav/prefetch-policy"

const KEY = "storelib_path_behind"

export function WarmBehind() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const here = `${window.location.pathname}${window.location.search}`
    let behind = ""
    try {
      behind = sessionStorage.getItem(KEY) || ""
    } catch {
      behind = ""
    }
    if (!behind) {
      try {
        const ref = document.referrer ? new URL(document.referrer) : null
        if (ref && ref.origin === window.location.origin) behind = `${ref.pathname}${ref.search}`
      } catch {
        behind = ""
      }
    }
    if (behind && behind !== here) prefetchHref(router, behind, "press")
    try {
      sessionStorage.setItem(KEY, here)
    } catch {
      /* private mode: the next back waits, as it did */
    }
  }, [router, pathname])

  return null
}

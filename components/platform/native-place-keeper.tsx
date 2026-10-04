"use client"

/**
 * Keeps the page the person is on, inside the phone app only, so the next
 * cold start opens there (lib/native-resume.ts says which pages may be kept
 * and app/native-start reads it). Renders nothing; `usePathname` is the
 * commit signal, once per navigation whichever control started it, and the
 * query is read from the address at that moment rather than through
 * useSearchParams, which would make every page under the root layout wait
 * on a Suspense boundary for a value only the phone app uses.
 *
 * /welcome is where every log out in the app lands, so the kept place is
 * forgotten there: it was the account that just left.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { forgetLastPlace, rememberPlace, resumablePlace } from "@/lib/native-resume"

export function NativePlaceKeeper() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || !isNativeApp()) return
    if (pathname === "/welcome") {
      forgetLastPlace()
      return
    }
    const place = resumablePlace(pathname, window.location.search)
    if (place) rememberPlace(place)
  }, [pathname])
  return null
}

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
import { forgetLastPlace, rememberPageScroll, rememberPlace, resumablePlace } from "@/lib/native-resume"
import { noteTabScroll } from "@/lib/navigation/tab-scroll"

let historyHooked = false
function hookHistory() {
  if (historyHooked || typeof window === "undefined") return
  historyHooked = true
  const wrap = (orig: History["pushState"]) =>
    function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = orig.apply(this, args)
      queueMicrotask(() => savePlace(false))
      return result
    }
  history.pushState = wrap(history.pushState)
  history.replaceState = wrap(history.replaceState)
}

function savePlace(forceScroll = false) {
  if (!isNativeApp()) return
  const path = window.location.pathname
  if (path === "/welcome") {
    forgetLastPlace()
    return
  }
  const place = resumablePlace(path, window.location.search)
  if (place) rememberPlace(place)
  /* A fresh mount is still at 0 until the feed is put back. Writing that 0 would erase the place they left. */
  if (path.startsWith("/community/") && (forceScroll || window.scrollY > 8)) {
    rememberPageScroll(path, window.scrollY)
    noteTabScroll(path, window.scrollY)
  }
}

export function NativePlaceKeeper() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || !isNativeApp()) return
    hookHistory()
    savePlace()
    const onHide = () => {
      if (document.visibilityState === "hidden") savePlace(true)
    }
    const onPageHide = () => savePlace(true)
    const onPop = () => savePlace(false)
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("popstate", onPop)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("popstate", onPop)
    }
  }, [pathname])
  return null
}

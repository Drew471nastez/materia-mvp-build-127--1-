"use client"

/**
 * ===========================================================================
 *  A STORELIB LINK THE PHONE OPENED IN THE APP GOES TO ITS PAGE
 * ===========================================================================
 * With Universal Links and App Links (lib/platform/app-links.ts), tapping
 * storelib.com/community/clay in Messages or Mail opens the app, which
 * Capacitor tells about with `appUrlOpen`. Nothing listened for a page
 * link: the app opened wherever it was. This does, inside the app only:
 *
 *   https://storelib.com/<page>       that page (openTarget)
 *   com.storelib.app://open?path=     the library's Open in app banner
 *   the sign in and reset returns     left to lib/native-oauth.ts
 *
 * A cold start reads the link the app was opened with (App.getLaunchUrl),
 * once per run of the app (sessionStorage), so a tap that started the app
 * lands on the page too rather than on the last page it kept.
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { openTarget } from "@/lib/platform/open-in-app"

const LAUNCH_KEY = "storelib:launch-link"

export function AppLinkOpener() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    if (!isNativeApp()) return
    let handle: { remove: () => void } | null = null
    let gone = false
    const go = (url: string | null | undefined) => {
      const target = url ? openTarget(url) : null
      if (!target) return
      const here = `${window.location.pathname}${window.location.search}`
      if (target !== here) routerRef.current.push(target)
    }
    ;(async () => {
      try {
        const { App } = await import("@capacitor/app")
        if (gone) return
        handle = await App.addListener("appUrlOpen", ({ url }) => go(url))
        /* The launch link is the app's for as long as it runs, and every full page load mounts this again: it is followed once. */
        const launch = (await App.getLaunchUrl().catch(() => null))?.url
        if (gone || !launch) return
        let seen: string | null = null
        try {
          seen = sessionStorage.getItem(LAUNCH_KEY)
          sessionStorage.setItem(LAUNCH_KEY, launch)
        } catch {
          /* no storage: follow it, once for this page */
        }
        if (seen !== launch) go(launch)
      } catch {
        /* A shell without the App plugin: links open the app where it was, as before. */
      }
    })()
    return () => {
      gone = true
      handle?.remove()
    }
  }, [])

  return null
}

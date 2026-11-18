"use client"
import { useEffect } from "react"
import { hideSplashOnce } from "@/lib/native-chrome"

/**
 * Takes the launch screen down once this page has drawn: after the frame it
 * commits in and the one after it, through the one shared hideSplashOnce
 * (lib/native-chrome.ts), so the dashboard, welcome and the library come in
 * exactly like every other landing.
 *
 * Round AT: it used to wait 400 ms more on top of those frames, then fetch
 * the splash plugin's chunk, then fade for 500 ms: about a second of launch
 * screen over a page that was already there (scripts/check-app-launch-at3.mjs).
 * `delay` stays for a caller that truly needs to hold it, and is 0 by default.
 */
export function useHideNativeSplash(delay = 0) {
  useEffect(() => {
    let cancelled = false
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const hide = () => {
          if (!cancelled) void hideSplashOnce()
        }
        if (delay > 0) window.setTimeout(hide, delay)
        else hide()
      }),
    )
    return () => {
      cancelled = true
    }
  }, [delay])
}

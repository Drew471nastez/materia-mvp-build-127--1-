"use client"

/**
 * ===========================================================================
 *  HOW TALL THE BAR OVER THE PAGE ACTUALLY IS
 * ===========================================================================
 * Storelib's header is sticky on the web and fixed in the app, and its
 * height is not one number: 64.6px on a phone, 71.75 on a computer, and
 * either of those plus the status bar's inset in the native shell
 * (components/platform/platform-header-client.tsx, app/globals.css
 * html.capacitor #platform-header-root). Nothing published it, so anything
 * that had to stay clear of the bar guessed, and the profile's Edit profile
 * button guessed wrong: it was pinned 12px inside the cover and slid under
 * the bar on the first flick of a scroll.
 *
 * So it is measured, from the bar itself, and written as `--profile-chrome`
 * on the document, which is what components/profile/profile-hero.tsx pins
 * the button under. A bar that is neither sticky nor fixed scrolls away with
 * the page and covers nothing, so it measures zero.
 *
 * The bar can arrive after this does (ConditionalHeader decides on the
 * client, and streams a stand in first), can change height when the window
 * turns, and grows by the safe area inset in the app, so the number is read
 * again on the frames right after mount, on every resize, and whenever the
 * bar itself changes size.
 */
import { useEffect } from "react"

export const PROFILE_CHROME_VAR = "--profile-chrome"

/** The height of the bar that stays over the page, or 0 when nothing does. */
export function stickyChromeHeight(doc: Document = document): number {
  const win = doc.defaultView
  const measure = (el: HTMLElement | null) => {
    if (!el || !win) return 0
    const position = win.getComputedStyle(el).position
    if (position !== "sticky" && position !== "fixed") return 0
    return Math.round(el.getBoundingClientRect().height)
  }
  const platform = doc.getElementById("platform-header-root")
  const platformH = measure(platform)
  if (platformH) return platformH
  /* /account with community context: CommunityTopBar instead of Storelib's header. */
  const community = doc.querySelector<HTMLElement>("[data-account-community-chrome] [data-community-top]")
  return measure(community)
}

export function ProfileChromeVar() {
  useEffect(() => {
    let watching: Element | null = null
    let observer: ResizeObserver | null = null
    const apply = () => {
      document.documentElement.style.setProperty(PROFILE_CHROME_VAR, `${stickyChromeHeight()}px`)
      const bar =
        document.getElementById("platform-header-root") ??
        document.querySelector<HTMLElement>("[data-account-community-chrome] [data-community-top]")
      if (bar && bar !== watching && typeof ResizeObserver !== "undefined") {
        observer?.disconnect()
        observer = new ResizeObserver(() => {
          document.documentElement.style.setProperty(PROFILE_CHROME_VAR, `${stickyChromeHeight()}px`)
        })
        observer.observe(bar)
        watching = bar
      }
    }
    apply()
    /* The bar's own arrival: the next frame, then a few moments, rather than a poll that never stops. */
    const frame = requestAnimationFrame(apply)
    const timers = [120, 500, 1500].map((ms) => window.setTimeout(apply, ms))
    window.addEventListener("resize", apply)
    window.addEventListener("orientationchange", apply)
    return () => {
      cancelAnimationFrame(frame)
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
      observer?.disconnect()
    }
  }, [])
  return null
}

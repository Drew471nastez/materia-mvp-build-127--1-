"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { applyStatusBar, applyThemeColor, hideSplashOnce, isNativeShell, readBand, shouldHideSplashOn } from "@/lib/native-chrome"

/**
 * ===========================================================================
 *  ONE BAND, READ AFTER EVERY MOVE
 * ===========================================================================
 * The page's top colour is --native-band on <html> (app/globals.css). This
 * reads it once the page has committed and whenever <html> changes its mind
 * (a class like `app-layout` or `light-chrome` arriving, a bar's own style
 * tag, an inline colour), and makes the browser's bar and the app's status
 * bar text agree with it: lib/native-chrome.ts. In the app it also takes the
 * launch screen down on the landing page's first steady frame.
 *
 * Mounted once, in the root layout. Renders nothing.
 */
export function NativeChrome() {
  const pathname = usePathname() || "/"

  useEffect(() => {
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const band = readBand()
        applyThemeColor(band)
        void applyStatusBar(band)
      })
    }
    sync()
    /*
      A class or an inline colour on <html> can move the band between moves
      (a white full screen page's light-chrome, /app's app-layout). A bar's
      own <style> (the dark buyer header) only comes and goes with a move,
      which this effect already runs after, so the body is not watched:
      every list that renders would wake an observer on it.
    */
    const html = document.documentElement
    /* What on <html> can say a band, read without a style recalc: the viewport's own variables are written to the same style attribute many times a second while a keyboard moves, and those are not a band. */
    /* And the person's dark look (lib/appearance, data-sl-dark), which moves the band without a move (round 28). */
    const said = () => `${html.className}|${html.style.getPropertyValue("--native-band")}|${html.style.backgroundColor}|${html.hasAttribute("data-sl-dark")}`
    let last = said()
    const mo = new MutationObserver(() => {
      const now = said()
      if (now === last) return
      last = now
      sync()
    })
    mo.observe(html, { attributes: true, attributeFilter: ["class", "style", "data-sl-dark"] })
    /* Coming back to the app from the background: the system may have reset the bar. */
    const onShow = () => {
      if (document.visibilityState === "visible") sync()
    }
    document.addEventListener("visibilitychange", onShow)
    return () => {
      cancelAnimationFrame(frame)
      mo.disconnect()
      document.removeEventListener("visibilitychange", onShow)
    }
  }, [pathname])

  useEffect(() => {
    if (!isNativeShell()) return
    let auth = false
    try {
      auth = sessionStorage.getItem("nativeAuthInProgress") === "1"
    } catch {
      /* no storage: not mid sign in */
    }
    if (!shouldHideSplashOn(pathname, auth)) return
    let cancelled = false
    /* The first paint, the frame after it, and the faces it is drawn in (never more than 600ms of waiting for them). */
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready ?? Promise.resolve()
    const capped = Promise.race([fonts, new Promise((r) => setTimeout(r, 600))])
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void capped.then(() => {
          if (!cancelled) void hideSplashOnce()
        })
      }),
    )
    return () => {
      cancelled = true
    }
    // Once per landing: hideSplashOnce remembers it was done.
  }, [pathname])

  /*
    iOS's video player is a system screen. Opening it also used to leave the
    page's own fullscreen element up, a second layer over the whole app.
    The class hides the status band while the player is up, and coming back
    drops any fullscreen element that outlived the player.
  */
  useEffect(() => {
    if (!isNativeShell()) return
    const root = document.documentElement
    const begin = () => root.classList.add("video-fullscreen")
    const end = () => {
      root.classList.remove("video-fullscreen")
      const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      }
      root.style.transform = "translateZ(0)"
      requestAnimationFrame(() => {
        root.style.transform = ""
      })
    }
    document.addEventListener("webkitbeginfullscreen", begin, true)
    document.addEventListener("webkitendfullscreen", end, true)
    return () => {
      root.classList.remove("video-fullscreen")
      document.removeEventListener("webkitbeginfullscreen", begin, true)
      document.removeEventListener("webkitendfullscreen", end, true)
    }
  }, [])

  return null
}

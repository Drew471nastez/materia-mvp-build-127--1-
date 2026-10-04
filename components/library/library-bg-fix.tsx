"use client"

import { useEffect } from "react"

/**
 * In Capacitor on iOS, `html.capacitor { background-color: #000 }` is set
 * globally so the Dynamic Island / status-bar safe-area zone is painted black
 * (the `html` background fills the initial containing block which extends
 * edge-to-edge with viewport-fit:cover, even when WKWebView's contentInset
 * pushes the `body` below that zone).
 *
 * The library uses a light (#fafafa) background, so we:
 *  1. Override html background-color to #fafafa via inline style (highest
 *     priority, beats CSS class rules). Re-applied on every `resize` event
 *     so that device rotation — which fires `resize` — cannot cause a black
 *     flash even if iOS briefly reverts the inline style during the rotation
 *     animation.
 *
 *  2. Add a `library-layout` class to <html>. It was written to trigger a
 *     document scroll lock, and that lock is gone: the library scrolls with
 *     the document now, like every other page. The class is still needed,
 *     because `html.capacitor.library-layout` in globals.css also paints the
 *     status-bar zone and the rotation-guard overlay behind a light page.
 */
export function LibraryBgFix() {
  useEffect(() => {
    const html = document.documentElement
    const prevBg = html.style.backgroundColor

    function applyBg() {
      html.style.backgroundColor = "#fafafa"
    }

    /*
      THE CLASS STAYS, and not for the scroll lock it was written for. That
      lock is gone — the library scrolls with the document now — but
      `html.capacitor.library-layout` also paints the status-bar zone and the
      rotation-guard overlay in the native app, and those rules are the whole
      reason the notch area is not black behind a light page. Removing the
      class took the lock's last consumer away and three native rules with it.
    */
    html.classList.add("library-layout")

    applyBg()
    // Re-apply after every resize (covers device rotation on iOS/Android where
    // the WKWebView rotation animation may briefly revert the inline style).
    window.addEventListener("resize", applyBg, { passive: true })
    // Also re-apply on orientationchange, which fires before resize, so the
    // inline style is set as early as possible during the rotation animation.
    // RotationGuard covers the visual gap, but this ensures the html background
    // is correct the moment the guard overlay hides.
    window.addEventListener("orientationchange", applyBg, { passive: true })

    return () => {
      html.style.backgroundColor = prevBg
      window.removeEventListener("resize", applyBg)
      window.removeEventListener("orientationchange", applyBg)
      html.classList.remove("library-layout")
    }
  }, [])

  return null
}

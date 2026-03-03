"use client"

import { useEffect } from "react"
import { isNativeApp } from "@/lib/native-bridge"

/**
 * Prevents elastic / rubber-band body scroll in the Capacitor native WebView.
 *
 * On /login and /signup the form fits entirely within the viewport — there
 * should be no scrolling and no bounce effect when the user swipes past the
 * edge of the content.  In a regular browser this hook is a no-op so the
 * existing scroll behaviour is preserved.
 *
 * What it does (native only):
 *   • Sets overflowY: hidden on <html> to stop the document from scrolling.
 *   • Sets overscrollBehavior: none on <html> and <body> to disable the
 *     Android WebView rubber-band / edge-glow effect.
 *
 * Everything is restored on unmount so other routes are not affected.
 */
export function useNativeScrollLock(): void {
  useEffect(() => {
    if (!isNativeApp()) return

    const html = document.documentElement
    const body = document.body

    const saved = {
      htmlOverflowY: html.style.overflowY,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    }

    // Prevent document-level scroll and elastic bounce.
    // NOTE: we set overscrollBehavior on body here because we are in an
    // Android WebView (not iOS Safari), so the "overflow-x on body breaks
    // touch-scroll" bug does not apply.
    html.style.overflowY = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overscrollBehavior = "none"

    return () => {
      html.style.overflowY = saved.htmlOverflowY
      html.style.overscrollBehavior = saved.htmlOverscroll
      body.style.overscrollBehavior = saved.bodyOverscroll
    }
  }, [])
}

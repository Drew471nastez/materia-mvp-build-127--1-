"use client"

import { useEffect } from "react"

/**
 * In Capacitor on iOS, `html.capacitor { background-color: #000 }` is set
 * globally so the Dynamic Island / status-bar safe-area zone is painted black
 * (the `html` background fills the initial containing block which extends
 * edge-to-edge with viewport-fit:cover, even when WKWebView's contentInset
 * pushes the `body` below that zone).
 *
 * The library uses a light (#fafafa) background, so we override the html
 * background-color for the duration the user is inside /library and restore
 * it on unmount (navigation away).  This prevents the black bar that appears
 * at the top of the screen — especially visible when the device is in
 * landscape orientation where the safe-area layout shifts.
 */
export function LibraryBgFix() {
  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = "#fafafa"
    return () => {
      document.documentElement.style.backgroundColor = prev
    }
  }, [])

  return null
}

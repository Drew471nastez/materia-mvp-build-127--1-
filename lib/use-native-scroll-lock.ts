"use client"

import { useEffect } from "react"
import { isNativeApp } from "@/lib/native-bridge"

/**
 * Prevents elastic / rubber-band body scroll on /login and /signup when
 * running inside a Capacitor iOS/Android app.
 *
 * In a regular browser this hook is a complete no-op — no classes are added
 * and no styles are changed, so storelib.com is unaffected.
 *
 * What it does (native only):
 *   • Adds the "native-auth-lock" class to <html> and <body>.
 *   • The class is defined in globals.css and applies:
 *       height: 100%             — anchors the document height to the viewport
 *       overflow: hidden         — blocks document-level vertical scroll
 *       overscroll-behavior: none — disables pull-to-refresh / edge-glow bounce
 *       touch-action: pan-x      — prevents vertical drag on the background layer
 *   • The companion .auth-card CSS rule re-enables vertical touch scrolling
 *     inside the form card so inputs remain reachable on short screens.
 *
 * Everything is cleaned up on unmount so other routes are unaffected.
 */
export function useNativeScrollLock(): void {
  useEffect(() => {
    if (!isNativeApp()) return

    const html = document.documentElement
    const body = document.body

    html.classList.add("native-auth-lock")
    body.classList.add("native-auth-lock")

    return () => {
      html.classList.remove("native-auth-lock")
      body.classList.remove("native-auth-lock")
    }
  }, [])
}

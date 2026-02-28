"use client"

/**
 * app/NativeOAuthBridge.tsx
 *
 * Global singleton component — rendered once in app/layout.tsx <body>.
 * Wires up the native OAuth deep-link listener for Android / Capacitor.
 *
 * Why here (app/) rather than components/?
 *   Next.js guarantees this module is loaded as part of the root layout on
 *   every route, so the appUrlOpen listener is registered before the user
 *   can complete OAuth and return to the app — regardless of which page they
 *   were on when they tapped "Sign in with Google".
 *
 * All logic lives in lib/native-oauth.ts.
 * This file is intentionally thin.
 */

import { useEffect } from "react"
import { setupNativeOAuthListeners } from "@/lib/native-oauth"

export default function NativeOAuthBridge() {
  useEffect(() => {
    let cleanup: (() => void) | undefined

    setupNativeOAuthListeners().then((fn) => {
      cleanup = fn
    })

    return () => {
      cleanup?.()
    }
  }, []) // mount once — never re-runs

  return null
}

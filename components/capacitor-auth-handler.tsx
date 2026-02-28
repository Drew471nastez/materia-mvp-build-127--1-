"use client"

/**
 * CapacitorAuthHandler
 *
 * Mounted ONCE in app/layout.tsx (root layout).  Renders nothing.
 * All logic lives in lib/native-oauth.ts — this component is just the
 * React hook that calls it at the right point in the lifecycle.
 *
 * Placement in layout.tsx:
 *   <body>
 *     ...
 *     <CapacitorAuthHandler />   ← after body children, before </body>
 *   </body>
 */

import { useEffect } from "react"
import { setupNativeOAuthListeners } from "@/lib/native-oauth"

export function CapacitorAuthHandler() {
  useEffect(() => {
    let cleanup: (() => void) | undefined

    setupNativeOAuthListeners().then((fn) => {
      cleanup = fn
    })

    return () => {
      cleanup?.()
    }
  }, []) // run once on mount

  return null
}

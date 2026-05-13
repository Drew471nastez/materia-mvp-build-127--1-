"use client"

import { useHideNativeSplash } from "@/hooks/use-hide-native-splash"

/**
 * Drop this into any page that is a final destination for the native-app
 * cold-start flow (/app, /library, /welcome).  It calls useHideNativeSplash()
 * so the Capacitor splash screen is dismissed once meaningful content has
 * rendered, and renders nothing itself.
 */
export function SplashInit({ delay }: { delay?: number } = {}) {
  useHideNativeSplash(delay)
  return null
}

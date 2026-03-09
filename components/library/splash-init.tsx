"use client"

import { useEffect } from "react"

export function LibrarySplashInit() {
  useEffect(() => {
    async function hideSplash() {
      try {
        if ((window as any).Capacitor?.isNativePlatform?.()) {
          const { SplashScreen } = await import("@capacitor/splash-screen")
          await SplashScreen.hide({ fadeOutDuration: 200 })
        }
      } catch {}
    }
    hideSplash()
  }, [])
  return null
}

"use client"
import { useEffect } from "react"
export function useHideNativeSplash(delay = 400) {
  useEffect(() => {
    let cancelled = false
    async function hideSplash() {
      try {
        if (
          typeof window !== "undefined" &&
          (window as any).Capacitor?.isNativePlatform?.()
        ) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(true)))
          await new Promise((resolve) => setTimeout(resolve, delay))
          if (cancelled) return
          const { SplashScreen } = await import("@capacitor/splash-screen")
          await SplashScreen.hide({ fadeOutDuration: 500 })
        }
      } catch {}
    }
    hideSplash()
    return () => {
      cancelled = true
    }
  }, [delay])
}

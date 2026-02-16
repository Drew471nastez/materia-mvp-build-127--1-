"use client"

import { useEffect, useRef } from "react"

export function ExplorePageWrapper({ children }: { children: React.ReactNode }) {
  const hasScrolledRef = useRef(false)

  useEffect(() => {
    if (!hasScrolledRef.current) {
      window.scrollTo(0, 0)
      hasScrolledRef.current = true
    }

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }

    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto"
      }
    }
  }, [])

  return <>{children}</>
}

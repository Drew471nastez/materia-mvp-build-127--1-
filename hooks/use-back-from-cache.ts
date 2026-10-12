"use client"

import { useEffect, useRef } from "react"

/**
 * Runs `reset` when the browser brings this page back from its back/forward
 * cache: Back from a payment page, a bank, a provider's checkout.
 *
 * A page restored that way comes back exactly as it was left, mid press, so
 * a button set to "Opening payment" just before `location.href` sent the
 * buyer away was still pressed, disabled, with nothing in flight behind it
 * and no way out but a reload. Nothing is running on a restored page, so
 * whatever was "busy" is not.
 */
export function useBackFromCache(reset: () => void): void {
  const latest = useRef(reset)
  latest.current = reset
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) latest.current()
    }
    window.addEventListener("pageshow", onShow)
    return () => window.removeEventListener("pageshow", onShow)
  }, [])
}

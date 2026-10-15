"use client"

/**
 * THE ROUTER, FOR CODE THAT IS NOT A COMPONENT (round 27, the app speed review).
 * A push notification's tap is heard by a plugin listener set up once, outside
 * React, so it had no router and opened its page with window.location: a whole
 * page load, a white screen, even with the app already open on the page next to
 * it. The root keeps the router here (AppRouterHandle), and such code moves
 * through it like any link (lib/native-bridge.ts navigateInApp).
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"

type PushRouter = { push: (href: string) => void }

let current: PushRouter | null = null

export function appRouter(): PushRouter | null {
  return current
}

/** Mounted once at the root: hands the router over, and takes it back when the root goes. */
export function AppRouterHandle() {
  const router = useRouter()
  useEffect(() => {
    current = router
    return () => {
      if (current === router) current = null
    }
  }, [router])
  return null
}

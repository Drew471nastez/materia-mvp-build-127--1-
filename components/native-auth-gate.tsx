"use client"

import { useState, useEffect, type ReactNode } from "react"

/**
 * Lightweight client gate for server-rendered layouts.
 *
 * Only blocks rendering while native-oauth.ts is actively handling a
 * deep-link callback (sessionStorage.nativeAuthInProgress === "1").
 *
 * Does NOT add a boot delay — the server already verified auth via cookies.
 * On web (or when no callback is in progress) children render immediately
 * with zero overhead.
 *
 * Usage in a server layout:
 *   import { NativeAuthGate } from "@/components/native-auth-gate"
 *   return <NativeAuthGate>{children}</NativeAuthGate>
 */
export function NativeAuthGate({ children }: { children: ReactNode }) {
  // Start as false (matches SSR output → no hydration mismatch).
  // useEffect checks the real value on the client.
  const [blocked, setBlocked] = useState(false)

  // Check nativeAuthInProgress on mount
  useEffect(() => {
    try {
      if (sessionStorage.getItem("nativeAuthInProgress") === "1") {
        setBlocked(true)
      }
    } catch {}
  }, [])

  // Poll for flag removal + safety timeout
  useEffect(() => {
    if (!blocked) return
    const poll = window.setInterval(() => {
      try {
        if (sessionStorage.getItem("nativeAuthInProgress") !== "1") {
          setBlocked(false)
        }
      } catch {
        setBlocked(false)
      }
    }, 300)
    const safety = window.setTimeout(() => setBlocked(false), 15_000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(safety)
    }
  }, [blocked])

  if (blocked) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-white">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}

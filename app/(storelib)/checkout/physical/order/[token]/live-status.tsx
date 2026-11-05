"use client"

/**
 * THE ORDER PAGE KEEPS ITSELF CURRENT. While the page is open and in view, it
 * asks /api/physical/order-status/<token> for the order's fingerprint (the
 * route says what goes into it): every 15 seconds at first, slower the longer
 * nothing moves, up to every two minutes, and at once when the tab comes
 * back into view. When the fingerprint moves (the shop marked it in
 * progress, a parcel was sent or scanned, a refund, a return answered), the
 * page draws itself again from the server (router.refresh), keeping
 * anything the buyer has open or typed. A buyer's page has no session to
 * open a realtime channel with, and a short poll with backoff is cheap.
 */
import * as React from "react"
import { useRouter } from "next/navigation"

const FIRST_MS = 15_000
const SETTLED_MS = 60_000
const MAX_MS = 120_000

export function LiveStatus({ token, settled = false }: { token: string; settled?: boolean }) {
  const router = useRouter()
  React.useEffect(() => {
    let last: string | null = null
    let timer: number | undefined
    let busy = false
    let gone = false
    const base = settled ? SETTLED_MS : FIRST_MS
    let wait = base
    const schedule = () => {
      window.clearTimeout(timer)
      if (!gone) timer = window.setTimeout(() => void look(), wait)
    }
    const look = async () => {
      if (busy || gone) return
      if (document.visibilityState !== "visible") return schedule()
      busy = true
      try {
        const res = await fetch(`/api/physical/order-status/${encodeURIComponent(token)}`, { cache: "no-store" })
        const v = res.ok ? ((await res.json()) as { v?: unknown }).v : null
        if (typeof v === "string") {
          if (last !== null && v !== last) {
            router.refresh()
            wait = FIRST_MS
          } else wait = Math.min(Math.round(wait * 1.5), MAX_MS)
          last = v
        } else wait = Math.min(wait * 2, MAX_MS)
      } catch {
        wait = Math.min(wait * 2, MAX_MS)
      } finally {
        busy = false
        schedule()
      }
    }
    const back = () => {
      if (document.visibilityState !== "visible") return
      wait = base
      void look()
    }
    void look()
    document.addEventListener("visibilitychange", back)
    window.addEventListener("focus", back)
    return () => {
      gone = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", back)
      window.removeEventListener("focus", back)
    }
  }, [token, settled, router])
  return null
}

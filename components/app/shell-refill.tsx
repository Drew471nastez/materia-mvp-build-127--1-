"use client"

/**
 * ===========================================================================
 *  THE SHELL ASKS AGAIN, QUIETLY, WHEN IT WAS DRAWN WITHOUT ITS ROWS (round 53)
 * ===========================================================================
 * The /app layout draws the sidebar from the name on the session alone when
 * the profile and the creator row could not be read in time and this
 * instance has no copy of them (app/app/layout.tsx). Nothing is put over the
 * page for it. This asks
 * the server for the page again in the background (router.refresh, inside a
 * transition, so what is on screen stays until the new answer is ready),
 * after REFILL_WAITS_MS, and at once when the browser comes back online.
 *
 * Never two at once: a refresh still on its way (a slow database takes as
 * long to answer the second time) is waited for, not joined by another, so
 * this never multiplies the load on a database that is already slow. Once a
 * render had its rows the layout no longer draws this, so the asking stops;
 * two tries at most for one page.
 */
import { useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"

export const REFILL_WAITS_MS = [4_000, 15_000] as const

export function ShellRefill() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const tries = useRef(0)

  useEffect(() => {
    let timer: number | undefined
    const ask = () => {
      if (tries.current >= REFILL_WAITS_MS.length) return
      /* The last one is still on its way: look again in a moment instead of sending another. */
      if (pendingRef.current || navigator.onLine === false) {
        timer = window.setTimeout(ask, 1_000)
        return
      }
      tries.current++
      startTransition(() => router.refresh())
      plan()
    }
    const plan = () => {
      if (tries.current >= REFILL_WAITS_MS.length) return
      timer = window.setTimeout(ask, REFILL_WAITS_MS[tries.current] + Math.round(Math.random() * 800))
    }
    const online = () => {
      window.clearTimeout(timer)
      ask()
    }
    plan()
    window.addEventListener("online", online)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("online", online)
    }
  }, [router])
  return null
}

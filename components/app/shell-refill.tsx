"use client"

/**
 * ===========================================================================
 *  THE SHELL ASKS AGAIN, QUIETLY, WHEN IT WAS DRAWN WITHOUT ITS ROWS (round 53)
 * ===========================================================================
 * The /app layout draws the sidebar from a kept copy, or from the name on the
 * session alone, when the profile or the creator row could not be read in
 * time (app/app/layout.tsx). Nothing is put over the page for it. This asks
 * the server for the page again in the background (router.refresh, inside a
 * transition, so what is on screen stays until the new answer is ready),
 * after REFILL_WAITS_MS, and at once when the browser comes back online. Once
 * a render had its rows the layout no longer draws this, so the asking stops;
 * three tries at most for one page.
 */
import { startTransition, useEffect } from "react"
import { useRouter } from "next/navigation"

export const REFILL_WAITS_MS = [2_500, 6_000, 15_000] as const

export function ShellRefill() {
  const router = useRouter()
  useEffect(() => {
    let tries = 0
    let timer: number | undefined
    const ask = () => {
      tries++
      startTransition(() => router.refresh())
      plan()
    }
    const plan = () => {
      if (tries >= REFILL_WAITS_MS.length) return
      const wait = REFILL_WAITS_MS[tries] + Math.round(Math.random() * 800)
      timer = window.setTimeout(() => {
        if (navigator.onLine === false) return
        ask()
      }, wait)
    }
    const online = () => {
      window.clearTimeout(timer)
      if (tries < REFILL_WAITS_MS.length) ask()
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

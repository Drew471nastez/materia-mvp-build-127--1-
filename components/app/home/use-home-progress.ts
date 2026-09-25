"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { readFacts, sameFacts, type ProgressFacts } from "@/lib/home/progress"
import { hasInAppHistory } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  THE STEPS KNOW WHAT HAPPENED WHILE YOU WERE ON ANOTHER PAGE
 * ===========================================================================
 * The router keeps a page it fetched for five minutes (next.config
 * staleTimes), and the pill fetches Home ahead, so the Home you land on can
 * be one read before you verified a domain, connected Stripe or published a
 * website: the step stayed open until a reload. So Home asks again, for the
 * facts alone (GET /api/home/progress, lib/home/progress):
 *
 *   when it is landed on from another page (a full load is fresh already),
 *   in the first idle moment after the landing, so the page and its
 *   entrance come first;
 *
 *   when it comes back into view: Stripe's onboarding, a domain checked in
 *   another tab, the app returning from the background.
 *
 * Never more than once in MIN_GAP_MS, and an answer that says the same thing
 * renders nothing. The sales are not asked for: the page counts its own
 * orders, kept live over realtime.
 *
 * Opening the guide is kept on the account (POST /api/home/guide) and shown
 * at once, before the answer.
 */
const MIN_GAP_MS = 4000

function whenIdle(task: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (typeof w.requestIdleCallback === "function" && typeof w.cancelIdleCallback === "function") {
    const handle = w.requestIdleCallback(task, { timeout: 1200 })
    return () => w.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(task, 250)
  return () => window.clearTimeout(handle)
}

export function useHomeProgress(initial: ProgressFacts) {
  const [facts, setFacts] = useState(initial)
  const factsRef = useRef(facts)
  useEffect(() => {
    factsRef.current = facts
  }, [facts])
  const lastAsked = useRef(0)
  const guideSent = useRef(false)

  const refresh = useCallback(async () => {
    const now = Date.now()
    if (now - lastAsked.current < MIN_GAP_MS) return
    lastAsked.current = now
    try {
      const res = await fetch("/api/home/progress?sales=0", { cache: "no-store", credentials: "same-origin" })
      if (!res.ok) return
      const next = readFacts((await res.json())?.facts)
      if (!next) return
      setFacts((prev) => {
        const merged: ProgressFacts = {
          ...next,
          /* Counted from the page's own live orders, not from this answer. */
          sales: prev.sales,
          revenueCents: prev.revenueCents,
          /* Opened here a moment ago and not written yet: still opened. */
          guideOpened: next.guideOpened || guideSent.current,
        }
        return sameFacts(prev, merged) ? prev : merged
      })
    } catch {
      /* Offline, or the server did not answer: the page keeps what it has. */
    }
  }, [])

  useEffect(() => {
    const cancelIdle = hasInAppHistory() ? whenIdle(() => void refresh()) : () => {}
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", onShow)
    return () => {
      cancelIdle()
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", onShow)
    }
  }, [refresh])

  const markGuideOpened = useCallback(() => {
    if (factsRef.current.guideOpened || guideSent.current) return
    guideSent.current = true
    setFacts((prev) => (prev.guideOpened ? prev : { ...prev, guideOpened: true }))
    void fetch("/api/home/guide", { method: "POST", credentials: "same-origin" })
      .then((res) => {
        /* Not kept: asked again the next time it is opened. */
        if (!res.ok) guideSent.current = false
      })
      .catch(() => {
        guideSent.current = false
      })
  }, [])

  return { facts, refresh, markGuideOpened }
}

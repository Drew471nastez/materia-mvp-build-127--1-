"use client"

/**
 * ===========================================================================
 *  A CASE, LIVE, IN THE BROWSER (round 27)
 * ===========================================================================
 * One hook for every page with a case open (the buyer's app/order-help, the
 * store's thread, Storelib's): `refresh` reads what is new through the
 * page's own gated route and says whether anything was.
 *
 *   REALTIME   the case's secret broadcast channel (lib/support/
 *              case-live-server.ts), joined as nobody (a public broadcast,
 *              no session): "the case changed" and nothing else, so the
 *              page reads at once
 *   POLLING    always, as the floor under it: every 4 seconds while things
 *              move, backing off to 30 seconds when nothing does (45 while
 *              the channel is joined, as a safety net), never while the tab
 *              is hidden, and at once when it comes back, regains focus or
 *              the network returns
 *
 * Reads never overlap: an event during a read asks for one more after it.
 * Without a topic (no server key, a list rather than a case) it polls.
 */
import * as React from "react"

export const LIVE_FAST_MS = 4_000
export const LIVE_SLOW_MS = 30_000
export const LIVE_JOINED_MS = 45_000
const GROW = 1.6

/** The wait before the next read: back to fast after news, longer after each quiet read, capped. Pure, for tests/help27.test.ts. */
export function nextLiveDelay(current: number, changed: boolean, joined: boolean): number {
  const cap = joined ? LIVE_JOINED_MS : LIVE_SLOW_MS
  if (changed) return joined ? LIVE_SLOW_MS : LIVE_FAST_MS
  return Math.min(cap, Math.round(Math.max(current, LIVE_FAST_MS) * GROW))
}

export function useCaseLive({ topic, refresh, enabled = true }: { topic: string | null | undefined; refresh: () => Promise<boolean | void>; enabled?: boolean }) {
  const refreshRef = React.useRef(refresh)
  React.useEffect(() => {
    refreshRef.current = refresh
  })

  React.useEffect(() => {
    if (!enabled) return
    let gone = false
    let timer: number | null = null
    let delay = LIVE_FAST_MS
    let joined = false
    let reading = false
    let again = false

    const schedule = () => {
      if (gone) return
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      if (document.visibilityState === "hidden") return
      timer = window.setTimeout(() => void read(), delay)
    }

    const read = async () => {
      if (gone) return
      if (reading) {
        again = true
        return
      }
      reading = true
      let changed = false
      try {
        changed = (await refreshRef.current()) === true
      } catch {
        /* A failed read is a quiet one: the next comes later. */
      }
      reading = false
      delay = nextLiveDelay(delay, changed, joined)
      if (again) {
        again = false
        void read()
        return
      }
      schedule()
    }

    const wake = () => {
      if (document.visibilityState === "hidden") {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
        return
      }
      delay = LIVE_FAST_MS
      void read()
    }
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    window.addEventListener("online", wake)
    schedule()

    /* The broadcast channel, joined as nobody: no session is read or kept for it. */
    let client: { removeChannel: (c: unknown) => unknown } | null = null
    let channel: unknown = null
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (topic && url && anon) {
      void import("@supabase/supabase-js")
        .then(({ createClient }) => {
          if (gone) return
          const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sl-case-live" } })
          client = c as unknown as { removeChannel: (c: unknown) => unknown }
          channel = c
            .channel(topic, { config: { broadcast: { self: false } } })
            .on("broadcast", { event: "case" }, () => {
              delay = LIVE_FAST_MS
              void read()
            })
            .subscribe((status: string) => {
              const was = joined
              joined = status === "SUBSCRIBED"
              /* Joined late, or lost: read once, so nothing said in between is missed. */
              if (joined !== was) void read()
            })
        })
        .catch(() => {
          /* No realtime here: polling carries it. */
        })
    }

    return () => {
      gone = true
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
      window.removeEventListener("online", wake)
      if (client && channel) void Promise.resolve(client.removeChannel(channel)).catch(() => {})
    }
  }, [topic, enabled])
}

/**
 * A list that should not go stale (Support's buyer cases, Storelib's
 * queue): read again every `ms` while the tab is in view, and at once when
 * it comes back into view or regains focus.
 */
export function useVisibleInterval(fn: () => unknown, ms: number, enabled = true) {
  const fnRef = React.useRef(fn)
  React.useEffect(() => {
    fnRef.current = fn
  })
  React.useEffect(() => {
    if (!enabled) return
    let timer: number | null = null
    const stop = () => {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      if (document.visibilityState !== "hidden") timer = window.setInterval(() => void fnRef.current(), ms)
    }
    const wake = () => {
      if (document.visibilityState === "hidden") return stop()
      void fnRef.current()
      start()
    }
    start()
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
    }
  }, [ms, enabled])
}

/** Messages after the ones already shown, by id, oldest first: what a read adds. */
export function mergeMessages<T extends { id: number }>(have: T[], fresh: T[]): T[] {
  if (!fresh.length) return have
  const seen = new Set(have.map((m) => m.id))
  const add = fresh.filter((m) => !seen.has(m.id))
  if (!add.length) return have
  return [...have, ...add].sort((a, b) => a.id - b.id)
}

/** The newest message id shown, for the next read's `after`. */
export const lastMessageId = (messages: { id: number }[]) => messages.reduce((n, m) => (m.id > n ? m.id : n), 0)

"use client"

import { useEffect } from "react"

/**
 * "Active now" only means something if somebody is writing it down.
 *
 * `profiles.last_seen_at` has existed since 20260731_presence.sql and exactly
 * one screen ever wrote to it — the Following list — so the column was almost
 * always stale or null. Every reader of it was therefore honest and useless:
 * the member page's dot, the follow list's dot, and now the line under a name
 * in a conversation all said "offline" about people who were on the site,
 * because the only thing that had ever marked them present was a list they had
 * not opened.
 *
 * So the ping moves here, into the shell every marketplace page renders. Being
 * anywhere in the app is what presence means; it was never a property of one
 * screen.
 *
 * Three things keep it cheap:
 *
 * It is throttled ACROSS MOUNTS, in module scope. This component remounts on
 * nothing — it is in the layout — but the guard costs nothing and makes the
 * rate a property of the tab rather than of the render tree.
 *
 * It only runs while the tab is visible. A backgrounded tab is not somebody
 * being present, and telling the database otherwise is how "active now" comes
 * to mean "has this page open somewhere", which is a different and much less
 * useful claim.
 *
 * And it re-pings on `visibilitychange` rather than only on a timer, so coming
 * back to the tab marks you present immediately instead of up to two minutes
 * later — which is the case that matters, because it is the moment somebody is
 * most likely to be looking at you in their inbox.
 */

const EVERY_MS = 120_000
let lastPing = 0

function ping() {
  if (typeof document === "undefined") return
  if (document.visibilityState !== "visible") return
  if (Date.now() - lastPing < EVERY_MS - 5_000) return
  lastPing = Date.now()
  // Fire and forget, always. Presence is decoration: a failed ping must never
  // surface anywhere, and the next one is two minutes away.
  void fetch("/api/presence", { method: "POST", credentials: "include" }).catch(() => {})
}

export function PresenceBeacon() {
  useEffect(() => {
    ping()
    const timer = window.setInterval(ping, EVERY_MS)
    document.addEventListener("visibilitychange", ping)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", ping)
    }
  }, [])

  return null
}

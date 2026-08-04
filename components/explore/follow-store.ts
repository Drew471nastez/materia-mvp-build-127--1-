"use client"

import { useCallback, useSyncExternalStore } from "react"

// Module-scoped follow graph for the current viewer.
//
// Deliberately not React state in a context: a Set held in state re-renders every
// memo'd card in the feed on each toggle, which kills the press animation on the
// card you actually tapped. useSyncExternalStore with a per-id snapshot re-renders
// only the button that changed. Same reasoning as the wishlist store next door.

/**
 * Who this browser last knew you were following.
 *
 * The same correction the wishlist store needed, for the same reason: until the
 * graph is fetched, every Follow button on the screen is drawn from an empty
 * set — and empty renders as "not following". For the length of that round trip
 * the page is telling you something untrue about your own account, and the
 * button you press to unfollow says Follow. Read back synchronously at module
 * load, before anything renders; the fetch still wins.
 */
const CACHE_KEY = "storelib_following_ids_v1"

function readCache(): Set<string> {
  if (typeof localStorage === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set()
  } catch {
    return new Set()
  }
}

function writeCache(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...ids]))
  } catch {
    /* quota, private mode — the store still works, it is just cold next time */
  }
}

let following = readCache()
let loaded = false
let inflight: Promise<void> | null = null

// Ids toggled while a bulk load was in flight, re-applied on top of the response
// so an optimistic change is never clobbered by data that was already stale when
// it was requested.
const pending = new Map<string, boolean>()

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

async function load(): Promise<void> {
  if (loaded || inflight) return inflight ?? undefined
  inflight = (async () => {
    try {
      const res = await fetch("/api/follows", { credentials: "include" })
      const data = res.ok ? await res.json() : { ids: [] }
      const next = new Set<string>(Array.isArray(data?.ids) ? data.ids : [])
      for (const [id, on] of pending) on ? next.add(id) : next.delete(id)
      following = next
      writeCache(next)
      loaded = true
      emit()
    } catch {
      loaded = true // don't retry forever; the button still works optimistically
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function isFollowing(id: string) {
  return following.has(id)
}

/** True once the graph has been fetched — lets buttons avoid flashing "Follow". */
export function useFollowLoaded() {
  return useSyncExternalStore(
    (l) => {
      void load()
      return subscribe(l)
    },
    () => loaded,
    () => false,
  )
}

export function useIsFollowing(id: string | null | undefined) {
  return useSyncExternalStore(
    (l) => {
      void load()
      return subscribe(l)
    },
    () => (id ? following.has(id) : false),
    () => false,
  )
}

/**
 * Optimistic follow toggle. Returns the state it moved to, or null when the
 * caller needs to sign in first (the server is the only thing that can say so).
 */
export function useToggleFollow() {
  return useCallback(async (id: string): Promise<boolean | null> => {
    if (!id) return null
    const next = !following.has(id)

    const optimistic = new Set(following)
    next ? optimistic.add(id) : optimistic.delete(id)
    following = optimistic
    writeCache(optimistic)
    pending.set(id, next)
    emit()

    try {
      const res = await fetch("/api/follows", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: id }),
      })
      if (!res.ok) {
        // Roll back — most often a 401, i.e. not signed in.
        const rolled = new Set(following)
        next ? rolled.delete(id) : rolled.add(id)
        following = rolled
        writeCache(rolled)
        pending.delete(id)
        emit()
        return null
      }
      pending.delete(id)
      return next
    } catch {
      const rolled = new Set(following)
      next ? rolled.delete(id) : rolled.add(id)
      following = rolled
      pending.delete(id)
      emit()
      return null
    }
  }, [])
}

/** Drop the cache so the next read refetches (after sign-in, or a feed refresh). */
export function resetFollowStore() {
  following = new Set()
  writeCache(following)
  loaded = false
  pending.clear()
  emit()
}

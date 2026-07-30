"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * localStorage-backed recent searches for the marketplace search inputs.
 *
 * ── Integration ───────────────────────────────────────────────────────────────
 *   const { searches, add, remove, clear } = useRecentSearches()
 *
 * `add` is also exported standalone as `addRecentSearch(query, category?)` so
 * non-React call sites (the header's navigateReliably handler) can record a
 * search without mounting the hook.
 *
 * Every hook instance reads the same module-level snapshot through
 * useSyncExternalStore, so the header dropdown and the explore panel stay in
 * sync without prop drilling, and a `storage` event keeps other tabs in step.
 *
 * SSR-safe: the server snapshot is a frozen empty array, so the first client
 * render matches the server HTML exactly and React re-renders with the stored
 * list immediately after hydration. Nothing reads localStorage during render.
 */

// Versioned so a future shape change can't crash on rows written by an older build.
const STORAGE_KEY = "storelib_recent_searches_v1"

/** Depop/Vinted-sized list — more than this and the dropdown stops being scannable. */
const MAX_ENTRIES = 8

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 100

/** Anything older is stale intent; dropped on the next read. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export interface RecentSearch {
  /** The query as the user typed it — original casing preserved for display. */
  q: string
  /** Epoch ms of the most recent time this query was run. */
  ts: number
  /** Category id the search was scoped to, when it wasn't "all". */
  category?: string
}

const EMPTY: readonly RecentSearch[] = Object.freeze([])

// Cached snapshot. useSyncExternalStore requires getSnapshot to return a
// referentially stable value between mutations or it re-renders forever.
let cache: readonly RecentSearch[] | null = null

const listeners = new Set<() => void>()

/** Compare key for de-duplication — casing and inner whitespace are noise. */
function normalise(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}

function isRecentSearch(value: unknown): value is RecentSearch {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.q === "string" && entry.q.length > 0 && typeof entry.ts === "number"
}

function read(): readonly RecentSearch[] {
  if (typeof window === "undefined") return EMPTY

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY

    const cutoff = Date.now() - MAX_AGE_MS
    const entries = parsed.filter(isRecentSearch).filter((entry) => entry.ts >= cutoff)

    return entries.length > 0 ? entries.slice(0, MAX_ENTRIES) : EMPTY
  } catch {
    // Malformed JSON, or storage blocked entirely (Safari private mode, iframe).
    return EMPTY
  }
}

function write(entries: readonly RecentSearch[]) {
  cache = entries
  try {
    if (entries.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Quota exceeded or storage disabled — the in-memory cache still serves this
    // session, the list just doesn't survive a reload.
  }
  for (const listener of listeners) listener()
}

function getSnapshot(): readonly RecentSearch[] {
  if (cache === null) cache = read()
  return cache
}

function getServerSnapshot(): readonly RecentSearch[] {
  return EMPTY
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  // First subscriber wires the cross-tab listener; the last one tears it down.
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorageEvent)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorageEvent)
    }
  }
}

function onStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  cache = read()
  for (const listener of listeners) listener()
}

/**
 * Record a search. Most-recent-first, de-duped case-insensitively (an existing
 * entry is moved to the top rather than duplicated), capped at MAX_ENTRIES.
 * Safe to call from anywhere, including outside React. No-op on the server.
 */
export function addRecentSearch(query: string, category?: string) {
  if (typeof window === "undefined") return

  const q = query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH)
  if (!q) return

  const key = normalise(q)
  const next: RecentSearch[] = [
    { q, ts: Date.now(), ...(category && category !== "all" ? { category } : {}) },
    ...getSnapshot().filter((entry) => normalise(entry.q) !== key),
  ]

  write(next.slice(0, MAX_ENTRIES))
}

/** Remove a single entry. Matches case-insensitively, like the de-dupe does. */
export function removeRecentSearch(query: string) {
  if (typeof window === "undefined") return

  const key = normalise(query)
  const current = getSnapshot()
  const next = current.filter((entry) => normalise(entry.q) !== key)

  if (next.length !== current.length) write(next)
}

/** Wipe the list — backs the dropdown's "Clear" action. */
export function clearRecentSearches() {
  if (typeof window === "undefined") return
  if (getSnapshot().length > 0) write(EMPTY)
}

export function useRecentSearches() {
  const searches = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const add = useCallback((query: string, category?: string) => addRecentSearch(query, category), [])
  const remove = useCallback((query: string) => removeRecentSearch(query), [])
  const clear = useCallback(() => clearRecentSearches(), [])

  return { searches, add, remove, clear }
}

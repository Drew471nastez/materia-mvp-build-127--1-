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
  /**
   * What the search was WEARING when it last ran — "Până la 15 RON",
   * "10–50 RON · 2 filtre". The results page writes it as filters change, so a
   * recent-search row can say what pressing it brings back, the way Vinted's
   * saved searches do. Absent means the search ran bare; the row then says
   * "Niciun filtru", which is information, not filler.
   */
  sum?: string
  /**
   * How many results this search had WHEN ITS PAGE WAS LAST SEEN — the exact
   * count the results page printed, written by the page itself. It is the
   * baseline the "+N" badge is measured against: the search panel counts the
   * query again on open, and the difference is what arrived since the last
   * visit. Absent means the results page was never reached for this query, and
   * with no baseline there is no badge — a "+N" against a number nobody saw
   * would be a claim about nothing.
   */
  seen?: number
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
export function addRecentSearch(query: string, category?: string, sum?: string) {
  if (typeof window === "undefined") return

  const q = query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH)
  if (!q) return

  const key = normalise(q)
  // A re-run without a summary KEEPS the one it had: running "nike" from the
  // recents list must not strip the filters the row was just describing.
  const prior = getSnapshot().find((entry) => normalise(entry.q) === key)
  const keptSum = sum !== undefined ? sum : prior?.sum
  const next: RecentSearch[] = [
    {
      q,
      ts: Date.now(),
      ...(category && category !== "all" ? { category } : {}),
      ...(keptSum ? { sum: keptSum.slice(0, 60) } : {}),
    },
    ...getSnapshot().filter((entry) => normalise(entry.q) !== key),
  ]

  write(next.slice(0, MAX_ENTRIES))
}

/**
 * Record the exact result count the results page just showed for this query,
 * without bumping the entry — seeing your results again is not a new search.
 * This is the "+N" badge's baseline; writing it is also what CLEARS the badge,
 * because once the page is seen, seen === current and the difference is zero.
 */
export function markRecentSearchSeen(query: string, total: number) {
  if (typeof window === "undefined" || !Number.isFinite(total) || total < 0) return
  const key = normalise(query)
  const current = getSnapshot()
  let changed = false
  const next = current.map((entry) => {
    if (normalise(entry.q) !== key || entry.seen === total) return entry
    changed = true
    return { ...entry, seen: total }
  })
  if (changed) write(next)
}

/**
 * Update the stored summary of an existing entry WITHOUT bumping it to the top.
 * The results page calls this as filters change under an active query; a filter
 * edit is not a new search, and reordering the list under somebody's eyes
 * because they touched a checkbox would make the recents feel haunted.
 */
export function annotateRecentSearch(query: string, sum: string | null) {
  if (typeof window === "undefined") return
  const key = normalise(query)
  const current = getSnapshot()
  let changed = false
  const next = current.map((entry) => {
    if (normalise(entry.q) !== key) return entry
    const wants = sum ? sum.slice(0, 60) : undefined
    if (entry.sum === wants) return entry
    changed = true
    const { sum: _old, ...rest } = entry
    return wants ? { ...rest, sum: wants } : rest
  })
  if (changed) write(next)
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

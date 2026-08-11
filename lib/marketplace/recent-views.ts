"use client"

/**
 * ===========================================================================
 *  WHAT THIS PERSON HAS BEEN LOOKING AT
 * ===========================================================================
 *
 * The home page had one idea about who you are: none. Everybody got the same
 * hundred newest listings in the same order, so a second visit was the first
 * visit again — and on a marketplace where the whole proposition is "there is
 * one of these and somebody near you has it", showing the same grid twice is
 * the surface admitting it has not been paying attention.
 *
 * Three rows depend on knowing: what you looked at, what is like what you
 * looked at, and which searches are worth offering you. All three read from
 * here.
 *
 * ---------------------------------------------------------------------------
 * ON THE DEVICE, NOT IN THE DATABASE
 * ---------------------------------------------------------------------------
 * A browsing history is the most sensitive thing a shopping site holds, and
 * this one buys personalisation on a page that is otherwise cached and
 * auth-free. Keeping it in localStorage means it costs no request, works signed
 * out, never leaves the machine, and is deleted by the same "clear site data"
 * everybody already knows about. There is no server copy to leak and no join to
 * an account.
 *
 * It also means it is small on purpose: ids and two short labels per entry,
 * capped, oldest dropped. Not a log — a working set.
 */

const KEY = "storelib_recent_views"
/** Enough for three rows and a pill strip, and nothing like a history. */
const MAX = 40

export type RecentView = {
  id: string
  /** Kept so the pill strip can offer "Nike sneakers" without a round trip. */
  brand?: string | null
  category?: string | null
  subcategory?: string | null
  /** Milliseconds. Only used for ordering; never displayed. */
  at: number
}

function read(): RecentView[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Defensive: this survives deploys, and a shape that changed underneath it
    // must degrade to "no history" rather than to a crash on the home page.
    return parsed.filter((v) => v && typeof v.id === "string").slice(0, MAX)
  } catch {
    return []
  }
}

function write(list: RecentView[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* private mode, or storage full — personalisation is not worth an error */
  }
}

/** Same-tab listeners. `storage` only fires in OTHER tabs, so a row that wants
 *  to update the moment you come back from a listing needs this one. */
const listeners = new Set<() => void>()

export function subscribeRecentViews(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * Record a listing as seen.
 *
 * Moves an id already present to the front rather than appending a second
 * entry, so "recently viewed" is a set in recency order and not a tally of how
 * many times you opened the same jumper.
 */
export function recordView(v: Omit<RecentView, "at">): void {
  if (typeof window === "undefined" || !v?.id) return
  const now = Date.now()
  const list = read().filter((e) => e.id !== v.id)
  list.unshift({ ...v, at: now })
  write(list)
  listeners.forEach((fn) => fn())
}

export function getRecentViews(): RecentView[] {
  return read()
}

export function clearRecentViews(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
  listeners.forEach((fn) => fn())
}

/**
 * ===========================================================================
 *  THE SIGNALS, RANKED
 * ===========================================================================
 *
 * Not a model — a count. Every brand and every category you have opened,
 * weighted by how recently, so three views of Carhartt outrank one view of Zara
 * and last week's browsing does not outrank this morning's.
 *
 * Recency is a simple decay over the position in the list rather than over
 * wall-clock time: the list is already in recency order, it is capped at forty,
 * and the difference between "an hour ago" and "yesterday" is not something a
 * row of suggestions needs to model correctly to be useful.
 */
export type Signal = { value: string; weight: number }

export function signalsFrom(views: RecentView[], field: "brand" | "category" | "subcategory"): Signal[] {
  const scores = new Map<string, number>()
  views.forEach((v, i) => {
    const value = (v[field] || "").trim()
    if (!value) return
    // 1.0 for the most recent, tapering to ~0.3 at the end of the window.
    const weight = 1 / (1 + i * 0.06)
    scores.set(value, (scores.get(value) ?? 0) + weight)
  })
  return [...scores.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((a, b) => b.weight - a.weight)
}

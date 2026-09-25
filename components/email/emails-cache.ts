"use client"

/**
 * ===========================================================================
 *  WHAT THE EMAILS SCREENS HAVE ALREADY READ, KEPT FOR THE NEXT LOOK
 * ===========================================================================
 * "Switching between tabs should feel smooth, load good, content not
 * glitchy." Each tab used to load again on every switch, with a blank table
 * while it did. Now each tab's data is read once and kept here, in the page's
 * memory, for as long as the app is open:
 *
 *   a tab that has been read   shows at once, and is read again quietly
 *                              behind it (stale while revalidate); the rows
 *                              change only if something did
 *   a tab never read yet       shows the table's own quiet placeholder until
 *                              it arrives, and the other tabs are read ahead,
 *                              when the browser is idle, so it rarely is
 *   the same read twice        shares one request
 *
 * An email's own page, opened from a row, is read ahead the same way on
 * hover or touch, so it is there by the time the click lands.
 *
 * Nothing here is private beyond what the page already showed, and nothing
 * outlives the tab: it is a Map in memory, not storage.
 */
import * as React from "react"

interface Entry {
  data?: unknown
  at: number
  pending?: Promise<unknown>
  error?: string
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()
const loaders = new Map<string, () => Promise<unknown>>()

/** Where a draft read ahead from its row is kept, for the composer to take. */
export const campaignKey = (id: string) => `emails:campaign:${id}`

/** Read again after this long when somebody looks. Shorter reads are served as they are. */
const FRESH_MS = 8_000

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn())
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key)
  if (!set) listeners.set(key, (set = new Set()))
  set.add(fn)
  return () => {
    set!.delete(fn)
  }
}

/** Starts a read of `key` unless one is already on its way. Never throws. */
export function load<T>(key: string, loader?: () => Promise<T>): Promise<T | undefined> {
  if (loader) loaders.set(key, loader as () => Promise<unknown>)
  const fn = loaders.get(key)
  const e = entries.get(key) ?? { at: 0 }
  if (e.pending) return e.pending as Promise<T | undefined>
  if (!fn) return Promise.resolve(e.data as T | undefined)
  const pending = fn()
    .then((data) => {
      entries.set(key, { data, at: Date.now() })
      emit(key)
      return data as T
    })
    .catch((err: unknown) => {
      const cur = entries.get(key) ?? { at: 0 }
      entries.set(key, { ...cur, pending: undefined, error: err instanceof Error ? err.message : "Could not load" })
      emit(key)
      return cur.data as T | undefined
    })
  entries.set(key, { ...e, pending })
  emit(key)
  return pending
}

/** What is known for `key` right now, with no read started. */
export function peek<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined
}

/** Read `key` ahead of time: a hover on a row, an idle moment after a tab loaded. */
export function prefetch<T>(key: string, loader: () => Promise<T>, freshMs = FRESH_MS) {
  const e = entries.get(key)
  if (e?.pending || (e && e.data !== undefined && Date.now() - e.at < freshMs)) return
  void load(key, loader)
}

/** Mark keys out of date: the next look reads them again, and anybody looking now gets the new rows. */
export function refresh(...keys: string[]) {
  for (const key of keys) {
    const e = entries.get(key)
    if (!e) continue
    entries.set(key, { ...e, at: 0 })
    if (loaders.has(key) && listeners.get(key)?.size) void load(key)
  }
}

/**
 * Every key starting with `prefix`, out of date and read again now, whether
 * or not anybody is looking: the composer calls it on its way back to the
 * list, so the list is fresh by the time it is drawn.
 */
export function refreshMatching(prefix: string) {
  for (const [key, e] of entries) {
    if (!key.startsWith(prefix)) continue
    entries.set(key, { ...e, at: 0 })
    if (loaders.has(key)) void load(key)
  }
}

/**
 * What a read ahead already has for `key`, if it is on its way or younger
 * than `maxAge`, taken out of the cache so the next look reads again. For a
 * page that opens on something a row read ahead (a draft in the composer).
 */
export async function takeFresh<T>(key: string, maxAge: number): Promise<T | undefined> {
  const e = entries.get(key)
  if (!e) return undefined
  if (e.pending) {
    const data = (await e.pending) as T | undefined
    entries.delete(key)
    return data
  }
  entries.delete(key)
  return e.data !== undefined && Date.now() - e.at < maxAge ? (e.data as T) : undefined
}

/** Replace what is known for a key, for an answer the page already has (a row removed, a switch flipped). */
export function write<T>(key: string, update: (prev: T | undefined) => T) {
  const e = entries.get(key) ?? { at: Date.now() }
  entries.set(key, { ...e, data: update(e.data as T | undefined) })
  emit(key)
}

export interface Cached<T> {
  data: T | undefined
  /** Nothing to show yet. */
  loading: boolean
  /** Showing what was read before while it is read again. */
  refreshing: boolean
  error: string | null
}

/**
 * The data for `key`: what is kept at once, read again behind it when it is
 * older than a few seconds. `key` null reads nothing.
 */
export function useCached<T>(key: string | null, loader: () => Promise<T>): Cached<T> {
  const loaderRef = React.useRef(loader)
  loaderRef.current = loader
  const [, bump] = React.useReducer((n: number) => n + 1, 0)

  React.useEffect(() => {
    if (!key) return
    const off = subscribe(key, bump)
    loaders.set(key, () => loaderRef.current())
    const e = entries.get(key)
    if (!e || e.data === undefined || Date.now() - e.at > FRESH_MS) void load(key)
    return off
  }, [key])

  const e = key ? entries.get(key) : undefined
  return {
    data: e?.data as T | undefined,
    loading: !!key && e?.data === undefined && !e?.error,
    refreshing: !!e?.pending && e.data !== undefined,
    error: e?.error ?? null,
  }
}

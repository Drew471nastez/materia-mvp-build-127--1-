"use client"

/**
 * ===========================================================================
 *  WHAT A LIST WAS SHOWING, KEPT WITH THE VISIT IT BELONGS TO
 * ===========================================================================
 * Round 25, the owner: "open a product, go Back: it must return exactly
 * where I was ... keep the loaded pages and the scroll". The scroll was kept
 * (lib/explore/use-explore-scroll), but a list whose page, order or price
 * lived only in React state came back on its first page in its first order:
 * a category on its third page, a product opened, Back, and the scroll was
 * put back over page one, or held at the end of a list a third as long.
 *
 * So a list's own choices are kept here, per history entry, under the same
 * keys as its scroll (explorePlaceKeys: the Navigation API's entry key, and
 * the address with its query), and read again only on the way back (a Back
 * or Forward, a reload, a Back that loaded the page again). A visit by a
 * link starts as a new visit does.
 *
 * Whatever the address can carry should live in the address (Explore's
 * grid keeps ?pg=, ?srt= and its pill there, and the server draws them);
 * this is for what it does not carry.
 */
import { explorePlaceKeys } from "./use-explore-scroll"

const STORE_KEY = "explore-entry-state"
/** Entries kept at most, the oldest let go first. */
const MAX_ENTRIES = 40

type Store = Record<string, Record<string, unknown>>

function readStore(): Store {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

/** What `name` was for the visit on screen, or undefined when nothing was kept for it. */
export function readExploreEntryState<T>(name: string): T | undefined {
  if (typeof window === "undefined") return undefined
  const store = readStore()
  for (const key of explorePlaceKeys()) {
    const entry = store[key]
    if (entry && Object.prototype.hasOwnProperty.call(entry, name)) return entry[name] as T
  }
  return undefined
}

/** Keeps `value` as `name` for the visit on screen. */
export function writeExploreEntryState(name: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    const store = readStore()
    for (const key of explorePlaceKeys()) {
      const entry = { ...(store[key] ?? {}), [name]: value }
      delete store[key]
      store[key] = entry
    }
    const all = Object.keys(store)
    for (const key of all.slice(0, Math.max(0, all.length - MAX_ENTRIES))) delete store[key]
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* Private mode, or storage that is full: the list simply starts fresh on the way back. */
  }
}

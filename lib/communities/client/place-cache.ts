/**
 * ===========================================================================
 *  THE PLACES A MEMBER MAY MOVE TO, HELD IN THE BROWSER (round 15)
 * ===========================================================================
 * One small cache per community, keyed by place (places.ts placeKey), of each
 * place's first screen as data (place-data.ts). Filled three ways: a place's
 * server page seeds it (a reload, a shared link: place-seed.tsx), a move to
 * a place it does not hold asks the JSON place route, and once the first
 * screen has painted and the phone is idle every place is read ahead, two at
 * a time, never on Save-Data or a 2G connection.
 *
 * STALE WHILE IT REVALIDATES. A place held is drawn at once; one read over a
 * minute ago is read again quietly behind it.
 *
 * NOTHING HERE RELOADS A PAGE. A read that fails (the phone just woke and its
 * connection is not back, a deploy in the middle) is tried once more after a
 * moment; if that fails too the place says so in the frame with a retry, and
 * whatever was on screen stays.
 *
 * The rules (how many places stay mounted, when a waiting screen may show,
 * when reading ahead is allowed) are pure functions, driven by
 * tests/communities-shell15.test.ts.
 */
import type { Place } from "./places"
import { placeKey } from "./places"
import type { PlaceAnswer, PlaceData } from "./place-data"

/** Visited places kept mounted (React's Activity, hidden): the four most recent. */
export const KEEP_ALIVE = 4
/** A place not in hand shows its waiting screen only after this long; before then the place being left stays on screen. */
export const WAIT_SCREEN_MS = 250
/** A place read longer ago than this is read again quietly when it is shown. */
export const PLACE_FRESH_MS = 60_000
/** How many places are read ahead at once. */
export const AHEAD_AT_ONCE = 2
/** A read that failed is tried once more after this long (a phone that just woke gets its connection back). */
export const RETRY_AFTER_MS = 700

/* ── The rules ── */

/** The kept places after `key` is shown: most recent last, the oldest let go past `limit`. */
export function keepAlive(order: readonly string[], key: string, limit: number = KEEP_ALIVE): string[] {
  const next = order.filter((k) => k !== key)
  next.push(key)
  return next.length > limit ? next.slice(next.length - limit) : next
}

/** Whether the waiting screen may show: only for a place not in hand, and only once WAIT_SCREEN_MS have passed. */
export function waitScreenDue(inHand: boolean, waitedMs: number, delay: number = WAIT_SCREEN_MS): boolean {
  return !inHand && waitedMs >= delay
}

export interface ConnectionFacts {
  saveData?: boolean
  effectiveType?: string
}

/** Whether places may be read ahead on this connection: never on Save-Data, never on 2G. */
export function readAheadAllowed(conn: ConnectionFacts | null | undefined): boolean {
  if (!conn) return true
  if (conn.saveData) return false
  return !/(^|-)2g$/.test(String(conn.effectiveType || ""))
}

/** The connection facts of this browser, where it says them. */
export function connectionFacts(): ConnectionFacts | null {
  if (typeof navigator === "undefined") return null
  const c = (navigator as Navigator & { connection?: ConnectionFacts }).connection
  return c ? { saveData: !!c.saveData, effectiveType: c.effectiveType } : null
}

/** Whether a held copy should be read again behind the screen. */
export function placeStale(at: number, now: number, fresh: number = PLACE_FRESH_MS): boolean {
  return now - at > fresh
}

/** Whether a failure is the network's (worth one more try), not the server's answer. */
export function retryable(error: unknown): boolean {
  if (!error) return false
  const name = (error as { name?: string }).name || ""
  const message = String((error as { message?: string }).message || error)
  return name === "TypeError" || /load failed|failed to fetch|network|timed? ?out/i.test(message)
}

/* ── The cache ── */

export interface HeldPlace {
  data: PlaceData
  at: number
}

const held = new Map<string, HeldPlace>()
const asking = new Map<string, Promise<HeldPlace | null>>()
const missingPlaces = new Set<string>()
const watchers = new Set<() => void>()

function cacheKey(communityId: string, key: string) {
  return `${communityId}|${key}`
}

function changed() {
  for (const w of Array.from(watchers)) w()
}

/** Told whenever a place arrives or changes. */
export function subscribePlaces(fn: () => void): () => void {
  watchers.add(fn)
  return () => {
    watchers.delete(fn)
  }
}

export function readPlace(communityId: string, place: Place | string): HeldPlace | null {
  const key = typeof place === "string" ? place : placeKey(place)
  return held.get(cacheKey(communityId, key)) ?? null
}

/** Whether the server said there is no such place (a program removed, Learn switched off): not asked again this visit. */
export function placeMissing(communityId: string, place: Place): boolean {
  return missingPlaces.has(cacheKey(communityId, placeKey(place)))
}

/** A place's data as a server page drew it (newer than what is held, or nothing held). */
export function seedPlace(communityId: string, place: Place, data: PlaceData, at: number = Date.now()) {
  const k = cacheKey(communityId, placeKey(place))
  const have = held.get(k)
  if (have && have.at >= at) return
  held.set(k, { data, at })
  missingPlaces.delete(k)
  changed()
}

/** The JSON place route's address. */
export function placeUrl(communityId: string, place: Place, lesson?: string | null): string {
  const q = new URLSearchParams({ p: placeKey(place) })
  if (lesson) q.set("lesson", lesson)
  return `/api/community/${encodeURIComponent(communityId)}/place?${q}`
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function askOnce(url: string): Promise<{ answer: PlaceAnswer | null; status: number }> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" })
  const answer = (await res.json().catch(() => null)) as PlaceAnswer | null
  return { answer, status: res.status }
}

/**
 * Read a place from the server (sharing a read already on its way). Resolves to what is held after it, or null when it
 * could not be read; never throws.
 */
export function loadPlaceData(communityId: string, place: Place, opts: { lesson?: string | null } = {}): Promise<HeldPlace | null> {
  const k = cacheKey(communityId, placeKey(place))
  const running = asking.get(k)
  if (running) return running
  const url = placeUrl(communityId, place, opts.lesson)
  const run = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { answer, status } = await askOnce(url)
        if (answer && answer.ok) {
          const got = { data: answer.data, at: Date.now() }
          held.set(k, got)
          missingPlaces.delete(k)
          changed()
          return got
        }
        if (status === 404) {
          missingPlaces.add(k)
          changed()
          return null
        }
        /* A 5xx (a function that timed out, a deploy going live): once more. A 401/403 is an answer. */
        if (status < 500) return null
      } catch (error) {
        if (!retryable(error)) return null
      }
      if (attempt === 0) await wait(RETRY_AFTER_MS)
    }
    return null
  })().finally(() => asking.delete(k))
  asking.set(k, run)
  return run
}

/** Whether a read of this place is on its way. */
export function placeLoading(communityId: string, place: Place): boolean {
  return asking.has(cacheKey(communityId, placeKey(place)))
}

/**
 * Every place's first screen, read ahead `AHEAD_AT_ONCE` at a time, skipping what is held and fresh. Stops when `stopped()`
 * says so (the member left the community) and never starts on Save-Data or 2G.
 */
export async function readPlacesAhead(communityId: string, places: Place[], stopped: () => boolean, conn: ConnectionFacts | null = connectionFacts()): Promise<number> {
  if (!readAheadAllowed(conn)) return 0
  const queue = places.filter((p) => {
    const have = readPlace(communityId, p)
    return !(have && !placeStale(have.at, Date.now())) && !placeMissing(communityId, p)
  })
  let read = 0
  const lane = async () => {
    while (queue.length && !stopped()) {
      const next = queue.shift()!
      if (await loadPlaceData(communityId, next)) read++
    }
  }
  await Promise.all(Array.from({ length: Math.min(AHEAD_AT_ONCE, queue.length) }, lane))
  return read
}

/** For tests: forget everything held. */
export function forgetPlaces() {
  held.clear()
  asking.clear()
  missingPlaces.clear()
}

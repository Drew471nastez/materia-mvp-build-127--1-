"use client"

import { useSyncExternalStore } from "react"

/**
 * ===========================================================================
 *  THE PEOPLE SOMEBODY ACTUALLY OPENED, FOR THE PERSOANE TAB'S EMPTY STATE
 * ===========================================================================
 *
 * The Persoane tab with nothing typed drew an icon and a sentence telling you
 * to search — a surface explaining what a search box is, in the space where the
 * sellers you were looking at YESTERDAY could be. Search is the one place a
 * repeat visit is the normal visit: the same shop gets checked for new stock
 * the way the same query gets retyped, which is exactly why the queries
 * themselves are remembered three rows up.
 *
 * Same architecture as use-recent-searches, deliberately — module-level cache
 * behind useSyncExternalStore, versioned key, storage-event sync — because two
 * "recent things" stores with two different failure modes is how one of them
 * ends up haunted. Smaller cap: five faces is a row of people you recognise,
 * ten is a directory.
 *
 * What is stored is the ROW, not a reference: id, handle, name, avatar. The
 * empty state must render offline and instantly, and re-fetching five profiles
 * to redraw faces somebody has already seen is a spinner for information the
 * device already had.
 */

const STORAGE_KEY = "storelib_recent_people_v1"
const MAX_ENTRIES = 5

export interface RecentPerson {
  id: string
  username: string
  name: string
  avatarUrl: string | null
  ts: number
}

const EMPTY: readonly RecentPerson[] = Object.freeze([])

let cache: readonly RecentPerson[] | null = null
const listeners = new Set<() => void>()

function isEntry(v: unknown): v is RecentPerson {
  if (typeof v !== "object" || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.id === "string" && typeof e.username === "string" && typeof e.name === "string" && typeof e.ts === "number"
}

function read(): readonly RecentPerson[] {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const entries = parsed.filter(isEntry)
    return entries.length > 0 ? entries.slice(0, MAX_ENTRIES) : EMPTY
  } catch {
    return EMPTY
  }
}

function write(entries: readonly RecentPerson[]) {
  cache = entries
  try {
    if (entries.length > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage blocked — the in-memory cache still serves this session */
  }
  for (const l of listeners) l()
}

function getSnapshot(): readonly RecentPerson[] {
  if (cache === null) cache = read()
  return cache
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener("storage", onStorage)
  }
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  cache = read()
  for (const l of listeners) l()
}

/** Record a profile visit from the search panel. De-duped by id, newest first. */
export function addRecentPerson(p: { id: string; username: string; name: string; avatarUrl?: string | null }) {
  if (typeof window === "undefined" || !p.id || !p.username) return
  const next: RecentPerson[] = [
    { id: p.id, username: p.username, name: p.name, avatarUrl: p.avatarUrl ?? null, ts: Date.now() },
    ...getSnapshot().filter((e) => e.id !== p.id),
  ]
  write(next.slice(0, MAX_ENTRIES))
}

export function removeRecentPerson(id: string) {
  if (typeof window === "undefined") return
  const current = getSnapshot()
  const next = current.filter((e) => e.id !== id)
  if (next.length !== current.length) write(next)
}

export function useRecentPeople(): readonly RecentPerson[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
}

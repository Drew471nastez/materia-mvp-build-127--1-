/**
 * ===========================================================================
 *  THE NAVIGATOR'S LIST, HELD FOR THE TAB AND TIED TO WHO IS SIGNED IN
 * ===========================================================================
 * GET /api/me/places, asked for once the page is idle and again when the
 * panel opens if what is held is more than a few seconds old, and kept for
 * the tab in sessionStorage, so the panel opens already drawn
 * (components/nav/place-navigator.tsx).
 *
 * WHY IT LIVES HERE NOW. "When I go to Explore and open the hamburger icon,
 * sometimes it just doesn't display things." Three ways the panel opened on
 * the wrong thing or on nothing, all in the old copy of this store:
 *
 *   A FAILED ASK WAS FOREVER. A 500, a dropped connection or a request that
 *   never answered left the list unknown, and an unknown list was drawn as
 *   a grey stand in row over the signed out panel (Log in, Sign up), for a
 *   person who was signed in, until the next open happened to succeed.
 *   Now every ask has a time limit, a failure is asked again a few times on
 *   its own, and the panel never waits on it: it draws what the header's
 *   record of the session already says (fallbackPlaces).
 *
 *   THE LIST DID NOT KNOW WHOSE IT WAS. It was kept for fifteen seconds and
 *   for the tab whoever asked, so signing in (in this tab, or in another
 *   one) opened the panel on the visitor's Log in and Sign up, and signing
 *   out in another tab left somebody's courses in it. Each answer is now
 *   stored with who was signed in when it was asked for (whoNow), it is
 *   only shown while that is still who is signed in, and a change to the
 *   header's record (lib/auth/auth-snapshot.ts, which also hears other tabs
 *   and a page back from the back/forward cache) asks again at once.
 *
 *   THE STAND IN WAS SHOWN WHEN NOTHING WAS COMING. A visitor's panel has no
 *   recent list, so there is nothing to wait for: it is drawn whole at once.
 *   The stand in row is only for a signed in person whose list is on its way.
 */
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { parsePlaces, PLACES_URL, SIGNED_OUT_PLACES, type PlacesResponse } from "./places-shared"

export const STORE_KEY = "storelib:places"
/** Fresh enough to open on without asking again. */
export const FRESH_MS = 15_000
/** An ask that has not answered by then has failed, and is asked again. */
export const REQUEST_TIMEOUT_MS = 8_000
/** When a failed ask is tried again on its own: three more times, then on the next open. */
export const RETRY_MS = [1_000, 3_000, 8_000] as const

/**
 * Who the header's record says is signed in: their id, "" for nobody, or
 * null where nothing is recorded yet (a first visit, before the header has
 * verified the session).
 */
export function whoNow(): string | null {
  const s = readAuthSnapshot()
  if (!s) return null
  return s.signedIn ? s.userId || "?" : ""
}

type Held = { at: number; who: string | null; places: PlacesResponse }
export type PlacesStatus = "idle" | "loading" | "failed"

export interface PlacesView {
  /** The answer for whoever is signed in now, or null while there is none. */
  places: PlacesResponse | null
  /** What to draw meanwhile: the panel as the header's record of the session has it. */
  fallback: PlacesResponse
  /** A signed in person's list is on its way: the one time the stand in row is honest. */
  loading: boolean
  status: PlacesStatus
}

let held: Held | null = null
let seeded = false
let status: PlacesStatus = "idle"
/** The communities switch as the last answer had it, whoever it was for: it is the same for everybody. */
let communitiesOn = false
let inflight: Promise<void> | null = null
let inflightWho: string | null | undefined = undefined
/** Bumped whenever what is being asked for changes, so a late answer for somebody else is dropped. */
let seq = 0
let attempts = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
let stopAuth: (() => void) | null = null
let view: PlacesView | null = null
let viewKey = ""

const emit = () => {
  view = null
  listeners.forEach((f) => f())
}

/**
 * Shown only while the person it was asked for is still the one signed in.
 * No record counts as nobody: signing out removes the record rather than
 * writing a signed out one (clearAuthSnapshot), so a list asked for while
 * somebody was recorded is not theirs to show once the record is gone. A
 * list asked for before any record existed is kept until one appears.
 */
function heldIsFor(h: Held, who: string | null): boolean {
  return (h.who ?? "") === (who ?? "")
}

function seed() {
  if (seeded || typeof window === "undefined") return
  seeded = true
  if (held) return
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY)
    if (!raw) return
    const v = JSON.parse(raw) as { at?: number; who?: unknown; places?: unknown }
    if (typeof v.at !== "number") return
    /* A copy from before answers were tied to a person reads as nobody's: it is asked again for whoever is signed in. */
    const who = typeof v.who === "string" ? v.who : v.who === null ? null : "~"
    held = { at: v.at, who, places: parsePlaces(v.places) }
    communitiesOn = held.places.communitiesOn
  } catch {
    /* no storage: asked for on open */
  }
}

function store() {
  try {
    if (held) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(held))
    else window.sessionStorage.removeItem(STORE_KEY)
  } catch {
    /* the tab still has it in memory */
  }
}

function dropHeld() {
  held = null
  seq++
  inflight = null
  inflightWho = undefined
  attempts = 0
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  status = "idle"
  if (typeof window !== "undefined") store()
}

/** The panel as the record of the session has it: who is signed in and whether they sell, with nothing recent. */
export function fallbackPlaces(): PlacesResponse {
  const s = readAuthSnapshot()
  if (s?.signedIn) return { signedIn: true, communitiesOn, isCreator: s.isSeller, hasSellerAccess: s.isSeller, recent: [] }
  return { ...SIGNED_OUT_PLACES, communitiesOn }
}

function scheduleRetry() {
  if (retryTimer || attempts >= RETRY_MS.length) return
  const ms = RETRY_MS[attempts]
  attempts++
  retryTimer = setTimeout(() => {
    retryTimer = null
    void refresh()
  }, ms)
}

/**
 * Ask for the list unless what is held is fresh and still this person's.
 * `force` asks even then. Never throws, never waits longer than
 * REQUEST_TIMEOUT_MS.
 */
export function refresh(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  seed()
  const who = whoNow()
  if (held && !heldIsFor(held, who)) {
    dropHeld()
    emit()
  }
  if (!force && held && Date.now() - held.at < FRESH_MS) return Promise.resolve()
  if (inflight && inflightWho === who) return inflight
  const token = ++seq
  status = "loading"
  inflightWho = who
  emit()
  const run = (async () => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null
    const timer = setTimeout(() => ctrl?.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(PLACES_URL, { cache: "no-store", credentials: "same-origin", signal: ctrl?.signal })
      if (!res.ok) throw new Error(`places answered ${res.status}`)
      const places = parsePlaces(await res.json())
      if (token !== seq) return
      held = { at: Date.now(), who, places }
      communitiesOn = places.communitiesOn
      attempts = 0
      status = "idle"
      store()
      /* Somebody else signed in while this was on its way: theirs is asked for now. */
      if (!heldIsFor(held, whoNow())) queueMicrotask(() => void refresh())
    } catch {
      if (token !== seq) return
      /* Whatever is held stays drawn; the ask is tried again. */
      status = "failed"
      scheduleRetry()
    } finally {
      clearTimeout(timer)
      if (token === seq) {
        inflight = null
        inflightWho = undefined
        emit()
      }
    }
  })()
  inflight = run
  return run
}

/** For a sign in or out in this tab: the next open asks again. */
export function forgetPlaces() {
  if (typeof window === "undefined") return
  seeded = true
  dropHeld()
  emit()
}

function onAuthChange() {
  const who = whoNow()
  if (held && !heldIsFor(held, who)) dropHeld()
  /* An ask still on its way for whoever was signed in before is not this person's answer. */
  else if (inflight && inflightWho !== who) {
    seq++
    inflight = null
    inflightWho = undefined
    status = "idle"
  }
  /* Even with the same answer, the record it falls back to (seller or not) may have changed. */
  emit()
  /* Asked for at once while a navigator is on the page, so the next open is already this person's. */
  if (listeners.size && !held) void refresh()
}

export function subscribePlaces(f: () => void): () => void {
  listeners.add(f)
  if (!stopAuth && typeof window !== "undefined") stopAuth = subscribeAuthSnapshot(onAuthChange)
  return () => {
    listeners.delete(f)
    if (!listeners.size && stopAuth) {
      stopAuth()
      stopAuth = null
    }
  }
}

export function readPlacesView(): PlacesView {
  seed()
  const who = whoNow()
  const s = readAuthSnapshot()
  const places = held && heldIsFor(held, who) ? held.places : null
  const key = `${held?.at ?? "-"}|${who}|${s?.isSeller ? 1 : 0}|${status}|${attempts}|${communitiesOn ? 1 : 0}|${places ? 1 : 0}`
  if (view && key === viewKey) return view
  viewKey = key
  view = {
    places,
    fallback: fallbackPlaces(),
    /*
      Nobody signed in has no recent list to wait for, and once an ask has
      failed the panel is drawn from the record instead of waiting on the
      retries (no stand in that comes and goes with each one).
    */
    loading: !places && who !== "" && status !== "failed" && attempts === 0,
    status,
  }
  return view
}

const SERVER_VIEW: PlacesView = { places: null, fallback: SIGNED_OUT_PLACES, loading: true, status: "idle" }
export const readPlacesViewOnServer = () => SERVER_VIEW

/** For tests: back to a fresh tab. */
export function resetPlacesForTests() {
  held = null
  seeded = false
  status = "idle"
  communitiesOn = false
  inflight = null
  inflightWho = undefined
  seq++
  attempts = 0
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  view = null
  viewKey = ""
}

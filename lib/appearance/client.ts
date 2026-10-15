"use client"

/**
 * The person's light or dark choice, in the browser (lib/appearance/site-appearance.ts
 * says where it applies and why). One store for every surface: the Storelib
 * header's menu, a community's bar and its "..." sheet all read and write it.
 */
import { useCallback, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { intoAppStillUp } from "@/lib/navigation/into-app-still"
import { APPEARANCE_KEY, APP_FROM_DARK_CLASS, APP_FROM_DARK_MS, APP_FROM_DARK_OUT_CLASS, DARK_ATTR, LEGACY_APPEARANCE_KEY, LOOK_NOW_KEY, isAppearance, themedPath, type Appearance } from "./site-appearance"

const listeners = new Set<() => void>()
/** A page's own look for people who never chose (a community whose creator picked dark); see setPageDefaultAppearance. */
let pageDefault: Appearance | null = null
/** Only when storage refuses the write (a private window with it off). */
let memory: Appearance | null = null

function read(): Appearance | null {
  try {
    const v = window.localStorage.getItem(APPEARANCE_KEY) ?? window.localStorage.getItem(LEGACY_APPEARANCE_KEY)
    return isAppearance(v) ? v : memory
  } catch {
    return memory
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === APPEARANCE_KEY) fn()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener("storage", onStorage)
  }
}

/** How long the old look fades into the new one (app/theme-dark.css reads html[data-theme-swap]). */
export const SWITCH_MS = 220

/*
  ROUND 28, THE OWNER: "switching is very laggy, the theme doesn't apply smoothly". It eased a transition on every
  element of the page at once (html.sl-theme-switching *), which on a long feed is thousands of transitions started in
  one frame. Now the switch is one picture: the browser takes a still of the page as it is, the new look is put on in
  the same task (the attribute on <html> at once, and React's render flushed synchronously), and the still fades away
  over the new page on the compositor (a View Transition). Nothing per element, nothing that waits for React. Where a
  browser has no View Transitions, or motion is reduced, the new look is simply there on the next frame.
*/
type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }
function swap(apply: () => void) {
  const doc = document as ViewTransitionDoc
  const html = document.documentElement
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  /* Never inside another transition of the app's (a layer or a tab moving): the look then changes in place. */
  const busy = html.hasAttribute("data-layer-motion") || html.hasAttribute("data-tab-swap") || html.hasAttribute("data-page-swap")
  if (reduce || busy || typeof doc.startViewTransition !== "function" || document.visibilityState !== "visible") {
    apply()
    return
  }
  html.setAttribute("data-theme-swap", "")
  try {
    const vt = doc.startViewTransition(() => {
      apply()
    })
    vt.finished.finally(() => html.removeAttribute("data-theme-swap"))
  } catch {
    html.removeAttribute("data-theme-swap")
    apply()
  }
}

function store(next: Appearance) {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, next)
    window.localStorage.removeItem(LEGACY_APPEARANCE_KEY)
  } catch {
    memory = next
  }
  memory = next
  /* The look on <html> first, in this task (the page under the still is already right), then every reader rendered now. */
  paintAppearance(window.location.pathname, next, pageDefault)
  flushSync(() => {
    for (const fn of listeners) fn()
  })
}

/** The person chose: this browser at once, their account behind it (a failed save keeps the browser's copy). */
export function chooseAppearance(next: Appearance) {
  swap(() => store(next))
  void fetch("/api/account/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ appearance: next }),
  }).catch(() => {})
}

/** The account's choice, arrived from the server: taken quietly when it differs from this browser's. */
export function adoptAccountAppearance(v: unknown) {
  if (!isAppearance(v) || read() === v) return
  swap(() => store(v))
}

/** The person's own choice, or null when they never made one. */
export function useAppearanceChoice(): Appearance | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

/** The look on screen for a page whose own default is `fallback` (a community's creator's pick, or light). */
export function useAppearance(fallback: Appearance = "light"): { appearance: Appearance; toggle: () => void } {
  const chosen = useAppearanceChoice()
  const appearance = chosen ?? fallback
  const toggle = useCallback(() => chooseAppearance(appearance === "dark" ? "light" : "dark"), [appearance])
  return { appearance, toggle }
}

/** Puts the look on <html> for this address: dark only on a themed page, and only when it is dark. */
export function paintAppearance(pathname: string, appearance: Appearance | null, pageDefault: Appearance | null = null) {
  const html = document.documentElement
  /* A page with a look of its own (a creator's page under /u/, [data-own-look]) is never darkened. */
  const dark = themedPath(pathname) && (appearance ?? pageDefault) === "dark" && !document.querySelector("[data-own-look]")
  /* The look this tab shows now, for an /app document that opens next (APP_FROM_DARK_BOOT). */
  try {
    window.sessionStorage.setItem(LOOK_NOW_KEY, dark ? "dark" : "light")
  } catch {
    /* No session storage: the dashboard opens on its own canvas, as it did. */
  }
  if (dark === html.hasAttribute(DARK_ATTR)) return
  if (dark) {
    html.setAttribute(DARK_ATTR, "")
    html.style.colorScheme = "dark"
  } else {
    /* A client move from a dark page into the dashboard: the same veil a document gets, then its fade. Not under the copy of
       the page left, which is already fading off the dashboard (lib/navigation/into-app-still.ts, round 31). */
    if (APP_PATH.test(pathname) && !intoAppStillUp()) veilIntoApp()
    html.removeAttribute(DARK_ATTR)
    html.style.colorScheme = "light"
  }
}

const APP_PATH = /^\/app(\/|$)/

/** Puts the dashboard's veil up now (a client move from a dark page) and fades it off two frames later, once /app is painted under it. */
function veilIntoApp() {
  const html = document.documentElement
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  html.classList.add(APP_FROM_DARK_CLASS)
  requestAnimationFrame(() => requestAnimationFrame(revealAppFromDark))
}

/**
 * The dashboard's shell is on the screen: the veil it opened under after a dark page fades off it (APP_FROM_DARK_BOOT,
 * app/globals.css html.app-from-dark). Nothing when there is no veil.
 */
export function revealAppFromDark() {
  const html = document.documentElement
  if (!html.classList.contains(APP_FROM_DARK_CLASS) || html.classList.contains(APP_FROM_DARK_OUT_CLASS)) return
  html.classList.add(APP_FROM_DARK_OUT_CLASS)
  window.setTimeout(() => html.classList.remove(APP_FROM_DARK_CLASS, APP_FROM_DARK_OUT_CLASS), APP_FROM_DARK_MS + 60)
}

/* ── A page's own default (a community whose creator picked dark) ─────────── */
const defaultListeners = new Set<() => void>()
function subscribeDefault(fn: () => void) {
  defaultListeners.add(fn)
  return () => defaultListeners.delete(fn)
}
/** Called by a page that has a look of its own for people who never chose; null when it goes. */
export function setPageDefaultAppearance(next: Appearance | null) {
  if (pageDefault === next) return
  pageDefault = next
  for (const fn of defaultListeners) fn()
}
export function usePageDefaultAppearance(): Appearance | null {
  return useSyncExternalStore(subscribeDefault, () => pageDefault, () => null)
}

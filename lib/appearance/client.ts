"use client"

/**
 * The person's light or dark choice, in the browser (lib/appearance/site-appearance.ts
 * says where it applies and why). One store for every surface: the Storelib
 * header's menu, a community's bar and its "..." sheet all read and write it.
 */
import { useCallback, useSyncExternalStore } from "react"
import { APPEARANCE_KEY, DARK_ATTR, LEGACY_APPEARANCE_KEY, isAppearance, themedPath, type Appearance } from "./site-appearance"

const listeners = new Set<() => void>()
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

/** How long every colour eases on a switch (app/theme-dark.css reads the class). */
export const SWITCH_MS = 320
let switching = 0

/** The page turns rather than cuts: every colour eases together for a moment, then the page has its own transitions back. */
function softly() {
  const html = document.documentElement
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  html.classList.add("sl-theme-switching")
  window.clearTimeout(switching)
  switching = window.setTimeout(() => html.classList.remove("sl-theme-switching"), SWITCH_MS + 80)
}

function store(next: Appearance) {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, next)
    window.localStorage.removeItem(LEGACY_APPEARANCE_KEY)
  } catch {
    memory = next
  }
  memory = next
  for (const fn of listeners) fn()
}

/** The person chose: this browser at once, their account behind it (a failed save keeps the browser's copy). */
export function chooseAppearance(next: Appearance) {
  softly()
  store(next)
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
  softly()
  store(v)
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
  const dark = themedPath(pathname) && (appearance ?? pageDefault) === "dark"
  if (dark === html.hasAttribute(DARK_ATTR)) return
  if (dark) {
    html.setAttribute(DARK_ATTR, "")
    html.style.colorScheme = "dark"
  } else {
    html.removeAttribute(DARK_ATTR)
    html.style.colorScheme = "light"
  }
}

/* ── A page's own default (a community whose creator picked dark) ─────────── */

let pageDefault: Appearance | null = null
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

"use client"

/**
 * ===========================================================================
 *  LIGHT OR DARK, THE READER'S CHOICE
 * ===========================================================================
 * A community has a look its creator picked (lib/communities/appearance,
 * Settings › Page). A member can override it for themselves from the "..."
 * menu in the community's bar: Dark mode, or Light mode when it is dark.
 * The choice is theirs and this browser's (localStorage), the same in every
 * community, until they switch it back.
 *
 * THE FIRST FRAME IS ALREADY RIGHT. The community's layout prints
 * APPEARANCE_BOOT, which reads the same key before the page paints and puts
 * the dark look on <html>, so a reload in dark mode never shows the light
 * page first. The frame takes over once React is running (useCommunityTheme).
 *
 * THE SWITCH IS ONE SOFT CHANGE. For the moment of the switch every surface,
 * word and hairline eases to its new colour together (html.community-theme-
 * switching, components/community/community-theme.css), and then the page
 * goes back to its own transitions.
 */
import { useCallback, useSyncExternalStore } from "react"
import { APPEARANCE_KEY } from "@/lib/communities/appearance-boot"

export type Appearance = "light" | "dark"

const listeners = new Set<() => void>()

function read(): Appearance | null {
  try {
    const v = window.localStorage.getItem(APPEARANCE_KEY)
    return v === "dark" || v === "light" ? v : null
  } catch {
    return null
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

/** How long every colour eases on a switch (community-theme.css reads the class). */
export const SWITCH_MS = 320

let switching = 0

function choose(next: Appearance) {
  const html = document.documentElement
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (!reduce) {
    html.classList.add("community-theme-switching")
    window.clearTimeout(switching)
    switching = window.setTimeout(() => html.classList.remove("community-theme-switching"), SWITCH_MS + 80)
  }
  try {
    window.localStorage.setItem(APPEARANCE_KEY, next)
  } catch {
    /* Private mode with storage off: the switch still holds for this page. */
    memory = next
  }
  for (const fn of listeners) fn()
}

/** Only used when storage refused the write. */
let memory: Appearance | null = null

/**
 * The look this community shows for this reader: their own choice when they
 * made one, the creator's otherwise. While React hydrates it answers the
 * creator's, as the server did; the boot script has already painted the right one.
 */
export function useCommunityAppearance(communityDefault: Appearance): { appearance: Appearance; toggle: () => void } {
  const chosen = useSyncExternalStore(subscribe, () => read() ?? memory, () => null)
  const appearance = chosen ?? communityDefault
  const toggle = useCallback(() => choose(appearance === "dark" ? "light" : "dark"), [appearance])
  return { appearance, toggle }
}

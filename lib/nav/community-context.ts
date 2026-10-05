"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY THE TAB BAR'S HOME BELONGS TO
 * ===========================================================================
 * Round 12: "once the person is inside a community, the tab bar's Home goes
 * to that community's home EVEN after they visit Profile, Library or Search
 * from the tab bar; the context ends only when they choose Explore, Discover
 * communities or Dashboard in the navigator (or open another community,
 * which becomes the context)."
 *
 * So the phone's tab bar (components/nav/buyer-tab-bar.tsx) remembers the
 * last community it was drawn inside, and its Home leads back there from the
 * person's own pages. Held in memory for the page and in sessionStorage for
 * the tab, so a reload of /account keeps it and a new tab starts clean. The
 * navigator (components/nav/place-navigator.tsx) ends it when one of its
 * three ways out is chosen.
 *
 * A slug is checked against the same shape the address is
 * (lib/nav/buyer-tabs.ts communityOf), so nothing else is ever put in a link.
 */
import { useSyncExternalStore } from "react"

export const COMMUNITY_CONTEXT_KEY = "storelib:community-context"

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** undefined: not read from the tab yet; null: no community. */
let held: string | null | undefined
const listeners = new Set<() => void>()

function read(): string | null {
  if (held !== undefined) return held
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(COMMUNITY_CONTEXT_KEY)
    held = raw && SLUG.test(raw) ? raw : null
  } catch {
    held = null
  }
  return held
}

function write(next: string | null) {
  if (read() === next) return
  held = next
  try {
    if (next) window.sessionStorage.setItem(COMMUNITY_CONTEXT_KEY, next)
    else window.sessionStorage.removeItem(COMMUNITY_CONTEXT_KEY)
  } catch {
    /* No storage (a private window): the page's memory still has it. */
  }
  listeners.forEach((f) => f())
}

/** The community Home leads to outside it, or null. */
export function communityContext(): string | null {
  return read()
}

/** Inside a community: it becomes the context (another one replaces it). */
export function enterCommunityContext(slug: string | null | undefined) {
  if (slug && SLUG.test(slug)) write(slug)
}

/** Explore, Discover communities or Dashboard chosen in the navigator: Home is Storelib's again. */
export function endCommunityContext() {
  write(null)
}

/** The navigator's rows that end the context. */
export const ENDS_COMMUNITY_CONTEXT: ReadonlySet<string> = new Set(["explore", "discover-communities", "dashboard"])

function subscribe(f: () => void) {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/** The context, for a component: none on the server and on the first (hydrating) render, then the tab's. */
export function useCommunityContext(): string | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

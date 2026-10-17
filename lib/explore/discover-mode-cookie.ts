/**
 * Explore's catalogue choice (products or communities).
 *
 * ROUND AG, THE OWNER: "Explore lands on Digital products. If I switched to communities, went into one and came back, keep
 * communities, but not for ever." So the choice is remembered for this tab only (sessionStorage), never in a cookie the
 * server reads: a fresh visit opens on products; Back reads ?type= from the address; a link back to /explore in the same
 * tab reads this. The 30 day cookie that used to hold it is cleared the first time a choice is written.
 */
export const DISCOVER_MODE_COOKIE = "storelib_discover_mode"
export const DISCOVER_MODE_SESSION_KEY = "storelib:discover-mode"

export type DiscoverModeCookie = "products" | "communities"

export function parseDiscoverModeCookie(value: string | undefined | null): DiscoverModeCookie | null {
  if (value === "products" || value === "communities") return value
  return null
}

/** Remembers the choice for this tab (the name is kept from when it was a cookie). */
export function writeDiscoverModeCookie(mode: DiscoverModeCookie) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(DISCOVER_MODE_SESSION_KEY, mode)
  } catch {
    /* A tab that keeps nothing simply opens on products. */
  }
  try {
    document.cookie = `${DISCOVER_MODE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  } catch {
    /* Nothing to clear. */
  }
}

/** The choice made earlier in this tab, or null. */
export function readDiscoverModeSession(): DiscoverModeCookie | null {
  if (typeof window === "undefined") return null
  try {
    return parseDiscoverModeCookie(window.sessionStorage.getItem(DISCOVER_MODE_SESSION_KEY))
  } catch {
    return null
  }
}

/** Persist Explore catalogue choice for 30 days (products vs communities). */
export const DISCOVER_MODE_COOKIE = "storelib_discover_mode"
export const DISCOVER_MODE_MAX_AGE = 60 * 60 * 24 * 30

export type DiscoverModeCookie = "products" | "communities"

export function parseDiscoverModeCookie(value: string | undefined | null): DiscoverModeCookie | null {
  if (value === "products" || value === "communities") return value
  return null
}

export function writeDiscoverModeCookie(mode: DiscoverModeCookie) {
  if (typeof document === "undefined") return
  document.cookie = `${DISCOVER_MODE_COOKIE}=${mode}; path=/; max-age=${DISCOVER_MODE_MAX_AGE}; SameSite=Lax`
}

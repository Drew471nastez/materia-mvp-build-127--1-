/**
 * On phones, feed spaces use ?space=<slug> on the community home address
 * instead of /community/<slug>/space/<slug>, so switching spaces never
 * loads another route or flashes the frame.
 */

export const FEED_SPACE_PARAM = "space"

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i

/** Coarse pointer + tablet width, or the native app. */
export function feedSpaceUrlsActive(): boolean {
  if (typeof window === "undefined") return false
  if (document.documentElement.classList.contains("capacitor")) return true
  return !!window.matchMedia?.("(pointer: coarse) and (max-width: 1023px)").matches
}

export function spaceSlugFromSearch(search: string | null | undefined): string | null {
  if (!search) return null
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(FEED_SPACE_PARAM)
  if (!raw) return null
  const decoded = decodeURIComponent(raw)
  return SLUG.test(decoded) ? decoded : null
}

/** All, a feed space, or Saved — href shape depends on device. */
export function feedListHref(base: string, pick: { kind: "all" } | { kind: "space"; slug: string } | { kind: "saved" }): string {
  if (pick.kind === "all") return base
  if (pick.kind === "saved") return `${base}/saved`
  if (feedSpaceUrlsActive()) {
    const q = new URLSearchParams()
    q.set(FEED_SPACE_PARAM, pick.slug)
    return `${base}?${q}`
  }
  return `${base}/space/${encodeURIComponent(pick.slug)}`
}

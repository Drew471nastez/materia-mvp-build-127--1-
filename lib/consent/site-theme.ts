/**
 * A creator's own words and colours for the cookie banner.
 *
 * There is ONE banner and one record (lib/consent). A creator's site used to
 * draw a second banner of its own from its "Cookie & privacy" settings, which
 * stored an answer nothing read, under a platform banner that also asked: two
 * banners, one of them doing nothing. Now the site hands its text and colours
 * to the one banner, which is mounted in the root layout, above the page that
 * knows them; so they travel through this small store rather than a context.
 */
import { useSyncExternalStore } from "react"

export interface SiteConsentTheme {
  /**
   * The creator switched the banner off for their site. Nothing is asked, and
   * so nothing optional is stored: every optional kind waits for a yes.
   */
  hidden?: boolean
  text?: string
  acceptText?: string
  declineText?: string
  background?: string
  color?: string
  accent?: string
}

let current: SiteConsentTheme | null = null
const listeners = new Set<() => void>()

export function setSiteConsentTheme(t: SiteConsentTheme | null) {
  current = t
  for (const l of listeners) l()
}

export function useSiteConsentTheme(): SiteConsentTheme | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
}

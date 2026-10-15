/**
 * ===========================================================================
 *  A JOIN, TOLD TO THE STORE'S GOOGLE ANALYTICS
 * ===========================================================================
 * A community's pages carry the store's own Google Analytics (Settings ›
 * Integrations, components/website-builder/store-tracking.tsx, placed by
 * app/(marketing)/community/[slug]/layout.tsx), which counts each page. A
 * join is told to it as GA4's recommended `join_group` event, with the
 * community's address as `group_id`, so the store's property can count joins
 * and build audiences from them.
 *
 * Only the address goes, never anything about the person. Once per community
 * in a tab: a refresh of the welcome page is not a second join. Consent is
 * the tag's own (lib/store/ga.ts gaConsentJs), and a page where the store's
 * IDs are switched off (ga-disable-<ID>, components/analytics/ga-route) sends
 * nothing. When the tag is still loading (__slGaWait) the event waits for it,
 * up to six seconds, as lib/analytics/pixels.ts gaStep does; with Tag Manager
 * alone it goes to the data layer. With neither, nothing happens.
 */
type GaWindow = Window & {
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
  __slGaWait?: boolean
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

function send(w: GaWindow, slug: string, tries: number): void {
  try {
    if (typeof w.gtag === "function") w.gtag("event", "join_group", { group_id: slug })
    else if (w.__slGaWait && tries < 20 && typeof w.setTimeout === "function") w.setTimeout(() => send(w, slug, tries + 1), 300)
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: "join_group", group_id: slug })
  } catch {
    /* the tag's own error is its own */
  }
}

/** True when it was sent (or queued for the tag), false when this tab already told it. */
export function gaCommunityJoin(win: Window | undefined, slug: string): boolean {
  if (!win || !SLUG.test(slug)) return false
  const w = win as GaWindow
  const key = `sl_ga_join:${slug}`
  try {
    if (w.sessionStorage?.getItem(key)) return false
    w.sessionStorage?.setItem(key, "1")
  } catch {
    /* storage off: told once more at most */
  }
  send(w, slug, 0)
  return true
}

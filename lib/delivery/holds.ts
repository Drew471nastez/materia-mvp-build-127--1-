/**
 * ===========================================================================
 *  HOW LONG A PUBLISHED WEBSITE'S PAGES AND DATA ARE HELD (round 54)
 * ===========================================================================
 * Measured in production (Vercel, 12 h): 11K ISR reads against 85K
 * revalidations, and ISR writes the largest line of the bill. Every page of
 * a Storelib theme website said `revalidate = 60`, and every read in its
 * draw that Next's data cache holds said 60 or 300 seconds. Next takes the
 * SHORTEST of them as the page's own lifetime (an `unstable_cache` with a
 * shorter `revalidate` shrinks the page it is drawn in:
 * next/dist/server/web/spec-extension/unstable-cache.js, the `prerender`
 * cases), so a page anybody opened twice a minute apart was drawn and
 * written again, whatever changed.
 *
 * Nothing on these pages changes on its own. Each change is announced:
 *   - Publish, unpublish, a domain, a ban: the site's tag and every rendered
 *     page (published-site.ts revalidatePublishedSite);
 *   - a product, its price, stock or collections saved from Storelib's own
 *     screens: the shop's tag and the rendered pages (app/api/revalidate);
 *   - the same written straight to the database (the browser's editor, a
 *     sale's stock): the database's own ping, /api/internal/invalidate,
 *     once part 179 and CACHE_INVALIDATE_SECRET are set;
 *   - markets, languages and translations saved: their own tags.
 * So the hour below is only a backstop, and a visitor never waits for it:
 * an expired page is served while it is drawn again behind them.
 *
 * THE SHOP'S HOLD DEPENDS ON THE DATABASE BEING ABLE TO SAY SO. Without
 * CACHE_INVALIDATE_SECRET nothing tells Storelib about a stock change made
 * by a sale, so the shop is held five minutes, not an hour. Five minutes is
 * still a fifth of the revalidations of the old minute.
 */

/** A published page, and what Publish or a save expires by tag: an hour, as a backstop only. */
export const PUBLISHED_HOLD_S = 3600

/** The shop when the database pings on every change (part 179 and CACHE_INVALIDATE_SECRET). */
export const SHOP_HOLD_PINGED_S = 3600
/** The shop when it does not: a sale's stock change is told to nobody, so it is seen within five minutes. */
export const SHOP_HOLD_UNPINGED_S = 300

/** How long the shop's reads are held on this deployment. Read at run time, so setting the secret is enough. */
export function shopHoldSeconds(env: Record<string, string | undefined> = process.env): number {
  return env.CACHE_INVALIDATE_SECRET ? SHOP_HOLD_PINGED_S : SHOP_HOLD_UNPINGED_S
}

/** The tag a website name's lookup is held under (published-site.ts creatorByName, and the rename it went to). */
export const siteNameTag = (name: string) => `site-name:${name.trim().toLowerCase()}`

import "server-only"

/**
 * ===========================================================================
 *  A STRANGER'S PAGE OF AN IMPORTED THEME, DRAWN ONCE A MINUTE, NOT PER VISIT
 * ===========================================================================
 * An imported Shopify theme's page is drawn by Storelib's Liquid engine on
 * every request, and measured on the owner's live site that took 0.4 to 3
 * seconds before the first byte, every time: the CDN copy the proxy asks for
 * (./anonymous-cache.ts, `public, s-maxage=60`) came back `x-vercel-cache:
 * MISS` on every request in production, so in practice every visitor waited
 * for a full draw.
 *
 * So the drawn page is held here too, in Next's data cache, whatever the CDN
 * does: the same page for the same marked address (host, country, language,
 * market, path and query, ./anonymous-cache.ts strangerMarker), which is
 * exactly what makes it safe to share. Held under the site's and the shop's
 * tags (lib/website-builder/published-site.ts), so Publish, a product saved
 * or a setting changed clears it at once, and for SECONDS at most otherwise.
 *
 * Only an answer the CDN rule would share is reused (publicAnswer: a plain
 * 200 page that set no cookie). Anything else is remembered as "draw it
 * again", so a page that stops being shareable (a product taken down) is
 * never served from an older shareable copy.
 *
 * Kept compressed: a theme's page is a megabyte of markup and the data cache
 * holds items up to 2MB.
 */
import { gunzipSync, gzipSync } from "node:zlib"
import { unstable_cache } from "next/cache"

/** How long a held page lasts when nothing clears it: the CDN rule's own minute. */
export const STRANGER_HOLD_SECONDS = 60

export interface DrawnPage {
  status: number
  headers: [string, string][]
  body: string
  /** Whether this answer is one every stranger may be given (publicAnswer). */
  share: boolean
}

type Held = { share: false } | { share: true; status: number; headers: [string, string][]; gz: string }

/** The cache key for a marked address: every part of it the page is drawn from. */
export function strangerKey(username: string, path: readonly string[], search: string): string[] {
  return ["compat-stranger-page", "v1", username.toLowerCase(), path.join("/"), search]
}

/**
 * The page for this marked address: the held copy when there is one, else
 * drawn now (and held when it may be shared). `draw` runs at most once per
 * call, and its answer is the one returned whenever it ran.
 */
export async function heldStrangerPage(key: string[], tags: string[], draw: () => Promise<DrawnPage>): Promise<DrawnPage & { held: boolean }> {
  let fresh: DrawnPage | null = null
  const read = unstable_cache(
    async (): Promise<Held> => {
      const page = await draw()
      fresh = page
      if (!page.share) return { share: false }
      return { share: true, status: page.status, headers: page.headers, gz: gzipSync(Buffer.from(page.body, "utf8")).toString("base64") }
    },
    key,
    { tags, revalidate: STRANGER_HOLD_SECONDS },
  )
  const held = await read()
  const drawn = fresh as DrawnPage | null
  if (drawn) return { ...drawn, held: false }
  if (held.share) {
    return { status: held.status, headers: held.headers, body: gunzipSync(Buffer.from(held.gz, "base64")).toString("utf8"), share: true, held: true }
  }
  /* Held as "draw it again": not a page to share, so this visitor gets their own. */
  return { ...(await draw()), held: false }
}

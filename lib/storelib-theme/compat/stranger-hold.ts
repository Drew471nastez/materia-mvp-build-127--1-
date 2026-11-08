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
import { StampedMemo } from "@/lib/website-builder/stamped-memo"

/** How long a held page lasts when nothing clears it: the CDN rule's own five minutes (./anonymous-cache.ts SHARED_PAGE_CDN, round 54). */
export const STRANGER_HOLD_SECONDS = 300

export interface DrawnPage {
  status: number
  headers: [string, string][]
  body: string
  /** Whether this answer is one every stranger may be given (publicAnswer). */
  share: boolean
}

type Held = { share: false } | { share: true; status: number; headers: [string, string][]; gz: string }

/**
 * The cache key for a marked address: every part of it the page is drawn
 * from. `asDocument`: the page was opened as a page (Sec-Fetch-Dest:
 * document), which is drawn ready for its first paint (./first-load.ts); a
 * script fetching the same address gets the theme's markup as written, so
 * the two are held apart.
 */
export function strangerKey(username: string, path: readonly string[], search: string, asDocument = false): string[] {
  return ["compat-stranger-page", "v1", username.toLowerCase(), path.join("/"), search, ...(asDocument ? ["document"] : [])]
}

/**
 * The page for this marked address: the held copy when there is one, else
 * drawn now (and held when it may be shared). `draw` runs at most once per
 * call, and its answer is the one returned whenever it ran.
 */
/*
  ONE DRAW FOR STRANGERS ARRIVING TOGETHER (round 48). The data cache
  shares a page once it is held, but not while it is being drawn: fifty
  strangers opening the same page on a cold server, or in the moment its
  copy expired with no stale one left, each ran the whole Liquid draw (0.4
  to 3 seconds of CPU each) and each wrote the same copy. Callers asking for
  the same marked address while a read or a draw is under way on this
  server now wait for it and take its page, when that page may be shared
  (the same rule the hold keeps); one that may not be shared is drawn again
  for each caller, as before.
*/
const underWay = new Map<string, Promise<DrawnPage & { held: boolean }>>()

/*
  AND IN THIS SERVER'S MEMORY, UNDER THE SITE'S STAMP (round AM,
  lib/website-builder/site-stamp.ts). A held page came from the shared cache
  on every visit: a request for a whole page of markup, 0.12 to 0.44 s to
  the first byte measured live. A page this server already drew or read is
  kept here too, compressed, and handed out while the site's stamp (expired
  by the same tags the hold is kept under) is the one it was kept with. A
  Publish changes the stamp, so it is never served past one.
*/
const inMemory = new StampedMemo<{ status: number; headers: [string, string][]; gz: Buffer }>(48)

/* `stamp`: the site's stamp read before this page; a promise of it for a site this server had not seen, read beside the page and used only to keep it. */
export async function heldStrangerPage(key: string[], tags: string[], draw: () => Promise<DrawnPage>, stamp: string | null | Promise<string | null> = null): Promise<DrawnPage & { held: boolean }> {
  const id = key.join("\u0000")
  const kept = typeof stamp === "string" ? inMemory.get(id, stamp) : undefined
  if (kept) return { status: kept.status, headers: kept.headers, body: gunzipSync(kept.gz).toString("utf8"), share: true, held: true }
  const going = underWay.get(id)
  if (going) {
    const page = await going.catch(() => null)
    if (page && page.share) return { ...page, held: true }
    return heldOnce(key, tags, draw)
  }
  const mine = heldOnce(key, tags, draw)
    .then(async (page) => {
      /* Kept under the stamp read before (or beside) the page, so a change that landed meanwhile never leaves this copy current for the next visitor. */
      if (page.share && page.status === 200) inMemory.set(id, await stamp, { status: page.status, headers: page.headers, gz: gzipSync(Buffer.from(page.body, "utf8")) })
      return page
    })
    .finally(() => underWay.delete(id))
  underWay.set(id, mine)
  return mine
}

async function heldOnce(key: string[], tags: string[], draw: () => Promise<DrawnPage>): Promise<DrawnPage & { held: boolean }> {
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

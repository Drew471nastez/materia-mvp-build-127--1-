import "server-only"

/**
 * ===========================================================================
 *  ONE SMALL READ THAT SAYS WHETHER A SITE CHANGED, ON EVERY SERVER
 * ===========================================================================
 * Measured on andrewrullz.storelib.com (round AM): a page of an imported
 * theme drawn on a WARM server spent 339 to 619 ms in "read" (Server-Timing),
 * every part of it an answer already held in Next's data cache. On Vercel
 * each held answer is a request to the shared cache, and compatSiteByName
 * asks for about twenty of them in five steps, each step waiting on the one
 * before. A held stranger's page was the same: two requests, one of them a
 * whole page of markup, 0.12 to 0.44 s to the first byte.
 *
 * A server keeps what it assembled in its own memory instead, and before
 * using it asks ONE thing of the shared cache: this stamp. The stamp is a
 * random word held under every tag the site's pages are held under (the
 * site, its shop and its blog). Publish, a product saved, a post published,
 * a setting, a menu or a domain changed: each expires one of those tags, the
 * stamp is read again as a new word, and every server's own copy stops
 * matching at once. So the copy in memory is never older than what a tag
 * says, which is exactly the rule the shared cache keeps.
 *
 * What no tag names (an hour's backstop on the stamp itself, the store's
 * return window, the creator's photo) is held no longer than MEMO_MAX_MS in
 * memory, after which the server assembles the site again from the shared
 * cache, as before.
 *
 * Never for a preview: the callers only ask for the live site.
 */
import { randomUUID } from "node:crypto"
import { unstable_cache } from "next/cache"
import { keyedAs } from "./last-good"
import { creatorByName, creatorShopTag, creatorSiteTag } from "./published-site"
import { siteBlogTag } from "@/lib/site-blog/cache"

/** How long the stamp lives when no tag expires it. Only a backstop: every change that matters expires a tag. */
export const STAMP_HOLD_S = 3600
/** How long a server trusts what it keeps in memory for a stamp, for what no tag names. */
export const MEMO_MAX_MS = 60_000

/** The tags a site's pages are held under (the held stranger's page, the CDN copy): the stamp changes whenever any of them is expired. */
export function siteStampTags(creatorId: string): string[] {
  return [creatorSiteTag(creatorId), creatorShopTag(creatorId), siteBlogTag(creatorId)]
}

/** The site's stamp now, or null when it cannot be read (the caller then reads the shared cache as before). */
export async function siteStamp(creatorId: string): Promise<string | null> {
  try {
    return await unstable_cache(keyedAs("site-stamp:v1", async () => randomUUID()), ["site-stamp", creatorId], { tags: siteStampTags(creatorId), revalidate: STAMP_HOLD_S })()
  } catch {
    return null
  }
}

/* Which creator each name was, last time: lets the stamp be asked beside the name's own lookup instead of after it. Checked against that lookup every time. */
const idOfName = new Map<string, string>()
const NAMES_MAX = 2000

/**
 * The creator behind a name and the site's stamp, asked together when this
 * server has seen the name before. Null when the name is nobody's or the
 * lookup failed (the caller goes on as it did without a stamp).
 */
export async function nameAndStamp(name: string): Promise<{ creatorId: string; stamp: string | null; creator: NonNullable<Awaited<ReturnType<typeof creatorByName>>> } | null> {
  const lower = name.toLowerCase()
  const guess = idOfName.get(lower)
  const [creator, early] = await Promise.all([creatorByName(name).catch(() => null), guess ? siteStamp(guess) : Promise.resolve(null)])
  if (!creator) return null
  if (guess !== creator.creatorId) {
    if (idOfName.size >= NAMES_MAX) idOfName.clear()
    idOfName.set(lower, creator.creatorId)
  }
  /*
    A name this server has not seen (or that is somebody else's now): no
    stamp, rather than a second request after the first. Nothing is kept
    in memory for this request, and the next one asks for both together.
  */
  return { creatorId: creator.creatorId, stamp: guess === creator.creatorId ? early : null, creator }
}

/**
 * What a server keeps in memory under a stamp: a value is handed back only
 * while the stamp it was kept with is the stamp now, and for MEMO_MAX_MS at
 * most. The most recently used are kept.
 */
export class StampedMemo<T> {
  private readonly held = new Map<string, { stamp: string; at: number; value: T }>()
  constructor(
    private readonly max: number,
    private readonly maxAgeMs: number = MEMO_MAX_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string, stamp: string | null): T | undefined {
    if (!stamp) return undefined
    const e = this.held.get(key)
    if (!e) return undefined
    if (e.stamp !== stamp || this.now() - e.at > this.maxAgeMs) {
      this.held.delete(key)
      return undefined
    }
    this.held.delete(key)
    this.held.set(key, e)
    return e.value
  }

  set(key: string, stamp: string | null, value: T): void {
    if (!stamp) return
    this.held.delete(key)
    this.held.set(key, { stamp, at: this.now(), value })
    while (this.held.size > this.max) {
      const oldest = this.held.keys().next().value
      if (oldest === undefined) break
      this.held.delete(oldest)
    }
  }

  get size(): number {
    return this.held.size
  }
}

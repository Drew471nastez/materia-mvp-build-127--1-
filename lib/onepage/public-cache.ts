import "server-only"

/**
 * ===========================================================================
 *  A PUBLISHED ONEPAGE, READ ONCE FOR EVERY VISITOR, CLEARED WHEN IT CHANGES
 * ===========================================================================
 * A OnePage is the link a creator puts in their bio, so it is the page that
 * gets a spike: one post goes round and thousands open the same address in a
 * minute. Every one of those opens asked the database the same questions
 * (the page by its name, its owner, their published product count, every
 * product its blocks name), seven to twelve round trips a visit, and then
 * wrote a view row of its own after the page was sent.
 *
 * The answers are the same for everybody, so they are held in Next's data
 * cache (unstable_cache), keyed by what they are read from and tagged by
 * whose they are:
 *
 *   onePageNameTag(name)       an address that answers with a page, and the
 *                              page row it answers with. A tag is fixed
 *                              before the row is read, so the row is held
 *                              under the name it was asked by, and a change
 *                              clears every name the page answers to: its
 *                              address and its owner's username, before and
 *                              after (onePageChangedFor reads them).
 *   onePageOwnerTag(user id)   the owner: their name, photo, handle, ban,
 *                              published product count and domain.
 *   onePageShopTag(creator)    the blocks with their products read live,
 *                              cleared with the products (app/api/revalidate,
 *                              app/api/internal/invalidate, a product
 *                              forgotten), together with creatorShopTag.
 *
 * Every answer a name gives is held (a page, a creator page, a renamed
 * address, nothing), because each is what the next visitor would be told
 * too; a lookup that failed is never held. A held answer that goes stale is
 * replaced by what the name leads to now. A publish, a new address and a new
 * username clear every name involved, before and after, so a page published
 * a second ago is never a held "nothing here".
 *
 * Every clear is `{ expire: 0 }`, a miss for the next request rather than a
 * stale copy served while a new one is read, so the creator who presses
 * Publish and opens their page sees what they published
 * (lib/website-builder/published-site.ts revalidatePublishedSite says why).
 *
 * The page is drawn per request at the server, and since round 51 the CDN
 * holds the drawn page for a minute (lib/onepage/edge): every clear below
 * also expires the CDN's copy by its tag (onePageCdnTag), so a publish is
 * on storelib.me at the next visit. A block's schedule is still decided by
 * the clock at each draw; lib/onepage/edge says how a held copy keeps it.
 *
 * ONE_PAGE_HOLD_SECONDS is the backstop for a writer that does not clear a
 * tag (an editor that writes from the browser): a minute after it was held,
 * the next visit reads the page again behind the visitor and the visit
 * after it is shown the change, the same backstop the product page and the
 * website use.
 */
import { revalidateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { onePageCdnTag } from "@/lib/onepage/edge"

/** The backstop, in seconds. The tags are the fast path. */
export const ONE_PAGE_HOLD_SECONDS = 60

export const onePageOwnerTag = (ownerUserId: string) => `onepage-owner:${ownerUserId}`
export const onePageNameTag = (name: string) => `onepage-name:${name.trim().toLowerCase()}`
export const onePageShopTag = (creatorId: string) => `onepage-shop:${creatorId}`
/**
 * The website shop's own tag (lib/website-builder/published-site.ts
 * creatorShopTag), written out here so a OnePage does not load the whole
 * website renderer to name it; tests/public-delivery.test.ts holds the two
 * equal. Every product writer already clears it, the database's own triggers
 * included (app/api/internal/invalidate), so a OnePage's products follow
 * every one of them.
 */
export const shopProductsTag = (creatorId: string) => `shop-products:${creatorId}`

/**
 * A read held in Next's data cache, or made directly where there is no data
 * cache at all: a probe or a suite that runs this module outside Next
 * (scripts/render-onepage-*.tsx, tests/onepage-share-image.test.ts), where
 * unstable_cache refuses with "incrementalCache missing". Any other error,
 * the read's own included, is the caller's, as it was.
 */
export function heldRead<T>(read: () => Promise<T>, key: string[], options: { tags: string[]; revalidate: number }): Promise<T> {
  return unstable_cache(read, key, options)().catch((e: unknown) => {
    if (e instanceof Error && /incrementalCache missing/.test(e.message)) return read()
    throw e
  })
}

/** Never a tag for nobody: an empty id would be one tag shared by every page without one. */
function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== ""
}

/** Expired now, on every server: the next visitor reads afresh. */
function expire(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (e) {
    /* Outside a request (a script, a test) there is no cache to clear. */
    console.warn(`[onepage-cache] ${tag} not cleared: ${(e as Error).message}`)
  }
}

export interface OnePageChange {
  /** The account whose OnePage it is. */
  ownerUserId?: string | null
  /** Every name the page answers to, before and after the change: its address and the owner's username. */
  names?: (string | null | undefined)[]
}

/** The tags a change expires: the owner's, and one per name it answers to, lower cased, each once. */
export function onePageChangeTags(change: OnePageChange): string[] {
  const names = new Set((change.names ?? []).filter(present).map((n) => n.trim().toLowerCase()))
  return [...(present(change.ownerUserId) ? [onePageOwnerTag(change.ownerUserId)] : []), ...[...names].map(onePageNameTag)]
}

/** A published OnePage changed: its page, its owner and every name it answers to are read afresh. */
export function onePageChanged(change: OnePageChange): void {
  for (const tag of onePageChangeTags(change)) expire(tag)
  /* And the CDN's copy of storelib.me/<name>, by its tag, after the data it is drawn from (lib/onepage/edge). */
  for (const name of new Set((change.names ?? []).filter(present).map((n) => n.trim().toLowerCase()))) expire(onePageCdnTag(name))
  /* And its stored copy at storelib.me/<name>, asked again after the answer (lib/edge/snapshot-capture.ts). */
  const names = (change.names ?? []).filter(present)
  if (names.length > 0) {
    void import("@/lib/edge/snapshot-capture")
      .then((m) => m.later(() => m.refreshOnePageSnapshot(names)))
      .catch(() => undefined)
  }
}

/**
 * The same, for a writer that knows only whose page it is (a draft save, a
 * new name or photo, a renamed account): the page's address and the owner's
 * username are read here, and any names the caller had before the change
 * are cleared with them. Never in the way of the write it follows: a read
 * that fails still clears the owner and the names it was given.
 */
export async function onePageChangedFor(ownerUserId: string | null | undefined, previousNames: (string | null | undefined)[] = []): Promise<void> {
  if (!present(ownerUserId)) return
  const names: (string | null | undefined)[] = [...previousNames]
  try {
    const db = createAdminClient()
    const [page, profile] = await Promise.all([
      db.from("onepages").select("slug").eq("owner_id", ownerUserId).limit(1).maybeSingle(),
      db.from("profiles").select("username").eq("id", ownerUserId).maybeSingle(),
    ])
    names.push((page.data as { slug?: string | null } | null)?.slug, (profile.data as { username?: string | null } | null)?.username)
  } catch {
    /* The owner and the names given are still cleared below; the backstop holds the rest to a minute. */
  }
  onePageChanged({ ownerUserId, names })
}

/**
 * A store's products changed: every OnePage block that draws one of them is
 * read afresh, and the CDN's copy of the store's OnePage goes with it (its
 * tag is by name, so the names are read here; a read that fails leaves the
 * copy to its minute). Awaited by a caller that can; the data is cleared
 * before the first await either way.
 */
export async function onePageProductsChanged(creatorId: string | null | undefined): Promise<void> {
  if (!present(creatorId)) return
  expire(onePageShopTag(creatorId))
  /* A creator's id is a uuid; nothing else is put into a filter. */
  if (!/^[0-9a-f-]{36}$/i.test(creatorId)) return
  try {
    const db = createAdminClient()
    const [pages, creator] = await Promise.all([
      db.from("onepages").select("slug").or(`seller_id.eq.${creatorId},creator_id.eq.${creatorId}`).limit(5),
      db.from("creators").select("user_id").eq("id", creatorId).maybeSingle(),
    ])
    const names = ((pages.data as { slug?: string | null }[] | null) ?? []).map((p) => p.slug)
    const userId = (creator.data as { user_id?: string | null } | null)?.user_id
    if (present(userId)) {
      const profile = await db.from("profiles").select("username").eq("id", userId).maybeSingle()
      names.push((profile.data as { username?: string | null } | null)?.username)
    }
    for (const name of new Set(names.filter(present).map((n) => n.trim().toLowerCase()))) expire(onePageCdnTag(name))
  } catch {
    /* The blocks are cleared; the CDN's copy is a minute old at most. */
  }
}

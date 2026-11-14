import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S PUBLIC PAGE, READ ONCE FOR EVERY VISITOR
 * ===========================================================================
 * /community/<slug> and /about are the pages a community's link is shared
 * as, so a stranger opening them is the common case, and every one of them
 * asked the database the same nineteen questions: the community (five
 * times), its creator and their profile (three times each), the member
 * figures (three times), its tiers, their products and plans, its gallery.
 *
 * WHAT IS READ FOR EVERY REQUEST: the community's own row, once (React's
 * cache, shared by the layout, the page and their metadata). Whether the
 * page may be shown at all (a draft, a suspended or a deleted community, the
 * viewer's standing) is decided from that live row, so a community made a
 * draft or suspended is a 404 for everybody but its staff on the very next
 * request, whoever changed it and however. Nothing about the viewer is held.
 *
 * WHAT IS HELD, for a minute at most, in Next's data cache (unstable_cache),
 * and only for a community anybody may see (published, not suspended, not
 * deleted, ./public.ts sharePreviewable): what the sales page and About
 * show every visitor alike. The tiers with their products and prices, the
 * creator's public name, photo and handle, the short description, the
 * gallery, the reviews, the member figures and the About extras. Keyed by the
 * community's id and its updated_at, so a change to the row itself (a new
 * name, cover, description, a member joining, which moves member_count) is a
 * new entry at once. Tagged:
 *
 *   communityPublicTag(id)   every staff write. Each route under
 *                            /api/app/community/[id] passes the gate in
 *                            ./context.ts, which clears this tag after the
 *                            request (next/server `after`), so a tier, a
 *                            gallery, a summary or a scheduled deletion is
 *                            on the page at the next visit.
 *   creatorTag(creator id)   a new name or photo (lib/account/identity-caches).
 *   shopProductsTag(creator) a product saved, archived or deleted (every
 *                            product writer, the database's triggers too).
 *
 * A read that failed is never held (noteHeldReadFailure): the visitor is
 * answered with what could be read and the next one asks again. Every clear
 * is `{ expire: 0 }`, a miss rather than a stale copy.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { revalidateTag, unstable_cache } from "next/cache"
import { after } from "next/server"
import { communitySlugTag } from "@/lib/communities/stranger-page"

/** The backstop, in seconds, for a writer that clears no tag. */
export const COMMUNITY_PUBLIC_HOLD_SECONDS = 60

export const communityPublicTag = (communityId: string) => `community-public:${communityId}`

/** The cards on a creator's page (its Communities tab): one creator's published, public communities. */
export const communityCardsTag = (creatorId: string) => `community-cards:${creatorId}`

/**
 * The creator's tags, written out here so the community pages do not load the
 * product page's cache module to name them; tests/public-delivery.test.ts
 * holds them equal to lib/commerce/product-page-cache creatorTag (a new name
 * or photo) and lib/onepage/public-cache shopProductsTag (a product changed).
 */
export const communityCreatorTags = (creatorId: string | null | undefined): string[] => (creatorId ? [`creator:${creatorId}`, `shop-products:${creatorId}`] : [])

/** Every tag a community's held public reads carry. */
export const communityTags = (community: { id: string; creator_id?: string | null }): string[] => [communityPublicTag(community.id), ...communityCreatorTags(community.creator_id)]

/** Read inside a held read: a failure is counted, so the answer is served once and not held. */
const failures = new AsyncLocalStorage<{ failed: number }>()

/** Called by a read that answered "nothing" because it failed (not because there was nothing). */
export function noteHeldReadFailure(): void {
  const store = failures.getStore()
  if (store) store.failed++
}

class NotHeld<T> extends Error {
  constructor(readonly value: T) {
    super("a read failed, so the answer is not held")
  }
}

/**
 * A read held for every visitor under `tags`, for COMMUNITY_PUBLIC_HOLD_SECONDS
 * at most. Outside Next (a script, a suite with no incremental cache) it is
 * read directly. A read during which anything failed is answered and not held.
 */
export async function heldCommunityRead<T>(read: () => Promise<T>, key: string[], tags: string[]): Promise<T> {
  const guarded = async (): Promise<T> => {
    const store = { failed: 0 }
    const value = await failures.run(store, read)
    if (store.failed > 0) throw new NotHeld(value)
    return value
  }
  try {
    return await unstable_cache(guarded, key, { revalidate: COMMUNITY_PUBLIC_HOLD_SECONDS, tags })()
  } catch (e) {
    if (e instanceof NotHeld) return e.value as T
    if (e instanceof Error && /incrementalCache missing/.test(e.message)) return read()
    throw e
  }
}

/**
 * A community's public page changed: the next visitor reads it afresh, and its creator's page draws its card afresh.
 * Never in the way of the write it follows.
 */
export function communityPublicChanged(communityId: string | null | undefined, creatorId?: string | null, slug?: string | null): void {
  if (!communityId) return
  try {
    revalidateTag(communityPublicTag(communityId), { expire: 0 })
    if (creatorId) revalidateTag(communityCardsTag(creatorId), { expire: 0 })
    /* Round 63: and the copy the CDN holds for strangers under its address (lib/communities/stranger-page.ts). */
    if (slug) revalidateTag(communitySlugTag(slug), { expire: 0 })
  } catch (e) {
    /* Outside a request (a script, a test) there is no cache to clear. */
    console.warn(`[community-cache] ${communityId} not cleared: ${(e as Error).message}`)
  }
}

/**
 * The same, once the request that wrote has answered (next/server `after`),
 * for a gate that runs before the write. Outside a request it clears now.
 */
export function communityPublicChangedAfter(communityId: string | null | undefined, creatorId?: string | null, slug?: string | null): void {
  if (!communityId) return
  try {
    after(() => communityPublicChanged(communityId, creatorId, slug))
  } catch {
    communityPublicChanged(communityId, creatorId, slug)
  }
}

/**
 * ===========================================================================
 *  THE PUBLISHED ONEPAGE, READ ONCE PER REQUEST, FOR EVERYTHING THAT SHOWS IT
 * ===========================================================================
 * The page (app/(marketing)/l/[slug]/page.tsx, which /{handle}/links runs),
 * its metadata, and its share image (app/(marketing)/[sellername]/links/
 * share.png) all need the same row, the same owner and the same name and
 * face. They were built inside the page file; the share image needs them too,
 * so they live here and each caller reads the same answer. React `cache`
 * keeps it to one read per request for the page and its metadata, and
 * Next's data cache to one read for every visitor until the page changes
 * (lib/onepage/public-cache).
 */
import "server-only"
import { createHash } from "node:crypto"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { isBanned } from "@/lib/seo/bans"
import type { SpamState } from "@/lib/security/spam-signals"
import { activeDomainOf } from "@/lib/website-builder/site-seo-data"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { resolveOnePageSeo, type ResolvedOnePageSeo } from "@/lib/onepage/seo"
import { resolveOnePageAddress, type OnePageAddress } from "@/lib/onepage/resolve-address"
import { supabaseOnePageLookup } from "@/lib/onepage/address-lookup"
import { SiteReadError } from "@/lib/website-builder/site-read"
import { withLiveProducts, type ProductsDb } from "@/lib/onepage/live-products"
import { withStorelibBlocks } from "@/lib/onepage/storelib-blocks-server"
import { ONE_PAGE_HOLD_SECONDS, heldRead, onePageNameTag, onePageOwnerTag, onePageShopTag, shopProductsTag } from "@/lib/onepage/public-cache"
import { creatorDomainsTag } from "@/lib/custom-domains/store"

/**
 * WHOSE ONEPAGE THIS IS, AND WHETHER A SEARCH ENGINE MAY LIST IT
 *
 *   handle      the owner's username, which the page is canonical under:
 *               storelib.me/<handle>, or /links on their connected
 *               domain, where the proxy serves the same page
 *   banned      an operator banned the owner: the page is not served at all,
 *               as their products are not (lib/seo/bans.ts)
 *
 * The creator row is read whole (`*`), the way the product page reads it, so
 * a column one database has and another does not cannot fail the read.
 * profiles.avatar_url and profiles.display_name are the single source of
 * truth: Settings and Store Builder both sync to them (lib/account/profile-follow).
 */
/*
  HELD FOR EVERY VISITOR (lib/onepage/public-cache): the same owner for the
  same page, under the owner's tag (a new name, photo, handle or ban) and the
  store's (its published product count, its domain), for a minute at most
  when nothing clears it. React's cache keeps it to one read of the held copy
  per request, for the page and its metadata.
*/
export const onePageOwner = cache((sellerId: string | null, creatorId: string | null, ownerId: string | null) => {
  const effective = sellerId || creatorId || null
  const tags = [
    ...(ownerId ? [onePageOwnerTag(ownerId)] : []),
    ...(effective ? [onePageShopTag(effective), shopProductsTag(effective), creatorDomainsTag(effective)] : []),
  ]
  return heldRead(() => readOnePageOwner(sellerId, creatorId, ownerId), ["onepage-owner", "v1", sellerId ?? "", creatorId ?? "", ownerId ?? ""], {
    tags,
    revalidate: ONE_PAGE_HOLD_SECONDS,
  })
})

async function readOnePageOwner(sellerId: string | null, creatorId: string | null, ownerId: string | null) {
  const supabase = createAdminClient()
  const effective = sellerId || creatorId || null
  /*
    The operator's spam verdict comes with the profile (round 41, lib/seo/bans.ts): one read, as before. A database
    without the column (before part 20260815) answers the read without it.
  */
  const readProfile = async (userId: string | null): Promise<{ data: unknown }> => {
    if (!userId) return { data: null }
    const withVerdict = await supabase.from("profiles").select("avatar_url, display_name, username, spam_state").eq("id", userId).maybeSingle()
    if (!withVerdict.error) return withVerdict
    const fallback = await supabase.from("profiles").select("avatar_url, display_name, username").eq("id", userId).maybeSingle()
    if (fallback.error) throw new SiteReadError("onepage profile", "The profile could not be read")
    return fallback
  }
  const readCount = (id: string | null) =>
    id ? supabase.from("products").select("id", { count: "exact", head: true }).eq("creator_id", id).eq("status", "published") : Promise.resolve({ count: 0 })
  /*
    A PAGE THAT NAMES ITS CREATOR AND ITS OWNER (every page made since
    seller_id existed) gives every read below its key up front, so they
    are asked together: one round trip in place of three in a row, on a
    page drawn for every visitor. The answers are the same reads'.
  */
  const together = effective && ownerId
    ? Promise.all([
        supabase.from("creators").select("*").eq("id", effective).maybeSingle(),
        readProfile(ownerId),
        readCount(effective),
        activeDomainOf(effective),
      ])
    : null
  const { data: creator } = together
    ? (await together)[0]
    : effective
      ? await supabase.from("creators").select("*").eq("id", effective).maybeSingle()
      : ownerId
        ? await supabase.from("creators").select("*").eq("user_id", ownerId).maybeSingle()
        : { data: null }
  const row = creator as { id?: string; user_id?: string | null; banned_at?: string | null } | null
  const userId = ownerId || row?.user_id || null
  const { data: profile } = together ? (await together)[1] : await readProfile(userId)
  const id = row?.id ?? effective
  const [products, domain] = together
    ? [(await together)[2], (await together)[3]]
    : await Promise.all([readCount(id), id ? activeDomainOf(id) : Promise.resolve(null)])
  const handle = (profile as { username?: string | null } | null)?.username || null
  const verdict = (profile as { spam_state?: string | null } | null)?.spam_state
  const spamState: SpamState = verdict === "clear" || verdict === "suspect" || verdict === "confirmed" ? verdict : null
  return {
    handle,
    /* The seller the page's products belong to, for a page row that does not name one. */
    creatorId: id || null,
    banned: isBanned(row),
    spamState,
    avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url || null,
    displayName: (profile as { display_name?: string | null } | null)?.display_name || null,
    publishedProducts: (products as { count?: number | null }).count ?? 0,
    canonical: handle ? (domain ? getLinksUrlWithCustomDomain(handle, domain) : getLinksShareUrl(handle)) : null,
  }
}

export type OnePageOwner = Awaited<ReturnType<typeof readOnePageOwner>>

/**
 * THE PAGE'S BLOCKS WITH EVERY PRODUCT READ FROM ITS ROW (lib/onepage/live-products),
 * once per request for the same blocks: the metadata names the products
 * the body draws, and both asked the catalogue for them, two round trips
 * each. Keyed by the blocks themselves, so blocks that differ are read for
 * themselves, and held for every visitor until a product changes (below).
 */
const liveBlocksOnce = cache((creatorId: string, blocksJson: string) => {
  /*
    HELD FOR EVERY VISITOR (lib/onepage/public-cache), keyed by the blocks'
    own fingerprint, so a publish that changes them is a new entry, and tagged
    by the store, so a product saved, archived or deleted clears it at once
    (app/api/revalidate, app/api/internal/invalidate, lib/products/forget-product).
  */
  const fingerprint = createHash("sha256").update(blocksJson).digest("base64url")
  return heldRead(
    async () => {
      const db = createAdminClient()
      const products = await withLiveProducts(db as unknown as ProductsDb, creatorId, JSON.parse(blocksJson) as unknown[])
      /* The shelf, the posts and the follower count, read now (lib/onepage/storelib-blocks-server); a page with none of them reads nothing more. */
      return withStorelibBlocks(db, creatorId, products)
    },
    ["onepage-live-blocks", "v1", creatorId, fingerprint],
    { tags: [onePageShopTag(creatorId), shopProductsTag(creatorId)], revalidate: ONE_PAGE_HOLD_SECONDS },
  )
})
export function liveBlocksFor<T>(creatorId: string, blocks: T): Promise<T> {
  if (blocks === null || blocks === undefined) return withLiveProducts(createAdminClient() as unknown as ProductsDb, creatorId, blocks)
  return liveBlocksOnce(creatorId, JSON.stringify(blocks)) as Promise<T>
}

/*
  WHAT IS HELD OF THE ROW IS WHAT A VISITOR IS SHOWN. The draft blocks, the
  blocks put aside and the draft theme and links are the editor's, and the
  live page reads them only for a page that has never been published with a
  copy of its own (lib/onepage/public-shape: published first, the row's after).
  So once a published copy is there, the draft is not kept beside it in a
  cache every visitor is served from.
*/
export function publishedOnly<Row extends Record<string, unknown>>(row: Row): Row {
  if (!row || typeof row !== "object") return row
  const held: Record<string, unknown> = { ...row }
  if (Array.isArray(row.published_blocks)) {
    delete held.draft_blocks
    delete held.archived_blocks
  }
  if (row.published_theme) delete held.theme
  if (row.published_social_links) delete held.social_links
  return held as Row
}

/**
 * WHERE A NAME LEADS, READ ONCE PER REQUEST (lib/onepage/resolve-address):
 * the page at that address, the page of the account with that username, the
 * creator page of an account with no OnePage, or the address a renamed page
 * or account has now. The page, its metadata and its share image all read
 * this one answer.
 *
 * A LOOKUP THAT FAILED IS NOT A NAME THAT LEADS NOWHERE. It used to be read
 * as "missing", so a bio link answered 404 to visitors and crawlers whenever
 * the database was slow. Now each query has a deadline
 * (ONE_PAGE_LOOKUP_ATTEMPT_MS) and the whole lookup a budget
 * (ONE_PAGE_LOOKUP_BUDGET_MS); a lookup that failed or ran out serves the
 * last answer this instance had for the name, and with none it THROWS a
 * SiteReadError: the page shows its error screen with Try again, never its
 * not found. Only a lookup that answered "nothing" is missing.
 */
/*
  HELD FOR EVERY VISITOR (lib/onepage/public-cache), under the name it was
  asked by: a OnePage's visitors all ask that one. Every answer is held, a
  page, a creator page, a renamed address and nothing at all, because each is
  what the next visitor would be told too, and a held answer that goes stale
  is replaced by what the name leads to now, never kept: a name that stopped
  leading to a page answers "nothing" after its minute, and at once when the
  writer clears it. Publishing, a new address and a new username clear every
  name involved (onePageChangedFor), so a page published a second ago is
  never a held 404. A lookup that FAILED is thrown, which unstable_cache never
  keeps, and the next visitor asks again.
*/
export const ONE_PAGE_LOOKUP_ATTEMPT_MS = 4000
export const ONE_PAGE_LOOKUP_BUDGET_MS = 8000

/* The last answer per name on this instance, bounded, oldest out first: what a failed lookup serves. */
const LAST_GOOD_ADDRESS = new Map<string, OnePageAddress<any>>()
const LAST_GOOD_MAX = 300
function rememberAddress(slug: string, answer: OnePageAddress<any>) {
  LAST_GOOD_ADDRESS.delete(slug)
  if (answer.kind === "missing") return
  LAST_GOOD_ADDRESS.set(slug, answer)
  if (LAST_GOOD_ADDRESS.size > LAST_GOOD_MAX) {
    const oldest = LAST_GOOD_ADDRESS.keys().next().value
    if (oldest !== undefined) LAST_GOOD_ADDRESS.delete(oldest)
  }
}

export const resolveOnePage = cache(async (slug: string): Promise<OnePageAddress<any>> => {
  const key = slug.toLowerCase()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const outOfTime = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${ONE_PAGE_LOOKUP_BUDGET_MS}ms`)), ONE_PAGE_LOOKUP_BUDGET_MS)
    })
    const answer = await Promise.race([
      heldRead(
        async (): Promise<OnePageAddress<any>> => {
          const answer = await resolveOnePageAddress<any>(slug, supabaseOnePageLookup<any>(createAdminClient() as never, "*", { attemptMs: ONE_PAGE_LOOKUP_ATTEMPT_MS }))
          return answer.kind === "page" ? { ...answer, page: publishedOnly(answer.page) } : answer
        },
        ["onepage-address", "v1", slug],
        { tags: [onePageNameTag(slug)], revalidate: ONE_PAGE_HOLD_SECONDS },
      ),
      outOfTime,
    ])
    rememberAddress(key, answer)
    return answer
  } catch (e) {
    const why = e instanceof Error ? e.message : "the lookup failed"
    const held = LAST_GOOD_ADDRESS.get(key)
    if (held) {
      console.warn("[onepage] served the last good copy", { slug: key, why })
      return held
    }
    console.warn("[onepage] page unavailable", { slug: key, why })
    throw new SiteReadError("onepage address", why)
  } finally {
    if (timer) clearTimeout(timer)
  }
})

/**
 * ONE READ OF THE PAGE, FOR THE TAB, THE BODY AND THE SHARE IMAGE: by its
 * address in any case, then by the owner whose username the name is
 * (storelib.me/<name>, which the proxy serves from /<name>/links with the
 * name as the slug). Both lookups are lib/onepage/address-lookup's, the
 * same ones the proxy asks for an old address.
 */
export const findPublishedOnePage = cache(async (slug: string) => {
  const address = await resolveOnePage(slug)
  return address.kind === "page" ? address.page : null
})

/** The shape the page is drawn from, with the owner's live name and photo to fall back on. */
export function publishedShape(
  onepage: Parameters<typeof publicOnePage>[0],
  owner: OnePageOwner,
  extra: { customDomain?: string | null; sellerId?: string | null } = {},
) {
  return publicOnePage(onepage, {
    source: "published",
    displayName: owner.displayName,
    /* The live photo, for a page that has no picture of its own, and for one
       whose copy is still the picture a sign in provider sent (lib/account/identity). */
    liveAvatarUrl: owner.avatarUrl,
    ...extra,
  })
}

/**
 * The address the page is shared at: <creator page domain>/links, or
 * storelib.me/<handle> under the owner's own handle, which is the one the
 * sitemap lists. The page's own name there when there is no handle.
 */
export async function onePageAddress(onepage: { seller_id?: string | null; creator_id?: string | null }, owner: OnePageOwner, slug: string) {
  if (owner.canonical) return owner.canonical
  const pageHost = await primaryHostFor(onepage.seller_id || onepage.creator_id || null, "creator_page")
  return getLinksShareUrl(slug, pageHost)
}

/**
 * The page's search and share fields, from the published copy: what the
 * editor's Settings previewed from the draft that was published
 * (lib/onepage/seo resolveOnePageSeo, the same function on both sides).
 */
export async function publishedOnePageSeo(
  onepage: any,
  owner: OnePageOwner,
  slug: string,
  { liveProducts = false }: { liveProducts?: boolean } = {},
): Promise<{ seo: ResolvedOnePageSeo; drawn: ReturnType<typeof publishedShape> }> {
  const drawn = publishedShape(onepage, owner)
  /*
    THE DESCRIPTION NAMES ONLY WHAT A VISITOR SEES (lib/onepage/seo-description):
    the published blocks, with each product read from its row as the page
    body reads it (lib/onepage/live-products), so an archived, unpublished or
    deleted product is never named. Only the metadata asks for this; the
    share pictures draw no text and skip the read.
  */
  const blocks = liveProducts ? await liveBlocksFor(drawn.seller_id || owner.creatorId || "", drawn.blocks) : drawn.blocks
  const pageUrl = await onePageAddress(onepage, owner, slug)
  const seo = resolveOnePageSeo({
    name: drawn.title,
    bio: drawn.bio,
    blocks,
    socialLinks: drawn.social_links,
    handle: onepage.slug || slug,
    avatarUrl: drawn.avatar_url,
    theme: drawn.theme,
    settings: onepage.settings,
    /* The picture a shared link shows (lib/onepage/seo shareImageModeOf): the column, read live like the settings. */
    shareImageMode: onepage.share_image_mode,
    pageUrl,
  })
  return { seo, drawn }
}

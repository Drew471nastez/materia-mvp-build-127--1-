/**
 * ===========================================================================
 *  THE PUBLISHED ONEPAGE, READ ONCE PER REQUEST, FOR EVERYTHING THAT SHOWS IT
 * ===========================================================================
 * The page (app/(marketing)/l/[slug]/page.tsx, which /{handle}/links runs),
 * its metadata, and its share image (app/(marketing)/[sellername]/links/
 * share.png) all need the same row, the same owner and the same name and
 * face. They were built inside the page file; the share image needs them too,
 * so they live here and each caller reads the same answer. React `cache`
 * keeps it to one read per request for the page and its metadata.
 */
import "server-only"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { isBanned } from "@/lib/seo/bans"
import { activeDomainOf } from "@/lib/website-builder/site-seo-data"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { resolveOnePageSeo, type ResolvedOnePageSeo } from "@/lib/onepage/seo"

/**
 * WHOSE ONEPAGE THIS IS, AND WHETHER A SEARCH ENGINE MAY LIST IT
 *
 *   handle      the owner's username, which the page is canonical under:
 *               storelib.com/<handle>/links, or /links on their connected
 *               domain, where the proxy serves the same page
 *   banned      an operator banned the owner: the page is not served at all,
 *               as their products are not (lib/seo/bans.ts)
 *
 * The creator row is read whole (`*`), the way the product page reads it, so
 * a column one database has and another does not cannot fail the read.
 * profiles.avatar_url and profiles.display_name are the single source of
 * truth: Settings and Store Builder both sync to them (lib/account/profile-follow).
 */
export const onePageOwner = cache(async (sellerId: string | null, creatorId: string | null, ownerId: string | null) => {
  const supabase = createAdminClient()
  const effective = sellerId || creatorId || null
  const { data: creator } = effective
    ? await supabase.from("creators").select("*").eq("id", effective).maybeSingle()
    : ownerId
      ? await supabase.from("creators").select("*").eq("user_id", ownerId).maybeSingle()
      : { data: null }
  const row = creator as { id?: string; user_id?: string | null; banned_at?: string | null } | null
  const userId = ownerId || row?.user_id || null
  const { data: profile } = userId
    ? await supabase.from("profiles").select("avatar_url, display_name, username").eq("id", userId).maybeSingle()
    : { data: null }
  const id = row?.id ?? effective
  const [products, domain] = await Promise.all([
    id
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("creator_id", id).eq("status", "published")
      : Promise.resolve({ count: 0 }),
    id ? activeDomainOf(id) : Promise.resolve(null),
  ])
  const handle = (profile as { username?: string | null } | null)?.username || null
  return {
    handle,
    banned: isBanned(row),
    avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url || null,
    displayName: (profile as { display_name?: string | null } | null)?.display_name || null,
    publishedProducts: (products as { count?: number | null }).count ?? 0,
    canonical: handle ? (domain ? getLinksUrlWithCustomDomain(handle, domain) : getLinksShareUrl(handle)) : null,
  }
})

export type OnePageOwner = Awaited<ReturnType<typeof onePageOwner>>

/**
 * ONE READ OF THE PAGE, FOR THE TAB, THE BODY AND THE SHARE IMAGE: by its
 * slug, then by the owner whose username the slug is (username.storelib.com/
 * links and /<handle>/links, where the proxy passes the handle as the slug).
 */
export const findPublishedOnePage = cache(async (slug: string) => {
  const supabase = createAdminClient()
  const { data: bySlug } = await supabase.from("onepages").select("*").eq("slug", slug).eq("status", "published").maybeSingle()
  if (bySlug) return bySlug

  const { data: profile } = await supabase.from("profiles").select("id, username").ilike("username", slug).maybeSingle()
  if (!profile) return null
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", profile.id).maybeSingle()
  if (creator) {
    const { data: bySeller } = await supabase.from("onepages").select("*").eq("seller_id", creator.id).eq("status", "published").maybeSingle()
    if (bySeller) return bySeller
    const { data: byCreator } = await supabase.from("onepages").select("*").eq("creator_id", creator.id).eq("status", "published").maybeSingle()
    if (byCreator) return byCreator
  }
  const { data: byOwner } = await supabase.from("onepages").select("*").eq("owner_id", profile.id).eq("status", "published").maybeSingle()
  return byOwner ?? null
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
 * storelib.com/<handle>/links under the owner's own handle, which is the one
 * the sitemap lists. The address it was reached at when there is no handle.
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
export async function publishedOnePageSeo(onepage: any, owner: OnePageOwner, slug: string): Promise<{ seo: ResolvedOnePageSeo; drawn: ReturnType<typeof publishedShape> }> {
  const drawn = publishedShape(onepage, owner)
  const pageUrl = await onePageAddress(onepage, owner, slug)
  const seo = resolveOnePageSeo({
    name: drawn.title,
    bio: drawn.bio,
    handle: onepage.slug || slug,
    avatarUrl: drawn.avatar_url,
    theme: drawn.theme,
    settings: onepage.settings,
    pageUrl,
  })
  return { seo, drawn }
}

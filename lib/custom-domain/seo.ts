import "server-only"

/**
 * robots.txt and sitemap.xml for a domain showing the creator page or the
 * OnePage. The proxy sends those two paths on such a domain to
 * app/(marketing)/u/[username]/robots.txt and /sitemap.xml with ?shows=.
 *
 * The domain is read from the database for this creator and this target,
 * never from the request, so a request that reaches the route some other
 * way cannot make it name a domain that is not theirs. Without a live
 * domain showing that target there is nothing to list.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorIndexable, productIndexable, type SitemapEntry } from "@/lib/seo/indexing"
import { domainSitemapUrls } from "./routing"
import { liveOriginOf } from "./server"

export async function domainSeo(
  username: string,
  shows: "creator_page" | "onepage",
): Promise<{ origin: string; entries: SitemapEntry[]; indexable: boolean } | null> {
  const admin = createAdminClient()
  const handle = username.toLowerCase()
  const { data: profile } = await admin.from("profiles").select("id, username").ilike("username", handle).maybeSingle()
  if (!profile) return null
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle()
  const creatorId = (creator as { id: string } | null)?.id
  if (!creatorId) return null

  const origin = await liveOriginOf(creatorId, shows)
  if (!origin) return null

  const [{ data: products }, { data: onepage }] = await Promise.all([
    admin.from("products").select("slug, status, updated_at").eq("creator_id", creatorId).eq("status", "published").limit(5000),
    admin
      .from("onepages")
      .select("id")
      .or(`creator_id.eq.${creatorId},seller_id.eq.${creatorId}`)
      .eq("status", "published")
      .limit(1)
      .maybeSingle(),
  ])
  const rows = (products ?? []) as { slug: string | null; status: string | null; updated_at: string | null }[]
  const listed = rows.filter((p) => productIndexable(p, handle))
  const indexable = creatorIndexable({ publishedProducts: rows.length, handle })
  const entries = domainSitemapUrls({
    origin,
    shows,
    creatorIndexable: indexable,
    onepageLive: Boolean(onepage),
    products: listed.map((p) => ({ slug: p.slug as string, lastModified: p.updated_at })),
  }).map((e) => ({ url: e.url, lastModified: e.lastModified ?? null }))
  return { origin, entries, indexable: indexable || shows === "onepage" }
}

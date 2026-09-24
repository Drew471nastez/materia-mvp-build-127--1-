import "server-only"

/**
 * Which addresses changed when a creator saved something, for IndexNow
 * (lib/seo/indexnow.ts). Each function answers with the public addresses a
 * search engine should look at again, and nothing for an account whose
 * handle the spam rules refuse: an engine told about a link farm's page is
 * an engine helping it.
 *
 * An address is sent whether the page just appeared or just went away. An
 * engine told that a page changed fetches it again, and a page that is now a
 * 404 or noindex is dropped sooner that way than by waiting for a crawl.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { getLinksShareUrl, getProductShareUrl } from "@/lib/url-helpers"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { BASE, siteSitemap } from "./sitemaps"
import { submitToIndexNow, indexNowKey } from "./indexnow"

type Admin = ReturnType<typeof createAdminClient>

const notSpam = (handle: string | null | undefined): handle is string =>
  !!handle && deservesIndexing({ publishedProducts: 1, handle })

async function handleOfCreator(admin: Admin, creatorId: string): Promise<string | null> {
  const { data: creator } = await admin.from("creators").select("user_id, slug").eq("id", creatorId).maybeSingle()
  const c = creator as { user_id?: string; slug?: string } | null
  if (!c?.user_id) return c?.slug ?? null
  const { data: profile } = await admin.from("profiles").select("username").eq("id", c.user_id).maybeSingle()
  return (profile as { username?: string } | null)?.username ?? c.slug ?? null
}

/** A product: its page, its creator's page, and the same product on their website. */
export async function productAddresses(productId: string, creatorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: product }, handle] = await Promise.all([
    admin.from("products").select("slug, creator_id").eq("id", productId).maybeSingle(),
    handleOfCreator(admin, creatorId),
  ])
  const p = product as { slug?: string; creator_id?: string } | null
  if (!p?.slug || p.creator_id !== creatorId || !notSpam(handle)) return []
  const urls = [getProductShareUrl(handle, p.slug), `${BASE}/${handle}`]
  const site = await siteSitemap(handle)
  if (site && site.entries.length > 0) urls.push(`${site.origin}/products/${encodeURIComponent(p.slug)}`, `${site.origin}/products`)
  return urls
}

/** A creator's own pages on storelib.com. */
export async function profileAddresses(creatorId: string): Promise<string[]> {
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  return notSpam(handle) ? [`${BASE}/${handle}`, getLinksShareUrl(handle)] : []
}

/** Every page of a creator's published website, at its canonical origin. */
export async function websiteAddresses(creatorId: string): Promise<string[]> {
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  if (!notSpam(handle)) return []
  const site = await siteSitemap(handle)
  if (!site) return []
  /* Unpublished or noindex: the front page, so engines see it went. */
  return site.entries.length > 0 ? site.entries.map((e) => e.url) : [`${site.origin}/`]
}

/** For `after()`: work out the addresses and send them, never throwing. */
export async function announce(addresses: () => Promise<string[]>): Promise<void> {
  if (!indexNowKey()) return
  try {
    await submitToIndexNow(await addresses())
  } catch (e) {
    console.warn("[indexnow] not announced:", (e as Error).message)
  }
}

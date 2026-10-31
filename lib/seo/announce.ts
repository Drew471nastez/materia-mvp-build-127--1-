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
import { getLinksShareUrl, getLinksUrlWithCustomDomain, getProductShareUrl, getStoreShareUrl } from "@/lib/url-helpers"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { isBanned } from "./bans"
import { activeDomainOf, formerSiteAddresses } from "@/lib/website-builder/site-seo-data"
import { BASE, siteSitemap } from "./sitemaps"
import { submitToIndexNow, indexNowKey } from "./indexnow"

type Admin = ReturnType<typeof createAdminClient>

const notSpam = (handle: string | null | undefined): handle is string =>
  !!handle && deservesIndexing({ handle })

/**
 * The handle a creator's pages live under, or null, which every function
 * below reads as "announce nothing". A banned creator has none: their pages
 * are coming down, and the row is read whole so a database without the
 * column simply has no bans (lib/seo/bans.ts).
 */
async function handleOfCreator(admin: Admin, creatorId: string, evenIfBanned = false): Promise<string | null> {
  const { data: creator } = await admin.from("creators").select("*").eq("id", creatorId).maybeSingle()
  const c = creator as { user_id?: string; slug?: string; banned_at?: string | null } | null
  /* A ban being announced is the one time a banned creator's addresses are wanted: so engines drop them (bannedCreatorAddresses). */
  if (isBanned(c) && !evenIfBanned) return null
  if (!c?.user_id) return c?.slug ?? null
  const { data: profile } = await admin.from("profiles").select("username").eq("id", c.user_id).maybeSingle()
  return (profile as { username?: string } | null)?.username ?? c.slug ?? null
}

/** The website's shop as its sitemap lists it: /collections/all on an imported theme, where /products redirects (round 45). */
function shopOf(site: { origin: string; entries: { url: string }[] }): string {
  const all = `${site.origin}/collections/all`
  return site.entries.some((e) => e.url === all) ? all : `${site.origin}/products`
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
  const [site, pageHost] = await Promise.all([siteSitemap(handle), activeDomainOf(creatorId)])
  if (site && site.entries.length > 0) urls.push(`${site.origin}/products/${encodeURIComponent(p.slug)}`, shopOf(site))
  urls.push(...onPageDomain(handle, pageHost, p.slug))
  return urls
}

/**
 * The same pages on the creator page's own domain, where their canonicals
 * point once it is live (lib/seo/creator-domain.ts). The storelib.com
 * addresses are still sent: an engine that fetches them reads the canonical
 * and moves the page over sooner.
 */
function onPageDomain(handle: string, pageHost: string | null, slug?: string): string[] {
  if (!pageHost) return []
  return slug ? [getProductShareUrl(handle, slug, pageHost), getStoreShareUrl(handle, pageHost)] : [getStoreShareUrl(handle, pageHost), getLinksShareUrl(handle, pageHost)]
}

/**
 * A product that was deleted, by the slug it had: where it was, so an engine
 * looks, finds nothing and drops it. The row is gone, so the slug comes from
 * the screen that deleted it, and is believed only when no product of this
 * creator still has it.
 */
export async function removedProductAddresses(slug: string, creatorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: still }, handle] = await Promise.all([
    admin.from("products").select("id").eq("creator_id", creatorId).eq("slug", slug).maybeSingle(),
    handleOfCreator(admin, creatorId),
  ])
  if (still || !notSpam(handle)) return []
  const urls = [getProductShareUrl(handle, slug), `${BASE}/${handle}`]
  const [site, pageHost] = await Promise.all([siteSitemap(handle), activeDomainOf(creatorId)])
  if (site && site.entries.length > 0) urls.push(`${site.origin}/products/${encodeURIComponent(slug)}`, shopOf(site))
  urls.push(...onPageDomain(handle, pageHost, slug))
  return urls
}

/** A creator's own pages on storelib.com, and on their creator page's domain when it is live. */
export async function profileAddresses(creatorId: string): Promise<string[]> {
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  if (!notSpam(handle)) return []
  return [`${BASE}/${handle}`, getLinksShareUrl(handle), ...onPageDomain(handle, await activeDomainOf(creatorId))]
}

/**
 * A OnePage, found by its owner's account: storelib.me/<handle>, and
 * /links on their connected domain when they have one, which is where its
 * canonical points (app/(marketing)/l/[slug]).
 */
export async function onePageAddresses(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: profile }, { data: creator }] = await Promise.all([
    admin.from("profiles").select("username").eq("id", userId).maybeSingle(),
    admin.from("creators").select("*").eq("user_id", userId).maybeSingle(),
  ])
  const handle = (profile as { username?: string | null } | null)?.username ?? null
  if (!notSpam(handle) || isBanned(creator as { banned_at?: string | null } | null)) return []
  const creatorId = (creator as { id?: string } | null)?.id
  const domain = creatorId ? await activeDomainOf(creatorId) : null
  return domain ? [getLinksUrlWithCustomDomain(handle, domain), getLinksShareUrl(handle)] : [getLinksShareUrl(handle)]
}

/** A site built with Storelib AI, at the address it was published to (lib/sites/publish.ts). */
export async function aiSiteAddresses(creatorId: string, url: string): Promise<string[]> {
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  return notSpam(handle) ? [`${url.replace(/\/+$/, "")}/`] : []
}

/** Every page of a creator's published website, at its canonical origin. */
export async function websiteAddresses(creatorId: string): Promise<string[]> {
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  if (!notSpam(handle)) return []
  const site = await siteSitemap(handle)
  /*
    TAKEN DOWN, there is no published site left for the sitemap to read, and
    this answered nothing at the one moment an engine most needs telling. The
    pages it had are still on the install it was (formerSiteAddresses).
  */
  if (!site) return formerSiteAddresses(creatorId, handle)
  /* Published but noindex: the front page, so engines see it went. */
  return site.entries.length > 0 ? site.entries.map((e) => e.url) : [`${site.origin}/`]
}

/**
 * A collection of the creator's website (round 45): its page under each
 * slug given (a rename sends the old one, now a 404, and the new), and the
 * collections list that links it. Only while a website is published and
 * open to search engines, at its canonical origin; nothing otherwise.
 */
export async function collectionAddresses(creatorId: string, ...slugs: Array<string | null | undefined>): Promise<string[]> {
  const wanted = [...new Set(slugs.map((s) => (s ?? "").trim().toLowerCase()).filter((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)))]
  if (wanted.length === 0) return []
  const handle = await handleOfCreator(createAdminClient(), creatorId)
  if (!notSpam(handle)) return []
  const site = await siteSitemap(handle)
  if (!site || site.entries.length === 0) return []
  return [...wanted.map((s) => `${site.origin}/collections/${s}`), `${site.origin}/collections`]
}

/**
 * ===========================================================================
 *  TAKEN DOWN BY STORELIB (round 45 leftovers)
 * ===========================================================================
 * An admin ban closes a creator's page and unpublishes their products
 * (app/api/admin/creators/moderate). Every function above answers nothing
 * for a banned creator, which is right for a save and wrong for the ban
 * itself: that is the moment an engine most needs telling the pages went.
 * So this one reads the handle even though the ban is already written, and
 * names what was public a moment ago: their page, their OnePage, the
 * products that were published (by the slugs read before the ban) and their
 * website. An engine told fetches each, finds a 404 or a noindex, and drops
 * it, the same as for a delete. The spam rule still holds: a link farm's
 * pages are never announced, not even as gone.
 */
export async function bannedCreatorAddresses(creatorId: string, productSlugs: string[] = []): Promise<string[]> {
  const admin = createAdminClient()
  const handle = await handleOfCreator(admin, creatorId, true)
  if (!notSpam(handle)) return []
  const slugs = [...new Set(productSlugs.filter((s) => typeof s === "string" && s.length > 0))]
  const [site, pageHost] = await Promise.all([siteSitemap(handle), activeDomainOf(creatorId)])
  const urls = [`${BASE}/${handle}`, getLinksShareUrl(handle), ...onPageDomain(handle, pageHost)]
  for (const slug of slugs) urls.push(getProductShareUrl(handle, slug), ...(pageHost ? [getProductShareUrl(handle, slug, pageHost)] : []))
  if (site) urls.push(...(site.entries.length > 0 ? site.entries.map((e) => e.url) : [`${site.origin}/`]), ...slugs.map((slug) => `${site.origin}/products/${encodeURIComponent(slug)}`))
  else urls.push(...(await formerSiteAddresses(creatorId, handle).catch(() => [] as string[])))
  return [...new Set(urls)]
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

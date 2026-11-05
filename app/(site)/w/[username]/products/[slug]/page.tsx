import { notFound, permanentRedirect } from "next/navigation"
import { websitePageLanguage } from "@/lib/seo/page-language"
import type { Metadata } from "next"
import { productMetadata, productStructuredData, renamedProductSlug, renderProduct } from "@/components/website-builder/theme/render-product"
import { creatorByName, publishedShopByName } from "@/lib/website-builder/published-site"
import { productUrl } from "@/lib/website-builder/site-seo"
import { builtSiteIndexable } from "@/lib/seo/indexing"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { siteLocale } from "@/lib/website-builder/site-language"
import { siteIconUrl } from "@/lib/website-builder/site-icon"
import { ownHostIcons } from "@/lib/website-builder/site-favicon"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageAlternates, siteLanguages, siteLocalizer } from "@/lib/markets/live"
import { localizedPath } from "@/lib/markets/locales"
import { siteStoreName } from "@/lib/website-builder/tab-title"
import { breadcrumbJsonLd } from "@/lib/website-builder/breadcrumbs"
import { jsonLdScript } from "@/lib/website-builder/site-seo"

/**
 * HELD FOR A MINUTE, like the pages of the site around it.
 *
 * This was `force-dynamic`, so every visit to a product, and every hover
 * that prefetched one (lib/website-builder/prefetch-rules.ts), drew the page
 * again from about eight database reads, and nothing about it could be kept
 * at the edge. Nothing here depends on who is asking: the product is read
 * with the server's client (render-product.tsx), the cart is the browser's.
 *
 * Fresh where it matters. A save purges this address
 * (revalidatePublishedProduct, from app/api/revalidate), a publish, archive
 * or take down purges the whole site, and a price or stock count changed
 * anywhere else clears the shop tag the page was drawn from. The rest is a
 * minute at most, the same as the catalogue under it, and checkout prices
 * and counts stock again itself (lib/checkout/pricing.ts), so a page a
 * minute old never sells something that is gone.
 */
export const revalidate = 3600

/** Empty on purpose: it is what lets a product page be kept (see ../../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string; slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: segment, slug } = await params
  /* "andrew~fr": the product in French (lib/markets/site-name.ts). */
  const { name: username, locale } = splitSiteName(segment)
  const creator = await creatorByName(username)
  if (!creator) return productMetadata(slug)
  const [origin, found, langs] = await Promise.all([siteOrigin(creator.creatorId, username), publishedShopByName(username), siteLanguages(creator.creatorId)])
  const path = `/products/${encodeURIComponent(slug)}`
  const pageLocale = (locale && langs.others.find((l) => l.toLowerCase() === locale)) || null
  const settings = found.kind === "site" ? (found.site.themeSettings as Record<string, unknown>) : {}
  /* The store's name as every page of the site says it (lib/website-builder/tab-title.ts). */
  const brand = siteStoreName({ brandName: settings.brand_name, storeName: found.kind === "site" ? found.site.profile?.storeName : null, displayName: creator.displayName, handle: creator.slug || username })
  /* The site's own rule: its switch, and not under a handle the spam rules hold back. */
  /* In the page's language, the default's included (a store whose default is not the language its products are written in). */
  const localizer = await siteLocalizer(creator.creatorId, pageLocale)
  const meta = await productMetadata(slug, { inLanguage: localizer ? (p) => localizer.product(p) : undefined, url: pageLocale ? `${origin}${localizedPath(path, pageLocale, langs.defaultLanguage)}` : productUrl(origin, slug), brand, indexable: builtSiteIndexable(settings, username), creatorId: creator.creatorId, locale: siteLocale(settings) })
  /* The site's own icon in the tab, as on its other pages: the favicon, or its logo (site-icon.ts). */
  /* The site's own icon, on its own host (lib/website-builder/site-favicon.ts). */
  const ownIcons = found.kind === "site" ? ownHostIcons(origin, siteIconUrl(settings, found.site.pages.home ?? found.site.sections)) : undefined
  /* The product in every language of the website, for search engines (hreflang). */
  const languages = await languageAlternates(creator.creatorId, origin, path)
  const withLanguages = languages ? { ...meta, alternates: { ...(meta.alternates ?? {}), languages } } : meta
  return ownIcons ? { ...withLanguages, icons: ownIcons.icons, manifest: ownIcons.manifest } : withLanguages
}

/**
 * ===========================================================================
 *  A PRODUCT, AT THE ADDRESS THE SITE ACTUALLY LINKS TO
 * ===========================================================================
 * Every product card, Product Featured and the header's link picker emit
 * `/products/<slug>`. On a built site that is `<name>.storelib.com/products/
 * <slug>`, which the proxy forwards to `/w/<name>/products/<slug>` — and
 * there was no route here, so every product link on every published site was
 * a 404. The one thing that leads to a sale was the one thing that did not
 * work.
 *
 * The address names an owner, so it is held to it: a product belonging to
 * somebody else is not at this address.
 */
export default async function SiteProductPage({ params }: PageProps) {
  const { username: segment, slug } = await params
  const { name: username, locale, market } = splitSiteName(segment)
  const creator = await creatorByName(username)
  if (!creator) notFound()
  /* A renamed product's old address: its new one, for good (308), in the same language. */
  const renamed = await renamedProductSlug(slug, creator.creatorId)
  if (renamed) {
    const langs = locale ? await siteLanguages(creator.creatorId) : null
    const pageLocale = (locale && langs?.others.find((l) => l.toLowerCase() === locale)) || null
    const path = `/products/${encodeURIComponent(renamed)}`
    permanentRedirect(pageLocale && langs ? localizedPath(path, pageLocale, langs.defaultLanguage) : path)
  }
  const [origin, localizer, langs, shop] = await Promise.all([
    siteOrigin(creator.creatorId, username),
    siteLocalizer(creator.creatorId, locale).catch(() => null),
    siteLanguages(creator.creatorId).catch(() => null),
    publishedShopByName(username).catch(() => null),
  ])
  /* The page's language as ThemePage sets its lang, for the JSON-LD (lib/seo/page-language.ts); unknown, left out. */
  const language = websitePageLanguage(langs, locale, shop?.kind === "site" ? (shop.site.themeSettings as Record<string, unknown>) : null)
  const [page, structured] = await Promise.all([
    renderProduct(slug, { creatorId: creator.creatorId, locale, market }),
    productStructuredData(slug, { url: productUrl(origin, slug), seller: creator.displayName, creatorId: creator.creatorId, inLanguage: localizer ? (p) => localizer.product(p) : undefined, language }),
  ])
  /* Where the product sits on the website (Home › Shop › the product), which a search result shows in place of the bare address. */
  const productName = structured ? String((JSON.parse(structured) as { name?: unknown }).name ?? "") : ""
  const crumbs = productName
    ? jsonLdScript(breadcrumbJsonLd([{ name: creator.displayName, url: `${origin}/` }, { name: "Shop", url: `${origin}/products` }, { name: productName, url: productUrl(origin, slug) }]))
    : null
  return (
    <>
      {/* What puts the price and the picture in a search result. */}
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />}
      {crumbs && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />}
      {page}
      {/* The store's analytics and ad pixels (Settings › Integrations). */}
      <StoreTracking creatorId={creator.creatorId} productSlug={slug} />
    </>
  )
}

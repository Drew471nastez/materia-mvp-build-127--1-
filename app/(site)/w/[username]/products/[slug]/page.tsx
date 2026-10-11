import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { productMetadata, productStructuredData, renderProduct } from "@/components/website-builder/theme/render-product"
import { creatorByName, publishedShopByName } from "@/lib/website-builder/published-site"
import { productUrl } from "@/lib/website-builder/site-seo"
import { builtSiteIndexable } from "@/lib/seo/indexing"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { siteLocale } from "@/lib/website-builder/site-language"
import { siteIcons } from "@/lib/website-builder/site-icon"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageAlternates, siteLanguages } from "@/lib/markets/live"
import { localizedPath } from "@/lib/markets/locales"

/**
 * RENDERED PER REQUEST, unlike the pages of the site around it.
 *
 * Everything here is the catalogue: a price, whether the last one sold, a Buy
 * button that starts a purchase. The catalogue is already cached for a minute
 * on its own (see `creatorShopTag` in lib/website-builder/published-site.ts),
 * and holding the page on top of that would add a second minute to a
 * corrected price on a live shop. The page around it is held; this is not.
 */
export const dynamic = "force-dynamic"

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
  const brand = typeof settings.brand_name === "string" && settings.brand_name.trim() ? settings.brand_name.trim() : creator.displayName
  /* The site's own rule: its switch, and not under a handle the spam rules hold back. */
  const meta = await productMetadata(slug, { url: pageLocale ? `${origin}${localizedPath(path, pageLocale, langs.defaultLanguage)}` : productUrl(origin, slug), brand, indexable: builtSiteIndexable(settings, username), creatorId: creator.creatorId, locale: siteLocale(settings) })
  /* The site's own icon in the tab, as on its other pages: the favicon, or its logo (site-icon.ts). */
  const icons = found.kind === "site" ? siteIcons(settings, found.site.pages.home ?? found.site.sections) : undefined
  /* The product in every language of the website, for search engines (hreflang). */
  const languages = await languageAlternates(creator.creatorId, origin, path)
  const withLanguages = languages ? { ...meta, alternates: { ...(meta.alternates ?? {}), languages } } : meta
  return icons ? { ...withLanguages, icons } : withLanguages
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
  const { name: username, locale } = splitSiteName(segment)
  const creator = await creatorByName(username)
  if (!creator) notFound()
  const origin = await siteOrigin(creator.creatorId, username)
  const [page, structured] = await Promise.all([
    renderProduct(slug, { creatorId: creator.creatorId, locale }),
    productStructuredData(slug, { url: productUrl(origin, slug), seller: creator.displayName, creatorId: creator.creatorId }),
  ])
  return (
    <>
      {/* What puts the price and the picture in a search result. */}
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />}
      {page}
      {/* The store's analytics and ad pixels (Settings › Integrations). */}
      <StoreTracking creatorId={creator.creatorId} />
    </>
  )
}

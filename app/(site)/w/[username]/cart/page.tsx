import { notFound, redirect } from "next/navigation"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { chromeSections } from "@/lib/website-builder/shop-page"
import { chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { getMainDomain } from "@/lib/url-helpers"
import { siteMetadata } from "../render-site"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageChoice, siteLocalizer } from "@/lib/markets/live"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"

/**
 * ===========================================================================
 *  THE CART, ON THE CREATOR'S OWN SITE
 * ===========================================================================
 * Built with the creator's header and footer and the cart between them, the
 * same way the shop and the search page are built, so a shopper never leaves
 * the site to look at what they have chosen.
 *
 * NOT INDEXED. It is one visitor's basket. There is nothing here for a
 * crawler and a cart in a search index is a page that is empty for everyone
 * who finds it.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: segment } = await params
  /* "Your cart | <store>", as every other page names itself (lib/website-builder/tab-title.ts). */
  const base = await siteMetadata(splitSiteName(segment).name, undefined, "cart", null, { page: { kind: "cart" } })
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteCartPage({ params }: PageProps) {
  /* /fr/cart: the cart in French, its header, footer and the shop's own words (lib/markets). */
  const { username: segment } = await params
  const { name: username, locale, market } = splitSiteName(segment)

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site: own, products, productCount } = found
  const [localizer, language] = await Promise.all([siteLocalizer(own.creatorId, locale, market), languageChoice(own.creatorId, locale, market)])
  /* Its menus, its own words and its search engine text in this language too, as on the home page (lib/markets/translate localizeTheme). */
  const site = localizer ? { ...own, themeSettings: localizer.theme(own.themeSettings as Record<string, unknown>) as typeof own.themeSettings } : own
  /* The header and footer, with any placeholder in them filled in, in the page's language. */
  /*
    AND THE CART TEMPLATE'S OWN SECTIONS (round N, N3): a website the AI designed stores a "cart" page whose
    sections are drawn under the cart itself (delivery notes, reassurance, suggestions), in its own header and
    footer. A site without one is drawn exactly as before. Coded sections (the AI's header too) are drawn by
    the template engine here, as on every other page: without the prerender a .storelib header drew nothing.
  */
  const cartOwn = (site.pages.cart ?? []).filter((s) => !s.group && s.type !== "header" && s.type !== "footer")
  const chrome = cartOwn.length ? withUniversalChrome(cartOwn, chromeOf(site.pages.home ?? site.sections)) : chromeSections(site.pages.home ?? site.sections)
  const cards = localizer ? localizer.cards(products) : products
  const { sections, data } = await dressPage(site, localizer ? localizer.sections(chrome, site.sources) : chrome, cards, productCount, "cart", "Cart", undefined, { cached: true, localizer })
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "cart", cards, undefined, data)

  /* The theme's default surface, resolved on the server: the cart is not a
     section and has no section settings of its own to resolve from. */
  const resolved = resolveSectionColors(site.themeSettings as unknown as Record<string, unknown>, {
    color_scheme: "white",
  })
  const scheme = { ...resolved.legacy, ...resolved.scheme } as Record<string, string>
  const radius = Number((site.themeSettings as Record<string, unknown>).radius_medium ?? 12) || 12

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "cart" }}>
    {/* The cart is a page of the website too: one view, with its own path. */}
    <TrackView creatorId={site.creatorId} />
    <StoreTracking creatorId={site.creatorId} />
    <ThemePage
      theme={site.themeSettings}
      sections={sections}
      storefront={{ creatorId: site.creatorId, installId: site.installId, language, words: localizer?.words, display: localizer?.display, currency: await cachedStoreCurrency(site.creatorId) }}
    >
      <CartPageBody
        radius={radius}
        palette={{
          bg: scheme.bg ?? "#ffffff",
          text: scheme.text ?? "#111111",
          heading: scheme.heading ?? "#111111",
          border: scheme.inset_border ?? "#e5e7eb",
          buttonBg: scheme.primary_btn_bg ?? "#111111",
          buttonText: scheme.primary_btn_text ?? "#ffffff",
        }}
      />
    </ThemePage>
    </StorelibSourcesProvider>
  )
}

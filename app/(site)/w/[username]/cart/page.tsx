import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { chromeSections } from "@/lib/website-builder/shop-page"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { getMainDomain } from "@/lib/url-helpers"
import { siteMetadata } from "../render-site"
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
  const { username } = await params
  const base = await siteMetadata(username, undefined, "products")
  return { ...base, title: "Cart", robots: { index: false, follow: false } }
}

export default async function SiteCartPage({ params }: PageProps) {
  const { username } = await params

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products, productCount } = found
  /* The header and footer, with any placeholder in them filled in. */
  const { sections } = await dressPage(site, chromeSections(site.pages.home ?? site.sections), products, productCount, "cart", "Cart")

  /* The theme's default surface, resolved on the server: the cart is not a
     section and has no section settings of its own to resolve from. */
  const resolved = resolveSectionColors(site.themeSettings as unknown as Record<string, unknown>, {
    color_scheme: "white",
  })
  const scheme = { ...resolved.legacy, ...resolved.scheme } as Record<string, string>
  const radius = Number((site.themeSettings as Record<string, unknown>).radius_medium ?? 12) || 12

  return (
    <>
    {/* The cart is a page of the website too: one view, with its own path. */}
    <TrackView creatorId={site.creatorId} />
    <StoreTracking creatorId={site.creatorId} />
    <ThemePage
      theme={site.themeSettings}
      sections={sections}
      storefront={{ creatorId: site.creatorId, installId: site.installId }}
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
    </>
  )
}

import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { publishedShopByName } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { shopSections } from "@/lib/website-builder/shop-page"
import { siteMetadata, type SiteSearchParams } from "../render-site"

/** Same reasoning as the rest of /w: see the comment in ../page.tsx. */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  searchParams?: Promise<SiteSearchParams>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username } = await params
  // "Shop | brand", through the same metadata rules as every other page.
  return siteMetadata(username, await searchParams, "products")
}

/**
 * ===========================================================================
 *  EVERYTHING THIS CREATOR SELLS, IN THEIR OWN CHROME
 * ===========================================================================
 * The themes ship with "Shop" in the nav pointing at `/products`, and the
 * product grid's own "See everything" button points there too. Nothing has
 * ever served it, on any address: the link was in every new site and led
 * nowhere.
 *
 * It is not a page in the database and should not become one, because it has
 * no editable content of its own: it is the site's header and footer around
 * the products the creator sells, which is exactly what the product grid
 * section already draws from the shop. So it is composed here from pieces
 * that are already cached, and a creator who wants a different shop page can
 * still make one and name it themselves.
 */
export default async function SiteShopPage({ params }: PageProps) {
  const { username } = await params

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products } = found
  const sections = shopSections(site.pages.home ?? site.sections, site.themeSettings)
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.products", products)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.products" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
        emptyDetail="Nothing in the shop yet."
      />
    </StorelibSourcesProvider>
  )
}
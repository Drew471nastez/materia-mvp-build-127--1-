import { headers } from "next/headers"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { publishedSiteByName } from "@/lib/website-builder/published-site"
import { notFoundSections } from "@/lib/website-builder/not-found-page"

/**
 * ===========================================================================
 *  NOT FOUND, IN THE SITE'S OWN VOICE
 * ===========================================================================
 * Every `notFound()` under /w lands here: a page key the site has not
 * published, a product that belongs to somebody else, an address nobody
 * made. It used to be Storelib's own 404 — a grey "Page not found" and a
 * button reading "Explore Storelib" — which on a creator's shop looks like
 * the shop is broken and then sends the visitor to another website.
 *
 * A not-found boundary is not given the segment's params, so the site is
 * read from `x-storelib-site`, which proxy.ts sets on the rewritten request.
 * Without it, or for a name that resolves to nothing, this falls back to the
 * plain message: there is no site to speak in the voice of.
 */
export default async function SiteNotFound() {
  /**
   * Read in a try, because the pages under this boundary are held at the
   * edge for a minute and a header read is a dynamic one: if Next refuses it
   * while generating, the answer must still be a 404 page rather than a
   * crash. Without the header there is no site to speak in the voice of, so
   * it falls back to the plain message below.
   */
  let name: string | null = null
  try {
    name = (await headers()).get("x-storelib-site")
  } catch {
    name = null
  }
  const found = name ? await publishedSiteByName(name) : { kind: "missing" as const }

  if (found.kind !== "site") {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-[28px] font-semibold text-[#1a1a2e]">That page is not here</h1>
        <p className="text-[15px] text-[#6b7280]">The link may be old, or the page may have moved.</p>
      </main>
    )
  }

  const { site } = found
  const sections = notFoundSections(site.pages.home ?? site.sections, site.themeSettings)
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "404", [])

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "404" }}>
      <ThemePage theme={site.themeSettings} sections={sections} storefront={{ creatorId: site.creatorId, installId: site.installId }} />
    </StorelibSourcesProvider>
  )
}

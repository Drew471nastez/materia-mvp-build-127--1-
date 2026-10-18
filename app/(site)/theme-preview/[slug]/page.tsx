import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, type PageOwner } from "@/lib/website-builder/published-site"
import { withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { pageTitleFromKey } from "@/lib/website-builder/site-pages"
import { buildThemePreset, getThemeDefinition } from "@/lib/website-builder/theme-registry"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { LISTING_SLUG_RE, hasLivePreview } from "@/lib/themes/marketplace-shared"
import { listingBySlug, storedPreview } from "@/lib/themes/marketplace-server"

/**
 * ===========================================================================
 *  A MARKETPLACE THEME, LIVE, WITH NOBODY'S SHOP IN IT
 * ===========================================================================
 * What the preview frame on storelib.com/themes/<slug> holds: the theme's
 * home page drawn by the same engine as every website (ThemePage, the
 * theme's own section files through StorelibSourcesProvider), from data
 * alone. Storelib's own theme from its preset, an uploaded package from the
 * preview its upload kept (lib/themes/marketplace-server.ts). There is no
 * creator: product grids show the theme's own placeholders, and a form
 * sends nothing.
 *
 * Framed only by storelib.com itself, and only with ?embedded=1 (proxy.ts).
 * Never indexed.
 */
export const revalidate = 300

export const metadata: Metadata = {
  title: "Theme preview",
  robots: { index: false, follow: false, nocache: true },
}

/** No creator owns a preview: every read keyed by this id finds nothing. */
const NOBODY = "00000000-0000-0000-0000-000000000000"

async function previewData(slug: string): Promise<{ settings: ThemeSettingsValues; sections: SectionInstance[]; sources: Record<string, string>; name: string } | null> {
  if (!LISTING_SLUG_RE.test(slug)) return null
  const listing = await listingBySlug(slug)
  if (!listing || !hasLivePreview(listing)) return null
  if (listing.builtinThemeId) {
    const def = getThemeDefinition(listing.builtinThemeId)
    if (!def) return null
    const preset = buildThemePreset(def)
    return { settings: preset.settings, sections: preset.pages.home as SectionInstance[], sources: {}, name: listing.name }
  }
  const stored = await storedPreview(listing.id, listing.createdAt)
  return stored ? { ...stored, name: listing.name } : null
}

export default async function ThemePreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await previewData(decodeURIComponent(slug))
  if (!data) notFound()

  const owner: PageOwner = {
    creatorId: NOBODY,
    displayName: data.name,
    themeSettings: data.settings,
    sources: data.sources,
    profile: { name: data.name, headline: "", bio: "", avatar: "" },
  }
  const sections = withUniversalChrome(repairChrome(sanitizeSections(data.sections), kindLookup(data.sources, SECTION_SCHEMAS as never)).sections, {})
  const dressed = await dressPage(owner, sections, [], null, "index", pageTitleFromKey("home"), undefined, { cached: true })
  const prerendered = renderWithSources(data.sources, dressed.sections, data.settings, "index", [], undefined, dressed.data)

  return (
    <div data-theme-preview={slug}>
      <StorelibSourcesProvider prerendered={prerendered} page={{ template: "index" }}>
        <ThemePage theme={data.settings} sections={dressed.sections} storefront={{}} emptyDetail="Your products show here." />
      </StorelibSourcesProvider>
    </div>
  )
}

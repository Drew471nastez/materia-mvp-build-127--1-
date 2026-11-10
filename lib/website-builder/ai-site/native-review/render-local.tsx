/**
 * ===========================================================================
 *  A NATIVE DRAFT DRAWN IN THIS PROCESS, BY THE LIVE SITE'S OWN RENDERERS
 * ===========================================================================
 * For Node outside Next (the tests, the scripts in scripts/): the page is
 * drawn with exactly what app/(site)/w/[username]/render-site.tsx draws a
 * page with, from a draft held in memory:
 *
 *   withUniversalChrome     home's header and footer on every page
 *   renderWithSources       the .storelib sections drawn on the server
 *   ThemePage               the page: chrome, ordering, the theme's CSS
 *   SectionRenderer         every native React section, behind its boundary
 *
 * rendered to static markup (react-dom/server) after every lazily loaded
 * renderer has been loaded, so no section is left to a Suspense fallback.
 *
 * NOT FOR THE APP'S SERVER. Next compiles route handlers as React server
 * code, where these client components are references, not components, and
 * react-dom/server is not allowed. Production draws the same page by asking
 * the site's own route for it (./render-remote.ts). Nothing on a route's
 * import path may import this file.
 *
 * The app's compiled stylesheet is handed in (`css`): the tests compile
 * app/site.css with the project's Tailwind (scripts/site-css.cjs, as the
 * build does) and pass it here.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { preloadSectionRenderers } from "@/components/website-builder/sections/registry"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { templateForPage, pageTitleFromKey } from "@/lib/website-builder/site-pages"
import { chromeOf, homeChromeOnly, withUniversalChrome, CHROMELESS_PAGES, withoutChrome } from "@/lib/website-builder/universal-chrome"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ShotPage } from "@/lib/ai-builder/visual-critic/shoot"
import { nativeCriticDocument } from "./document"
import type { NativeRenderer } from "./review"

export interface LocalRenderOptions {
  /** The app's compiled stylesheet (app/site.css through Tailwind). */
  css: string
  /** The site's own .storelib files, by path (none: the theme's). */
  sources?: Record<string, string>
}

/** One page of a draft, as the live site would draw it, as the critic's document. */
export async function renderNativePageLocally(site: { settings: Record<string, unknown>; pages: Record<string, SectionInstance[]> }, page: string, opts: LocalRenderOptions): Promise<ShotPage | null> {
  await preloadSectionRenderers()
  const own = site.pages[page]
  if (!own) return null
  const theme = site.settings as unknown as ThemeSettingsValues
  const sources = opts.sources ?? {}
  const sections = CHROMELESS_PAGES.has(page)
    ? withoutChrome(own)
    : page === "home"
      ? withUniversalChrome(own, {})
      : withUniversalChrome(own, chromeOf(site.pages.home ?? [], { homeOnly: homeChromeOnly(site.settings) }))
  const template = templateForPage(page)
  const prerendered = renderWithSources(sources, sections, theme, template, [], { title: pageTitleFromKey(page) })
  const body = renderToStaticMarkup(
    <StorelibSourcesProvider prerendered={prerendered} page={{ template }}>
      <ThemePage theme={theme} sections={sections} storefront={{}} emptyDetail="Check back soon!" />
    </StorelibSourcesProvider>,
  )
  return { page, html: nativeCriticDocument({ body: `<div data-snapshot-stage="">${body}</div>`, css: opts.css }) }
}

/** The renderer the review takes (./review.ts), drawing in this process. */
export function localNativeRenderer(opts: LocalRenderOptions): NativeRenderer {
  return async (site, pages) => {
    const out: ShotPage[] = []
    for (const p of pages) {
      const doc = await renderNativePageLocally(site, p, opts)
      if (doc) out.push(doc)
    }
    return out
  }
}

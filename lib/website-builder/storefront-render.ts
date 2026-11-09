import { breadcrumbTrail } from "@/lib/products/breadcrumbs"
import { isStorelibSection, renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { headerLogoOf, themeWithHeaderLogo } from "./chrome-logo"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import type { StorefrontGlobals } from "@/lib/storelib-theme/globals"
import { eagerMedia, heroMedia } from "./media-pass"

/** How many sections at the top of a page are drawn with their pictures at once, as Shopify's image_tag does for a theme's first sections. */
export const TOP_SECTIONS = 3
/** The header and the bars above it: drawn at once, never the page's main picture. */
const CHROME_TYPE = /header|announcement|topbar|top_bar|nav|menu|marquee|ticker/i

/**
 * ===========================================================================
 *  WHAT A PUBLISHED PAGE OWES A .storelib SECTION
 * ===========================================================================
 * A section in this format is not a React component. It is a file, and it
 * becomes markup and a scoped stylesheet only when something renders it —
 * on the server, once, so the visitor's browser never receives the compiler.
 *
 * Every public route that draws a creator's sections therefore owes them
 * this step, and a route that forgets it does not fail loudly: the section
 * renders NOTHING (StorelibSection returns null off the editor, which is the
 * rule for a section that cannot be drawn). Measured before this function
 * existed: 0 characters of HTML on the product page against 3651 on the
 * storefront, for the same section.
 *
 * So the step lives here rather than in a route, and each route calls it.
 * When the next public route appears, the thing it has to remember is one
 * import, and the thing it cannot get subtly wrong is which files to read.
 */
export async function prerenderStorelibSections(
  db: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { like: (col: string, pattern: string) => PromiseLike<{ data: { path: string; content: string }[] | null }> }
      }
    }
  },
  installId: string,
  sections: SectionInstance[],
  theme: ThemeSettingsValues,
  /**
   * "index", "product", "page.about". A section reads it as `page.template`
   * and `allowed_templates` is written against it, so passing "index" from
   * the product page is not a harmless default, it is a wrong answer.
   */
  template: string,
  /**
   * The creator's published products, block-shaped, for sections that draw
   * the catalogue. Optional: a route that does not pass them renders every
   * section exactly as before, and a section asking for products draws none.
   */
  products?: ProductCard[],
  /**
   * What this page is about, for its sections to read as `page.<key>`. The
   * product page passes `{ product }`, which is how a section on it reads
   * the product it is about (`page.product`, the same shape as a card in
   * `products`). See lib/website-builder/shop-products.ts.
   */
  pageExtras?: Record<string, unknown>,
  /** The shop's own facts; see lib/website-builder/storefront-data.ts. */
  data?: StorefrontData,
  /** The store and the visitor, for the sections that read them: lib/storelib-theme/globals.ts. */
  globals?: StorefrontGlobals,
): Promise<Record<string, RenderedSection>> {
  const prerendered: Record<string, RenderedSection> = {}
  /**
   * An empty page is the only case that can skip the query. Not "no type
   * here is a known .storelib type" — a type the creator wrote themselves
   * is unknown until the files are read, and skipping on that test is how
   * their own sections would go blank again.
   */
  if (sections.length === 0) return prerendered

  /**
   * THE FILES THIS CREATOR SAVED IN THE CODE EDITOR, which are the source
   * for their own section types and the override for the theme's. Without
   * them the live site draws the bundled hero while the editor draws the
   * edited one.
   */
  const sources = await sectionSources(db, installId)
  return renderWithSources(sources, sections, theme, template, products, pageExtras, data, globals)
}

/**
 * The files half, on its own, because it is the half worth caching. It is a
 * database read that changes when somebody publishes; the render below is
 * arithmetic that changes when a product does.
 */
export async function sectionSources(
  db: Parameters<typeof prerenderStorelibSections>[0],
  installId: string,
): Promise<Record<string, string>> {
  const { data: savedFiles } = await db
    .from("store_theme_custom_files")
    .select("path, content")
    .eq("install_id", installId)
    .like("path", "%.storelib")
  const sources: Record<string, string> = {}
  for (const row of savedFiles ?? []) {
    /**
     * AN EMPTY `content` IS "NOTHING PUBLISHED FOR THIS PATH", not "an empty
     * file". A file created in the code editor and not yet published has a
     * draft and no live half; including it here would shadow the theme's own
     * file with nothing, so creating `sections/hero.storelib` to work on it
     * would blank the shipped hero on the live site. See `saveDraft`.
     */
    if (typeof row.content !== "string" || row.content.trim() === "") continue
    /* An imported Shopify theme's files are drawn by its own engine (lib/storelib-theme/compat), never by this one. */
    if (isCompatSource(row.content)) continue
    sources[row.path] = row.content
  }
  return sources
}

/**
 * The same section files from a whole set of live files (a release's,
 * lib/website-builder/site-releases.ts), by the same rules as above: a
 * `.storelib` file with text, and not an imported Shopify theme's.
 */
export function sourcesFromFiles(files: Record<string, string>): Record<string, string> {
  const sources: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".storelib") || typeof content !== "string" || content.trim() === "") continue
    if (isCompatSource(content)) continue
    sources[path] = content
  }
  return sources
}

/**
 * The render half, on its own, because it touches no database at all. Thirty
 * sections come out in single-digit milliseconds once their files are
 * compiled, and the compiler keeps its own cache, so a page can be rendered
 * per request from cached inputs rather than held whole. That is what lets
 * a price change in the shop reach a published site in a minute while the
 * page around it stays cached until somebody publishes.
 */
export function renderWithSources(
  sources: Record<string, string>,
  sections: SectionInstance[],
  theme: ThemeSettingsValues,
  template: string,
  products?: ProductCard[],
  /**
   * What this particular page knows that its sections cannot work out for
   * themselves. The search page's query is the first of these: it belongs to
   * the request rather than to the section, so it is not a setting somebody
   * could be asked to keep in step, and it is not something the section can
   * read on its own.
   */
  pageExtras?: Record<string, unknown>,
  /** The shop's own facts; see lib/website-builder/storefront-data.ts. */
  data?: StorefrontData,
  /**
   * The store (`shop`) and, on a page drawn for one visitor, who they are
   * (`customer`) and what they saved (`wishlist`). lib/storelib-theme/globals.
   */
  globals?: StorefrontGlobals,
): Record<string, RenderedSection> {
  const prerendered: Record<string, RenderedSection> = {}
  /* Where this page is, for the Breadcrumbs section: Home > Shop > the
     product, Home > the page's title (lib/products/breadcrumbs.ts). Worked
     out once per page from what the page already knows. */
  const about = pageExtras?.product as { settings?: { title?: unknown } } | undefined
  const page = {
    breadcrumbs: breadcrumbTrail({
      template,
      title: typeof pageExtras?.title === "string" ? pageExtras.title : null,
      product: { title: typeof about?.settings?.title === "string" ? about.settings.title : data?.product?.title ?? null },
    }),
    ...pageExtras,
    template,
  }
  /* A coded header or footer reads the logo uploaded in the built-in header's panel when Branding has none (./chrome-logo.ts). */
  const drawnTheme = themeWithHeaderLogo(theme, headerLogoOf(sections))
  /*
    THE TOP OF THE PAGE IS NOT LAZY (./media-pass.ts eagerMedia, heroMedia).
    The first TOP_SECTIONS sections a visitor sees are drawn at once, and the
    first picture of the first one that is not the header's is the page's
    largest paint: asked for with fetchpriority="high".
  */
  let shown = 0
  let heroDone = false
  for (const section of sections) {
    const visible = !section.hidden
    const top = visible && shown < TOP_SECTIONS
    if (visible) shown++
    if (!isStorelibSection(section.type, sources)) continue
    const out = renderStorelibSection(section, drawnTheme, page, sources, products, data, globals)
    if (out.ok) {
      let html = out.html
      if (top) {
        const hero = !heroDone && !CHROME_TYPE.test(section.type) ? heroMedia(html) : null
        if (hero !== null) {
          html = hero
          heroDone = true
        } else html = eagerMedia(html)
      }
      prerendered[section.id] = { html, css: out.css, script: out.script, capabilities: out.capabilities }
    }
  }
  return prerendered
}

/**
 * ===========================================================================
 *  AN ABOUT PAGE FOR A WEBSITE BUILT BEFORE ROUND 66, WITHOUT A REBUILD (round 67)
 * ===========================================================================
 * The owner: Liam's About page "is not built at all, it's like nothing".
 * Measured on liam-bailey.storelib.com/pages/about (round 67): the menu links
 * /pages/about (five links), the website has no "about" page, so the theme's
 * plain page template drew a heading "About" over an empty body. The admin
 * built website was made before round 66, when tailor.ts left the template's
 * sample About out and did not write one of its own; aboutPage() has written
 * one since, but only into a website built again.
 *
 * So a website the admin console built (publish.ts ADMIN_BUILT_KEY, or the
 * home page tailor.ts writes: its hero and its products) whose menu links
 * /pages/about and which has no About page is given, when it is drawn, the
 * page aboutPage() writes, from what the website already holds: the store's
 * name, the creator's photo (the one its share card uses), the bio and the
 * products heading its home page shows, the social links in its theme
 * settings, and its products. Nothing is written to the database; the
 * website is drawn with it, live and in a preview link, until the creator
 * builds an About page of their own (theirs is then the one drawn).
 *
 * Pure: the site's parts in, the page's sections out.
 */
import type { CreatorSiteContent } from "./content"
import { MATERIA_SOCIAL_SETTINGS, plainText } from "./content"
import { aboutPage } from "./tailor"

type Section = { id: string; type: string; group?: unknown; settings?: Record<string, unknown>; blocks?: { id: string; type: string; settings?: Record<string, unknown> }[] }

export interface AboutFallbackInput {
  /** The install's settings (where the admin console's mark is kept). */
  settings: Record<string, unknown>
  /** The theme's setting values (social links). */
  themeValues: Record<string, unknown>
  pages: Record<string, readonly Section[]>
  /** Every address the website's menus link to. */
  menuLinks: readonly string[]
  products: readonly { id: string; title?: string | null; handle?: string | null; slug?: string | null }[]
  shopName: string
  avatar: string | null
  /** The theme's own name for a section type ("Image-and-video-text"), and whether it has that section. */
  typeOf: (type: string) => string
  hasSection: (type: string) => boolean
}

/** publish.ts ADMIN_BUILT_KEY, written here so drawing a page never loads the publish code. */
const ADMIN_BUILT_KEY = "storelib_admin_built"

const TYPES = ["Image-and-video-text", "text-columns", "products-listing"]

/** A website the admin console built: its mark, or the home page tailor.ts writes (a hero, then the products). */
export function looksAdminBuilt(settings: Record<string, unknown>, home: readonly Section[] | undefined): boolean {
  const mark = settings[ADMIN_BUILT_KEY]
  if (mark && typeof mark === "object" && (mark as { by?: unknown }).by === "admin") return true
  const middle = (home ?? []).filter((s) => !s.group)
  const ids = middle.map((s) => s.id)
  return ids.length > 0 && ids.every((id) => id === "hero" || id === "products" || id === "about") && ids.includes("products") && middle.some((s) => /products-listing/i.test(s.type))
}

/** The About page's sections, as a page row holds them (header and footer come from home), or null when it has one or needs none. */
export function aboutFallbackSections(input: AboutFallbackInput): Section[] | null {
  const { pages } = input
  if (pages.about?.length || pages["about-us"]?.length) return null
  if (!input.menuLinks.some((l) => /^\/(?:pages\/)?about\/?(?:[?#].*)?$/i.test(l))) return null
  if (!looksAdminBuilt(input.settings, pages.home)) return null
  if (!TYPES.every((t) => input.hasSection(input.typeOf(t)))) return null

  const home = (pages.home ?? []).filter((s) => !s.group)
  const blockText = (s: Section | undefined, id: string) => plainText(s?.blocks?.find((b) => b.id === id)?.settings?.text ?? "")
  const about = home.find((s) => s.id === "about")
  const listing = home.find((s) => /products-listing/i.test(s.type))
  const socials: Record<string, string> = {}
  for (const key of MATERIA_SOCIAL_SETTINGS) {
    const v = input.themeValues[key]
    if (typeof v === "string" && /^https:\/\/\S+$/i.test(v.trim())) socials[key] = v.trim()
  }
  const content: CreatorSiteContent = {
    creatorId: "",
    name: input.shopName,
    handle: null,
    bio: blockText(about, "text"),
    avatar: input.avatar && /^https?:\/\//i.test(input.avatar) ? input.avatar : null,
    logo: null,
    hero: { image: null, heading: "", subheading: "" },
    productsHeading: blockText(listing, "heading"),
    socials,
    products: input.products.map((p) => ({ id: p.id, title: p.title ?? "", slug: p.handle ?? p.slug ?? null })),
    sources: {},
    leftOut: [],
  }
  const page = aboutPage(content) as { sections: Record<string, { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown> }>; block_order?: string[] }>; order: string[] }
  return page.order.map((id) => {
    const s = page.sections[id]
    const order = s.block_order ?? Object.keys(s.blocks ?? {})
    return { id: `about-${id}`, type: input.typeOf(s.type), settings: s.settings ?? {}, blocks: order.map((b) => ({ id: b, type: s.blocks![b].type, settings: s.blocks![b].settings ?? {} })) }
  })
}

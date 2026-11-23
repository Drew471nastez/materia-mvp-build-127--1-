import { classifyImportedSection, normalizeWords } from "./section-categories"

/**
 * ===========================================================================
 *  THE ORDER OF "ALL" IN ADD A SECTION (round 58)
 * ===========================================================================
 * The owner: "order the sections the way a person building a site actually
 * thinks: start with what makes a page (hero, featured products or
 * collection, image with text, rich text, testimonials and so on). Do not
 * start with announcement bars or utility sections; put those later,
 * grouped sensibly."
 *
 * All used to be the theme's own file order, which for an imported theme is
 * alphabetical: Materia's All opened on "Annoucment Bar Scrolling", "Back to
 * top" and four more announcement bars. Now every section is given a kind
 * (the same reading of its names that files it under a category,
 * section-categories.ts), and All lists the kinds in the order a page is
 * built, top to bottom. Within a kind, the plainest of it comes first (`lead`:
 * a hero called a hero before a promo banner, a featured product before a
 * quick add button), then the theme's general sections before the ones made
 * for a single template (see `familyPrefixes`), and otherwise the theme's
 * own order is kept.
 *
 * The order is data: each kind with the reason it sits where it does.
 */
export const ALL_SECTIONS_ORDER = [
  /* What makes a page, roughly in the order a page is read. */
  { kind: "hero", why: "Almost every page opens with one: the first thing anybody adds.", lead: /\bhero\b|image banner/ },
  { kind: "slideshow", why: "The other way to open a page: several heroes in turn." },
  { kind: "products", why: "A store's page shows what it sells next: a featured product or a grid of them.", lead: /featured product|products? (grid|carousel|listing|showcase)|product spotlight/ },
  { kind: "collections", why: "Or the ranges it sells: a featured collection, a list of collections.", lead: /featured collection|collection list|collections display|collection banner/ },
  { kind: "image-with-text", why: "The everyday content section: a picture beside a few lines and a button." },
  { kind: "rich-text", why: "A heading and a paragraph: the plainest way to say something." },
  { kind: "testimonials", why: "Proof, once the page has said what is on offer: reviews and quotes.", lead: /testimonial/ },
  { kind: "features", why: "Benefits, icons, steps and comparisons: the detail under the offer.", lead: /benefit|multi ?column|\bicons?\b/ },
  { kind: "media", why: "Galleries, video and before and after: pictures that carry a page on their own.", lead: /gallery|\bvideo\b|\bimage\b/ },
  { kind: "text", why: "Other text: quotes, a story, an about block." },
  { kind: "logos", why: "Logos, press and trust badges, usually low on a page." },
  { kind: "faq", why: "Questions, near the end of a page." },
  { kind: "newsletter", why: "A sign up, near the foot of a page." },
  { kind: "blog", why: "Posts from the blog, mostly on a home page's lower half." },
  { kind: "social", why: "Instagram and other feeds, at the foot." },
  { kind: "contact", why: "A form or a map: mostly a page of its own." },
  { kind: "countdown", why: "A timer: for a sale or a launch, not for every page." },
  /* Utility: added once, or rarely, and never what a page starts with. */
  { kind: "announcements", why: "Bars over the header: added once, from the Header group, not page by page." },
  { kind: "layout", why: "Dividers, spacers, breadcrumbs, headers and footers: structure, not content." },
  { kind: "popups", why: "What floats over the page: pop ups, back to top, sticky bars." },
  { kind: "other", why: "Custom code and anything the names do not place." },
] as const

export type AllSectionKind = (typeof ALL_SECTIONS_ORDER)[number]["kind"]

const RANK = new Map<string, number>(ALL_SECTIONS_ORDER.map((k, i) => [k.kind, i]))
const LEAD = new Map<string, RegExp>(ALL_SECTIONS_ORDER.flatMap((k) => ("lead" in k ? [[k.kind, k.lead] as [string, RegExp]] : [])))

const IMAGE_WITH_TEXT = /image (with|and|plus) text|text (with|and) image|image text|text image|imagewithtext|\bsplit\b|media (with|and) text|video (with|and) text/
const RICH_TEXT = /rich ?text|\brichtext/

export interface SectionOrderFacts {
  /** The category the library filed it under. */
  category: string
  type: string
  name: string
  presetName?: string
  /**
   * The category is an imported theme's kind (section-categories.ts), read
   * from these same names. Otherwise (a Storelib theme's own categories, a
   * creator's own section, an app's) the kind is read from the names here.
   */
  imported?: boolean
}

/** What a section is, for the order of All: its kind, made finer where a page builder thinks finer. */
export function sectionKind(facts: SectionOrderFacts): AllSectionKind {
  const words = normalizeWords(`${facts.presetName ?? ""} ${facts.name} ${facts.type}`)
  let category: string = facts.category
  if (!facts.imported) category = facts.category === "overlay" ? "popups" : classifyImportedSection({ type: facts.type, name: facts.name, presetName: facts.presetName })
  if (category === "media" && IMAGE_WITH_TEXT.test(words)) return "image-with-text"
  if (category === "text" && RICH_TEXT.test(words)) return "rich-text"
  return (RANK.has(category) ? category : "other") as AllSectionKind
}

/**
 * THE GENERAL ONES FIRST. A theme like Materia carries sections made for one
 * template each (coach-hero, course2-faq, artbooks-spreads), named with the
 * template's word first. A word that starts the names of sections of three
 * kinds or more is a template's, not a kind's ("hero_split", "hero_media"
 * are all heroes; "coach-" is a hero, a quote, steps and an offer).
 */
export function familyPrefixes(items: readonly { type: string; kind: string }[]): Set<string> {
  const kinds = new Map<string, Set<string>>()
  for (const { type, kind } of items) {
    const first = type.replace(/^sections\//, "").split(/[-_]/)[0]?.toLowerCase()
    if (!first || first === type.toLowerCase()) continue
    if (!kinds.has(first)) kinds.set(first, new Set())
    kinds.get(first)!.add(kind)
  }
  return new Set([...kinds].filter(([, k]) => k.size >= 3).map(([w]) => w))
}

/**
 * All, in the order a page is built: by kind (ALL_SECTIONS_ORDER), then the
 * plainest of a kind (`lead`), then the general sections before a template's own, then the order they came in.
 * Stable, and pure: the same list always comes out the same.
 */
export function orderForAll<T>(items: readonly T[], factsOf: (item: T) => SectionOrderFacts): T[] {
  const read = items.map((item, i) => {
    const f = factsOf(item)
    const kind = sectionKind(f)
    const lead = LEAD.get(kind)?.test(normalizeWords(`${f.presetName ?? ""} ${f.name}`)) ? 0 : 1
    return { item, i, type: f.type, kind, lead }
  })
  const families = familyPrefixes(read)
  const familyOf = (type: string) => (families.has(type.split(/[-_]/)[0]?.toLowerCase() ?? "") ? 1 : 0)
  return read
    .sort((a, b) => RANK.get(a.kind)! - RANK.get(b.kind)! || a.lead - b.lead || familyOf(a.type) - familyOf(b.type) || a.i - b.i)
    .map((r) => r.item)
}

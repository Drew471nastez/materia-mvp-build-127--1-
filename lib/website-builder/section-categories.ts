import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  WHERE AN IMPORTED THEME'S SECTIONS GO IN ADD A SECTION
 * ===========================================================================
 * An imported theme's sections are all files of the install, so Add a section
 * used to file every one of them under Created: 143 cards and one category.
 * They are the theme's sections, not the creator's, and a theme ships them in
 * kinds: heroes, testimonials, FAQs, galleries. Each is put in one of a fixed
 * set of categories by what the theme itself says about it:
 *
 *   the preset's own category, when the theme gives one (older themes do,
 *   "Testimonials", "Image With Text"), weighed most
 *   the preset's name, the section's name and its file name
 *   its block types, and the types of its settings (a product picker is a
 *   products section, a collection picker a collections one)
 *   where it may go: a section only for the Overlay group is a popup
 *
 * Every source scores the categories its words match; the highest score wins,
 * and a tie goes to the more specific kind (a "Testimonial carousel" is
 * testimonials before it is a slideshow). Nothing matched is Other. Pure and
 * deterministic: the same section always lands in the same place
 * (tests/section-categories.test.ts).
 */

export interface ImportedSectionFacts {
  /** The file name: `sections/<type>.storelib`. */
  type: string
  /** The schema's name. */
  name: string
  /** This preset's name, when it has its own. */
  presetName?: string
  /** This preset's own category, when the theme gives it one. */
  presetCategory?: string
  /** The block types the section declares, and the preset's. */
  blockTypes?: readonly string[]
  /** The types of the section's settings (`product`, `collection`, `video_url`...). */
  settingTypes?: readonly string[]
  /** Where it may be placed (enabled_on.groups). */
  groups?: readonly string[]
}

/** The categories, in the order the library lists them. Only the ones a theme has are shown. */
export const IMPORTED_SECTION_CATEGORIES = [
  { id: "hero", get label() { return tt("Hero and banners") } },
  { id: "slideshow", get label() { return tt("Slideshows") } },
  { id: "text", get label() { return tt("Text") } },
  { id: "media", get label() { return tt("Image and video") } },
  { id: "products", get label() { return tt("Products") } },
  { id: "collections", get label() { return tt("Collections") } },
  { id: "features", get label() { return tt("Features") } },
  { id: "testimonials", get label() { return tt("Testimonials") } },
  { id: "logos", get label() { return tt("Logos and trust") } },
  { id: "social", get label() { return tt("Social") } },
  { id: "faq", label: "FAQ" },
  { id: "countdown", get label() { return tt("Countdowns") } },
  { id: "newsletter", get label() { return tt("Newsletter") } },
  { id: "blog", get label() { return tt("Blog") } },
  { id: "contact", get label() { return tt("Contact") } },
  { id: "announcements", get label() { return tt("Announcements") } },
  { id: "layout", get label() { return tt("Dividers") } },
  { id: "popups", get label() { return tt("Popups") } },
  { id: "other", get label() { return tt("Other") } },
] as const

export type ImportedSectionCategory = (typeof IMPORTED_SECTION_CATEGORIES)[number]["id"]

export const IMPORTED_SECTION_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(IMPORTED_SECTION_CATEGORIES.map((c) => [c.id, c.label]))

/**
 * What each category's words are, most specific first: on a tie the earlier
 * one wins. Matched against text that is lower-cased, with `-`, `_` and `/`
 * turned into spaces and `&` into "and".
 */
const RULES: readonly { id: ImportedSectionCategory; re: RegExp }[] = [
  { id: "popups", re: /pop ?up|\bmodal\b|\boverlay\b|cookie|age verif|exit intent|back to top|notification|fake order|sticky (add|atc|cart|bar)|tab bar|quick view/ },
  { id: "announcements", re: /announcement|marquee|ticker|top ?bar\b|promo bar|notice bar/ },
  { id: "layout", re: /\bheader\b|\bfooter\b|divider|spacer|separator|breadcrumb|mega menu/ },
  { id: "faq", re: /faq|frequently asked|questions|accordion|collapsible/ },
  { id: "testimonials", re: /testimon|review|rating|feedback|what (our )?(customers|people) say|customer stor|\bugc\b/ },
  { id: "contact", re: /contact|\bmaps?\b|store locator|\blocations?\b|find us/ },
  { id: "newsletter", re: /newsletter|email sign ?up|\bsign ?up\b|subscribe|mailing list/ },
  { id: "blog", re: /blog|article|\bposts?\b|journal|\bnews\b/ },
  { id: "countdown", re: /countdown|count down|\btimers?\b|coming soon/ },
  { id: "logos", re: /logo|\bpress\b|as seen|trust|payment icon|guarantee|\bbadges?\b|certif|\bpartners?\b/ },
  { id: "social", re: /instagram|social|tiktok|youtube|\bfeed\b/ },
  { id: "collections", re: /collection|categor|lookbook/ },
  { id: "products", re: /product|shop the look|shoppable|bundle|upsell|cross ?sell|recommend|add ?to ?cart|\bcart\b|\bprice\b|pricing|size chart|quick (add|order)|order list|hotspot|buy (box|button)/ },
  { id: "features", re: /benefit|\bfeatures?\b|\bicons?\b|\busps?\b|multi ?column|\bcolumns\b|\bsteps?\b|how to|how it works|\bstats?\b|counter|count up|progress|compar|versus|\bvs\b|ingredient|\btabs?\b|timeline|why (us|choose)|\bspecs?\b/ },
  { id: "hero", re: /hero|banner|\bcover\b|splash|\bintro\b|jumbotron/ },
  { id: "slideshow", re: /slideshow|slider|carousel|\bslides?\b/ },
  { id: "media", re: /image|video|gallery|\bmedia\b|photo|picture|\breels?\b|collage|before (and )?after|multi ?row|mosaic|bento/ },
  { id: "text", re: /rich ?text|\btext\b|heading|\btitle\b|quote|paragraph|\bcontent\b|\babout\b|\bstory\b|\bpage\b|brand info|subtitle/ },
]

/**
 * What a section's own name settles on its own, whatever else it says: a
 * "Size chart popup" is a popup, an "Announcement bar" goes at the top, and
 * a before and after picture is a picture, however it is slid.
 */
const DECISIVE: readonly { id: ImportedSectionCategory; re: RegExp }[] = [
  { id: "popups", re: RULES[0].re },
  { id: "announcements", re: /announcement/ },
  { id: "media", re: /before (and )?after|image compar|comparison images?/ },
  { id: "other", re: /custom (html|liquid|code)/ },
]

/** A file name runs words together ("heroproduct1", "imagewithtextgrid"): the words that matter, pulled apart. */
const GLUED = /(hero|product|collection|gallery|image|video|text|rich|testimonials?|reviews?|banner|slider|slideshow|carousel|contact|form|simple|grid|list|section|button|cart|quote|wavy|hotspot|benefits?|faq|logos?|blog|newsletter|countdown|timer|social)/g

export function normalizeWords(text: string | undefined): string {
  if (!text) return ""
  return ` ${text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/.,:—–|()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `
}

/**
 * "Image with text" is an image section and "Icons with text" an icons one:
 * the words they carry are not what they are. Dropped before scoring.
 */
const withText = (s: string) => s.replace(/ (\w+) (with|and) text\b/g, " $1 ")

/** A preset category may be a locale key ("t:categories.banners"): its last part is the word. */
function declaredWords(category: string | undefined): string {
  if (!category) return ""
  const key = category.trim().match(/^t:(?:[\w-]+\.)*([\w-]+)$/)
  return normalizeWords(key ? key[1] : category)
}

function typeWords(type: string): string {
  const spaced = normalizeWords(type)
  /* Glued words are split only where a known word starts, so "richtext1" reads "rich text" and "imagewithtextgrid" reads "image with text grid". */
  const split = spaced.replace(/[a-z]+/g, (w) => (w.length > 6 ? w.replace(GLUED, " $1 ") : w)).replace(/\d+/g, " ")
  return normalizeWords(split)
}

function scoreInto(scores: Map<ImportedSectionCategory, number>, text: string, weight: number) {
  if (!text.trim()) return
  for (const rule of RULES) if (rule.re.test(text)) scores.set(rule.id, (scores.get(rule.id) ?? 0) + weight)
}

const SETTING_HINTS: Record<string, ImportedSectionCategory> = {
  product: "products",
  product_list: "products",
  collection: "collections",
  collection_list: "collections",
  blog: "blog",
  article: "blog",
  video: "media",
  video_url: "media",
}

/** The category an imported theme's section is filed under in Add a section. */
export function classifyImportedSection(facts: ImportedSectionFacts): ImportedSectionCategory {
  const groups = facts.groups ?? []
  /* Only for the Overlay group: it floats over the page. */
  if (groups.length > 0 && groups.every((g) => g === "overlay")) return "popups"

  const name = normalizeWords(facts.name)
  const preset = normalizeWords(facts.presetName)
  const type = typeWords(facts.type)
  const declared = declaredWords(facts.presetCategory)

  for (const text of [preset, name, type]) {
    for (const rule of DECISIVE) if (rule.re.test(text)) return rule.id
  }

  /* What the theme calls it: its names first. */
  const scores = new Map<ImportedSectionCategory, number>()
  scoreInto(scores, withText(preset), 4)
  if (name !== preset) scoreInto(scores, withText(name), 3)
  scoreInto(scores, withText(type), 3)
  scoreInto(scores, withText(declared), 3.5)
  /* Only when the names say nothing: what it is made of, and where it may go. */
  if (scores.size === 0) {
    scoreInto(scores, normalizeWords([...new Set(facts.blockTypes ?? [])].join(" ")), 1)
    for (const t of new Set(facts.settingTypes ?? [])) {
      const hint = SETTING_HINTS[t]
      if (hint) scores.set(hint, (scores.get(hint) ?? 0) + 2)
    }
    if (groups.length > 0 && groups.every((g) => g === "header")) scores.set("announcements", (scores.get("announcements") ?? 0) + 2)
    if (groups.length > 0 && groups.every((g) => g === "header" || g === "footer")) scores.set("layout", (scores.get("layout") ?? 0) + 3)
  }

  let best: ImportedSectionCategory = "other"
  let bestScore = 0
  /* RULES is in tie order: a later category has to beat, not equal, an earlier one. */
  for (const rule of RULES) {
    const s = scores.get(rule.id) ?? 0
    if (s > bestScore) {
      best = rule.id
      bestScore = s
    }
  }
  return best
}

/**
 * ===========================================================================
 *  APPS: STORELIB'S OWN, IN EVERY THEME
 * ===========================================================================
 * Sections that belong to one of Storelib's apps rather than to the theme:
 * Storelib Reviews' sections and its widgets (lib/reviews/widgets). They
 * are filed under an Apps heading at the end of Add a section, in the
 * app's own category, in a Storelib theme and an imported one alike, so a
 * store finds its review widgets in the same place whichever theme it runs.
 */
export const APP_SECTION_CATEGORIES = [{ id: "reviews", get label() { return tt("Reviews") } }] as const

const APP_SECTION_TYPES: Record<string, string> = {
  /* An imported theme's (lib/storelib-theme/compat/storelib-reviews.ts). */
  "storelib-reviews": "reviews",
  "storelib-review-widget": "reviews",
  /* A Storelib theme's (themes/default/sections/reviews_*.storelib). */
  reviews_widget: "reviews",
  reviews_product: "reviews",
  reviews_badge: "reviews",
  reviews_carousel: "reviews",
  reviews_all: "reviews",
}

/** The app category a section type is filed under, or null for a theme's own section. */
export function appSectionCategory(type: string): string | null {
  return Object.prototype.hasOwnProperty.call(APP_SECTION_TYPES, type) ? APP_SECTION_TYPES[type] : null
}

export function isAppSectionCategory(id: string): boolean {
  return APP_SECTION_CATEGORIES.some((c) => c.id === id)
}

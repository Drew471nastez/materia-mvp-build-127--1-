/**
 * ===========================================================================
 *  THE THEME MARKETPLACE: WHAT A LISTING IS, AND HOW A LIST IS NARROWED
 * ===========================================================================
 * One listing is one theme a creator can add: a name, who made it, a
 * category, a price (free, a price, or Pro plan only), a cover and its
 * screenshots. No description, by the owner's choice: the pictures and the
 * live preview say what a theme is.
 *
 * Listings live in `theme_marketplace_listings` (supabase/sql/run-now/
 * 252_theme_marketplace_and_plan_overrides.sql), written from /admin/themes.
 * Storelib's own templates are listed from code as well (CODE_TEMPLATES), so
 * the library and the marketplace have them on a fresh deploy, before that
 * SQL has run and with nothing uploaded. A row with a template's address in
 * the table only changes how it is shown.
 *
 * THE TEMPLATES (templates rounds 16 to 18). Eleven starting websites made
 * from one theme, Materia: its files once (theme-packages/materia/base) and a small
 * overlay per template (theme-packages/materia/templates/<template>). Add
 * composes the two on the server and hands the result to the import every
 * theme zip goes through (lib/themes/template-packages.ts). The native
 * Storelib Default (theme-registry.ts) is no longer listed: its code still
 * draws the websites made with it.
 *
 * Pure and client safe: the library cards, the marketplace page and the
 * admin form all read this file.
 */
import { THEME_INDUSTRIES } from "@/lib/website-builder/theme-registry"

export type ThemeTier = "free" | "paid" | "pro"
export const THEME_TIERS: readonly ThemeTier[] = ["free", "paid", "pro"]

export type ThemeSort = "featured" | "newest" | "name" | "price"
export const THEME_SORTS: readonly { id: ThemeSort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "name", label: "Name" },
  { id: "price", label: "Price" },
]

/**
 * The categories a theme is filed under: the industries the registry already
 * names, and two the marketplace has that no native theme does (templates
 * round 16: a clothing store and a fitness coach are neither "General" nor
 * "Coaching and consultants"). Round 18 removed the skincare template and
 * with it "Beauty", which nothing else was filed under.
 */
export const THEME_CATEGORIES: readonly { key: string; label: string }[] = [
  ...THEME_INDUSTRIES.map((i) => ({ key: i.key, label: i.label })),
  { key: "fashion", label: "Fashion" },
  { key: "fitness", label: "Fitness" },
]

export function categoryLabel(key: string | null | undefined): string {
  return THEME_CATEGORIES.find((c) => c.key === key)?.label ?? "General"
}

/** What kind of zip a listing carries, as the import pipeline reads it. */
export type ThemePackageKind = "storelib" | "shopify" | "export"

export interface ThemeListing {
  id: string
  slug: string
  name: string
  author: string
  authorAvatar: string | null
  category: string
  tier: ThemeTier
  /** Cents, for a paid theme. 0 otherwise. */
  priceCents: number
  /** The card's picture. A tall full page screenshot pans on hover; null draws the theme from its definition. */
  cover: string | null
  screenshots: string[]
  /** A sentence or two under the name on its marketplace page, written in /admin/themes (RUN_THEME_RELEASES.sql). */
  description?: string | null
  /** The cover at a phone's width, when one was uploaded; also screenshots[1]. */
  phoneCover?: string | null
  /** A registry theme (lib/website-builder/theme-registry.ts) this listing adds, for Storelib's own. */
  builtinThemeId: string | null
  /**
   * A template that ships with Storelib's code, as "<package>/<template>"
   * (theme-packages/<package>/templates/<template>). Add composes it on the
   * server and imports it; there is no stored zip and no table row to need.
   */
  codePackage: string | null
  /** True when there is a zip for it, stored or shipped with the code, which Add imports. */
  hasPackage: boolean
  packageKind: ThemePackageKind | null
  /** A live store made with it, shown in the preview frame when the theme cannot be drawn here. */
  demoUrl: string | null
  published: boolean
  sortOrder: number
  createdAt: string
}

/** The default template's address. It was the native theme's; the template took its place. */
export const DEFAULT_LISTING_SLUG = "storelib-default"

/** The theme package the templates are made from (theme-packages/<package>). */
export const CODE_THEME_PACKAGE = "materia"

/** One starting website: its address, its overlay folder, its name and where it is filed. */
export interface CodeTemplate {
  slug: string
  template: string
  name: string
  category: string
}

/** In the order the library shows them; the first is the default. */
export const CODE_TEMPLATES: readonly CodeTemplate[] = [
  { slug: DEFAULT_LISTING_SLUG, template: "default", name: "Storelib Default", category: "general" },
  { slug: "clothing", template: "clothing", name: "Clothing", category: "fashion" },
  { slug: "merch", template: "merch", name: "Merch", category: "creators" },
  { slug: "digital-products", template: "digital", name: "Digital products", category: "digital" },
  /* Templates round 19: digital art books, a diptych hero, subjects and a look inside, after the owner's Echoes reference. */
  { slug: "art-books", template: "artbooks", name: "Art books", category: "ebooks" },
  /* Templates round 22: remade as a traditional foods cookbook shop, broths, offal, ferments and meal plans in print and as ebooks, built from the theme's own sections. */
  { slug: "ebooks", template: "ebooks", name: "Cookbook", category: "ebooks" },
  { slug: "fitness", template: "fitness", name: "Fitness", category: "fitness" },
  /* Templates round 18: remade as a course school, a flagship course with smaller ones beside it. */
  { slug: "landing-page", template: "landing", name: "Course", category: "courses" },
  /* Templates round 18: a creator's personal home page, after the owner's reference. */
  { slug: "creator-landing", template: "creator", name: "Creator Landing", category: "courses" },
  /* Templates round 17: narrower ones, for the shops that are opening now (round 18 removed Skincare, round 20 Tour merch). */
  { slug: "streetwear", template: "streetwear", name: "Lifestyle label", category: "fashion" },
  { slug: "sample-packs", template: "samples", name: "Sample packs", category: "music" },
  { slug: "templates-shop", template: "workspace", name: "Notion templates", category: "design" },
  /* Templates round 19: a clothing shop on a night sky, products floating with a glow, after the owner's reference. */
  { slug: "space-clothing", template: "space", name: "Night shop", category: "fashion" },
  /* Templates round 19: a pastel poster shop with wavy bands and framed prints, after the owner's reference. */
  { slug: "posters", template: "posters", name: "Poster shop", category: "design" },
  /* Templates round 20: a life and business coach, an arched portrait, ways to work together with prices and a free first call, after the owner's reference. Round 22: now a running coach, built from the theme's own sections. */
  { slug: "coach", template: "coach", name: "Running coach", category: "coaching" },
  /* Templates round 20: one course sold by a video sales letter on a starry black page, then a call to book, after the owner's reference. */
  { slug: "vsl-course", template: "vsl", name: "Video sales letter", category: "courses" },
  /* Templates round 20: a one page course site, outlined labels and accent words, a curriculum that opens and a form card, after the owner's onepage reference. */
  { slug: "online-course", template: "course2", name: "Online course", category: "courses" },
  /* Templates round 20: a one offer course sales page, after the owner's reference. Round 25: Arch Pilates, a six week online reformer Pilates course in clay on white, with a split hero; the offer is the course product itself (the theme's featured product) in place of price cards. */
  { slug: "course-landing", template: "courselanding", name: "Course landing", category: "courses" },
  /* Templates round 20: a merch shop on an old desktop, product windows, a taskbar with a Start menu, quick view and added to cart dialogs. */
  { slug: "retro-merch", template: "retro", name: "Retro desktop", category: "creators" },
  /* Templates round 21: an author's book landing page. Round 23: remade as one ebook's sales page after the owner's reference (Hold the Room, a public speaking playbook): a dark hero with the book, open spreads, reader quotes on an orange band, the six parts of a talk, who it is for and the author. Round 25: Keep Them Alive, a houseplant care ebook, with a drawn cover around a real leaf and a Windowsill logo. */
  { slug: "author-book", template: "authorbook", name: "Ebook", category: "ebooks" },
  /* Templates round 21: a content creator teaching online business, a hero with her photo and floating video and podcast cards, start here steps, videos, courses, a newsletter band, the podcast and where to follow. */
  { slug: "content-creator", template: "creatorpro", name: "Content creator", category: "creators" },
  /* Templates round 21: a coach and creator's personal brand site, a dark hero with the person, the show, programmes as wide panels, a free worksheet and client stories, after the owner's reference. */
  { slug: "coach-creator", template: "coachpro", name: "Coach creator", category: "coaching" },
  /* Templates round 25: Mateo Ruiz, a personal strength coach in Valencia and online, on warm film photographs of one coach with his clients: a full bleed hero, the coach, three ways to work together, programs, how coaching works, the plan in the app, progress shown honestly, client quotes, questions and a weekly email, built from the theme's own sections. */
  { slug: "personal-trainer", template: "trainer", name: "Personal trainer", category: "coaching" },
  /* Templates round 21: Digital Renaissance, a dark course funnel for using AI in a business: offer, problem and fix, curriculum, bonuses, instructor, pricing, guarantee and questions, with a sign up window. */
  { slug: "digital-renaissance", template: "renaissance", name: "Digital Renaissance", category: "courses" },
  /* Templates round 21: a merch shop on a sunny XP style desktop, a hill under a blue sky, glossy blue windows, a green button of the shop's own and a taskbar, quick view and added to cart windows. */
  { slug: "xp-merch", template: "xpshop", name: "XP shop", category: "creators" },
  /* Templates round 22: a plain white caps and tees shop, a small logo, search and cart, four across on one light grey ground, a short brand statement, built from the theme's own sections. */
  { slug: "caps-tees", template: "capstees", name: "Caps and tees", category: "fashion" },
  /* Templates round 22: a print on demand apparel store after the owner's reference: a split sale hero, a gift guide, price tiles, new arrivals, a product highlight, big collection tiles, a shop visit banner, email signup and reviews, built from the theme's own sections. */
  { slug: "print-on-demand", template: "podshop", name: "Print on demand", category: "fashion" },
  /* Templates round 23: Strata, an outerwear label after the owner's streetwear reference: trending pieces under tabs, category banners, a list of collections, a story split, an Instagram strip and a big wordmark, built from the theme's own sections. Round 24: Materia's scrolling picture hero with three editorial photographs and a collection for every menu link. Round 25: the round 23 order again on Materia's own sections (product carousels beside a picture, a single big review). */
  { slug: "outerwear", template: "outerwear", name: "Outerwear label", category: "fashion" },
  /* Templates round 23: a second video sales letter, on a light page. Round 25: Paper Garden, an eight week course in loose watercolour florals, in deep teal instead of black. The free lesson plays in a large player with the teacher on its cover, then who it is for, the eight modules, the teacher, student quotes, the offer with a refund, questions and a book a call page, built from the theme's own sections. */
  { slug: "vsl-funnel", template: "vslfunnel", name: "VSL funnel", category: "courses" },
  /* Templates round 23: one Notion template's sales page after the owner's reference, by Northpaper; round 24: the product is Creator OS, a Notion system for content creators, with buyer photos. A hero with the workspace, the pages inside as screenshot cards, who it is for, the extras, the template itself as the offer (round 25: white sections, one card tone), a note from the maker, a wall of buyer notes, questions and a last call, built from the theme's own sections around one card grid (notionpage-cards). */
  { slug: "notion-sales-page", template: "notionpage", name: "Notion sales page", category: "digital" },
  /* Templates round 24, remade in round 25: Sixth Ward, a streetwear label whose home page opens on a clothing rail (hanging-rail): garments hang side on, turn to the front under the pointer and lift into a focus view with sizes, Add to cart and the pieces they are worn with. Then new arrival rows with arrows and Shop all, editorial banners, a red text band, shop the look, collection rows, a journal and a lookbook page with the rail over a landscape, built from the theme's own sections. */
  { slug: "streetwear-drop", template: "rail", name: "Streetwear drop", category: "fashion" },
  /* Templates round 25: Margin, a Notion template creator's website by Nora Lind, after the owner's reference: her photo over a large heading, popular templates as cards, a featured template, how buying works, free templates, the creator, a wall of buyer notes, a newsletter, questions, a templates page with Premium, Free, On sale and Bundles, and a product page for every template, built from the theme's own sections around one hero (notionsite-hero). */
  { slug: "notion-creator", template: "notionsite", name: "Notion creator", category: "digital" },
  /* Templates round 25: Lowmoth, a sample label's dark store after the owner's sample pack reference: a centred hero with short previews floating round the heading, pack cards in rows with a play button on each cover and the preview's own waveform (soundpacks-pack-row), a table of demos with type, file name, BPM and key (soundpacks-track-table), bundles, why buy here, sample reviews with photos and a journal. Each pack page has a demo player, its sounds in the table, what is inside, the DAWs it works in and the licence. Pack art drawn for the template, demo loops synthesised for it. */
  { slug: "sound-packs", template: "soundpacks", name: "Sound packs", category: "digital" },
]

/** Where a template's pictures live: its home page whole at 1440 wide, and at a phone's width (scripts/build-theme-template-covers.ts takes both). */
export const templateCoverPath = (template: string) => `/themes/${CODE_THEME_PACKAGE}/${template}.webp`
export const templatePhonePath = (template: string) => `/themes/${CODE_THEME_PACKAGE}/${template}-phone.webp`
/**
 * Where a template's website is, prerendered: its pages, styles, scripts and
 * pictures as static files the CDN serves (scripts/build-template-previews.ts
 * writes them). The marketplace's Preview frames <root>/<slug>/index.html.
 */
export const TEMPLATE_PREVIEW_ROOT = "/theme-previews"
/** The home page of a code template's prerendered website, or null for a listing that is not one. */
export function templatePreviewPath(l: Pick<ThemeListing, "codePackage">): string | null {
  const t = l.codePackage ? CODE_TEMPLATES.find((c) => `${CODE_THEME_PACKAGE}/${c.template}` === l.codePackage) : null
  return t ? `${TEMPLATE_PREVIEW_ROOT}/${t.slug}/index.html` : null
}
/** The default template's cover. */
export const DEFAULT_LISTING_COVER = templateCoverPath("default")

export function builtinListings(): ThemeListing[] {
  return CODE_TEMPLATES.map((t, i) => ({
    id: `template-${CODE_THEME_PACKAGE}-${t.template}`,
    slug: t.slug,
    name: t.name,
    author: "Storelib",
    authorAvatar: null,
    category: t.category,
    tier: "free" as const,
    priceCents: 0,
    cover: templateCoverPath(t.template),
    screenshots: [templateCoverPath(t.template), templatePhonePath(t.template)],
    builtinThemeId: null,
    codePackage: `${CODE_THEME_PACKAGE}/${t.template}`,
    hasPackage: true,
    /* Null on purpose: the kind is only a label for an uploaded zip, and a code template's is never sent to the page (the owner: no vendor named anywhere). */
    packageKind: null,
    demoUrl: null,
    published: true,
    sortOrder: i - CODE_TEMPLATES.length,
    createdAt: "2026-11-21T00:00:00.000Z",
  }))
}

/**
 * The code listings with the table's rows over them. A row with a template's
 * address replaces the code listing of it (a new cover, another order,
 * hidden), so there is only ever one card for a template; it still adds the
 * template the code ships unless the row carries a zip of its own.
 *
 * A row that names a native registry theme (the old Storelib Default) is
 * retired: it is on no list a creator sees and Add refuses it. The admin's
 * list still shows it, hidden, so it can be removed.
 */
export function mergeListings(rows: ThemeListing[], opts: { includeHidden?: boolean } = {}): ThemeListing[] {
  const code = builtinListings()
  const live = rows.filter((r) => !r.builtinThemeId)
  const retired = opts.includeHidden ? rows.filter((r) => r.builtinThemeId).map((r) => ({ ...r, published: false })) : []
  const builtins = code.filter((b) => !live.some((r) => r.slug === b.slug))
  /* A row for a template keeps the code's pictures until it has its own. */
  const dressed = live.map((r) => {
    const b = code.find((c) => c.slug === r.slug)
    if (!b) return r
    const own = r.hasPackage
    return { ...r, codePackage: own ? null : b.codePackage, hasPackage: true, packageKind: own ? r.packageKind : b.packageKind, cover: r.cover ?? b.cover, screenshots: r.screenshots.length ? r.screenshots : b.screenshots, authorAvatar: r.authorAvatar ?? b.authorAvatar }
  })
  const all = [...builtins, ...dressed, ...retired].filter((l) => opts.includeHidden || l.published)
  return sortListings(all, "featured")
}

export interface ThemeFilter {
  q?: string
  tier?: ThemeTier | "all"
  category?: string | "all"
  sort?: ThemeSort
}

export function sortListings(list: ThemeListing[], sort: ThemeSort): ThemeListing[] {
  const out = [...list]
  const byOrder = (a: ThemeListing, b: ThemeListing) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  if (sort === "newest") out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || byOrder(a, b))
  else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === "price") out.sort((a, b) => priceRank(a) - priceRank(b) || byOrder(a, b))
  else out.sort(byOrder)
  return out
}

/** Free first, then Pro (it comes with a plan), then paid by price. */
function priceRank(l: ThemeListing): number {
  if (l.tier === "free") return 0
  if (l.tier === "pro") return 1
  return 2 + l.priceCents
}

export function filterListings(list: ThemeListing[], f: ThemeFilter): ThemeListing[] {
  const q = (f.q ?? "").trim().toLowerCase()
  const narrowed = list.filter((l) => {
    if (f.tier && f.tier !== "all" && l.tier !== f.tier) return false
    if (f.category && f.category !== "all" && l.category !== f.category) return false
    if (q && !`${l.name} ${l.author} ${categoryLabel(l.category)}`.toLowerCase().includes(q)) return false
    return true
  })
  return sortListings(narrowed, f.sort ?? "featured")
}

export function formatThemePrice(cents: number): string {
  const d = cents / 100
  return `$${cents % 100 === 0 ? d.toFixed(0) : d.toFixed(2)}`
}

/** "Free", "$49" or "Grow" (included from Grow up), the one word the card and the badge show. */
export function tierLabel(l: Pick<ThemeListing, "tier" | "priceCents">): string {
  if (l.tier === "pro") return "Grow"
  if (l.tier === "paid") return formatThemePrice(l.priceCents)
  return "Free"
}

/** A slug the address can hold: lower case letters, digits and single dashes. */
export const LISTING_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "")
}

/** The library shows eight themes and a ninth card to the marketplace. */
export const LIBRARY_THEME_CARDS = 8

/** The marketplace's own address, and a theme's page in it. */
export const MARKETPLACE_PATH = "/themes"
export const listingPath = (slug: string) => `${MARKETPLACE_PATH}/${encodeURIComponent(slug)}`
/** The page the live preview frame holds. */
export const listingPreviewPath = (slug: string) => `/theme-preview/${encodeURIComponent(slug)}?embedded=1`

/**
 * Whether a listing can be drawn in Storelib's own preview frame: a built-in
 * theme, or a Storelib package or export. A theme in the compatible profile
 * (packageKind "shopify", which the templates are) is drawn by the compatible
 * engine from an install's files, so its preview is its demo store when it
 * has one, and its screenshots when it does not.
 */
export function hasLivePreview(l: Pick<ThemeListing, "builtinThemeId" | "packageKind" | "hasPackage">): boolean {
  return !!l.builtinThemeId || (l.hasPackage && (l.packageKind === "storelib" || l.packageKind === "export"))
}

/** The settings key a website made from a listing carries when it is not in the compatible profile (which keeps it in `compat.listing`). */
export const LISTING_SETTINGS_KEY = "marketplace_listing"

/** The listing a website was added from, read from its settings (written by /api/themes/marketplace/add), or null. */
export function listingSlugOfSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null
  const s = settings as Record<string, unknown>
  const compat = s.compat && typeof s.compat === "object" ? (s.compat as Record<string, unknown>).listing : undefined
  const slug = typeof compat === "string" ? compat : s[LISTING_SETTINGS_KEY]
  return typeof slug === "string" && LISTING_SLUG_RE.test(slug) ? slug : null
}

/**
 * Which listings are already in a library, by address: every website that
 * was added from one remembers it in its settings, so "In library" holds on
 * the next visit too. `installs` is the library as the Website page loads it
 * (each with its `settings`).
 */
export function installedListingSlugs(installs: readonly { settings?: unknown }[]): Set<string> {
  const out = new Set<string>()
  for (const i of installs) {
    const slug = listingSlugOfSettings(i.settings)
    if (slug) out.add(slug)
  }
  return out
}

/** What Add does for a listing, decided the same way on the card, the page and the server. */
export type AddVerdict = { ok: true } | { ok: false; reason: "paid_soon" | "needs_pro" | "no_package" }

export function addVerdict(l: Pick<ThemeListing, "tier" | "builtinThemeId" | "hasPackage">, creatorIsPro: boolean): AddVerdict {
  if (l.tier === "paid") return { ok: false, reason: "paid_soon" }
  if (l.tier === "pro" && !creatorIsPro) return { ok: false, reason: "needs_pro" }
  if (!l.builtinThemeId && !l.hasPackage) return { ok: false, reason: "no_package" }
  return { ok: true }
}

export const ADD_REFUSALS: Record<"paid_soon" | "needs_pro" | "no_package", string> = {
  paid_soon: "Paid themes open soon.",
  needs_pro: "This theme comes with the Grow and Pro plans.",
  no_package: "This theme is not ready to add yet.",
}

/** The cache tag every listing read carries, so an admin change shows at once. */
export const MARKETPLACE_TAG = "theme-marketplace"

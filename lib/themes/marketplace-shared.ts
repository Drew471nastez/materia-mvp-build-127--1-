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
 * THE TEMPLATES (templates round 16). Seven starting websites made from one
 * theme, Materia: its files once (theme-packages/materia/base) and a small
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
 * "Coaching and consultants").
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
  { slug: "ebooks", template: "ebooks", name: "Ebooks", category: "ebooks" },
  { slug: "fitness", template: "fitness", name: "Fitness", category: "fitness" },
  { slug: "landing-page", template: "landing", name: "Landing page", category: "courses" },
]

/** Where a template's pictures live: its home page whole at 1440 wide, and at a phone's width (scripts/build-theme-template-covers.ts takes both). */
export const templateCoverPath = (template: string) => `/themes/${CODE_THEME_PACKAGE}/${template}.webp`
export const templatePhonePath = (template: string) => `/themes/${CODE_THEME_PACKAGE}/${template}-phone.webp`
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
    packageKind: "shopify" as const,
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

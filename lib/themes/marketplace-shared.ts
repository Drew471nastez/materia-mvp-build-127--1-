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
 * Storelib's own theme is listed from code as well, so the library and the
 * marketplace have it before that SQL has run, and a row for it in the table
 * only changes how it is shown.
 *
 * Pure and client safe: the library cards, the marketplace page and the
 * admin form all read this file.
 */
import { STORELIB_DEFAULT_ID, THEME_INDUSTRIES, getThemeDefinition } from "@/lib/website-builder/theme-registry"

export type ThemeTier = "free" | "paid" | "pro"
export const THEME_TIERS: readonly ThemeTier[] = ["free", "paid", "pro"]

export type ThemeSort = "featured" | "newest" | "name" | "price"
export const THEME_SORTS: readonly { id: ThemeSort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "name", label: "Name" },
  { id: "price", label: "Price" },
]

/** The categories a theme is filed under: the industries the registry already names. */
export const THEME_CATEGORIES: readonly { key: string; label: string }[] = THEME_INDUSTRIES.map((i) => ({ key: i.key, label: i.label }))

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
  /** True when a zip is stored for it, which Add imports. */
  hasPackage: boolean
  packageKind: ThemePackageKind | null
  /** A live store made with it, shown in the preview frame when the theme cannot be drawn here. */
  demoUrl: string | null
  published: boolean
  sortOrder: number
  createdAt: string
}

/** Storelib Default, listed from code. */
export const DEFAULT_LISTING_SLUG = "storelib-default"
/** Where its full page screenshot lives (scripts/check-theme-marketplace.mjs takes it). */
export const DEFAULT_LISTING_COVER = "/themes/storelib-default-full.webp"

export function builtinListings(): ThemeListing[] {
  const def = getThemeDefinition(STORELIB_DEFAULT_ID)
  if (!def) return []
  return [
    {
      id: `builtin-${def.id}`,
      slug: DEFAULT_LISTING_SLUG,
      name: def.name,
      author: "Storelib",
      authorAvatar: null,
      category: def.industry,
      tier: "free",
      priceCents: 0,
      cover: DEFAULT_LISTING_COVER,
      screenshots: [],
      builtinThemeId: def.id,
      hasPackage: false,
      packageKind: null,
      demoUrl: null,
      published: true,
      sortOrder: -1,
      createdAt: "2026-03-17T00:00:00.000Z",
    },
  ]
}

/**
 * The code listings with the table's rows over them. A row that names a
 * built-in theme replaces the code listing of it (a new cover, another
 * order, hidden), so there is only ever one card for a theme.
 */
export function mergeListings(rows: ThemeListing[], opts: { includeHidden?: boolean } = {}): ThemeListing[] {
  const code = builtinListings()
  const builtins = code.filter((b) => !rows.some((r) => r.builtinThemeId === b.builtinThemeId || r.slug === b.slug))
  /* A row for a built-in theme keeps the code's pictures until it has its own. */
  const dressed = rows.map((r) => {
    const b = code.find((c) => c.builtinThemeId === r.builtinThemeId || c.slug === r.slug)
    return b ? { ...r, builtinThemeId: b.builtinThemeId, cover: r.cover ?? b.cover, authorAvatar: r.authorAvatar ?? b.authorAvatar } : r
  })
  const all = [...builtins, ...dressed].filter((l) => opts.includeHidden || l.published)
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
 * theme, or a Storelib package or export. An imported Shopify theme is drawn
 * by the compatible engine from an install's files, so its preview is its
 * demo store when it has one, and its screenshots when it does not.
 */
export function hasLivePreview(l: Pick<ThemeListing, "builtinThemeId" | "packageKind" | "hasPackage">): boolean {
  return !!l.builtinThemeId || (l.hasPackage && (l.packageKind === "storelib" || l.packageKind === "export"))
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

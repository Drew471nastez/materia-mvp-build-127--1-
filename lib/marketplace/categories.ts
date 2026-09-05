import type React from "react"

// Single source of truth for the Storelib taxonomy: digital products sold by
// independent creators. Safe to import from both server and client components -
// no "use client", no server-only imports.
//
// ===========================================================================
//  THIS FILE WAS THE FASHION TAXONOMY, AND IS THE DIGITAL ONE AGAIN
// ===========================================================================
//
// It held womenswear / menswear / sneakers / vintage, with UK shoe sizes and
// a "Very good condition" scale. Storelib sells digital products, so all of it
// is gone: a download has no size and no condition, and offering those fields
// produced listings that asked a font what waist it was.
//
// WHERE THESE LABELS COME FROM. Not invented here. The original digital
// taxonomy was never a curated list in code -- it was roughly six hundred
// free-text strings in the database, which is why normalizeCategoryToId below
// still exists to collapse them. The twenty-one labels used here are the ones
// the marketing site itself has been showing all along, in
// components/marketing/product-marquee.tsx, unchanged through the whole
// marketplace era. They are what Storelib has always said it sells.
//
// The six departments are the only new thing: twenty-one flat chips are a
// marquee, not a navigation, so they are grouped the way somebody shopping
// would group them.
import { Layers, Palette, LayoutTemplate, GraduationCap, AudioLines, Code, Users } from "lucide-react"

// Categories with icons and subcategories.
// Subcategory IDs are globally unique because `?sub=` is resolved by scanning
// every category.
const CATEGORIES = [
  {
    id: "all",
    label: "All",
    icon: Layers,
    subcategories: [],
  },
  {
    id: "design",
    label: "Design",
    icon: Palette,
    subcategories: [
      { id: "design-templates", label: "Design Templates" },
      { id: "fonts", label: "Fonts" },
      { id: "digital-art", label: "Digital Art" },
      { id: "photography", label: "Photography" },
      { id: "game-assets", label: "Game Assets" },
    ],
  },
  {
    id: "templates",
    label: "Templates",
    icon: LayoutTemplate,
    subcategories: [
      { id: "notion-templates", label: "Notion Templates" },
      { id: "spreadsheets", label: "Spreadsheets" },
      { id: "worksheets", label: "Worksheets" },
    ],
  },
  {
    id: "learning",
    label: "Learning",
    icon: GraduationCap,
    subcategories: [
      { id: "online-courses", label: "Online Courses" },
      { id: "video-tutorials", label: "Video Tutorials" },
      { id: "ebooks", label: "E-books" },
      { id: "coaching", label: "1:1 Coaching" },
      { id: "fitness-plans", label: "Fitness Plans" },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    icon: AudioLines,
    subcategories: [
      { id: "music", label: "Music" },
      { id: "beat-packs", label: "Beat Packs" },
      { id: "podcasts", label: "Podcasts" },
    ],
  },
  {
    id: "software",
    label: "Software",
    icon: Code,
    subcategories: [
      { id: "software", label: "Software" },
      { id: "plugins", label: "Plugins" },
      { id: "link-in-bio", label: "Link-in-bio" },
    ],
  },
  {
    id: "memberships",
    label: "Memberships",
    icon: Users,
    subcategories: [
      { id: "memberships", label: "Memberships" },
      { id: "merch", label: "Merch" },
    ],
  },
] as const

export { CATEGORIES }

export type Category = (typeof CATEGORIES)[number]
export type CategoryId = Category["id"]
export type Subcategory = { id: string; label: string }

export type CategoryIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>

/**
 * A widened, mutable view of the taxonomy.
 *
 * CATEGORIES is `as const` so ids and labels are literal types where that is
 * useful, but a readonly tuple whose members have differently-shaped
 * `subcategories` (the "all" entry's is an empty tuple) is not something you can
 * call `.map` or `.find` on. This is the one place that widening happens, and
 * everything below reads from it.
 */
type CategoryShape = { id: string; label: string; icon: CategoryIcon; subcategories: Subcategory[] }
const CATEGORY_LIST: CategoryShape[] = CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  icon: c.icon as CategoryIcon,
  subcategories: c.subcategories.map((s) => ({ id: s.id, label: s.label })),
}))

// Server-side route/query validation (replaces the per-page VALID_CATEGORIES copies)
export const VALID_CATEGORY_IDS: string[] = CATEGORY_LIST.map((category) => category.id)

const VALID_CATEGORY_ID_SET = new Set<string>(VALID_CATEGORY_IDS)

/**
 * Every subcategory id, flattened, so `?sub=` can be validated without walking
 * the tree at each call site.
 */
export const VALID_SUBCATEGORY_IDS: string[] = CATEGORY_LIST.flatMap((c) =>
  c.subcategories.map((s) => s.id),
)

/**
 * Map from DB category values to our code category IDs.
 *
 * `products.category` is free text and holds three generations of value: the
 * original digital strings ("Notion Templates", "Beat Pack", "UI Kit"), the
 * fashion ones the marketplace era wrote ("Womenswear", "Sneakers"), and plain
 * ids. The first are mapped properly, the second deliberately are NOT -- a
 * jacket has no home in this taxonomy, and quietly filing it under Design would
 * be worse than showing it as uncategorised.
 */
export const DB_CATEGORY_TO_ID: Record<string, string> = {
  // Exact id matches
  all: "all",
  design: "design",
  templates: "templates",
  learning: "learning",
  audio: "audio",
  software: "software",
  memberships: "memberships",

  // Design
  "design templates": "design",
  "design template": "design",
  graphics: "design",
  "graphic design": "design",
  "ui kit": "design",
  "ui kits": "design",
  mockups: "design",
  mockup: "design",
  icons: "design",
  illustrations: "design",
  illustration: "design",
  "digital art": "design",
  art: "design",
  fonts: "design",
  font: "design",
  typefaces: "design",
  photography: "design",
  photos: "design",
  presets: "design",
  "lightroom presets": "design",
  "game assets": "design",
  "3d": "design",
  "3d models": "design",

  // Templates
  "notion templates": "templates",
  "notion template": "templates",
  notion: "templates",
  spreadsheets: "templates",
  spreadsheet: "templates",
  excel: "templates",
  "google sheets": "templates",
  worksheets: "templates",
  worksheet: "templates",
  planners: "templates",
  planner: "templates",
  printables: "templates",
  "resume templates": "templates",
  "cv templates": "templates",

  // Learning
  "online courses": "learning",
  "online course": "learning",
  course: "learning",
  courses: "learning",
  "video tutorials": "learning",
  tutorials: "learning",
  tutorial: "learning",
  "e-books": "learning",
  ebooks: "learning",
  ebook: "learning",
  "e-book": "learning",
  books: "learning",
  guides: "learning",
  guide: "learning",
  coaching: "learning",
  "1:1 coaching": "learning",
  consulting: "learning",
  "fitness plans": "learning",
  fitness: "learning",
  "workout plans": "learning",
  "meal plans": "learning",

  // Audio
  music: "audio",
  beats: "audio",
  "beat packs": "audio",
  "beat pack": "audio",
  samples: "audio",
  "sample packs": "audio",
  "sound effects": "audio",
  sfx: "audio",
  podcasts: "audio",
  podcast: "audio",

  // Software
  apps: "software",
  app: "software",
  plugins: "software",
  plugin: "software",
  extensions: "software",
  scripts: "software",
  code: "software",
  "link-in-bio": "software",
  "link in bio": "software",
  saas: "software",

  // Memberships
  membership: "memberships",
  community: "memberships",
  communities: "memberships",
  subscription: "memberships",
  subscriptions: "memberships",
  merch: "memberships",
  merchandise: "memberships",

  // Catch-all buckets
  other: "all",
  misc: "all",
  miscellaneous: "all",
  uncategorized: "all",
  uncategorised: "all",
}

/**
 * Normalize a DB category value to a code category id.
 *
 * Anything unrecognised falls back to "all" rather than to itself, so a stale
 * value -- including every fashion string the marketplace era wrote -- can
 * never match a real category filter.
 */
export function normalizeCategoryToId(dbCategory: string | null | undefined): string {
  const lower = (dbCategory || "").toLowerCase().trim()
  if (!lower) return ""
  const mapped = DB_CATEGORY_TO_ID[lower]
  if (mapped) return mapped
  return VALID_CATEGORY_ID_SET.has(lower) ? lower : "all"
}

export function getCategory(id: string): CategoryShape | undefined {
  return CATEGORY_LIST.find((category) => category.id === id)
}

export function getSubcategories(id: string): readonly Subcategory[] {
  return getCategory(id)?.subcategories ?? []
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? "All"
}

/** The label for a subcategory id, searched across every department. */
export function subcategoryLabel(id: string | null | undefined): string | null {
  if (!id) return null
  for (const category of CATEGORY_LIST) {
    const hit = category.subcategories.find((s) => s.id === id)
    if (hit) return hit.label
  }
  return null
}

/**
 * ===========================================================================
 *  NAVIGATION SHAPES, DERIVED FROM THE TAXONOMY ABOVE
 * ===========================================================================
 *
 * The header, the search row and the two mobile headers each need the category
 * list in a slightly different shape. These used to come from
 * lib/marketplace/department-nav.ts, which derived them from a SECOND fashion
 * taxonomy file -- two sources that had to agree and periodically did not.
 *
 * They are derived HERE now, from CATEGORIES, because a category added above
 * should appear in every menu and in the sitemap without anybody remembering
 * to edit a nav file. That was the good idea in department-nav; it just had the
 * wrong taxonomy underneath it.
 */

export type CategoryNavItem = {
  id: string
  label: string
  href: string
  icon: CategoryIcon
  subcategories: { id: string; label: string; href: string }[]
}

/**
 * The path for a category, and optionally one subcategory inside it.
 *
 * A PATH rather than a query string for the category, because /explore/design
 * is a page a crawler can rank and a person can read. The subcategory stays a
 * query param: it filters the page rather than being a page of its own, and
 * every subcategory id is globally unique so `?sub=` needs no department to
 * disambiguate it.
 */
export function categoryPath(categoryId?: string | null, subId?: string | null): string {
  if (!categoryId || categoryId === "all") return "/explore"
  const base = `/explore/${categoryId}`
  return subId ? `${base}?sub=${subId}` : base
}

/** The six departments, each drilling into its own subcategories. */
export const CATEGORY_NAV: CategoryNavItem[] = CATEGORY_LIST.filter((c) => c.id !== "all").map((c) => ({
  id: c.id,
  label: c.label,
  href: categoryPath(c.id),
  icon: c.icon,
  subcategories: c.subcategories.map((s) => ({
    id: s.id,
    label: s.label,
    href: categoryPath(c.id, s.id),
  })),
}))

/**
 * The same six with "All" in front, for the rails that FILTER rather than
 * navigate. "all" is not a category and has no subcategories; it is the absence
 * of a filter, which is why it is the first entry of CATEGORIES with an empty
 * list.
 */
export const CATEGORY_RAIL: { id: string; label: string; icon: CategoryIcon }[] = CATEGORY_LIST.map(
  (c) => ({ id: c.id, label: c.label, icon: c.icon }),
)

/** The subcategories of one department, or an empty list for an unknown id. */
export function subcategoriesFor(categoryId: string): { id: string; label: string }[] {
  return [...(getCategory(categoryId)?.subcategories ?? [])]
}

/**
 * ---------------------------------------------------------------------------
 * WHAT USED TO BE HERE
 * ---------------------------------------------------------------------------
 * SIZE_SYSTEMS (UK/EU/US shoe sizes, alpha garment sizes), CATEGORY_SIZING,
 * sizeSystemForCategory, sizeOptionsForCategory, CONDITIONS and conditionLabel.
 *
 * All removed with the marketplace. They described a physical object being
 * resold, and there is no version of "Men's waist 34, very good condition" that
 * means anything about a Notion template. Nothing referenced the size helpers
 * by the time they came out -- they had already been superseded by
 * listing-taxonomy.ts, which is gone too.
 */

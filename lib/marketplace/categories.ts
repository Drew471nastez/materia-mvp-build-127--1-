// Single source of truth for the marketplace taxonomy (second-hand fashion, books, home & vintage).
// Safe to import from both server and client components - no "use client", no server-only imports.
import { Layers, Shirt, PersonStanding, Footprints, ShoppingBag, Gem, Sparkles, BookOpen, Home, Recycle } from "lucide-react"

// Categories with icons and subcategories
// Subcategory IDs are globally unique because `?sub=` is resolved by scanning every category
const CATEGORIES = [
  {
    id: "all",
    label: "All",
    icon: Layers,
    subcategories: []
  },
  {
    id: "womenswear",
    label: "Womenswear",
    icon: Shirt,
    subcategories: [
      { id: "dresses", label: "Dresses" },
      { id: "tops", label: "Tops" },
      { id: "womens-jeans", label: "Jeans" },
      { id: "skirts", label: "Skirts" },
      { id: "womens-outerwear", label: "Jackets & Coats" },
      { id: "knitwear", label: "Knitwear" },
      { id: "activewear", label: "Activewear" },
      { id: "swimwear", label: "Swimwear" },
    ]
  },
  {
    id: "menswear",
    label: "Menswear",
    // lucide 0.454 has no dedicated menswear glyph - Shirt is taken by Womenswear
    icon: PersonStanding,
    subcategories: [
      { id: "t-shirts", label: "T-Shirts" },
      { id: "shirts", label: "Shirts" },
      { id: "hoodies", label: "Hoodies & Sweats" },
      { id: "mens-jeans", label: "Jeans" },
      { id: "mens-outerwear", label: "Jackets & Coats" },
      { id: "trousers", label: "Trousers" },
      { id: "shorts", label: "Shorts" },
      { id: "suits", label: "Suits" },
    ]
  },
  {
    id: "sneakers",
    label: "Sneakers",
    icon: Footprints,
    subcategories: [
      { id: "jordan", label: "Jordan" },
      { id: "nike", label: "Nike" },
      { id: "adidas", label: "Adidas & Yeezy" },
      { id: "new-balance", label: "New Balance" },
      { id: "vans-converse", label: "Vans & Converse" },
      { id: "asics", label: "Asics" },
      { id: "salomon", label: "Salomon" },
      { id: "other-sneakers", label: "Other" },
    ]
  },
  {
    id: "bags-accessories",
    label: "Bags & Accessories",
    icon: ShoppingBag,
    subcategories: [
      { id: "handbags", label: "Handbags" },
      { id: "backpacks", label: "Backpacks" },
      { id: "wallets", label: "Wallets & Purses" },
      { id: "belts", label: "Belts" },
      { id: "hats", label: "Hats & Caps" },
      { id: "scarves", label: "Scarves & Gloves" },
      { id: "sunglasses", label: "Sunglasses" },
      { id: "watches", label: "Watches" },
    ]
  },
  {
    id: "jewellery",
    label: "Jewellery",
    icon: Gem,
    subcategories: [
      { id: "rings", label: "Rings" },
      { id: "necklaces", label: "Necklaces" },
      { id: "earrings", label: "Earrings" },
      { id: "bracelets", label: "Bracelets" },
      { id: "brooches", label: "Brooches & Pins" },
      { id: "body-jewellery", label: "Body Jewellery" },
      { id: "fine-jewellery", label: "Fine & Gold" },
    ]
  },
  {
    id: "beauty",
    label: "Beauty",
    icon: Sparkles,
    subcategories: [
      { id: "skincare", label: "Skincare" },
      { id: "makeup", label: "Makeup" },
      { id: "fragrance", label: "Fragrance" },
      { id: "haircare", label: "Haircare" },
      { id: "nails", label: "Nails" },
      { id: "tools-brushes", label: "Tools & Brushes" },
      { id: "sets-gifts", label: "Sets & Gift Boxes" },
    ]
  },
  {
    id: "books",
    label: "Books",
    icon: BookOpen,
    subcategories: [
      { id: "fiction", label: "Fiction" },
      { id: "non-fiction", label: "Non-Fiction" },
      { id: "self-help", label: "Self-Help & Business" },
      { id: "manga-comics", label: "Manga & Comics" },
      { id: "textbooks", label: "Textbooks" },
      { id: "rare-collectible", label: "Rare & Collectible" },
    ]
  },
  {
    id: "home",
    label: "Home",
    icon: Home,
    subcategories: [
      { id: "decor", label: "Decor" },
      { id: "kitchen-dining", label: "Kitchen & Dining" },
      { id: "furniture", label: "Furniture" },
      { id: "bedding", label: "Bedding & Linen" },
      { id: "lighting", label: "Lighting" },
      { id: "art-prints", label: "Art & Prints" },
      { id: "plants-garden", label: "Plants & Garden" },
    ]
  },
  {
    id: "vintage",
    label: "Vintage",
    icon: Recycle,
    subcategories: [
      { id: "y2k", label: "Y2K" },
      { id: "nineties", label: "90s" },
      { id: "eighties", label: "80s" },
      { id: "vintage-streetwear", label: "Streetwear" },
      { id: "vintage-designer", label: "Designer" },
      { id: "band-tees", label: "Band Tees" },
    ]
  },
] as const

export { CATEGORIES }

export type Category = (typeof CATEGORIES)[number]
export type CategoryId = Category["id"]
export type Subcategory = { id: string; label: string }

// Server-side route/query validation (replaces the per-page VALID_CATEGORIES copies)
export const VALID_CATEGORY_IDS: string[] = CATEGORIES.map((category) => category.id)

const VALID_CATEGORY_ID_SET = new Set<string>(VALID_CATEGORY_IDS)

// Map from DB category values to our code category IDs
// Products in the DB may hold display names ("Bags & Accessories"), legacy digital
// taxonomy values ("Notion Templates") or already-normalized IDs ("womenswear")
export const DB_CATEGORY_TO_ID: Record<string, string> = {
  // Exact ID matches (after the SQL migration has been run)
  "all": "all",
  "womenswear": "womenswear",
  "menswear": "menswear",
  "sneakers": "sneakers",
  "bags-accessories": "bags-accessories",
  "jewellery": "jewellery",
  "beauty": "beauty",
  "books": "books",
  "home": "home",
  "vintage": "vintage",
  // Display-name and natural-language variants from the DB
  "women": "womenswear",
  "womens": "womenswear",
  "women's": "womenswear",
  "womens clothing": "womenswear",
  "women's clothing": "womenswear",
  "ladies": "womenswear",
  "dresses": "womenswear",
  "men": "menswear",
  "mens": "menswear",
  "men's": "menswear",
  "mens clothing": "menswear",
  "men's clothing": "menswear",
  "clothing": "womenswear",
  "fashion": "womenswear",
  "shoes": "sneakers",
  "footwear": "sneakers",
  "trainers": "sneakers",
  "sneaker": "sneakers",
  "kicks": "sneakers",
  "bags": "bags-accessories",
  "bags & accessories": "bags-accessories",
  "bags and accessories": "bags-accessories",
  "accessories": "bags-accessories",
  "handbags": "bags-accessories",
  "watches": "bags-accessories",
  "jewelry": "jewellery",
  "jewelery": "jewellery",
  "makeup": "beauty",
  "make-up": "beauty",
  "cosmetics": "beauty",
  "skincare": "beauty",
  "fragrance": "beauty",
  "perfume": "beauty",
  "beauty & personal care": "beauty",
  "book": "books",
  "literature": "books",
  "manga": "books",
  "comics": "books",
  "textbooks": "books",
  "home & living": "home",
  "home and living": "home",
  "homeware": "home",
  "homewares": "home",
  "home decor": "home",
  "decor": "home",
  "interiors": "home",
  "furniture": "home",
  "kitchen": "home",
  "retro": "vintage",
  "y2k": "vintage",
  "thrift": "vintage",
  "second hand": "vintage",
  "secondhand": "vintage",
  "pre-loved": "vintage",
  "preloved": "vintage",
}

// Bucket for a listing whose category is not part of the taxonomy — every row still
// carrying a pre-pivot digital category ("design", "ai", "Notion Templates", …) plus
// anything explicitly filed as "other"/"uncategorised".
//
// Deliberately NOT "all": "all" is the feed, not a category, so a product routed there
// is invisible on every category surface at once — nine empty category pages and nine
// gradient placeholder tiles, which is exactly the state this constant exists to avoid.
// "vintage" is the taxonomy's genuine grab-bag, so a mis-bucketed item still reads as
// plausible to a shopper.
//
// supabase/migrations/20260730_marketplace_category_backfill.sql performs the same
// mapping in the database. Once it has run (and sellers have re-categorised), this
// only covers rows written by an out-of-date client.
export const FALLBACK_CATEGORY_ID = "vintage"

// Pre-pivot digital taxonomy → closest physical bucket. Kept separate from
// DB_CATEGORY_TO_ID (which is real second-hand vocabulary) so it is obvious what is a
// pivot artefact, and so it can be deleted wholesale once the catalogue is clean.
// Anything not listed here lands in FALLBACK_CATEGORY_ID.
const LEGACY_DIGITAL_TO_ID: Record<string, string> = {
  // Visual/printable goods sit closest to Home → Art & Prints
  "design": "home",
  "graphics": "home",
  "graphic design": "home",
  "illustration": "home",
  "illustrations": "home",
  "photography": "home",
  "photos": "home",
  "video": "home",
  "video & film": "home",
  "film": "home",
  "art": "home",
  // Anything read rather than worn → Books
  "education": "books",
  "courses": "books",
  "course": "books",
  "ebooks": "books",
  "ebook": "books",
  "writing": "books",
  "writing & publishing": "books",
  "notion templates": "books",
}

/**
 * Normalize a DB category value to a taxonomy ID for *matching*.
 *
 * Strict on purpose: anything unrecognised returns "" so it can never satisfy a
 * category filter. This is also applied to free-text `creators.niche_tags`, where a
 * lenient fallback would make every seller's whole catalogue appear under one category.
 * Use resolveProductCategoryId() for the category a product should be *filed under*.
 */
export function normalizeCategoryToId(dbCategory: string | null | undefined): string {
  const lower = (dbCategory || "").toLowerCase().trim()
  if (!lower) return ""
  const mapped = DB_CATEGORY_TO_ID[lower]
  if (mapped) return mapped
  return VALID_CATEGORY_ID_SET.has(lower) ? lower : ""
}

/**
 * The taxonomy ID a product is filed under — always one of VALID_CATEGORY_IDS, never
 * "" and never "all". Legacy and missing categories resolve to a real bucket so no
 * listing is dropped from the category pages, the category tiles or the feed's pills.
 *
 * Only ever call this with `products.category`; niche tags and user-supplied filters
 * must go through normalizeCategoryToId().
 */
export function resolveProductCategoryId(dbCategory: string | null | undefined): string {
  const normalized = normalizeCategoryToId(dbCategory)
  if (normalized && normalized !== "all") return normalized
  const lower = (dbCategory || "").toLowerCase().trim()
  return LEGACY_DIGITAL_TO_ID[lower] ?? FALLBACK_CATEGORY_ID
}

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((category) => category.id === id)
}

export function getSubcategories(id: string): readonly Subcategory[] {
  return getCategory(id)?.subcategories ?? []
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? "All"
}

// The closed vocabulary products.size_system is allowed to hold — must stay in step with
// the products_size_system_check constraint in
// supabase/migrations/20260730_marketplace_physical_attributes.sql.
export const SIZE_SYSTEM_DB_VALUES = ["alpha", "eu", "uk", "us", "numeric", "one-size"] as const

export type SizeSystemDbValue = (typeof SIZE_SYSTEM_DB_VALUES)[number]

// Size systems the seller picks from. `id` is a UI key (there are two garment-numeric
// systems with different option sets but the same stored value), `dbValue` is what gets
// written to products.size_system, and `options` are the exact labels stored on
// products.size. `dbValue` is what the CHECK constraint sees — never persist `id`.
export const SIZE_SYSTEMS = [
  {
    id: "alpha",
    dbValue: "alpha",
    label: "Alpha (XS - XXXL)",
    options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  },
  {
    id: "womens-numeric",
    dbValue: "numeric",
    label: "Women's (UK)",
    options: ["4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"],
  },
  {
    id: "mens-numeric",
    dbValue: "numeric",
    label: "Men's (waist, in)",
    options: ["28", "30", "32", "34", "36", "38", "40", "42", "44"],
  },
  {
    id: "shoe-uk",
    dbValue: "uk",
    label: "Shoes (UK)",
    options: ["3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13"],
  },
  {
    id: "shoe-eu",
    dbValue: "eu",
    label: "Shoes (EU)",
    options: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"],
  },
  {
    id: "shoe-us",
    dbValue: "us",
    label: "Shoes (US)",
    options: ["4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "14"],
  },
  {
    id: "one-size",
    dbValue: "one-size",
    label: "One size",
    options: ["One size"],
  },
] as const satisfies readonly { id: string; dbValue: SizeSystemDbValue; label: string; options: readonly string[] }[]

export type SizeSystem = (typeof SIZE_SYSTEMS)[number]
export type SizeSystemId = SizeSystem["id"]

// Short prefix for a bare numeric size, so "9" reads as "UK 9" on a card. Keyed by the
// stored dbValue *and* by the picker id, because a listing written before dbValue existed
// may still hold "shoe-uk". Alpha / numeric / one-size get no prefix — "UK M" reads wrong.
const SIZE_SYSTEM_PREFIXES: Record<string, string> = {
  "uk": "UK",
  "eu": "EU",
  "us": "US",
  "shoe-uk": "UK",
  "shoe-eu": "EU",
  "shoe-us": "US",
}

/** Display prefix for products.size_system, or null when the size stands on its own. */
export function sizeSystemPrefix(sizeSystem: string | null | undefined): string | null {
  return SIZE_SYSTEM_PREFIXES[(sizeSystem || "").toLowerCase().trim()] ?? null
}

// How a category is sized: garments, footwear, or nothing to pick (books, home, beauty)
export type CategorySizing = "clothing" | "shoes" | "unsized"

const CATEGORY_SIZING: Record<string, CategorySizing> = {
  "womenswear": "clothing",
  "menswear": "clothing",
  "vintage": "clothing",
  "sneakers": "shoes",
}

// Size systems offered per category, in the order they should be shown
const CATEGORY_SIZE_SYSTEMS: Record<string, readonly SizeSystemId[]> = {
  "womenswear": ["alpha", "womens-numeric", "one-size"],
  "menswear": ["alpha", "mens-numeric", "one-size"],
  "vintage": ["alpha", "womens-numeric", "mens-numeric", "one-size"],
  "sneakers": ["shoe-uk", "shoe-eu", "shoe-us"],
}

export function sizeSystemForCategory(categoryId: string): CategorySizing {
  return CATEGORY_SIZING[normalizeCategoryToId(categoryId)] ?? "unsized"
}

export function sizeOptionsForCategory(categoryId: string): readonly SizeSystem[] {
  const ids: readonly SizeSystemId[] = CATEGORY_SIZE_SYSTEMS[normalizeCategoryToId(categoryId)] ?? ["one-size"]
  return SIZE_SYSTEMS.filter((system) => ids.includes(system.id))
}

// Item condition, ordered best-first (matches the products.condition CHECK constraint)
export const CONDITIONS = [
  { id: "new_with_tags", label: "New with tags", description: "Unworn, still has the original tags or packaging" },
  { id: "new_without_tags", label: "New without tags", description: "Unworn, but the tags have been removed" },
  { id: "very_good", label: "Very good", description: "Worn a few times, no visible flaws" },
  { id: "good", label: "Good", description: "Worn, with minor flaws that don't stand out" },
  { id: "satisfactory", label: "Satisfactory", description: "Well worn, with flaws shown in the photos" },
] as const

export type Condition = (typeof CONDITIONS)[number]
export type ConditionId = Condition["id"]

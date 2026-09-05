import type React from "react"

// ===========================================================================
//  THE STORELIB TAXONOMY
// ===========================================================================
//
// Single source of truth for what Storelib sells: digital products made by
// independent creators. Safe to import from both server and client components --
// no "use client", no server-only imports.
//
// ---------------------------------------------------------------------------
// WHERE THIS LIST COMES FROM
// ---------------------------------------------------------------------------
// It is not invented, and it is not a reconstruction. It is the taxonomy this
// platform actually shipped, recovered verbatim from the last commit before the
// fashion-marketplace pivot (95bb2f8f, 2026-04-21) -- the same fourteen
// categories and seventy subcategories that components/explore/
// explore-page-client.tsx has always browsed, and that
// app/(marketing)/explore/[category]/page.tsx has always had hand-written SEO
// copy for.
//
// An earlier pass at this file held six invented "departments" (design /
// templates / learning / audio / software / memberships). Those were a good
// guess made while the real list was believed lost, and they were wrong: they
// dropped AI, Social Media, Productivity, Video, E-commerce and Freebies
// entirely, and every /explore/<id> they produced was a URL this site had never
// served. They are gone.
//
// The marketplace era's own file lived here too -- womenswear, menswear,
// sneakers, vintage, UK shoe sizes and a "very good condition" scale. Also gone.
// A download has no size and no condition.
import {
  Layers,
  Sparkles,
  Code,
  Megaphone,
  Briefcase,
  Bot,
  Share2,
  Zap,
  Camera,
  Video,
  Music,
  GraduationCap,
  ShoppingBag,
} from "lucide-react"

/**
 * Categories with icons and subcategories.
 *
 * "all" is first and carries no subcategories: it is not a category, it is the
 * absence of a filter, which is why the rails include it and the navigation
 * menus do not.
 *
 * Subcategory ids are globally unique, which is what lets `?sub=` be resolved
 * by scanning every category rather than needing its parent to disambiguate it.
 */
const CATEGORIES = [
  { id: "all", label: "All", icon: Layers, subcategories: [] },
  {
    id: "design",
    label: "Design",
    icon: Sparkles,
    subcategories: [
      { id: "ui-ux", label: "UI/UX Templates" },
      { id: "graphics", label: "Graphics & Illustrations" },
      { id: "fonts", label: "Fonts & Typography" },
      { id: "icons", label: "Icons & Elements" },
      { id: "mockups", label: "Mockups" },
      { id: "logos", label: "Logo Templates" },
      { id: "branding", label: "Branding Kits" },
      { id: "print", label: "Print Design" },
    ],
  },
  {
    id: "development",
    label: "Development",
    icon: Code,
    subcategories: [
      { id: "web", label: "Web Templates" },
      { id: "mobile", label: "Mobile Apps" },
      { id: "scripts", label: "Scripts & Plugins" },
      { id: "apis", label: "APIs & Tools" },
      { id: "wordpress", label: "WordPress Themes" },
      { id: "shopify", label: "Shopify Themes" },
      { id: "react", label: "React Components" },
      { id: "nextjs", label: "Next.js Templates" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    subcategories: [
      { id: "email", label: "Email Templates" },
      { id: "ads", label: "Ad Creatives" },
      { id: "landing", label: "Landing Pages" },
      { id: "seo", label: "SEO Tools" },
      { id: "copywriting", label: "Copywriting Templates" },
      { id: "funnels", label: "Sales Funnels" },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: Briefcase,
    subcategories: [
      { id: "spreadsheets", label: "Spreadsheets" },
      { id: "presentations", label: "Presentations" },
      { id: "documents", label: "Documents & Contracts" },
      { id: "invoices", label: "Invoice Templates" },
      { id: "proposals", label: "Proposal Templates" },
      { id: "business-plans", label: "Business Plans" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    icon: Bot,
    subcategories: [
      { id: "prompts", label: "AI Prompts" },
      { id: "chatgpt", label: "ChatGPT Templates" },
      { id: "midjourney", label: "Midjourney Prompts" },
      { id: "automation", label: "Automation Tools" },
      { id: "ai-tools", label: "AI-Powered Tools" },
    ],
  },
  {
    id: "social-media",
    label: "Social Media",
    icon: Share2,
    subcategories: [
      { id: "instagram", label: "Instagram Templates" },
      { id: "tiktok", label: "TikTok Content" },
      { id: "youtube", label: "YouTube Assets" },
      { id: "twitter", label: "Twitter/X Templates" },
      { id: "linkedin", label: "LinkedIn Templates" },
      { id: "pinterest", label: "Pinterest Templates" },
      { id: "reels", label: "Reels & Shorts" },
    ],
  },
  {
    id: "productivity",
    label: "Productivity",
    icon: Zap,
    subcategories: [
      { id: "notion", label: "Notion Templates" },
      { id: "planners", label: "Calendars & Planners" },
      { id: "checklists", label: "Checklists" },
      { id: "trackers", label: "Habit Trackers" },
      { id: "dashboards", label: "Dashboards" },
      { id: "airtable", label: "Airtable Templates" },
    ],
  },
  {
    id: "photography",
    label: "Photography",
    icon: Camera,
    subcategories: [
      { id: "presets", label: "Lightroom Presets" },
      { id: "overlays", label: "Photo Overlays" },
      { id: "actions", label: "Photoshop Actions" },
      { id: "luts", label: "Color LUTs" },
      { id: "stock", label: "Stock Photos" },
    ],
  },
  {
    id: "video",
    label: "Video",
    icon: Video,
    subcategories: [
      { id: "templates", label: "Video Templates" },
      { id: "transitions", label: "Transitions & Effects" },
      { id: "motion", label: "Motion Graphics" },
      { id: "after-effects", label: "After Effects" },
      { id: "premiere", label: "Premiere Pro" },
      { id: "davinci", label: "DaVinci Resolve" },
    ],
  },
  {
    id: "audio-music",
    label: "Audio & Music",
    icon: Music,
    subcategories: [
      { id: "music", label: "Royalty-Free Music" },
      { id: "sfx", label: "Sound Effects" },
      { id: "loops", label: "Loops & Samples" },
      { id: "podcasts", label: "Podcast Templates" },
    ],
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    subcategories: [
      { id: "courses", label: "Online Courses" },
      { id: "ebooks", label: "eBooks" },
      { id: "tutorials", label: "Tutorials" },
      { id: "worksheets", label: "Worksheets" },
      { id: "guides", label: "Guides & How-tos" },
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    icon: ShoppingBag,
    subcategories: [
      { id: "product-photos", label: "Product Photography" },
      { id: "store-themes", label: "Store Themes" },
      { id: "pricing", label: "Pricing Templates" },
      { id: "emails", label: "E-commerce Emails" },
    ],
  },
  { id: "freebies", label: "Freebies", icon: Sparkles, subcategories: [] },
  { id: "other", label: "Other", icon: Layers, subcategories: [] },
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
 * `subcategories` (three of them are empty tuples) is not something you can call
 * `.map` or `.find` on. This is the one place that widening happens, and
 * everything below reads from it.
 */
type CategoryShape = { id: string; label: string; icon: CategoryIcon; subcategories: Subcategory[] }
const CATEGORY_LIST: CategoryShape[] = CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  icon: c.icon as CategoryIcon,
  subcategories: c.subcategories.map((s) => ({ id: s.id, label: s.label })),
}))

/** Server-side route and query validation. */
export const VALID_CATEGORY_IDS: string[] = CATEGORY_LIST.map((category) => category.id)

const VALID_CATEGORY_ID_SET = new Set<string>(VALID_CATEGORY_IDS)

/** Every subcategory id, flattened, so `?sub=` can be validated in one lookup. */
export const VALID_SUBCATEGORY_IDS: string[] = CATEGORY_LIST.flatMap((c) =>
  c.subcategories.map((s) => s.id),
)

/**
 * Map from free-text DB category values to the ids above.
 *
 * `products.category` is free text and holds three generations of value: the
 * labels this taxonomy has always displayed ("Notion Templates", "Lightroom
 * Presets"), plain ids, and the fashion strings the marketplace era wrote
 * ("Womenswear", "Sneakers"). The first two are mapped; the fashion ones
 * deliberately are NOT -- a jacket has no home here, and filing it under Design
 * would be worse than showing it as uncategorised.
 */
export const DB_CATEGORY_TO_ID: Record<string, string> = {
  // Exact id matches
  all: "all",
  design: "design",
  development: "development",
  marketing: "marketing",
  business: "business",
  ai: "ai",
  "social-media": "social-media",
  "social media": "social-media",
  productivity: "productivity",
  photography: "photography",
  video: "video",
  "audio-music": "audio-music",
  "audio & music": "audio-music",
  audio: "audio-music",
  education: "education",
  ecommerce: "ecommerce",
  "e-commerce": "ecommerce",
  freebies: "freebies",
  other: "other",

  // Design
  "ui/ux templates": "design",
  "ui kit": "design",
  "ui kits": "design",
  "graphics & illustrations": "design",
  graphics: "design",
  "graphic design": "design",
  illustrations: "design",
  illustration: "design",
  "digital art": "design",
  art: "design",
  "fonts & typography": "design",
  fonts: "design",
  font: "design",
  typefaces: "design",
  typography: "design",
  "icons & elements": "design",
  icons: "design",
  mockups: "design",
  mockup: "design",
  "logo templates": "design",
  logos: "design",
  "branding kits": "design",
  branding: "design",
  "print design": "design",
  print: "design",
  "design templates": "design",
  "design template": "design",

  // Development
  "web templates": "development",
  web: "development",
  "mobile apps": "development",
  mobile: "development",
  apps: "development",
  app: "development",
  "scripts & plugins": "development",
  scripts: "development",
  plugins: "development",
  plugin: "development",
  extensions: "development",
  code: "development",
  "apis & tools": "development",
  apis: "development",
  "wordpress themes": "development",
  wordpress: "development",
  "shopify themes": "development",
  shopify: "development",
  "react components": "development",
  react: "development",
  "next.js templates": "development",
  nextjs: "development",
  saas: "development",

  // Marketing
  "email templates": "marketing",
  email: "marketing",
  "ad creatives": "marketing",
  ads: "marketing",
  "landing pages": "marketing",
  landing: "marketing",
  "seo tools": "marketing",
  seo: "marketing",
  "copywriting templates": "marketing",
  copywriting: "marketing",
  "sales funnels": "marketing",
  funnels: "marketing",

  // Business
  spreadsheets: "business",
  spreadsheet: "business",
  excel: "business",
  "google sheets": "business",
  presentations: "business",
  "documents & contracts": "business",
  documents: "business",
  contracts: "business",
  "invoice templates": "business",
  invoices: "business",
  "proposal templates": "business",
  proposals: "business",
  "business plans": "business",
  "resume templates": "business",
  "cv templates": "business",

  // AI
  "ai prompts": "ai",
  prompts: "ai",
  "chatgpt templates": "ai",
  chatgpt: "ai",
  "midjourney prompts": "ai",
  midjourney: "ai",
  "automation tools": "ai",
  automation: "ai",
  "ai-powered tools": "ai",
  "ai tools": "ai",

  // Social media
  "instagram templates": "social-media",
  instagram: "social-media",
  "tiktok content": "social-media",
  tiktok: "social-media",
  "youtube assets": "social-media",
  youtube: "social-media",
  "twitter/x templates": "social-media",
  twitter: "social-media",
  "linkedin templates": "social-media",
  linkedin: "social-media",
  "pinterest templates": "social-media",
  pinterest: "social-media",
  "reels & shorts": "social-media",
  reels: "social-media",

  // Productivity
  "notion templates": "productivity",
  "notion template": "productivity",
  notion: "productivity",
  "calendars & planners": "productivity",
  planners: "productivity",
  planner: "productivity",
  calendars: "productivity",
  checklists: "productivity",
  "habit trackers": "productivity",
  trackers: "productivity",
  dashboards: "productivity",
  "airtable templates": "productivity",
  airtable: "productivity",
  printables: "productivity",

  // Photography
  "lightroom presets": "photography",
  presets: "photography",
  "photo overlays": "photography",
  overlays: "photography",
  "photoshop actions": "photography",
  actions: "photography",
  "color luts": "photography",
  luts: "photography",
  "stock photos": "photography",
  stock: "photography",
  photos: "photography",

  // Video
  "video templates": "video",
  "transitions & effects": "video",
  transitions: "video",
  "motion graphics": "video",
  motion: "video",
  "after effects": "video",
  "premiere pro": "video",
  premiere: "video",
  "davinci resolve": "video",
  davinci: "video",

  // Audio & music
  "royalty-free music": "audio-music",
  music: "audio-music",
  "sound effects": "audio-music",
  sfx: "audio-music",
  "loops & samples": "audio-music",
  loops: "audio-music",
  samples: "audio-music",
  "sample packs": "audio-music",
  beats: "audio-music",
  "beat packs": "audio-music",
  "beat pack": "audio-music",
  "podcast templates": "audio-music",
  podcasts: "audio-music",
  podcast: "audio-music",

  // Education
  "online courses": "education",
  "online course": "education",
  courses: "education",
  course: "education",
  ebooks: "education",
  ebook: "education",
  "e-books": "education",
  "e-book": "education",
  books: "education",
  tutorials: "education",
  tutorial: "education",
  "video tutorials": "education",
  worksheets: "education",
  worksheet: "education",
  "guides & how-tos": "education",
  guides: "education",
  guide: "education",
  coaching: "education",
  "1:1 coaching": "education",
  fitness: "education",
  "fitness plans": "education",

  // E-commerce
  "product photography": "ecommerce",
  "product-photos": "ecommerce",
  "store themes": "ecommerce",
  "pricing templates": "ecommerce",
  "e-commerce emails": "ecommerce",

  // Freebies
  free: "freebies",
  freebie: "freebies",

  // Catch-alls
  misc: "other",
  miscellaneous: "other",
  uncategorized: "other",
  uncategorised: "other",
  memberships: "other",
  membership: "other",
  community: "other",
  communities: "other",
  merch: "other",
}

/**
 * Normalize a DB category value to a code category id.
 *
 * Anything unrecognised falls back to "other" rather than to itself, so a stale
 * value -- including every fashion string the marketplace era wrote -- can never
 * match a real category filter. "other" is a real browsable category here, which
 * is why it is the fallback: an unrecognised product is still reachable.
 */
export function normalizeCategoryToId(dbCategory: string | null | undefined): string {
  const lower = (dbCategory || "").toLowerCase().trim()
  if (!lower) return ""
  const mapped = DB_CATEGORY_TO_ID[lower]
  if (mapped) return mapped
  return VALID_CATEGORY_ID_SET.has(lower) ? lower : "other"
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

/** The label for a subcategory id, searched across every category. */
export function subcategoryLabel(id: string | null | undefined): string | null {
  if (!id) return null
  for (const category of CATEGORY_LIST) {
    const hit = category.subcategories.find((s) => s.id === id)
    if (hit) return hit.label
  }
  return null
}

/**
 * The path for a category, and optionally one subcategory inside it.
 *
 * A PATH for the category, because /explore/design is a page a crawler can rank
 * and a person can read -- and it is the URL this site has served all along. The
 * subcategory stays a query param: it filters the page rather than being a page
 * of its own, and every subcategory id is globally unique so `?sub=` needs no
 * parent to disambiguate it.
 */
export function categoryPath(categoryId?: string | null, subId?: string | null): string {
  if (!categoryId || categoryId === "all") return "/explore"
  const base = `/explore/${categoryId}`
  return subId ? `${base}?sub=${subId}` : base
}

export type CategoryNavItem = {
  id: string
  label: string
  href: string
  icon: CategoryIcon
  subcategories: { id: string; label: string; href: string }[]
}

/** The fourteen categories, each drilling into its own subcategories. */
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

/** The same, with "All" in front, for the rails that FILTER rather than navigate. */
export const CATEGORY_RAIL: { id: string; label: string; icon: CategoryIcon }[] = CATEGORY_LIST.map(
  (c) => ({ id: c.id, label: c.label, icon: c.icon }),
)

/** The subcategories of one category, or an empty list for an unknown id. */
export function subcategoriesFor(categoryId: string): { id: string; label: string }[] {
  return [...(getCategory(categoryId)?.subcategories ?? [])]
}

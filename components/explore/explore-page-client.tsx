"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef, useDeferredValue } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { ExploreHero, type DiscoverMode } from "./explore-hero"
import { writeDiscoverModeCookie } from "@/lib/explore/discover-mode-cookie"
import { ProductCard } from "./product-card"
import { ExploreCommunityGrid } from "./community-card"
import { ExploreCommunitiesResults, type CommunitiesFirstPage } from "./explore-communities-results"
import type { CommunityCard } from "@/lib/communities/types"
import { COMMUNITY_PRICE_FILTERS, COMMUNITY_SORT_OPTIONS, EXPLORE_COMMUNITIES_HREF } from "@/lib/explore/communities-mode"
import { useEntranceOnChange } from "@/lib/ui/use-entrance-on-change"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Zap, Share2, Bot, SlidersHorizontal, ChevronLeft, ChevronRight, Briefcase, Megaphone, ArrowRight, Music, Camera, Video, ShoppingBag, GraduationCap, Code } from "lucide-react"
import { ExploreCategoryPicker } from "./explore-category-picker"
import { ExploreFilters, DEFAULT_SORT, PRICE_FILTERS, SORT_OPTIONS } from "./explore-filters"
import { Chevron, type BrowseGroup } from "./category-browser"
import { useLocale } from "@/components/locale-provider"
import { EMPTY_INTERESTS, FOR_YOU_ID, buildPillRow, interestScore, type Interests } from "@/lib/explore/interests"
import { hasCategoryPage, showAllLabel as showAllProductsLabel } from "@/lib/explore/category-pages"
import { normalizeCategoryToId as normalizeCategory } from "@/lib/marketplace/categories"
import { matchesSubcategory, subcategoryTerms } from "@/lib/explore/subcategory-match"
import { useExploreScrollRestore, useExploreScrollRestoring } from "@/lib/explore/use-explore-scroll"

// Categories with icons and subcategories - Extended list
const CATEGORIES = [
  {
    id: "all",
    label: "All",
    icon: Layers,
    subcategories: []
  },
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
    ]
  },
  {
    id: "development",
    /* "Tech", per the owner. The id stays `development` because it is what
       products carry in their category column and what every link already
       written points at; the label is the part a visitor reads. */
    label: "Tech",
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
  },
  {
    id: "freebies",
    label: "Freebies",
    icon: Sparkles,
    subcategories: []
  },
  {
    id: "other",
    label: "Other",
    icon: Layers,
    subcategories: []
  },
] as const

/* A DB category value as a category id, by the shared rule
   (lib/marketplace/categories), which the category pages use too, so a pill
   here and its "Show All" page list the same products. The copy of the table
   that lived here did not know the product editor's own names ("UI Kits",
   "Notion Dashboards"), so those products were in no category at all. */
function normalizeCategoryToId(dbCategory: string): string {
  return normalizeCategory(dbCategory)
}

// Filter types for Recommended section
/**
 * THE PILLS, WHICH ARE A SUBSET AND SAY SO.
 *
 * Nine of the fifteen categories, chosen because they are the ones with
 * products in them, plus "More..." for the rest — which opens the picker that
 * already existed rather than being a second list to keep in step. Derived
 * from CATEGORIES so a label or an icon is edited in one place.
 */
const PILL_IDS = [
  "all",
  "design",
  "development",
  "business",
  "marketing",
  "ai",
  "education",
  "productivity",
  "video",
] as const
/**
 * REAL EMOJI, NOT LINE ICONS. The owner asked for the platform's own emoji,
 * which is what every marketplace with a category row uses: they carry colour
 * and read at 14px where a one-pixel stroke does not, and they are the same
 * glyphs a visitor sees everywhere else on their phone.
 *
 * Kept here rather than on CATEGORIES because the label and the id are shared
 * with the picker and the URL, and only the pills want a face on them.
 */
export const PILL_EMOJI: Record<string, string> = {
  all: "\u{1F30D}",
  /* For you keeps the globe, per the owner: the pill in that position has
     always been the world and swapping its face as well as its name would
     make it read as a different control rather than the same one, named
     for you. */
  "for-you": "\u{1F30D}",
  design: "\u{1F3A8}",
  business: "\u{1F4BC}",
  marketing: "\u{1F4C8}",
  ai: "\u{2728}",
  education: "\u{1F393}",
  development: "\u{1F4BB}",
  productivity: "\u{26A1}",
  video: "\u{1F3AC}",
  /* The other six, because an interest pill can be any category and a pill
     with no face next to eight that have one looks broken. */
  "social-media": "\u{1F4AC}",
  photography: "\u{1F4F7}",
  "audio-music": "\u{1F3B5}",
  ecommerce: "\u{1F6D2}",
  freebies: "\u{1F381}",
  other: "\u{1F4E6}",
}
export const CATEGORY_PILLS = PILL_IDS
  .map((id) => CATEGORIES.find((c) => c.id === id))
  .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c))

/** The categories, as the More picker lists them: everything but "All", with their subcategories. */
const PICKER_GROUPS: BrowseGroup[] = CATEGORIES.filter((c) => c.id !== "all").map((c) => ({
  id: c.id,
  label: c.label,
  items: c.subcategories,
}))

/*
  COMMUNITIES MODE HAS THE PRODUCTS' ROW AND THE PRODUCTS' MORE (round 8: the
  owner wants the categories to open up for communities too). The same
  pills in the same order, with All where For you would be (For you is
  built from what somebody bought, which says nothing about where they
  would gather), the same Communities pill in the second place (pressed,
  and pressing it again goes back to the products), and the same picker
  with the whole tree, subcategories included.

  A community stores one category id (communities.category), never a
  subcategory, so the server reads a subcategory as its parent category
  narrowed by the subcategory's words in the name, tagline or description,
  and when no community in that category mentions them it shows the whole
  category and says so (lib/communities/server/explore.ts). Freebies is a
  price, so there it is the free communities.
*/
/** A subcategory id from the address, with its label, or null for anything the tree does not have. */
function subcategoryFromAddress(id: string | null): { id: string; label: string } | null {
  if (!id) return null
  for (const g of PICKER_GROUPS) {
    const hit = g.items.find((x) => x.id === id)
    if (hit) return { id: hit.id, label: hit.label }
  }
  return null
}

/**
 * The row's shape is decided by lib/explore/interests, which is pure and
 * tested. This turns its ids into the objects the pills are drawn from.
 */
function pillsFrom(interests: Interests) {
  const row = buildPillRow(
    interests,
    PILL_IDS,
    CATEGORIES.map((c) => c.id),
  )
  return {
    first: { id: row.firstId, label: row.firstLabel },
    pills: row.ids
      .map((id) => CATEGORIES.find((c) => c.id === id))
      .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c)),
    personalised: row.personalised,
  }
}

/**
 * EIGHT ROWS, which at three across is twenty-four. The number is derived
 * from the rows and the columns rather than written out, so changing either
 * one keeps the other honest. It was seven for a day; the owner said eight.
 */
const PRODUCTS_PER_ROW = 3
const ROWS_PER_PAGE = 8
const PRODUCTS_PER_PAGE = PRODUCTS_PER_ROW * ROWS_PER_PAGE

// Search Input Component
function smoothScrollToRecommendedSection(ref: React.RefObject<HTMLElement | null>) {
  if (!ref.current) return

  const yOffset = -96
  const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset

  window.scrollTo({
    top: Math.max(0, y),
    behavior: "smooth",
  })
}

function smoothScrollToBrowseSection(ref: React.RefObject<HTMLElement | null>) {
  if (!ref.current) return

  const yOffset = -96
  const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset

  window.scrollTo({
    top: Math.max(0, y),
    behavior: "smooth",
  })
}

interface ExplorePageClientProps {
  initialProducts: any[]
  initialCategory: string
  /** See lib/explore/interests. Empty and `enough: false` when signed out. */
  interests?: Interests
  searchQuery: string
  /** Gray pill above “Discover” — admin / Health → Discover headline pill switch. */
  discoverHeadlineSegmentEnabled?: boolean
  initialDiscoverMode?: DiscoverMode
  /** Communities are switched on: the only gate on communities mode (reached through the hero's Discover switcher). */
  communitiesEnabled?: boolean
  /** On a search, the communities that match (lib/communities/server/explore.ts), drawn above the products. */
  communityResults?: CommunityCard[]
  /** Communities mode's first page, drawn on the server when the page opens in that mode. */
  initialCommunities?: CommunitiesFirstPage | null
}

export function ExplorePageClient({
  initialProducts,
  initialCategory,
  interests = EMPTY_INTERESTS,
  searchQuery: urlSearchQuery,
  discoverHeadlineSegmentEnabled = false,
  initialDiscoverMode = "products",
  communitiesEnabled = false,
  communityResults = [],
  initialCommunities = null,
}: ExplorePageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  /* Set from the switcher in the hero's chip, and written to the address as
     ?type=communities so Back from a community lands on communities. */
  /* Only while communities are switched on (lib/explore/communities-mode discoverModeFor): off, an old link or cookie asking for them gets the products. */
  const [mode, setMode] = useState<DiscoverMode>(() => {
    if (!communitiesEnabled) return "products"
    const fromUrl = searchParams.get("type")
    if (fromUrl === "communities") return "communities"
    if (fromUrl === "products") return "products"
    return initialDiscoverMode
  })
  const communities = mode === "communities"

  // Main category (for Recommended section)
  /*
    FOR YOU IS THE DEFAULT, for an account that has shown us enough. Arriving
    on /explore with no category in the address is "show me the front of the
    shop", and for somebody we know something about the front of the shop is
    their own. An address that names a category still wins.
  */
  const [mainCategory, setMainCategory] = useState(() => {
    const fromUrl = initialCategory.toLowerCase() || "all"
    return fromUrl === "all" && interests.enough && !communities ? FOR_YOU_ID : fromUrl
  })

  // Selected subcategory from modal
  /* From the address on the first render, so a shared ?sub= link asks the communities route for the same list the server drew instead of drawing the category first and then narrowing it. */
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(() => subcategoryFromAddress(searchParams.get("sub"))?.id ?? null)
  const [selectedSubcategoryLabel, setSelectedSubcategoryLabel] = useState<string | null>(() => subcategoryFromAddress(searchParams.get("sub"))?.label ?? null)

  // Separate category for the Browse by Category section
  const [browseCategory, setBrowseCategory] = useState("all")

  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<"curated" | "trending" | "hot-new">("curated")
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const categorySectionRef = useRef<HTMLElement>(null)
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE LAST CATEGORY THE VISITOR ACTUALLY CHOSE
    ═══════════════════════════════════════════════════════════════════════
    Tapping a pill sets the state at once and writes the URL a moment later,
    and the URL write is a server round trip. When it lands, the effect below
    reads the category out of it and applies it — which is right when somebody
    arrives on a link, and wrong when they have tapped two more pills since.
    The reply to "design" would arrive after they had moved to "ai" and put
    them back on design.

    That is "it bugs when I switch too fast". So the choice is remembered, and
    an incoming URL that does not match it is a reply to a question that has
    been superseded.
  */
  const chosenCategoryRef = useRef<string | null>(null)
  const categoryAutoScrollTimeoutRef = useRef<number | null>(null)
  const pendingCategoryAutoScrollRef = useRef(false)
  const browseSectionRef = useRef<HTMLElement>(null)
  const pendingBrowseAutoScrollRef = useRef(false)
  const scrollTargetHandledRef = useRef<string | null>(null)
  const hasMountedRef = useRef(false)

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  /* From the address on the first render, so communities mode asks the server for the order the page was drawn with rather than the default and then again. */
  const [sortBy, setSortBy] = useState<string>(() => {
    const srt = searchParams.get("srt")
    return srt && SORT_OPTIONS.some((o) => o.id === srt) ? srt : DEFAULT_SORT
  })
  /*
    THE LIST FOLLOWS THE CHOICE A BEAT BEHIND IT, NOT IN THE SAME FRAME. A
    tap on a price re-ranks the catalogue and redraws twenty-four cards; done
    at the tap's own priority that is the frame the panel's tick lands on, so
    the tick waited for the grid. Deferred, the control answers at once and
    the grid is drawn straight after.
  */
  const deferredPrice = useDeferredValue(priceFilter)
  const deferredSort = useDeferredValue(sortBy)
  /*
    ═══════════════════════════════════════════════════════════════════════
     useLocale, NOT useLanguage, AND THE DIFFERENCE TOOK THE PAGE DOWN
    ═══════════════════════════════════════════════════════════════════════
    There are two language contexts in this codebase. lib/i18n/context's
    LanguageProvider is mounted in ONE place, components/app/app-layout-wrapper,
    which wraps the /app workspace and nothing else. Its useLanguage throws
    when there is no provider above it, and /explore is under (marketing),
    so calling it here replaced the whole page with an error boundary.

    LocaleProvider is in the root layout, so it is above everything, and its
    useLocale carries the same language and the same setter. That is the one
    a marketing route can use.
  */
  const { language, setLanguage, languages: availableLanguages } = useLocale()

  useExploreScrollRestore()
  const restoringExploreScroll = useExploreScrollRestoring()

  /* See buildPills: identical to everybody else's row below the threshold. */
  const pillRow = useMemo(() => pillsFrom(interests), [interests])
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The More pill's picker
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false)

  // Reset stale scroll lock state on mount (prevents scroll bugs after navigation)
  useEffect(() => {
    document.body.classList.remove("modal-open")
    document.body.style.removeProperty("--scroll-y")
  }, [])

  // Store back-label so product pages can show "< Explore" in their breadcrumb
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", "Explore") } catch { /* ignore */ }
  }, [])

  // Search states
  const [localSearchQuery, setLocalSearchQuery] = useState("")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [mode, mainCategory, selectedSubcategoryId, recommendationFilter, priceFilter, sortBy, localSearchQuery])

  // Products for featured section
  const featuredProducts = useMemo(() => {
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  // Get Recommended section products (based on main category and subcategory)
  const recommendedProducts = useMemo(() => {
    /* Every product, memberships included: communities are their own rows now (ExploreCommunitiesResults), not membership products. */
    let products = [...initialProducts]
    const searching = localSearchQuery.trim().length > 0

    /*
      ═══════════════════════════════════════════════════════════════════════
       FOR YOU IS AN ORDER, NOT A FILTER
      ═══════════════════════════════════════════════════════════════════════
      It could have been "only products in your categories", and that makes a
      page that runs out. Ranking instead means the things this person is most
      likely to want are at the top and the rest of the catalogue is still
      underneath, so scrolling never hits a wall and the pagination still has
      eight rows to fill.

      What it does remove is what they already own. Being sold a thing you
      have already bought is the one recommendation that is definitely wrong.
    */
    /* Declared before the branches below so they can stand down. */
    if (searching) {
      /* nothing: a search is not scoped to a category */
    } else if (mainCategory === FOR_YOU_ID) {
      const owned = new Set(interests.ownedProductIds)
      products = products
        .filter((p) => !owned.has(p.id))
        .map((p) => ({ p, score: interestScore(p, interests) }))
        .sort((a, b) => b.score - a.score)
        .map(({ p }) => p)
    }
    // Special handling for "freebies" category - show free products
    else if (mainCategory === "freebies") {
      products = products.filter(p => p.price_cents === 0)
    }
    // For all other categories (including "other"): strictly filter by normalized DB category
    else if (mainCategory !== "all") {
      products = products.filter(p => {
        // Primary: match via normalized DB category field
        const normalizedCategory = normalizeCategoryToId(p.category || p.categoryName || "")
        if (normalizedCategory === mainCategory) return true

        // Secondary: match via creator niche tags
        const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
        if (creatorTags.includes(mainCategory)) return true

        return false
      })
    }

    /* A subcategory is found in the fields this page loads: the product's
       category, title and description (lib/explore/subcategory-match). It
       read `subcategory` and `tags`, which the route never selects, and
       looked for the slug itself in the text, so most subcategories came
       back empty. The category page uses the same rule. */
    if (selectedSubcategoryId) {
      const subDef = CATEGORIES.flatMap((c) => c.subcategories as readonly { id: string; label: string }[]).find((x) => x.id === selectedSubcategoryId)
      const terms = subcategoryTerms(selectedSubcategoryId, subDef?.label ?? selectedSubcategoryId)
      products = products.filter((p) => matchesSubcategory(p, terms))
    }

    // Filter by local search
    /*
      ═══════════════════════════════════════════════════════════════════════
       A SEARCH LOOKS AT EVERYTHING, AND IN EVERY FIELD
      ═══════════════════════════════════════════════════════════════════════
      Two things were wrong with this. It matched the title and the
      description and nothing else, so a creator's name found nothing; and it
      ran AFTER the category narrowing above, so searching while a pill was
      selected searched inside that pill. With For you selected by default for
      a signed-in visitor, that is a search box that quietly answers a
      different question from the one it was asked.

      A search is now the whole catalogue, in every field a visitor could
      reasonably mean. The category block above is skipped while there is a
      query, and comes back the moment the field is cleared.
    */
    if (searching) {
      const query = localSearchQuery.trim().toLowerCase()
      products = products.filter((p) => {
        const creator = p.creator || {}
        return (
          p.title?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query) ||
          p.categoryName?.toLowerCase().includes(query) ||
          creator.display_name?.toLowerCase().includes(query) ||
          creator.username?.toLowerCase().includes(query) ||
          creator.slug?.toLowerCase().includes(query)
        )
      })
    }

    // Save the category-filtered set before recommendation sorting (for backfill)
    const categoryFilteredProducts = [...products]

    /*
      FOR YOU KEEPS ITS OWN ORDER. The ranking below re-sorted the whole list
      by general quality, which quietly undid the interest ranking above it:
      For you came out in the same order as All. Its order is the point of it.
    */
    const ranking = mainCategory === FOR_YOU_ID && !searching ? "for-you" : recommendationFilter

    // Apply recommendation filter with smart sorting algorithms
    switch (ranking) {
      case "for-you":
        break
      case "trending":
        // Trending: Score based on recent engagement, sales velocity, and popularity
        // Higher weight to recent activity (last 14 days)
        const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
        products = products.sort((a, b) => {
          const aCreatedRecently = new Date(a.created_at).getTime() > fourteenDaysAgo ? 1.5 : 1
          const bCreatedRecently = new Date(b.created_at).getTime() > fourteenDaysAgo ? 1.5 : 1
          const scoreA = ((a.sales_count || 0) * 3 + (a.reviews_count || 0) * 2 + (a.view_count || 0) * 0.1) * aCreatedRecently
          const scoreB = ((b.sales_count || 0) * 3 + (b.reviews_count || 0) * 2 + (b.view_count || 0) * 0.1) * bCreatedRecently
          return scoreB - scoreA
        })
        break
      case "hot-new":
        // Hot & New: Products from last 30 days, ranked by early traction and quality
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        products = products
          .filter(p => new Date(p.created_at).getTime() > thirtyDaysAgo)
          .sort((a, b) => {
            const aIsNew = new Date(a.created_at).getTime() > sevenDaysAgo
            const bIsNew = new Date(b.created_at).getTime() > sevenDaysAgo
            const aNewBoost = aIsNew ? 2 : 1
            const bNewBoost = bIsNew ? 2 : 1
            const scoreA = ((a.sales_count || 0) * 5 + (a.reviews_count || 0) * 3 + (a.reviews_average || 0) * 2) * aNewBoost
            const scoreB = ((b.sales_count || 0) * 5 + (b.reviews_count || 0) * 3 + (b.reviews_average || 0) * 2) * bNewBoost
            if (Math.abs(scoreA - scoreB) < 5) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            }
            return scoreB - scoreA
          })
        // Backfill from SAME category (not all products) if not enough hot & new
        if (products.length < 15) {
          const olderProducts = categoryFilteredProducts
            .filter(p => !products.find(rp => rp.id === p.id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 15 - products.length)
          products = [...products, ...olderProducts]
        }
        break
      case "curated":
      default:
        // Curated: Best overall quality - weighted scoring algorithm
        products = products.sort((a, b) => {
          const aReviewScore = (a.reviews_average || 0) * Math.min(a.reviews_count || 0, 20) * 0.5
          const bReviewScore = (b.reviews_average || 0) * Math.min(b.reviews_count || 0, 20) * 0.5
          const aSalesScore = Math.min(a.sales_count || 0, 100) * 2
          const bSalesScore = Math.min(b.sales_count || 0, 100) * 2
          const aCompleteBonus = (a.thumbnail_url ? 5 : 0) + ((a.description?.length || 0) > 100 ? 5 : 0)
          const bCompleteBonus = (b.thumbnail_url ? 5 : 0) + ((b.description?.length || 0) > 100 ? 5 : 0)
          const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
          const aFreshBonus = new Date(a.created_at).getTime() > sixtyDaysAgo ? 10 : 0
          const bFreshBonus = new Date(b.created_at).getTime() > sixtyDaysAgo ? 10 : 0
          const scoreA = aReviewScore + aSalesScore + aCompleteBonus + aFreshBonus
          const scoreB = bReviewScore + bSalesScore + bCompleteBonus + bFreshBonus
          return scoreB - scoreA
        })
        break
    }

    // Apply price filter
    switch (deferredPrice) {
      case "free":
        products = products.filter(p => p.price_cents === 0)
        break
      case "under-10":
        products = products.filter(p => p.price_cents > 0 && p.price_cents < 1000)
        break
      case "10-50":
        products = products.filter(p => p.price_cents >= 1000 && p.price_cents <= 5000)
        break
      case "50-plus":
        products = products.filter(p => p.price_cents > 5000)
        break
    }

    // Apply sort override — only override the ranking for an explicit sort pick.
    // "recommended" (the default) leaves the ranking above in place.
    switch (deferredSort) {
      case "newest":
        products = products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case "popular":
        products = products.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "price-low":
        products = products.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
        break
      case "price-high":
        products = products.sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0))
        break
      case "recommended":
      default:
        // Don't override — let the recommendation filter sorting stand
        break
    }

    return products
  }, [initialProducts, mainCategory, selectedSubcategoryId, recommendationFilter, deferredPrice, deferredSort, localSearchQuery, interests])

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE
    return recommendedProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE)
  }, [recommendedProducts, currentPage])

  /*
    ═══════════════════════════════════════════════════════════════════════════
     THE GRIDS FADE IN WHEN THEY CHANGE, NOT WHEN YOU ARRIVE AT THEM
    ═══════════════════════════════════════════════════════════════════════════
    Each of these three grids carried `animate-in fade-in-0` unconditionally.
    That is right for what it was written for — pick a category, change the
    sort, go to page two, and the new set fades up instead of snapping — and it
    is wrong on arrival, because a mount is a mount and coming BACK from a
    product page is one.

    The main grid is 3364px tall. Filmed on production going back to /explore:

         54ms   mean 194.4   65.6% white   the listing, as it was
         73ms   mean 227.2   90.3% white   the grid at opacity 0
        142ms   mean 212.0   66.8% white   coming back
        327ms   mean 194.7   61.8% white   settled

    A quarter of a second of near-white page on every return, and the same
    88.9/89.0% white shows up in the screen recording that reported it.

    The token each one passes is what already decides whether its CONTENTS
    changed: the filters for the first, the browsed category for the second,
    the query for the third. First render compares it against itself and
    nothing animates; anything different afterwards is a change the visitor
    made while looking at it.
  */
  const productsGridToken = `${mode}-${mainCategory}-${selectedSubcategoryId}-${recommendationFilter}-${deferredPrice}-${deferredSort}-${currentPage}`
  const productsGridEntrance = useEntranceOnChange(
    productsGridToken,
    "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
  )
  const browseGridEntrance = useEntranceOnChange(browseCategory, "animate-in fade-in-0 duration-200")
  const searchGridEntrance = useEntranceOnChange(urlSearchQuery || "", "animate-in fade-in-0 duration-200")

  const totalPages = Math.ceil(recommendedProducts.length / PRODUCTS_PER_PAGE)

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  CHANGING PAGE PUTS YOU AT THE TOP OF THE NEW ONE
   * ═════════════════════════════════════════════════════════════════════════
   * The controls set the page and nothing else, so pressing 2 left the
   * visitor exactly where they were — at the BOTTOM of the list, looking at
   * the last row of a page they had already read, with twenty-one new
   * products above them and no sign anything had happened. Every catalogue
   * that pages returns you to the start of the list, because that is where
   * the thing you asked for is.
   *
   * The section's own top rather than the document's: the heading, the pills
   * and the filters stay in view, so the list changes under controls that do
   * not move.
   */
  /**
   * ===========================================================================
   *  THE URL SAYS WHAT YOU ARE LOOKING AT
   * ===========================================================================
   * Switching a category used to leave `?category=design` behind and nothing
   * else, so a link somebody sent you opened on a different sort in whatever
   * language their browser happened to pick. The owner asked for the shape
   * `?c=…&lang=…&srt=…`, and all three are read back on arrival, which is the
   * only thing that makes them worth writing.
   *
   * `srt` carries the sort ids this page actually has — newest, popular,
   * price-low, price-high — rather than a word invented for the URL. `lang`
   * carries the code from lib/i18n, which is what setLanguage takes, so the
   * link opens in the language it was shared from.
   */
  const exploreHref = useCallback(
    (categoryId: string, sort: string = sortBy, forMode: DiscoverMode = mode) => {
      const params = new URLSearchParams()
      if (forMode === "communities") params.set("type", "communities")
      if (categoryId && categoryId !== "all" && categoryId !== FOR_YOU_ID) params.set("c", categoryId)
      params.set("lang", language)
      params.set("srt", sort)
      return `/explore?${params.toString()}`
    },
    [language, sortBy, mode],
  )

  /* A different catalogue, so the category starts over: All for
     communities, and the usual first pill for products. */
  const handleModeChange = useCallback((next: DiscoverMode) => {
    const firstCategory = next === "products" && interests.enough ? FOR_YOU_ID : "all"
    writeDiscoverModeCookie(next)
    setMode(next)
    /* The two catalogues order and price differently (lib/explore/communities-mode), so the filters start over too. */
    setPriceFilter("all")
    setSortBy(DEFAULT_SORT)
    setMainCategory(firstCategory)
    setBrowseCategory("all")
    setSelectedSubcategoryId(null)
    setSelectedSubcategoryLabel(null)
    setCurrentPage(1)
    chosenCategoryRef.current = firstCategory
    if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
    categoryChangeTimeoutRef.current = setTimeout(() => {
      let href = exploreHref("all", DEFAULT_SORT, next)
      if (urlSearchQuery) href += `&q=${encodeURIComponent(urlSearchQuery)}`
      router.replace(href, { scroll: false })
    }, 250)
  }, [interests.enough, exploreHref, urlSearchQuery, router])

  const goToPage = useCallback((page: number) => {
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === currentPage) return
    setCurrentPage(next)
    smoothScrollToRecommendedSection(categorySectionRef)
  }, [currentPage, totalPages])

  // Get products for the Browse by Category section - 2 rows x 3 = 6 products
  const browseSectionProducts = useMemo(() => {
    let products = [...initialProducts]

    if (browseCategory !== "all") {
      products = products.filter(p => {
        const normalizedCategory = normalizeCategoryToId(p.category || p.categoryName || "")
        if (normalizedCategory === browseCategory) return true
        const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
        if (creatorTags.includes(browseCategory)) return true
        return false
      })
    }

    products = products.sort((a, b) => {
      const scoreA = (a.reviews_average || 0) * (a.reviews_count || 0) + (a.sales_count || 0)
      const scoreB = (b.reviews_average || 0) * (b.reviews_count || 0) + (b.sales_count || 0)
      return scoreB - scoreA
    })

    return products.slice(0, 6)
  }, [initialProducts, browseCategory])

  // Get active filter count
  const activeFilterCount = (priceFilter !== "all" ? 1 : 0) + (sortBy !== DEFAULT_SORT ? 1 : 0)

  // Reset filters
  const resetFilters = useCallback(() => {
    setPriceFilter("all")
    setSortBy(DEFAULT_SORT)
  }, [])

  // Get section title - shows subcategory label if selected
  const sectionTitle = useMemo(() => {
    if (urlSearchQuery) return `Results for "${urlSearchQuery}"`
    if (selectedSubcategoryLabel) return selectedSubcategoryLabel
    if (mainCategory === "all") return "Recommended"
    return CATEGORIES.find(c => c.id === mainCategory)?.label || "Products"
  }, [mainCategory, selectedSubcategoryLabel, urlSearchQuery])

  /* The wording is in lib/explore/category-pages, where it can be driven
     with the awkward inputs rather than read back as a regex. */
  const showAllLabel = useMemo(
    () => showAllProductsLabel(selectedSubcategoryLabel || sectionTitle),
    [selectedSubcategoryLabel, sectionTitle],
  )

  const scrollRecommendedSectionWithRetry = useCallback((attempt = 0) => {
    if (urlSearchQuery) return

    if (categorySectionRef.current) {
      smoothScrollToRecommendedSection(categorySectionRef)
      return
    }

    if (attempt >= 8) return

    categoryAutoScrollTimeoutRef.current = window.setTimeout(() => {
      scrollRecommendedSectionWithRetry(attempt + 1)
    }, 60)
  }, [urlSearchQuery])

  // Handle category change - updates main category and can smooth-scroll to Recommended section
  const handleCategoryChange = useCallback((
    categoryId: string,
    subcategoryId?: string,
    subcategoryLabel?: string,
    shouldAutoScrollToRecommended = false,
  ) => {
    setMainCategory(categoryId)
    setBrowseCategory(categoryId)
    setSelectedSubcategoryId(subcategoryId || null)
    setSelectedSubcategoryLabel(subcategoryLabel || null)
    setCurrentPage(1)
    chosenCategoryRef.current = categoryId
    pendingCategoryAutoScrollRef.current = shouldAutoScrollToRecommended

    /*
      ═══════════════════════════════════════════════════════════════════════
       THE FLASHING WAS A LOADING STATE FOR SOMETHING THAT NEVER LOADED
      ═══════════════════════════════════════════════════════════════════════
      This used to raise isLoadingCategory, wait 100ms on a timer, push the
      URL inside a transition, and lower it again. Every one of those steps
      puts skeletons on screen: the flag directly, the transition through
      isPending. The filtering itself is a useMemo over products that are
      already in memory, so there was nothing to wait for. Tapping through
      the pills quickly meant skeletons in, cards back, skeletons in again,
      which is the popping and flashing that was reported.

      The state changes now and the list is simply correct on the next frame.

      THE URL FOLLOWS, DEBOUNCED AND WITHOUT A HISTORY ENTRY. Each push was
      also a server round trip and a new entry in history, so five taps left
      five pages to walk back through. `replace` after a short pause means
      the address ends up describing what you are looking at, and Back still
      goes where you came from.
    */
    if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
    categoryChangeTimeoutRef.current = setTimeout(() => {
      let newUrl = exploreHref(categoryId)
      if (subcategoryId) newUrl += `&sub=${subcategoryId}`
      if (urlSearchQuery) newUrl += `&q=${urlSearchQuery}`
      router.replace(newUrl, { scroll: false })
    }, 250)
  }, [router, urlSearchQuery, exploreHref])

  // Handle subcategory selection from modal
  const handleSubcategorySelect = useCallback((categoryId: string, subcategoryId: string, subcategoryLabel: string) => {
    handleCategoryChange(categoryId, subcategoryId, subcategoryLabel, true)
  }, [handleCategoryChange])

  // Handle browse-only category change from browse section pills (doesn't change main/recommended)
  const handleBrowseOnlyChange = useCallback((categoryId: string) => {
    setBrowseCategory(categoryId)
    // Scroll to browse section after content renders
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        smoothScrollToBrowseSection(browseSectionRef)
      })
    })
  }, [])

  useEffect(() => {
    if (
      urlSearchQuery ||
      isLoadingCategory ||
      categorySelectorOpen ||
      !pendingCategoryAutoScrollRef.current
    ) {
      return
    }

    pendingCategoryAutoScrollRef.current = false

    requestAnimationFrame(() => {
      scrollRecommendedSectionWithRetry()
    })
  }, [
    categorySelectorOpen,
    isLoadingCategory,
    mainCategory,
    scrollRecommendedSectionWithRetry,
    selectedSubcategoryId,
    urlSearchQuery,
  ])


  // Auto-scroll to browse section after category selector modal closes (when opened from browse context)
  useEffect(() => {
    if (categorySelectorOpen || !pendingBrowseAutoScrollRef.current) return
    pendingBrowseAutoScrollRef.current = false
    requestAnimationFrame(() => {
      smoothScrollToBrowseSection(browseSectionRef)
    })
  }, [categorySelectorOpen])

  // Mark component as mounted after initial render (skip auto-scroll on page load/reload)
  useEffect(() => {
    const timer = setTimeout(() => { hasMountedRef.current = true }, 500)
    return () => clearTimeout(timer)
  }, [])

  // Handle scroll target from URL (set by header, hamburger, search bar, featured categories)
  // For client-side nav (already mounted): delegate to pendingCategoryAutoScrollRef so scroll
  // fires only after content finishes loading — avoids scroll being interrupted by skeleton→real
  // content swap. For initial page load: wait 800ms for content to render then scroll.
  useEffect(() => {
    const scrollTarget = searchParams.get("scroll")
    const currentUrl = window.location.href
    if (scrollTarget === "recommended" && scrollTargetHandledRef.current !== currentUrl) {
      scrollTargetHandledRef.current = currentUrl
      // Clean up scroll param immediately so it doesn't re-fire
      const url = new URL(window.location.href)
      url.searchParams.delete("scroll")
      window.history.replaceState({}, '', url.pathname + url.search)
      if (hasMountedRef.current) {
        // Client-side nav: queue scroll to fire after isLoadingCategory becomes false
        // This ensures content is stable before the smooth scroll animation starts
        pendingCategoryAutoScrollRef.current = true
      } else {
        // Initial page load: content needs time to render from server
        const timer = setTimeout(() => {
          scrollRecommendedSectionWithRetry()
        }, 800)
        return () => clearTimeout(timer)
      }
    }
  }, [searchParams, scrollRecommendedSectionWithRetry])

  useEffect(() => {
    return () => {
      if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
      if (categoryAutoScrollTimeoutRef.current) window.clearTimeout(categoryAutoScrollTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const raw = initialCategory.toLowerCase() || "all"
    /* The address has no word for For you: it is the absence of a category,
       same as All. Which of the two that means depends on the account. */
    const normalizedCategory = raw === "all" && interests.enough && !communities ? FOR_YOU_ID : raw
    /* A reply that has been overtaken. Ignore the category it carries; the
       rest of the effect still runs, because sub, srt and lang are not part
       of what was superseded. */
    const superseded =
      chosenCategoryRef.current !== null && chosenCategoryRef.current !== normalizedCategory
    if (chosenCategoryRef.current === normalizedCategory) chosenCategoryRef.current = null
    if (!superseded && normalizedCategory !== mainCategory) setMainCategory(normalizedCategory)

    /* Written by exploreHref above; both are ignored when absent. */
    const srtParam = searchParams.get("srt")
    if (srtParam && SORT_OPTIONS.some((o) => o.id === srtParam) && srtParam !== sortBy) {
      setSortBy(srtParam)
    }
    const langParam = searchParams.get("lang")
    if (langParam && availableLanguages.some((l) => l.code === langParam) && langParam !== language) {
      setLanguage(langParam as typeof language)
    }

    // Check for subcategory in URL
    const subParam = searchParams.get("sub")
    if (subParam && subParam !== selectedSubcategoryId) {
      setSelectedSubcategoryId(subParam)
      // Find the label for this subcategory
      for (const cat of CATEGORIES) {
        const foundSub = (cat.subcategories as readonly { id: string; label: string }[]).find(s => s.id === subParam)
        if (foundSub) {
          setSelectedSubcategoryLabel(foundSub.label)
          break
        }
      }
    }
  }, [initialCategory, searchParams, interests.enough])

  const showSkeletons = (isPending || isLoadingCategory) && !restoringExploreScroll

  /* A category chosen from More that has no pill of its own: the More pill holds it. */
  const rowPills = [communities ? { id: "all", label: "All" } : { id: pillRow.first.id, label: pillRow.first.label }, ...pillRow.pills]
  /* The picker's first row, the row's first pill: All categories, or For you for an account we know something about (never in communities mode). */
  const pickerAllRow = communities || pillRow.first.id !== FOR_YOU_ID ? { id: "all", label: "All categories" } : { id: pillRow.first.id, label: pillRow.first.label }
  const pickCategory = (groupId: string, itemId?: string | null) => {
    const sub = itemId ? PICKER_GROUPS.find((c) => c.id === groupId)?.items.find((x) => x.id === itemId) : undefined
    handleCategoryChange(groupId, sub?.id, sub?.label, true)
  }
  const moreHolds =
    mainCategory !== "all" &&
    mainCategory !== FOR_YOU_ID &&
    !rowPills.some((p) => p.id === mainCategory)

  /*
    THE PILL YOU ARE ON IS SCROLLED INTO VIEW. On a phone the row scrolls, so
    a category chosen from More (AI, say, which has a pill) could be the
    pressed pill somewhere off to the side; and with a category's name on it
    the More pill is wider, and sat half under the fade at the row's end. The
    pill saying what you are looking at was the one you could not see.
  */
  const pillTrackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const track = pillTrackRef.current
    const on = track?.querySelector<HTMLElement>(moreHolds ? "[data-more-pill]" : '[aria-pressed="true"]')
    if (!track || !on) return
    const t = track.getBoundingClientRect()
    const m = on.getBoundingClientRect()
    if (m.right > t.right - 20) track.scrollBy({ left: m.right - t.right + 24, behavior: "smooth" })
    else if (m.left < t.left + 8) track.scrollBy({ left: m.left - t.left - 12, behavior: "smooth" })
  }, [moreHolds, mainCategory])

  // Get current browse category label
  const browseCategoryLabel = CATEGORIES.find(c => c.id === browseCategory)?.label || "All"

  return (
    <div className="space-y-8">
      {/*
        THE MODE IS THERE WHILE COMMUNITIES ARE. The chip's menu (and the
        admin's headline control, which only adds a second way to the same
        choice) is offered only while the communities switch is on; off,
        Explore is products and the chip is just a word.
      */}
      <ExploreHero
        query={localSearchQuery}
        onQueryChange={setLocalSearchQuery}
        mode={mode}
        onModeChange={communitiesEnabled ? handleModeChange : undefined}
        discoverHeadlineSegmentEnabled={communitiesEnabled && discoverHeadlineSegmentEnabled}
        categories={{
          groups: PICKER_GROUPS,
          selectedGroup: mainCategory === "all" || mainCategory === FOR_YOU_ID ? null : mainCategory,
          selectedItem: selectedSubcategoryId,
          allRow: pickerAllRow,
          onPick: pickCategory,
        }}
      />

      {/*
        THE BANNER SLIDER IS GONE. A full-width carousel of one product at a
        time, with dots, sat between the heading and the list — so the first
        thing under "Discover" was a single product chosen for you rather than
        the catalogue you came to look through. The owner asked for no sliders
        here, and the list starts immediately now.
      */}

      {/* Dynamic Category Section (Recommended) */}
      {(!urlSearchQuery || communities) && (
        <section ref={categorySectionRef} className="mt-2 scroll-mt-28" data-discover-mode={mode}>
          {/* Section Header */}
          <div className="flex flex-col gap-4 mb-6 relative">
            {/*
              NO SECTION TITLE. It said "Recommended", above a list that is
              the whole page — a heading for the only thing on the screen. The
              row is the categories and a way to filter them, which is what
              somebody standing in front of a catalogue actually reaches for.

              The By Category button went with it: the pills ARE the
              categories now, so a button that opens a list of them is the
              same choice twice.
            */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/*
                THE ROW SCROLLS AND SAYS SO. It was clipped dead at the
                Filters button with a pill cut in half at the edge, which
                reads as broken rather than as more-to-the-right. The mask
                fades the last few pixels instead.
              */}
              {/*
                CENTRED, NOT PACKED AGAINST THE LEFT EDGE.

                The scroller and the row are two elements now, because they
                want opposite things. `justify-content: center` inside a
                scroll container makes the first item unreachable once the
                content overflows — a known flexbox behaviour, and on a phone
                the first pill is "All". So the outer box scrolls and the
                inner row is `w-max mx-auto`: auto margins centre it while it
                fits and do nothing once it does not, which is scrolling from
                the left with nothing cut off.

                Wide enough to hold them all, it wraps and centres each line
                instead of scrolling at all.
              */}
              {/*
                ONE ROW, AT EVERY WIDTH.

                It used to wrap on a desktop, and with nine pills and a
                Filters button that meant "More..." sitting alone on a second
                line under a centred row — which reads as a mistake rather
                than as a row that continues. The owner asked for one row and
                sideways scrolling when it does not fit.

                So the wrap is gone and the scroller is the scroller at every
                width. `w-max mx-auto` still centres the row while it fits and
                does nothing once it is wider than its track, which is
                scrolling from the left with the first pill reachable. The
                mask fades the right edge at every width now, so a pill that
                continues past the edge looks like more rather than like a
                pill cut in half.
              */}
              {/* pr-5 is the fade's own width, so a row scrolled to its end
                  shows its last pill whole rather than under the fade. */}
              <div
                ref={pillTrackRef}
                className="flex-1 min-w-0 overflow-x-auto scrollbar-hide -mx-1 pl-1 pr-5 py-0.5 [mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-20px),transparent_100%)]"
              >
              <div
                data-category-pills-row
                className="flex w-max mx-auto items-center gap-2"
              >
                {/* "All", or "For you" for an account we know something about.
                    Same position, same globe, same behaviour: it is the pill
                    that clears the category, and it is first. */}
                {/*
                  NO COMMUNITIES PILL. It sat second in this row and switched
                  the page to communities, which made a place read as one more
                  category. The owner asked for it off: communities are reached
                  through the hero's Discover switcher only, and this row is
                  categories in both modes.
                */}
                {rowPills.map((cat) => {
                  const isSelected = mainCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setMainCategory(cat.id)
                        setSelectedSubcategoryId(null)
                        setSelectedSubcategoryLabel(null)
                        setCurrentPage(1)
                        chosenCategoryRef.current = cat.id
                        /* Debounced and replacing, for the reason in
                           handleCategorySelect: a tap is not a page. */
                        if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
                        categoryChangeTimeoutRef.current = setTimeout(() => {
                          router.replace(exploreHref(cat.id), { scroll: false })
                        }, 250)
                        /* Switching a category changes what the list is, so
                           the list starts again from its top rather than
                           leaving somebody in the middle of a page of
                           products they have not seen. Same movement the
                           pager uses. */
                        smoothScrollToRecommendedSection(categorySectionRef)
                      }}
                      className={`inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap border transition-[background-color,border-color,color,box-shadow] duration-150 ${
                        isSelected
                          ? "bg-[#e2e4e8] text-neutral-900 border-[#d7dadf] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
                          : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800"
                      }`}
                    >
                      <span aria-hidden className="text-[15px] leading-none">{PILL_EMOJI[cat.id]}</span>
                      {cat.label}
                    </button>
                  )
                })}
                {/*
                  EVERYTHING THAT DID NOT FIT, and it says so when it is holding
                  the choice. A category picked from in here that has no pill of
                  its own (Photography, say) used to leave no pill pressed at all,
                  so nothing on screen said what the list was. The More pill
                  carries its name and the pressed look until another is chosen.
                */}
                <ExploreCategoryPicker
                  open={categorySelectorOpen}
                  onOpenChange={setCategorySelectorOpen}
                  groups={PICKER_GROUPS}
                  selectedGroup={mainCategory === "all" || mainCategory === FOR_YOU_ID ? null : mainCategory}
                  selectedItem={selectedSubcategoryId}
                  allRow={pickerAllRow}
                  onPick={pickCategory}
                  triggerClassName={`inline-flex items-center gap-1 shrink-0 pl-3.5 pr-2.5 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap border outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 transition-[background-color,border-color,color,box-shadow] duration-150 ${
                    moreHolds || categorySelectorOpen
                      ? "bg-[#e2e4e8] text-neutral-900 border-[#d7dadf] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
                      : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800"
                  }`}
                >
                  {moreHolds ? CATEGORIES.find((c) => c.id === mainCategory)?.label ?? "More" : "More"}
                  <Chevron dir="down" className="h-3.5 w-3.5 opacity-70" />
                </ExploreCategoryPicker>
              </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 relative">
                {/* Filters Button */}
                <ExploreFilters
                  open={filtersOpen}
                  onOpenChange={setFiltersOpen}
                  sortOptions={communities ? COMMUNITY_SORT_OPTIONS : SORT_OPTIONS}
                  priceOptions={communities ? COMMUNITY_PRICE_FILTERS : PRICE_FILTERS}
                  resultLabel={communities ? "Show communities" : undefined}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  priceFilter={priceFilter}
                  setPriceFilter={setPriceFilter}
                  activeCount={activeFilterCount}
                  onClear={resetFilters}
                  resultCount={recommendedProducts.length}
                  /*
                    AN EDGE AND A SHADOW, because on a phone this collapses to
                    the icon alone and a bare glyph on a light background does
                    not read as something you can press. The pills beside it
                    have a border; this has that and a little depth, so it sits
                    one layer above the row rather than in it.
                  */
                  triggerClassName={`inline-flex items-center justify-center gap-2 h-[38px] px-3.5 sm:px-4 rounded-[10px] text-sm font-medium border outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 transition-[background-color,border-color,color,box-shadow] duration-150 cursor-pointer select-none ${
                    /* GREY, NOT BLACK, per the owner. Near-black is what the
                       selected CATEGORY pill wears, and two black controls in
                       one row read as two selections rather than as a filter
                       button that happens to be carrying something. */
                    filtersOpen || activeFilterCount > 0
                      ? "bg-neutral-200 text-[#1a1a2e] border-neutral-300 shadow-[inset_0_1px_1px_rgba(15,23,42,0.05)]"
                      : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_1px_rgba(15,23,42,0.04)]"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#1a1a2e] text-white text-[11px] font-semibold tabular-nums">
                      {activeFilterCount}
                    </span>
                  )}
                </ExploreFilters>

              </div>
            </div>

            {/*
              THE SEARCH MOVED UP INTO THE HERO, where a visitor arriving to
              browse is already looking, and where it is wide enough to read.
              It was a collapsed field here behind a toggle that nothing
              opened any more. components/explore/explore-hero has it, and the
              header borrows it once it scrolls away.
            */}

            {/*
              THE CURATED / TRENDING / HOT & NEW ROW IS GONE. It was a second
              row of pills under the first, sorting the same list a different
              way, and two rows of pills for one grid is the clutter the owner
              pointed at. What it did lives in the Filters panel, which
              already had a sort with the same options in it.
            */}

            {/*
              NO "CLEAR" CHIP. It sat under the pills whenever a category was
              on, and the owner took it out: the pill row is already the
              control. The category you are in is the filled pill, and the way
              out of it is the first pill — tapping that is how you get back to
              everything, which is what a visitor tries first anyway.

              A SUBcategory still earns a chip, because the row above only
              names the parent, so without it there is nothing on screen
              saying which subcategory is on.
            */}
            {selectedSubcategoryLabel && (
              /* At every width now: on a computer nothing else on screen named
                 the subcategory either. Removing it clears the subcategory and
                 nothing more; it used to navigate to the category's own page. */
              <div className="flex items-center justify-start md:justify-center -mt-1">
                <button
                  type="button"
                  data-subcategory-chip=""
                  aria-label={`Remove ${selectedSubcategoryLabel}`}
                  onClick={() => {
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                    if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
                    categoryChangeTimeoutRef.current = setTimeout(() => {
                      router.replace(exploreHref(mainCategory), { scroll: false })
                    }, 250)
                  }}
                  className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full border border-neutral-200 bg-white text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 hover:border-neutral-300 transition-colors cursor-pointer"
                >
                  {selectedSubcategoryLabel}
                  <svg aria-hidden viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-neutral-400">
                    <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/*
              NO ROW OF ACTIVE FILTERS. An "Active:" line of chips repeated
              the Filters panel under the pills. With two questions in that
              panel, the count on its button says enough, and the panel has
              the Clear all.
            */}
          </div>

          {/* Products Grid - 3 per row; in communities mode, the communities the server finds for the same choices. */}
          {communities ? (
            <ExploreCommunitiesResults
              initial={initialCommunities}
              q={(localSearchQuery.trim() || urlSearchQuery || "").trim()}
              category={mainCategory}
              sub={selectedSubcategoryId}
              subLabel={selectedSubcategoryLabel}
              srt={deferredSort}
              price={deferredPrice}
              categoryLabel={mainCategory === "all" ? null : CATEGORIES.find((c) => c.id === mainCategory)?.label ?? null}
              filtersOn={activeFilterCount > 0}
              onClearFilters={resetFilters}
            />
          ) : showSkeletons ? (
            <div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${restoringExploreScroll ? "" : "animate-in fade-in-0 duration-200"}`}>
              {Array.from({ length: 9 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : paginatedProducts.length > 0 ? (
            <>
              <div
                key={productsGridToken}
                /*
                  The entrance plays when the visitor CHANGES something and not
                  when they arrive. Coming back from a product page is an
                  arrival, and this grid is 3364px tall: filmed on production it
                  took the whole page to 90.3% white and spent 250ms fading
                  back. See lib/ui/use-entrance-on-change.ts.
                */
                className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${productsGridEntrance}`}
              >
                {paginatedProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    srcParam="?src=platform"
                    priority={index < 3}
                    clientNav
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number
                    if (totalPages <= 5) {
                      page = i + 1
                    } else if (currentPage <= 3) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i
                    } else {
                      page = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                          currentPage === page
                            ? "bg-neutral-900 text-white"
                            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  })}

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              <p className="text-sm text-neutral-500 mt-4 text-center">
                Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, recommendedProducts.length)} of {recommendedProducts.length} products
              </p>

              {/*
                ═══════════════════════════════════════════════════════════
                 A LINK TO A PAGE THAT EXISTS, SAYING A THING ONCE
                ═══════════════════════════════════════════════════════════
                This was shown for every pill except "All", and it pointed at
                `/explore/<the pill>`. One of the pills is "For you", which is
                a feed and not a category: it has no page, the route calls
                `notFound()` for it, and pressing this button landed on a 404
                with the products still on the screen behind it. Reported with
                the picture of that 404.

                `hasCategoryPage` is the route's own list, shared now rather
                than copied, so a link can only be built to somewhere that
                answers. A pill with no page of its own simply has no button —
                there is nothing more to show than what is already here.

                AND THE LABEL SAID IT TWICE. `sectionTitle` falls back to the
                word "Products" for anything it cannot name, so the button
                read "Show All Products Products". It takes the category's
                name when there is one and says "Show All Products" when
                there is not.
              */}
              {hasCategoryPage(mainCategory) && (
                <div className="flex justify-center mt-8">
                  <Link
                    href={selectedSubcategoryId
                      ? `/explore/${mainCategory}?sub=${selectedSubcategoryId}`
                      : `/explore/${mainCategory}`
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <span>{showAllLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            /*
              MIN-HEIGHT, SO AN EMPTY RESULT CANNOT PULL THE FOOTER UP INTO
              THE FOLD. A search that matches nothing is a normal thing to
              happen, and when it does the page should still be a page. Two
              thirds of the viewport keeps the footer where a footer belongs,
              below what you are looking at, rather than arriving under the
              category pills.
            */
            <div className="min-h-[60svh] flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">
                {localSearchQuery
                  ? `No products found for "${localSearchQuery}"`
                  : priceFilter !== "all"
                    ? "No products match your filters. Try adjusting your price range."
                    : `No products found in ${sectionTitle}.`
                }
              </p>
              {(activeFilterCount > 0 || selectedSubcategoryId) && (
                <button
                  onClick={() => {
                    resetFilters()
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                  }}
                  className="mt-3 text-sm text-neutral-600 hover:text-neutral-900 font-medium underline underline-offset-2 cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/*
        NO CATEGORY BOARDS. "Browse by Category" went first, then "Explore
        categories you can build with" under the page (round 9): both listed
        the categories the pills at the top of the list already offer. The
        pills, and their More, are the one way to choose one here.
      */}

      {/* Search Results Section */}
      {urlSearchQuery && !communities && (
        <section className="mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            Results for "{urlSearchQuery}"
          </h2>
          {/* The communities that match, first and few: the products are still the page. */}
          {communitiesEnabled && !communities && communityResults.length > 0 ? (
            <div className="mb-8" data-search-communities="">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h3 className="text-[15px] font-semibold text-neutral-900">Communities</h3>
                <Link href={`${EXPLORE_COMMUNITIES_HREF}&q=${encodeURIComponent(urlSearchQuery)}`} className="text-[14px] font-medium text-neutral-500 hover:text-neutral-900">
                  See all
                </Link>
              </div>
              <ExploreCommunityGrid cards={communityResults} />
            </div>
          ) : null}
          {recommendedProducts.length > 0 ? (
            <div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${searchGridEntrance}`}>
              {recommendedProducts.slice(0, 15).map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 3}
                  clientNav
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">No products found for "{urlSearchQuery}"</p>
            </div>
          )}
        </section>
      )}

    </div>
  )
}

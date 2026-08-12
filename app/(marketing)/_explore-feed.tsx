import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { VALID_CATEGORY_IDS } from "@/lib/marketplace/categories"
import { DEPARTMENTS, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { getServerT } from "@/lib/i18n/server"
import { DesktopHome } from "@/components/explore/home/desktop-home"

// Shared implementation of the marketplace feed.
//
// The feed is served from two routes:
//   "/"        — primary surface (marketplace homepage)
//   "/explore" — kept alive because the native app treats it as a Discover route
//                (see lib/isDiscoverMode.ts); redirecting it would break in-app nav.
// Both canonicalise to "/" so the duplicate never competes with itself in search.
//
// Not a route file — leading underscore + non-reserved filename, so Next.js
// never maps it to a URL.

export const FEED_CANONICAL = "https://storelib.com/"

export const FEED_DESCRIPTION =
  "Buy and sell second-hand fashion, sneakers, bags, jewellery, beauty, books, homeware and vintage. Thousands of pre-loved pieces from independent sellers."

export const FEED_KEYWORDS = [
  "second-hand fashion",
  "pre-loved clothing",
  "vintage clothing",
  "used sneakers",
  "thrift marketplace",
  "sell clothes online",
  "womenswear",
  "menswear",
  "resale marketplace",
]

export const FEED_OG_IMAGE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"

export const FEED_OG_IMAGE_ALT = "Storelib - Buy & Sell Second-Hand Fashion"

export type FeedSearchParams = { q?: string; category?: string; sub?: string }

export async function ExploreFeed({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  // Safely get search params
  let params: FeedSearchParams = {}
  try {
    params = await searchParams
  } catch {
    params = {}
  }

  const searchQuery = (params?.q || "").toLowerCase()
  const rawCategory = (params?.category || "all").toLowerCase()
  const category = VALID_CATEGORY_IDS.includes(rawCategory) ? rawCategory : "all"

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A DEPARTMENT IN THE URL ACTUALLY FILTERS THE FEED
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `?category=` was validated against VALID_CATEGORY_IDS — the nine legacy
   * digital-goods categories — so `?category=women`, which is what both the
   * header bar and the home page's category tiles link to, failed that test
   * and silently became "all". Five doors on the front page, all opening onto
   * the same undifferentiated feed.
   *
   * Departments are checked separately because they are a different KIND of
   * value: a department is not stored on a listing at all. What a listing
   * carries in `category` is a GROUP id ("women-footwear"), so filtering by
   * department means asking for every group inside it — which is exactly what
   * groupsForDepartment returns, and exactly how the sell form assigned the
   * value in the first place.
   *
   * `?sub=` narrows to one group, for the Browse menu's second level. It is
   * validated against the same list rather than trusted, so a hand-typed id
   * cannot reach the query.
   */
  const rawSub = (params?.sub || "").toLowerCase()
  const departmentGroups = DEPARTMENTS.some((d) => d.id === rawCategory)
    ? groupsForDepartment(rawCategory).map((g) => g.id)
    : null
  const subGroup = departmentGroups?.includes(rawSub) ? rawSub : null

  // Initialize data
  let productsWithCreators: any[] = []

  try {
    const supabase = await createClient()

    // Fetch published products — apply search filter server-side via ILIKE
    // to avoid fetching 100 rows when only a few match the query
    // Resale attributes (size/condition/brand) exist only after
    // 20260730_marketplace_physical_attributes.sql. Fetch them when present, but
    // fall back to the base columns if the migration hasn't run yet, so the feed
    // never 400s on unknown columns. The card renders the badges only when set.
    const BASE_COLS =
      "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"
    // Resale attributes the cards and filters read. Everything after BASE_COLS
    // arrived in a later migration, so the query falls back if it 400s.
    // `image_variants` is the newest of these and arrives with
    // RUN_LISTING_IMAGE_VARIANTS.sql. It is appended to the SAME optimistic
    // string the resale attributes already use, so it inherits the existing
    // fallback: if the migration has not run, this query 400s on the unknown
    // column, the retry below runs with BASE_COLS, and the feed renders from
    // thumbnail_url exactly as it does today.
    //
    // That is the whole reason the column is additive. A deploy that required
    // the migration to have been run first would be a blank marketplace for
    // however long the gap was.
    const FEED_COLS = `${BASE_COLS}, size, size_system, condition, brand, subcategory, colour, era, source_tags, style_tags, image_variants`

    const runProductsQuery = (cols: string) => {
      let q = supabase
        .from("products")
        .select(cols)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(100)
      if (searchQuery) {
        q = q.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      }
      // One group when the Browse menu asked for one, every group in the
      // department otherwise. Neither runs unless the id survived validation
      // above, so `?category=all` and anything unrecognised still fetch the
      // whole feed exactly as before.
      if (subGroup) q = q.eq("category", subGroup)
      else if (departmentGroups && departmentGroups.length > 0) q = q.in("category", departmentGroups)
      return q
    }

    let { data: products, error: productsError } = await runProductsQuery(FEED_COLS)
    if (productsError) {
      console.error("[ExploreFeed] Products error (retrying without resale columns):", productsError.message)
      const retry = await runProductsQuery(BASE_COLS)
      products = retry.data
      productsError = retry.error
    }

    if (products && products.length > 0) {
      // Get creators for products
      const productCreatorIds = [...new Set(products.map((p) => p.creator_id).filter(Boolean))]
      let productCreators: any[] = []

      if (productCreatorIds.length > 0) {
        const { data: pCreators } = await supabase
          .from("creators")
          .select("id, user_id, slug, niche_tags")
          .in("id", productCreatorIds)
        productCreators = pCreators || []
      }

      // Get profiles for product creators
      const productCreatorUserIds = productCreators.map((c) => c.user_id).filter(Boolean)
      let productCreatorProfiles: any[] = []

      if (productCreatorUserIds.length > 0) {
        const { data: pcProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, username")
          .in("id", productCreatorUserIds)
        productCreatorProfiles = pcProfiles || []
      }

      // Total saves per product across ALL users (for the read-only count pill on
      // each card). RLS hides other users' wishlist rows from the anon client, so
      // this needs the service-role client. It's optional — cards render fine at 0.
      const savesByProduct = new Map<string, number>()
      try {
        const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (adminUrl && adminKey) {
          const admin = createAdminClient(adminUrl, adminKey)
          const ids = products.map((p) => p.id).filter(Boolean)
          const { data: saveRows } = await admin
            .from("wishlist_items")
            .select("product_id")
            .in("product_id", ids)
            .limit(50000)
          for (const row of saveRows || []) {
            const pid = (row as any).product_id
            if (pid) savesByProduct.set(pid, (savesByProduct.get(pid) || 0) + 1)
          }
        }
      } catch (e: any) {
        console.error("[ExploreFeed] saves count skipped:", e?.message || e)
      }

      // Build products with creator info
      productsWithCreators = products.map((product) => {
        const creator = productCreators.find((c) => c.id === product.creator_id)
        const profile = creator ? productCreatorProfiles.find((p) => p.id === creator.user_id) : null
        return {
          ...product,
          creator: creator ? { ...creator, profile } : null,
          categories: [],
          categoryName: product.category || null,
          reviews_count: (product as any).reviews_count || 0,
          reviews_average: (product as any).reviews_average || 0,
          saves_count: savesByProduct.get(product.id) || 0,
        }
      })
    }
  } catch (error: any) {
    console.error("[ExploreFeed] Exception:", error?.message || error)
  }

  // Search filtering is now done server-side via ILIKE in the Supabase query
  const filteredProducts = productsWithCreators

  // Server-side locale (this page is already force-dynamic, so reading the
  // cookie is free) — renders the SEO heading in the visitor's language.
  const { t } = await getServerT()

  // Resolve the saved feed view (grid | reels) from the cookie so the mobile
  // feed renders the correct style on first paint — no grid → reels flash.
  let initialView: "grid" | "reels" = "grid"
  try {
    const { cookies } = await import("next/headers")
    const store = await cookies()
    if (store.get("storelib_feed_view")?.value === "reels") initialView = "reels"
  } catch {
    /* cookies unavailable */
  }

  /**
   * SIGNED IN OR NOT — the one thing the desktop home needs that it cannot
   * work out for itself. The marketing hero above the slideshow is for people
   * who have never been here; showing it to somebody with an account is the
   * site failing to recognise them on every visit.
   *
   * `getUser()` rather than `getSession()`: this decides what is RENDERED, and
   * a session read from a cookie the server has not verified is not something
   * to render a page from. The page is already force-dynamic, so the round trip
   * costs nothing that was not already being spent.
   */
  let signedIn = false
  try {
    const { data } = await (await createClient()).auth.getUser()
    signedIn = !!data.user
  } catch {
    /* treat an unreadable session as signed out — the hero is the safe side */
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Shop Second-Hand Fashion, Sneakers & Vintage",
            "description": FEED_DESCRIPTION,
            "url": FEED_CANONICAL
          }),
        }}
      />

      {/* Semantic page structure for SEO - matches header max-width (1400px).

          THE TOP PADDING IS THE GAP UNDER THE CATEGORY BAR. Nothing else sits
          between them: the bar ends, this padding runs, and the hero starts.
          It was 16/20; it is 14/17, fifteen percent off — the bar got shorter
          in the same pass (see components/platform/platform-header-client.tsx)
          and the gap under it had to come in with it, or the space reads as
          bigger than it was before even though the bar is smaller.

          Round numbers only up to a point: 13.6 and 17 are the arithmetic, and
          a half pixel of padding is a half pixel the browser rounds somewhere
          you cannot predict. */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-[14px] pb-6 sm:pt-[17px] sm:pb-8">
        {/* Hidden H1 for SEO - visible to screen readers and crawlers */}
        <h1 className="sr-only">{t("feed.seo_h1")}</h1>

        {/* Main content */}
        <ExplorePageClient
          initialProducts={filteredProducts}
          initialCategory={category}
          searchQuery={searchQuery}
          initialView={initialView}
        />

        {/* ═══════════════════════════════════════════════════════════════════
            THE DESKTOP HOME PAGE
            ═══════════════════════════════════════════════════════════════════

            Desktop only, and it replaces the whole of what used to be here: a
            featured-categories rail and a most-popular grid, under a client
            component that drew a banner and one more grid. Four sections, three
            of them the same hundred listings in a different order, and none of
            them different on a second visit.

            The mobile feed is a full-screen overlay, so anything drawn here on a
            phone is drawn behind it — hence `hidden md:block` inside the
            component rather than a second render path.

            Nothing is fetched: it is handed the same array the feed already
            built, and cuts it seven ways. See components/explore/home. */}
        {!searchQuery && <DesktopHome products={productsWithCreators} signedIn={signedIn} />}
      </div>
    </main>
  )
}

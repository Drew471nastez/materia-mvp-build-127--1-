import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sanitizeSearchTerm } from "@/lib/search/sanitize-term"

/**
 * GET /api/v2/search?q=term&category=sneakers&sort=relevance&limit=30&offset=0
 *
 * Ranked product search for the marketplace.
 *
 * ── Status ────────────────────────────────────────────────────────────────────
 * Nothing in the UI calls this endpoint yet — /explore still filters server-side
 * with ILIKE and the header typeahead queries Supabase from the browser. It is
 * kept correct and ready for those two call sites to move over.
 *
 * ── What changed and why ──────────────────────────────────────────────────────
 * The previous implementation built ~70 lines of ts_rank_cd SQL and executed it
 * through `admin.rpc("exec_sql", …)`. No such function exists anywhere in
 * supabase/migrations, so that call always errored and every request silently
 * took the ILIKE fallback — the ranking SQL had never once run, and
 * products.search_vector (maintained by trg_products_search_vector) was never
 * read. One line of it, `jsonb_array_length(p.gallery_urls)`, would also have
 * thrown the moment it did run if that column is a text[].
 *
 * This version uses the real full-text index through PostgREST's `fts` operator,
 * which needs no RPC and no migration:
 *
 *   1. Full-text search against products.search_vector (GIN,
 *      idx_products_search_vector). Title and brand are weight A, description
 *      weight B — brand was added to the vector by
 *      20260730_marketplace_physical_attributes.sql, and on a resale marketplace
 *      the brand IS the query ("carhartt", "nike").
 *   2. If FTS matches nothing — a typo, or a query that stems away entirely —
 *      fall back to trigram ILIKE across title, brand and description
 *      (idx_products_title_trgm, idx_products_brand_trgm,
 *      idx_products_description_trgm).
 *   3. Rank in JS over the returned pool. PostgREST cannot ORDER BY an
 *      expression, so relevance sorting happens here; the pool is capped at
 *      MAX_POOL rows so the sort is trivially cheap.
 *
 * Scoring is retuned for tangible second-hand goods. Most listings are
 * quantity-one with zero sales and zero reviews, so the old popularity/review
 * weights would have been 0.0 for nearly the whole catalogue: reviews are capped
 * far lower, freshness is raised sharply (recency is the primary quality signal
 * on Depop/Vinted), and multi-photo listings are rewarded because they convert.
 *
 * The response shape is unchanged — { results, total, query, category, sort } —
 * and `results` rows keep the nested `creator` embed the fallback path already
 * returned, now including creator.profile so ProductCard can build store links.
 */

/** Ceiling on a single page of results. */
const MAX_LIMIT = 100

/** Rows pulled before ranking. Bounded so the JS sort can never become the bottleneck. */
const MAX_POOL = 200

/** Extra candidates fetched beyond the requested page so ranking has room to reorder. */
const RANK_BUFFER = 60

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 100

/** More tokens than this and the tsquery is noise. */
const MAX_TOKENS = 6

const RICH_SELECT =
  "*, creator:creators(id, slug, display_name, avatar_url, profile:profiles!creators_user_id_fkey(display_name, avatar_url, username))"

/** Used if the profile embed is unavailable — matches what this route returned before. */
const BASE_SELECT = "*, creator:creators(id, slug, display_name, avatar_url)"

const SORTS = ["relevance", "newest", "popular", "price-low", "price-high"] as const

type Sort = (typeof SORTS)[number]

interface ProductRow {
  id: string
  title: string | null
  description: string | null
  brand: string | null
  condition: string | null
  size: string | null
  thumbnail_url: string | null
  gallery_urls: unknown
  price_cents: number | null
  sales_count: number | null
  reviews_count: number | null
  reviews_average: number | null
  created_at: string | null
}

/**
 * Build a prefix tsquery: `jordan:* & 4:*`.
 *
 * Restricted to word characters and Latin-1/Latin-Extended accents so no
 * to_tsquery operator (`&` `|` `!` `<->` `(` `)` `:`) can survive into the
 * query string — a malformed tsquery raises a Postgres error, which here would
 * cost a wasted round-trip before the ILIKE fallback.
 *
 * Prefix matching is what makes short queries work: "y2k" tokenises to `y2k:*`
 * and matches "Y2K baby tee", and a half-typed "jord" still matches "Jordan".
 */
function buildTsQuery(term: string): string {
  return term
    .replace(/[^\w\sÀ-ɏ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS)
    .map((token) => `${token}:*`)
    .join(" & ")
}

/** gallery_urls is jsonb and can arrive as a non-array — same guard product-card.tsx uses. */
function galleryCount(gallery: unknown): number {
  return Array.isArray(gallery) ? gallery.filter((url) => typeof url === "string" && url.length > 0).length : 0
}

/**
 * How well the row's text answers the query.
 *
 * Coverage-based rather than positional: what matters on a resale marketplace is
 * whether every word the shopper typed appears, and whether it appears in the
 * title/brand (weight A in the tsvector) or only in the description (weight B).
 */
function textScore(product: ProductRow, needle: string, tokens: string[]): number {
  const title = (product.title || "").toLowerCase()
  const brand = (product.brand || "").toLowerCase()
  const description = (product.description || "").toLowerCase()

  if (tokens.length === 0) return 0

  let titleHits = 0
  let brandHits = 0
  let descriptionHits = 0

  for (const token of tokens) {
    if (title.includes(token)) titleHits++
    if (brand && brand.includes(token)) brandHits++
    if (description.includes(token)) descriptionHits++
  }

  let score =
    (titleHits / tokens.length) * 2.0 + (brandHits / tokens.length) * 1.4 + (descriptionHits / tokens.length) * 0.5

  // Whole-phrase bonuses — "jordan 4 retro" should beat a listing that merely
  // contains all three words scattered through a paragraph.
  if (title === needle) score += 1.5
  else if (title.startsWith(needle)) score += 0.8
  else if (title.includes(needle)) score += 0.4

  if (brand === needle) score += 1.0
  else if (brand && brand.startsWith(needle)) score += 0.5

  return score
}

/**
 * Non-textual quality signals, weighted for tangible second-hand goods.
 * Deliberately small relative to textScore — these break ties, they don't
 * override what the shopper asked for.
 */
function qualityScore(product: ProductRow): number {
  let score = 0

  // Almost every resale listing is quantity-one with no sales history, so this is
  // near-zero for most of the catalogue. Log-scaled and capped regardless.
  score += Math.min(Math.log10((product.sales_count || 0) + 1) * 0.5, 1.0)

  // Capped hard (was 1.0): second-hand listings rarely accumulate reviews, so a
  // heavier weight would just rank the handful of reviewed sellers above everyone.
  if ((product.reviews_count || 0) > 0) {
    score += ((product.reviews_average || 0) / 5) * Math.min(Math.log10((product.reviews_count || 0) + 1) * 0.2, 0.3)
  }

  // Raised sharply from the digital-goods tuning. Fresh stock is the strongest
  // quality signal on a resale marketplace — an item listed today is far more
  // likely to still be available than one from six months ago.
  const createdAt = product.created_at ? Date.parse(product.created_at) : NaN
  if (!Number.isNaN(createdAt)) {
    const ageDays = (Date.now() - createdAt) / 86_400_000
    if (ageDays <= 7) score += 1.2
    else if (ageDays <= 30) score += 0.6
    else if (ageDays <= 90) score += 0.2
  }

  // Completeness. Multiple photos matter far more for tangible goods than for a
  // digital download, so the gallery term outweighs the description term.
  if (product.thumbnail_url) score += 0.2
  score += Math.min(galleryCount(product.gallery_urls) * 0.08, 0.32)
  if ((product.description || "").length > 100) score += 0.15

  // A listing that filled in the resale attributes is a properly described item.
  if (product.condition) score += 0.1
  if (product.size) score += 0.05

  return score
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim()
    const category = searchParams.get("category") || ""
    const requestedSort = searchParams.get("sort") || "relevance"
    const sort: Sort = (SORTS as readonly string[]).includes(requestedSort) ? (requestedSort as Sort) : "relevance"
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), MAX_LIMIT)
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0)

    if (!query) {
      return NextResponse.json({ error: "Missing search query" }, { status: 400 })
    }

    const term = sanitizeSearchTerm(query, MAX_QUERY_LENGTH)

    // Everything the user typed was punctuation — nothing to match on.
    if (!term) {
      return NextResponse.json({ results: [], total: 0, query, category, sort })
    }

    const admin = createAdminClient()
    const isRelevance = sort === "relevance"

    // Relevance re-orders in JS, so it needs a pool wide enough to reorder within.
    // Every other sort is already ordered by Postgres, so only the page is fetched.
    const fetchLimit = isRelevance ? Math.min(offset + limit + RANK_BUFFER, MAX_POOL) : limit

    // For relevance this only decides which rows enter the ranking pool — newest
    // first, because recency is the strongest availability signal on resale stock.
    const orderBy =
      sort === "popular"
        ? { column: "sales_count", ascending: false }
        : sort === "price-low"
          ? { column: "price_cents", ascending: true }
          : sort === "price-high"
            ? { column: "price_cents", ascending: false }
            : { column: "created_at", ascending: false }

    /**
     * Status + category scope. Supabase query builders are single-use, so every
     * attempt rebuilds from scratch.
     */
    function filtered(select: string) {
      let q = admin.from("products").select(select).eq("status", "published")

      if (category && category !== "all") {
        // ilike without wildcards is a case-insensitive equality match — the same
        // semantics as the LOWER(category) = $n comparison this replaced.
        q = q.ilike("category", category)
      }

      return q
    }

    /** Ordering and paging, applied after the text filter (builder order matters). */
    function paginate(q: ReturnType<typeof filtered>) {
      const start = isRelevance ? 0 : offset
      return q
        .order(orderBy.column, { ascending: orderBy.ascending, nullsFirst: false })
        .range(start, start + fetchLimit - 1)
    }

    // ── Attempt 1: full-text search on the tsvector ──────────────────────────
    const tsQuery = buildTsQuery(term)
    let select = RICH_SELECT
    let rows: ProductRow[] = []

    if (tsQuery) {
      let fts = await paginate(filtered(select).textSearch("search_vector", tsQuery, { config: "english" }))

      // The profile embed is the only part of RICH_SELECT that could be missing;
      // drop back to the plain creator embed rather than losing the whole search.
      if (fts.error) {
        select = BASE_SELECT
        fts = await paginate(filtered(select).textSearch("search_vector", tsQuery, { config: "english" }))
      }

      if (!fts.error) rows = (fts.data as unknown as ProductRow[] | null) || []
    }

    // ── Attempt 2: trigram ILIKE ─────────────────────────────────────────────
    // Reached when FTS found nothing (typo, stopword-only query, or no
    // search_vector on this database). Trigram indexes need 3 characters to be
    // useful, which "y2k" and anything longer satisfies.
    if (rows.length === 0) {
      const pattern = `%${term}%`
      const withBrand = `title.ilike.${pattern},brand.ilike.${pattern},description.ilike.${pattern}`
      const withoutBrand = `title.ilike.${pattern},description.ilike.${pattern}`

      let fallback = await paginate(filtered(select).or(withBrand))

      // products.brand only exists after 20260730_marketplace_physical_attributes.sql.
      if (fallback.error) {
        fallback = await paginate(filtered(select).or(withoutBrand))
      }

      if (fallback.error) {
        console.error("[v2/search] Fallback failed:", fallback.error.message)
      } else {
        rows = (fallback.data as unknown as ProductRow[] | null) || []
      }
    }

    // ── Rank ─────────────────────────────────────────────────────────────────
    let results: ProductRow[] = rows

    if (isRelevance && rows.length > 0) {
      const needle = term.toLowerCase()
      const tokens = needle.split(" ").filter(Boolean).slice(0, MAX_TOKENS)

      results = rows
        .map((product) => ({ product, score: textScore(product, needle, tokens) * 2.0 + qualityScore(product) }))
        .sort((a, b) => b.score - a.score)
        .slice(offset, offset + limit)
        .map((entry) => entry.product)
    }

    return NextResponse.json({
      results,
      total: results.length,
      query,
      category,
      sort,
    })
  } catch (error) {
    console.error("[v2/search] Error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}

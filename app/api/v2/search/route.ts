import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { offChannelAmong } from "@/lib/store/channel-filter"

/**
 * GET /api/v2/search?q=term&category=design&sort=relevance&limit=30
 *
 * Ranked search using PostgreSQL full-text search (tsvector) with:
 * - Title weight A (highest)
 * - Description weight B
 * - Popularity boost (sales_count, reviews)
 * - Freshness boost (newer products ranked higher)
 * - Completeness boost (has thumbnail, long description)
 *
 * Falls back to trigram ILIKE for short queries or when FTS returns no results.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim()
    const category = searchParams.get("category") || ""
    const sort = searchParams.get("sort") || "relevance"
    const limit = Math.min(Number(searchParams.get("limit")) || 30, 100)
    const offset = Number(searchParams.get("offset")) || 0

    if (!query) {
      return NextResponse.json({ error: "Missing search query" }, { status: 400 })
    }

    const admin = createAdminClient()

    /**
     * RANKING IS A NARROW FUNCTION, NOT A GENERAL SQL RUNNER. This used to
     * send the whole ranked SELECT through `exec_sql`, a function no file in
     * this repository creates and which runs arbitrary SQL as its definer.
     * The query it sent could not work anyway: it called
     * `jsonb_array_length(products.gallery_urls)` and that column is text[],
     * so Postgres answered "function jsonb_array_length(text[]) does not
     * exist" on every search and the ILIKE fallback below did all the work.
     *
     * search_products_ranked (supabase/sql/run-now/20) holds the same ranking
     * and takes the five things that vary. A database that has not run that
     * part answers "function does not exist" and the fallback runs, as before.
     */
    const tsQuery = query
      .split(/\s+/)
      /* to_tsquery parses its argument, so a term keeps word characters only:
         a stray & or ! is a syntax error, not a search. */
      .map((term) => term.replace(/[^\p{L}\p{N}_]/gu, ""))
      .filter(Boolean)
      .map((term) => `${term}:*`) // Prefix matching for partial words
      .join(" & ")

    const { data: ftsResults, error: ftsError } = tsQuery
      ? await admin.rpc("search_products_ranked", {
          p_query: tsQuery,
          p_category: category,
          p_sort: sort,
          p_limit: limit,
          p_offset: offset,
        })
      : { data: null, error: null }

    // If FTS RPC doesn't exist, fall back to standard Supabase query with ILIKE
    let results: unknown[] = []

    if (ftsError || !ftsResults || (Array.isArray(ftsResults) && ftsResults.length === 0)) {
      // Fallback: trigram ILIKE search
      let fallbackQ = admin
        .from("products")
        .select("*, creator:creators(id, slug, display_name, avatar_url)")
        .eq("status", "published")
        .neq("type", "physical")
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(limit)

      if (category && category !== "all") {
        fallbackQ = fallbackQ.ilike("category", category)
      }

      if (sort === "newest") {
        fallbackQ = fallbackQ.order("created_at", { ascending: false })
      } else if (sort === "popular") {
        fallbackQ = fallbackQ.order("sales_count", { ascending: false })
      } else if (sort === "price-low") {
        fallbackQ = fallbackQ.order("price_cents", { ascending: true })
      } else if (sort === "price-high") {
        fallbackQ = fallbackQ.order("price_cents", { ascending: false })
      } else {
        // Relevance: title matches first, then by sales
        fallbackQ = fallbackQ.order("sales_count", { ascending: false })
      }

      const { data: fallbackData } = await fallbackQ
      results = fallbackData || []
    } else {
      results = Array.isArray(ftsResults) ? ftsResults : []
    }
    /* Physical products are sold on the creator's own website, not found in Storelib's search. */
    results = results.filter((r) => (r as { type?: unknown } | null)?.type !== "physical")
    /* Settings › Sales channels: a product its creator took off Explore is not found here. */
    const offExplore = await offChannelAmong(admin, results.map((r) => String((r as { id?: unknown } | null)?.id ?? "")), "marketplace")
    if (offExplore.size) results = results.filter((r) => !offExplore.has(String((r as { id?: unknown } | null)?.id ?? "")))

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

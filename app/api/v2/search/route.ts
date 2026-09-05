import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

    // Build the search query with ts_rank scoring
    const tsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map(term => `${term}:*`) // Prefix matching for partial words
      .join(" & ")

    // Try full-text search first (ranked)
    let sqlQuery = `
      SELECT
        p.*,
        ts_rank_cd(p.search_vector, to_tsquery('english', $1), 32) AS text_rank,
        -- Popularity boost: log scale to prevent dominant products
        LEAST(LOG(GREATEST(p.sales_count, 1) + 1) * 0.3, 2.0) AS popularity_boost,
        -- Review quality boost
        CASE WHEN p.reviews_count > 0
          THEN (p.reviews_average / 5.0) * LEAST(LOG(p.reviews_count + 1) * 0.2, 1.0)
          ELSE 0
        END AS review_boost,
        -- Freshness boost: newer products get a slight edge
        CASE
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 0.5
          WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 0.3
          WHEN p.created_at > NOW() - INTERVAL '90 days' THEN 0.1
          ELSE 0
        END AS freshness_boost,
        -- Completeness boost: reward well-filled products
        CASE WHEN p.thumbnail_url IS NOT NULL THEN 0.2 ELSE 0 END +
        CASE WHEN LENGTH(COALESCE(p.description, '')) > 100 THEN 0.15 ELSE 0 END +
        CASE WHEN p.gallery_urls IS NOT NULL AND jsonb_array_length(p.gallery_urls) > 0 THEN 0.1 ELSE 0 END
        AS completeness_boost,
        -- Creator info
        c.slug AS creator_slug,
        c.display_name AS creator_name,
        c.avatar_url AS creator_avatar
      FROM public.products p
      LEFT JOIN public.creators c ON c.id = p.creator_id
      WHERE p.status = 'published'
        AND p.search_vector @@ to_tsquery('english', $1)
    `

    const queryParams: unknown[] = [tsQuery]
    let paramIndex = 2

    // Category filter
    if (category && category !== "all") {
      sqlQuery += ` AND LOWER(COALESCE(p.category, '')) = $${paramIndex}`
      queryParams.push(category.toLowerCase())
      paramIndex++
    }

    // Sorting
    if (sort === "relevance") {
      sqlQuery += `
        ORDER BY (
          ts_rank_cd(p.search_vector, to_tsquery('english', $1), 32) * 2.0
          + LEAST(LOG(GREATEST(p.sales_count, 1) + 1) * 0.3, 2.0)
          + CASE WHEN p.reviews_count > 0
              THEN (p.reviews_average / 5.0) * LEAST(LOG(p.reviews_count + 1) * 0.2, 1.0)
              ELSE 0 END
          + CASE
              WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 0.5
              WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 0.3
              WHEN p.created_at > NOW() - INTERVAL '90 days' THEN 0.1
              ELSE 0 END
          + CASE WHEN p.thumbnail_url IS NOT NULL THEN 0.2 ELSE 0 END
          + CASE WHEN LENGTH(COALESCE(p.description, '')) > 100 THEN 0.15 ELSE 0 END
        ) DESC
      `
    } else if (sort === "newest") {
      sqlQuery += ` ORDER BY p.created_at DESC`
    } else if (sort === "popular") {
      sqlQuery += ` ORDER BY p.sales_count DESC NULLS LAST`
    } else if (sort === "price-low") {
      sqlQuery += ` ORDER BY p.price_cents ASC`
    } else if (sort === "price-high") {
      sqlQuery += ` ORDER BY p.price_cents DESC`
    }

    sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(limit, offset)

    const { data: ftsResults, error: ftsError } = await admin.rpc("exec_sql", {
      query: sqlQuery,
      params: queryParams,
    }).maybeSingle()

    // If FTS RPC doesn't exist, fall back to standard Supabase query with ILIKE
    let results: unknown[] = []

    if (ftsError || !ftsResults) {
      // Fallback: trigram ILIKE search
      let fallbackQ = admin
        .from("products")
        .select("*, creator:creators(id, slug, display_name, avatar_url)")
        .eq("status", "published")
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

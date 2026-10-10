import useSWR, { mutate as globalMutate } from "swr"
import { createClient } from "@/lib/supabase/client"

// ────────────────────────────────────────────────────────────────────────────
// Generic Supabase SWR fetcher
// ────────────────────────────────────────────────────────────────────────────

type FetcherKey = [table: string, query: string]

/**
 * Generic fetcher that executes a Supabase select using table + filter key.
 * The query string is parsed as JSON containing { select, filters, order, limit }.
 */
async function supabaseFetcher([table, queryJson]: FetcherKey) {
  const supabase = createClient()
  const params = JSON.parse(queryJson) as {
    select?: string
    filters?: Record<string, unknown>
    eq?: Array<[string, unknown]>
    order?: { column: string; ascending?: boolean }
    limit?: number
    single?: boolean
  }

  let q = supabase.from(table).select(params.select || "*")

  if (params.eq) {
    for (const [col, val] of params.eq) {
      q = q.eq(col, val)
    }
  }

  if (params.order) {
    q = q.order(params.order.column, { ascending: params.order.ascending ?? false })
  }

  if (params.limit) {
    q = q.limit(params.limit)
  }

  if (params.single) {
    const { data, error } = await q.single()
    if (error) throw error
    return data
  }

  const { data, error } = await q
  if (error) throw error
  return data
}

// ────────────────────────────────────────────────────────────────────────────
// Hooks for specific data types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cached explore page products.
 * Key includes category + search for per-query caching.
 */
export function useExploreProducts(category: string, search?: string) {
  const queryKey = JSON.stringify({
    select: "*, creator:creators(id, slug, display_name, avatar_url, niche_tags)",
    eq: [["status", "published"]],
    order: { column: "created_at", ascending: false },
    limit: 100,
  })

  const cacheKey = `explore:${category}:${search || ""}`

  return useSWR<unknown[]>(
    [cacheKey, queryKey],
    async () => {
      const supabase = createClient()
      let q = supabase
        .from("products")
        .select("*, creator:creators(id, slug, display_name, avatar_url, niche_tags)")
        .eq("status", "published")
        .neq("type", "physical")
        .order("created_at", { ascending: false })
        .limit(100)

      if (search) {
        q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    {
      dedupingInterval: 60_000, // Explore data is relatively stable
      revalidateOnFocus: false,
    },
  )
}

/**
 * Cached single product data (product page).
 */
export function useProduct(slug: string | null) {
  return useSWR(
    slug ? ["products", JSON.stringify({ select: "*, creator:creators(*)", eq: [["slug", slug]], single: true })] : null,
    supabaseFetcher,
    { dedupingInterval: 30_000 },
  )
}

/**
 * Cached store/creator data.
 */
export function useCreatorStore(creatorSlug: string | null) {
  return useSWR(
    creatorSlug
      ? ["creators", JSON.stringify({ select: "*, products:products(*, digital_assets(*))", eq: [["slug", creatorSlug]], single: true })]
      : null,
    supabaseFetcher,
    { dedupingInterval: 30_000 },
  )
}

/**
 * Cached dashboard analytics summary.
 */
export function useAnalyticsRollups(creatorId: string | null, startDate: string, endDate: string) {
  return useSWR(
    creatorId ? `rollups:${creatorId}:${startDate}:${endDate}` : null,
    async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("analytics_daily_rollups")
        .select("*")
        .eq("creator_id", creatorId!)
        .gte("rollup_date", startDate)
        .lte("rollup_date", endDate)
        .order("rollup_date", { ascending: true })

      if (error) throw error
      return data || []
    },
    { dedupingInterval: 60_000 },
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Cache invalidation helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Invalidate all explore caches (call after product publish/unpublish).
 */
export function invalidateExploreCache() {
  globalMutate((key: unknown) => {
    if (typeof key === "string" && key.startsWith("explore:")) return true
    if (Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("explore:")) return true
    return false
  }, undefined, { revalidate: true })
}

/**
 * Invalidate a specific product's cache (call after product update).
 */
export function invalidateProductCache(slug: string) {
  globalMutate(
    (key: unknown) => {
      if (Array.isArray(key) && key[0] === "products") {
        try {
          const params = JSON.parse(key[1] as string)
          return params.eq?.some(([col, val]: [string, unknown]) => col === "slug" && val === slug)
        } catch { return false }
      }
      return false
    },
    undefined,
    { revalidate: true },
  )
  // Also invalidate explore caches since product data changed
  invalidateExploreCache()
}

/**
 * Invalidate store cache for a creator.
 */
export function invalidateStoreCache(creatorSlug: string) {
  globalMutate(
    (key: unknown) => {
      if (Array.isArray(key) && key[0] === "creators") {
        try {
          const params = JSON.parse(key[1] as string)
          return params.eq?.some(([col, val]: [string, unknown]) => col === "slug" && val === creatorSlug)
        } catch { return false }
      }
      return false
    },
    undefined,
    { revalidate: true },
  )
}

/**
 * Invalidate analytics rollup caches.
 */
export function invalidateAnalyticsCache(creatorId: string) {
  globalMutate(
    (key: unknown) => typeof key === "string" && key.startsWith(`rollups:${creatorId}`),
    undefined,
    { revalidate: true },
  )
}

// Shared column list for the marketplace feed surfaces ("/", "/explore",
// "/explore/[category]"). One definition so a card field can never be rendered on a
// surface that forgot to fetch it - which is exactly how the Depop-style hover swap and
// the size/brand/condition badges came to be dead on all three feeds.
//
// Safe to import from server components - no "use client", no supabase import.

// Everything that exists on public.products today, before
// 20260730_marketplace_physical_attributes.sql is applied.
// gallery_urls is load-bearing: components/explore/product-card.tsx derives the hover
// image from it, and without it every card silently falls back to the zoom variant.
export const FEED_PRODUCT_COLUMNS_BASE =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"

// Physical attributes added by 20260730_marketplace_physical_attributes.sql. Selected
// separately because the migration may not have reached the target database yet.
const PHYSICAL_ATTRIBUTE_COLUMNS = "brand, condition, size, size_system"

export const FEED_PRODUCT_COLUMNS = `${FEED_PRODUCT_COLUMNS_BASE}, ${PHYSICAL_ATTRIBUTE_COLUMNS}`

// PostgREST surfaces an unknown column as Postgres' undefined_column.
const UNDEFINED_COLUMN = "42703"

// `data: unknown` on purpose. The column list is a runtime string, so supabase-js cannot
// infer a row type from it (it degrades to GenericStringError[]); narrowing happens once,
// in `rows()` below, instead of forcing every caller to cast.
type RawQueryResult = {
  data: unknown
  error: { code?: string | null; message: string } | null
}

function isMissingColumnError(error: RawQueryResult["error"]): boolean {
  if (!error) return false
  if (error.code === UNDEFINED_COLUMN) return true
  // Some PostgREST versions report a bad select as a parse failure rather than 42703.
  return /column .* does not exist|unknown column/i.test(error.message)
}

/**
 * Run a feed query with the physical attributes, falling back to the base columns if the
 * database has not had 20260730_marketplace_physical_attributes.sql applied yet.
 *
 * Without this, adding brand/condition/size to a select list is a deploy-ordering
 * landmine: PostgREST answers 400, the caller only console.error's it, and the homepage
 * renders zero products. Degrading to the base columns costs one extra round-trip in the
 * un-migrated case and nothing at all once the migration has run.
 *
 * `build` is called with the column list and must return the full query, because a
 * supabase-js builder cannot be re-selected after the fact.
 */
export async function selectFeedProducts<T>(
  build: (columns: string) => PromiseLike<RawQueryResult>,
  logLabel: string,
): Promise<{ products: T[]; error: string | null }> {
  const { data, error } = await build(FEED_PRODUCT_COLUMNS)

  if (error && isMissingColumnError(error)) {
    console.warn(
      `[${logLabel}] products is missing the physical attribute columns - ` +
        "apply supabase/migrations/20260730_marketplace_physical_attributes.sql. " +
        "Serving the feed without brand/condition/size for now.",
    )
    const fallback = await build(FEED_PRODUCT_COLUMNS_BASE)
    return { products: rows<T>(fallback.data), error: fallback.error?.message ?? null }
  }

  return { products: rows<T>(data), error: error?.message ?? null }
}

/** The single narrowing point for a runtime-built select list. */
function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

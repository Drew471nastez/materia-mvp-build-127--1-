/**
 * ===========================================================================
 *  WHO MAY SEE A PRODUCT: ONE RULE, IN ONE PLACE
 * ===========================================================================
 * A product is shown to the public (the creator's page, the OnePage, a built
 * website, Explore, search, the sitemaps, a wishlist, a checkout) when its
 * status is "published" and the older `archived` flag is not set. Anything
 * else (draft, unpublished, archived by status or by the flag, deleted) is
 * shown to nobody but its creator, and sold to nobody.
 *
 * WHY A QUERY ONLY NEEDS THE STATUS. Archive writes both marks at once
 * (lib/products/archive.ts), publishing clears the flag, and run-now part 47
 * keeps the two in step in the database, so a row that says "published" is
 * never archived. Every public read therefore filters on the status alone,
 * `.eq("status", "published")`, which every database has, and `publicOnly`
 * below is that filter by name. Rows already read are checked with
 * `isPubliclyVisible`, which also looks at the flag, so a database that has
 * not run part 47 is still right in memory.
 *
 * WHAT IS NEVER FILTERED BY THIS. What a buyer already has: their library,
 * their downloads, their receipt, their course. Those read the product by
 * the buyer's own entitlement or order, whatever its status now, because an
 * archived or unpublished product is still theirs (lib/library/owned-products.ts).
 *
 * tests/product-visibility.test.ts reads every public reader of `products`
 * and fails when one of them stops asking this question, so a new page
 * cannot quietly show an archived product.
 */

/** The one status a visitor may see. */
export const PUBLIC_PRODUCT_STATUS = "published" as const

export interface VisibilityFields {
  status?: string | null
  archived?: boolean | null
}

/** Published, and not archived by the older flag. */
export function isPubliclyVisible(p: VisibilityFields | null | undefined): boolean {
  return !!p && p.status === PUBLIC_PRODUCT_STATUS && p.archived !== true
}

/** A query narrowed to what a visitor may see: `.eq("status", "published")`, named. */
export function publicOnly<Q>(query: Q): Q {
  /* Loosely typed on purpose: a Supabase builder's own `eq` is generic enough to send the compiler round in circles. */
  return (query as unknown as { eq: (column: string, value: string) => Q }).eq("status", PUBLIC_PRODUCT_STATUS)
}

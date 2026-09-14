/**
 * ===========================================================================
 *  WHICH PRODUCTS THE FEATURED SECTION SHOWS, AND IN WHAT ORDER
 * ===========================================================================
 * The creator page asks the database for every published product once, newest
 * first, and that one list feeds both tabs. The Products tab shows it as it
 * comes, which is what "newest first" should look like. Home is meant to be
 * the creator's own arrangement.
 *
 * It was `products.filter(p => productIds.includes(p.id))`, and a filter keeps
 * the order of the array it filters. So the arrangement was saved and then
 * thrown away on every render, and the two tabs were the same list twice.
 *
 * Walking `productIds` is what makes the stored order the rendered one. Pure
 * and in its own file so the ordering can be tested rather than read.
 */
export function pickFeatured<T extends { id: string }>(
  products: T[] | null | undefined,
  productIds: string[] | null | undefined,
): T[] {
  const all = products ?? []
  if (!productIds || productIds.length === 0) return all

  const byId = new Map(all.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const picked: T[] = []
  for (const id of productIds) {
    if (seen.has(id)) continue
    const product = byId.get(id)
    /* A miss is a product deleted, unpublished, or otherwise not one this
       visitor may see — `products` is already that list — so it is dropped
       rather than left as a gap in the grid. */
    if (!product) continue
    seen.add(id)
    picked.push(product)
  }
  return picked
}

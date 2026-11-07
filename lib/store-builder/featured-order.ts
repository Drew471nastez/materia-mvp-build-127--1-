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

/**
 * ===========================================================================
 *  THE PRODUCTS TAB, IN THE ORDER THE CREATOR DRAGGED THEM INTO
 * ===========================================================================
 * Close cousin of `pickFeatured` and deliberately NOT the same function, on
 * one point that matters: Featured is a SELECTION, so anything not named is
 * left out. The Products tab is the whole catalogue, so anything not named
 * has to still be there.
 *
 * That difference is the entire bug this avoids. Reusing pickFeatured here
 * would mean a creator arranges their products once, adds a product the next
 * week, and that product is invisible on their own shop with nothing to
 * explain why. New products land at the FRONT, keeping the newest-first
 * behaviour the tab has always had for anything unarranged.
 */
export function applyManualOrder<T extends { id: string }>(
  products: T[] | null | undefined,
  order: string[] | null | undefined,
): T[] {
  const all = products ?? []
  if (!order || order.length === 0) return all

  const position = new Map<string, number>()
  order.forEach((id, index) => {
    if (!position.has(id)) position.set(id, index)
  })

  /*
    A stable sort on "where the creator put it, or in front of everything if
    they have never seen it". Sorting rather than rebuilding the array keeps
    the relative order of the unarranged ones exactly as the query returned
    them, which is newest first.
  */
  const unplaced = -1
  return [...all].sort((a, b) => {
    const pa = position.has(a.id) ? position.get(a.id)! : unplaced
    const pb = position.has(b.id) ? position.get(b.id)! : unplaced
    if (pa === pb) return 0
    if (pa === unplaced) return -1
    if (pb === unplaced) return 1
    return pa - pb
  })
}

/**
 * ===========================================================================
 *  AN ARRANGEMENT OF SOME OF THE PRODUCTS, IN THE ORDER OF ALL OF THEM (round 50)
 * ===========================================================================
 * Arrange on Home lists the Featured section's products, which can be a
 * selection. It saved that selection as the whole order, so every product
 * left out of it had no place any more and jumped to the front of the
 * Products tab (applyManualOrder puts the unplaced first).
 *
 * The arranged products take the slots they already held in the whole
 * catalogue, in their new order, and everything else stays where it was:
 * [A,B,C,D,E] with B and D swapped is [A,D,C,B,E].
 */
export function mergeArrangement(full: string[], arranged: string[]): string[] {
  const picked = new Set(arranged)
  const queue = arranged.filter((id, i) => arranged.indexOf(id) === i)
  const out: string[] = []
  for (const id of full) {
    if (!picked.has(id)) out.push(id)
    else if (queue.length > 0) out.push(queue.shift()!)
  }
  /* Arranged but not in the catalogue as the page knew it: after it, not lost. */
  out.push(...queue)
  return out.filter((id, i) => out.indexOf(id) === i)
}

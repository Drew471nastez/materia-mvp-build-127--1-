/**
 * ===========================================================================
 *  WHAT A WEBSITE'S SIGNED IN CUSTOMER ALREADY OWNS, FOR A PRODUCT PAGE
 * ===========================================================================
 * A product page on a creator's website says "You already own this" with the
 * way to the website's own downloads (/account) when the visitor is signed in
 * to that website and owns it: a built site's product section asks
 * /api/site-account/owned, an imported theme's page is drawn with a small
 * notice (lib/storelib-theme/compat/owned-banner).
 *
 * Owning is lib/checkout/owned's rule, by the customer's email, which their
 * sign in code proved: this creator's products only, per option, never a
 * physical product or a membership. A guest is never told anything.
 */
import { ownedProducts } from "@/lib/checkout/owned"
import { UUID, type Db } from "./db"

export interface ProductOwnership {
  /** The whole product is theirs (every option). */
  whole: boolean
  /** The options they own one by one, when not the whole product. */
  options: string[]
}

export async function customerOwns(db: Db, scope: { creatorId: string; email: string }, productIds: string[]): Promise<Record<string, ProductOwnership>> {
  const ids = [...new Set(productIds.filter((id) => UUID.test(id)))].slice(0, 24)
  if (!UUID.test(scope.creatorId) || !scope.email || ids.length === 0) return {}
  let rows: { id: string; type: string }[] = []
  try {
    const { data } = await db.from("products").select("id, type").in("id", ids).eq("creator_id", scope.creatorId)
    rows = (data ?? []) as { id: string; type: string }[]
  } catch {
    return {}
  }
  const owned = await ownedProducts(db, { provenEmail: scope.email }, rows)
  const out: Record<string, ProductOwnership> = {}
  for (const id of owned.whole) out[id] = { whole: true, options: [] }
  for (const [id, options] of Object.entries(owned.options)) if (options.length) out[id] = { whole: false, options }
  return out
}

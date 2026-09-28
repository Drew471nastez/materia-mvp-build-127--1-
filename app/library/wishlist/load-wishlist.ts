import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPubliclyVisible } from "@/lib/products/visibility"
import { entryOf, type Plan, type WishlistEntry } from "@/components/wishlist/wishlist-entry"

/**
 * ===========================================================================
 *  THE SIGNED IN BUYER'S WISHLIST, READ ON THE SERVER
 * ===========================================================================
 * The library's Wishlist tab used to be drawn empty and then ask
 * /api/wishlist from the browser, so the tab's own prefetch carried no
 * products and every visit showed a spinner after the pill had already
 * switched. Read here, the prefetch carries the whole list, and the cards
 * are in the first frame the tab paints.
 *
 * Three waves at most. The saved rows with their products and sellers; then,
 * together, the sellers' names and faces, the plans of any membership (for
 * "/month" or "/year"), which products have options, and which the buyer
 * already owns. /api/wishlist asks for each seller's profile one at a time;
 * this asks once for all of them.
 *
 * Only what is still on sale is listed, as /api/wishlist lists it
 * (lib/products/visibility).
 */

const WITH_PWYW =
  "id, product_id, created_at, products (id, title, slug, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, status, creator_id, creators (id, user_id, slug))"
const WITHOUT_PWYW =
  "id, product_id, created_at, products (id, title, slug, price_cents, compare_at_cents, thumbnail_url, type, status, creator_id, creators (id, user_id, slug))"

type SavedRow = {
  id: string
  product_id: string
  created_at: string
  products: (Record<string, unknown> & { id: string; type?: string | null; status?: string | null; creators?: { user_id?: string | null } | null }) | null
}

export async function loadWishlist(userId: string): Promise<WishlistEntry[]> {
  const admin = createAdminClient()
  const read = (select: string) => admin.from("wishlist_items").select(select).eq("user_id", userId).order("created_at", { ascending: false })
  let { data, error } = await read(WITH_PWYW)
  /* A database from before pay what you want: the same list without it. */
  if (error) ({ data, error } = await read(WITHOUT_PWYW))
  if (error || !data) return []

  const rows = (data as unknown as SavedRow[]).filter((r) => r.products && isPubliclyVisible(r.products as { status?: string | null }))
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.products!.id)
  const sellers = [...new Set(rows.map((r) => r.products!.creators?.user_id).filter((v): v is string => !!v))]
  const memberships = rows.filter((r) => r.products!.type === "membership").map((r) => r.products!.id)

  /* Each of these can fail on its own (a table from a later migration) without taking the list with it. */
  const [profiles, plans, variants, owned] = await Promise.all([
    sellers.length ? admin.from("profiles").select("id, display_name, username, avatar_url").in("id", sellers) : Promise.resolve({ data: [] }),
    memberships.length ? admin.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents").in("product_id", memberships) : Promise.resolve({ data: [] }),
    admin.from("product_variants").select("product_id").in("product_id", ids),
    admin.from("entitlements").select("product_id").eq("buyer_id", userId).in("product_id", ids),
  ])

  const faceOf = new Map(((profiles.data ?? []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>).map((p) => [p.id, p]))
  const planOf = new Map(((plans.data ?? []) as Array<Plan & { product_id: string }>).map((p) => [p.product_id, p]))
  const withOptions = new Set(((variants.data ?? []) as Array<{ product_id: string }>).map((v) => v.product_id))
  const theirs = new Set(((owned.data ?? []) as Array<{ product_id: string }>).map((v) => v.product_id))

  const out: WishlistEntry[] = []
  for (const r of rows) {
    const p = r.products!
    const face = p.creators?.user_id ? faceOf.get(p.creators.user_id) : undefined
    const entry = entryOf(
      { ...r, products: { ...p, creator_profile: face ? { display_name: face.display_name, username: face.username, avatar_url: face.avatar_url } : null } },
      { plan: planOf.get(p.id) ?? null, hasOptions: withOptions.has(p.id), owned: theirs.has(p.id) },
    )
    if (entry) out.push(entry)
  }
  return out
}

import "server-only"

/**
 * THE READS BEHIND A COMMUNITY'S MEMBERSHIP MONEY (round 41). Which products
 * sell a community, its memberships a page at a time, and its MRR now, for
 * the community list, the Overview, the money stats and the Analytics report
 * alike. The rule is ../membership-money.ts.
 */
import { MEMBERSHIP_MONEY_COLUMNS, mrrAt, type MembershipMoneyRow } from "../membership-money"
import { missing, reasonOf, type Db } from "./db"

const PAGE = 1000
const MAX_PAGES = 50

/**
 * The products that sell a community: its paid tiers (recurring or once, archived ones too, since a member can still
 * be paying for one) and the products made for it, with the name each is sold under.
 */
export async function communitySellingProducts(db: Db, communityId: string): Promise<{ all: string[]; recurring: string[]; names: Map<string, string> }> {
  const [tiers, made] = await Promise.all([
    db.from("community_tiers").select("product_id, billing, name").eq("community_id", communityId).eq("kind", "paid").limit(50),
    db.from("products").select("id, type, title").eq("community_id", communityId).limit(200),
  ])
  const t = ((tiers.data as { product_id: string | null; billing: string | null; name?: string | null }[] | null) ?? []).filter((x) => x.product_id)
  const m = made.error ? [] : ((made.data as { id: string; type: string | null; title?: string | null }[] | null) ?? [])
  const all = [...new Set([...t.map((x) => x.product_id as string), ...m.map((x) => x.id)])]
  const recurring = [...new Set([...t.filter((x) => x.billing === "recurring").map((x) => x.product_id as string), ...m.filter((x) => x.type === "membership").map((x) => x.id)])]
  const names = new Map<string, string>()
  for (const x of m) if (x.title?.trim()) names.set(x.id, x.title.trim())
  for (const x of t) if (x.name?.trim()) names.set(x.product_id as string, x.name.trim())
  return { all, recurring, names }
}

/** Every membership of these products, a page of 1000 at a time; null when the table is not there. */
export async function membershipsOf(db: Db, productIds: string[], opts: { open?: boolean } = {}): Promise<MembershipMoneyRow[] | null> {
  if (productIds.length === 0) return []
  const out: MembershipMoneyRow[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("memberships").select(MEMBERSHIP_MONEY_COLUMNS).in("product_id", productIds)
    /* Now only: the ones that can be paying at all. */
    if (opts.open) q = q.in("status", ["active", "past_due", "trialing", "canceled"])
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (missing(error)) return out.length ? out : null
      console.error(`[communities] memberships: ${reasonOf(error)}`)
      return out
    }
    const rows = (data as (MembershipMoneyRow & { id: string })[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return out
}

/** A community's MRR now, and how many pay for it. */
export async function communityMrr(db: Db, communityId: string, now = Date.now()): Promise<{ cents: number; currency: string; paying: number }> {
  const products = await communitySellingProducts(db, communityId)
  const rows = (await membershipsOf(db, products.recurring, { open: true })) ?? []
  const m = mrrAt(rows, now)
  return { cents: m.cents, currency: m.currency, paying: m.paying }
}

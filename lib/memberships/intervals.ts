/**
 * ===========================================================================
 *  WHICH MEMBERSHIPS ARE PRICED PER YEAR
 * ===========================================================================
 * A membership's product row carries one price: the monthly one, or the
 * yearly one when the plan has no monthly (lib/memberships/creator.ts). A
 * surface that lists products says "/month" for a membership by default
 * (lib/pricing/list-price.ts intervalOf); this reads the plans of the
 * memberships in a list, once, so a yearly only plan says "/year".
 *
 * Browser safe: membership_plans' prices are readable by anyone
 * (supabase/sql/run-now/75), so a server page and a browser search can both
 * ask. Never throws and never fails the list it is asked about: where the
 * table is missing or the read fails, the default stands.
 */
import type { PriceInterval } from "@/lib/pricing/list-price"

type Client = { from: (table: string) => any }

/** The interval a plan's product row is priced in: monthly first, as the row is. */
export function planInterval(plan: { monthly_price_cents?: number | null; yearly_price_cents?: number | null } | null | undefined): PriceInterval {
  if (plan?.monthly_price_cents) return "month"
  if (plan?.yearly_price_cents) return "year"
  return "month"
}

/** Product id to interval, for the memberships among `ids`. */
export async function planIntervals(client: Client, ids: string[]): Promise<Map<string, PriceInterval>> {
  const out = new Map<string, PriceInterval>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  try {
    const { data, error } = await client.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents").in("product_id", unique)
    if (error || !Array.isArray(data)) return out
    for (const row of data as { product_id: string; monthly_price_cents: number | null; yearly_price_cents: number | null }[]) out.set(row.product_id, planInterval(row))
  } catch {
    /* The default ("/month") stands. */
  }
  return out
}

/**
 * The same rows, each membership with its `price_interval`. Asks nothing
 * when the list has no membership in it.
 */
export async function withPriceIntervals<T extends { id: string; type?: string | null }>(client: Client, rows: T[]): Promise<Array<T & { price_interval?: PriceInterval }>> {
  const ids = rows.filter((r) => r?.type === "membership").map((r) => r.id)
  if (ids.length === 0) return rows
  const intervals = await planIntervals(client, ids)
  return rows.map((r) => (r?.type === "membership" ? { ...r, price_interval: intervals.get(r.id) ?? "month" } : r))
}

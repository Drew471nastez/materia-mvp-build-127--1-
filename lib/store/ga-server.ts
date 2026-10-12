import "server-only"

/**
 * The product a page is about, as the store's Google Analytics names it:
 * its id, title, price and whether it ships (lib/store/ga.ts gaItem), in the
 * store's own currency (creators.payout_currency, a private column read on
 * the server). Read only when the store has Google Analytics on, once a
 * request, and never throws: an event with the id alone is still an event.
 */
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { storeCurrencyOf } from "@/lib/store/currency"
import { gaItem, type GaItem } from "./ga"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const storeCurrencyFor = cache(async (creatorId: string): Promise<string> => {
  try {
    const { data } = await createAdminClient().from("creators").select("payout_currency").eq("id", creatorId).maybeSingle()
    return storeCurrencyOf((data as { payout_currency?: string | null } | null)?.payout_currency)
  } catch {
    return storeCurrencyOf(null)
  }
})

export const gaProductFor = cache(async (creatorId: string, slug: string | null, id: string | null = null): Promise<{ item: GaItem; currency: string | null } | null> => {
  if (!UUID.test(creatorId)) return null
  try {
    let q = createAdminClient().from("products").select("id, title, price_cents, type").eq("creator_id", creatorId).eq("status", "published")
    if (id && UUID.test(id)) q = q.eq("id", id)
    else if (slug && slug.length <= 200) q = q.eq("slug", slug)
    else return null
    const [{ data }, currency] = await Promise.all([q.limit(1).maybeSingle(), storeCurrencyFor(creatorId)])
    const row = data as { id: string; title: string | null; price_cents: number | null; type: string | null } | null
    if (!row) return null
    const item = gaItem({ id: row.id, title: row.title, priceCents: row.price_cents, kind: row.type === "physical" ? "physical" : "digital" })
    return item ? { item, currency } : null
  } catch {
    return null
  }
})

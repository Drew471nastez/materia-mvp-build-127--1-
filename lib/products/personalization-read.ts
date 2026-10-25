/**
 * Each product's personalization fields (products.personalization, SQL part
 * 307, lib/products/personalization.ts), read for the products of a list,
 * a cart or a page. No server secret here, so the shop's card list (which
 * the builder's canvas also imports) may read it too.
 */
import { readPersonalization, type PersonalizationField } from "./personalization"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Each product's fields by id; an empty map when the column is not there (part 307 not run). Never throws. */
export async function personalizationOf(db: Db, productIds: string[]): Promise<Map<string, PersonalizationField[]>> {
  const out = new Map<string, PersonalizationField[]>()
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))]
  for (let i = 0; i < ids.length; i += 80) {
    try {
      const { data, error } = await db.from("products").select("id, personalization").in("id", ids.slice(i, i + 80))
      if (error) return out
      for (const r of (data ?? []) as { id: string; personalization?: unknown }[]) {
        const fields = readPersonalization(r.personalization)
        if (fields.length) out.set(r.id, fields)
      }
    } catch {
      return out
    }
  }
  return out
}

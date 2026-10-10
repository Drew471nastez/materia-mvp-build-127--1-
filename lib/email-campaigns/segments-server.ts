import "server-only"

/**
 * A segment's people, read for one creator only (./segments.ts holds the
 * rules). Subscribers in pages of a thousand, the creator's completed orders
 * once for "bought", then the rules in memory: a list of a few thousand is
 * a few reads, and nothing here can reach another creator's people.
 */
import { SOURCE_VALUES, matchesRules, readRules, type SegmentRules } from "./segments"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function boughtByEmail(db: Db, creatorId: string): Promise<{ anyByEmail: Set<string>; byProduct: Map<string, Set<string>> }> {
  const anyByEmail = new Set<string>()
  const byProduct = new Map<string, Set<string>>()
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await db.from("orders").select("buyer_email, product_id").eq("creator_id", creatorId).eq("status", "completed").not("buyer_email", "is", null).order("id", { ascending: true }).range(from, from + 999)
    if (error) break
    for (const o of (data ?? []) as { buyer_email: string | null; product_id: string | null }[]) {
      const email = (o.buyer_email ?? "").trim().toLowerCase()
      if (!email) continue
      anyByEmail.add(email)
      if (o.product_id) {
        const set = byProduct.get(o.product_id) ?? new Set<string>()
        set.add(email)
        byProduct.set(o.product_id, set)
      }
    }
    if (!data || data.length < 1000) break
  }
  return { anyByEmail, byProduct }
}

/** The ids of the creator's subscribed people a set of rules picks. */
export async function segmentMemberIds(db: Db, creatorId: string, rulesRaw: unknown): Promise<string[]> {
  const rules: SegmentRules = readRules(rulesRaw)
  const bought = rules.purchased === "any" ? { anyByEmail: new Set<string>(), byProduct: new Map<string, Set<string>>() } : await boughtByEmail(db, creatorId)
  const ids: string[] = []
  const now = Date.now()
  for (let from = 0; from < 500_000; from += 1000) {
    let q = db.from("subscribers").select("id, email, source, subscribed_at, status, is_active").eq("creator_id", creatorId).eq("status", "subscribed")
    if (rules.source) q = q.in("source", SOURCE_VALUES[rules.source])
    if (rules.joinedWithinDays) q = q.gte("subscribed_at", new Date(now - rules.joinedWithinDays * 86_400_000).toISOString())
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + 999)
    if (error) throw new Error("segment")
    for (const s of (data ?? []) as { id: string; email: string; source: string | null; subscribed_at: string | null; is_active: boolean | null }[]) {
      if (s.is_active === false) continue
      if (matchesRules(rules, { subscribedAt: s.subscribed_at, source: s.source, email: s.email ?? "" }, bought, now)) ids.push(s.id)
    }
    if (!data || data.length < 1000) break
  }
  return ids
}

/**
 * ===========================================================================
 *  A SEGMENT: WHO AN EMAIL GOES TO, BY WHAT THEY DID
 * ===========================================================================
 * New email › Send to › New segment. A segment is a name and a few rules,
 * kept in email_segments.filters (SQL part 46) beside the hand picked list
 * an older segment may hold (`subscriber_ids`), which still works:
 *
 *   joinedWithinDays  joined the list in the last N days (7, 30, 90, 365)
 *   source            where they joined: the OnePage, the website, a
 *                     checkout, a contact form
 *   purchased         anyone; bought anything; bought nothing; or bought one
 *                     of the products named in `productIds`
 *
 * Every rule narrows; none set is the whole list. Only people who are
 * subscribed are ever sent to, whatever a segment says (lib/email-campaigns/
 * queue.ts resolveAudience drops the rest), so a segment can never reach
 * somebody who left. Pure here; the server reads it in ./segments-server.ts.
 */

export const SEGMENT_SOURCES = ["onepage", "store_builder", "checkout", "contact"] as const
export type SegmentSource = (typeof SEGMENT_SOURCES)[number]
export const SOURCE_LABEL: Record<SegmentSource, string> = { onepage: "Your OnePage", store_builder: "Your website", checkout: "A checkout", contact: "A contact form" }
/** What subscribers.source holds for each: the website's footer form and its newsletter section are both the website. */
export const SOURCE_VALUES: Record<SegmentSource, string[]> = { onepage: ["onepage"], store_builder: ["store_builder", "website_builder_newsletter"], checkout: ["checkout"], contact: ["contact_form"] }

export type Purchased = "any" | "bought" | "not_bought" | "products"
export const JOINED_DAYS = [7, 30, 90, 365] as const

export interface SegmentRules {
  joinedWithinDays: number | null
  source: SegmentSource | null
  purchased: Purchased
  productIds: string[]
}

export const NO_RULES: SegmentRules = { joinedWithinDays: null, source: null, purchased: "any", productIds: [] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Rules as sent or as stored, made safe: anything unknown is dropped, never guessed. */
export function readRules(raw: unknown): SegmentRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const days = typeof r.joinedWithinDays === "number" && (JOINED_DAYS as readonly number[]).includes(r.joinedWithinDays) ? r.joinedWithinDays : null
  const source = (SEGMENT_SOURCES as readonly string[]).includes(r.source as string) ? (r.source as SegmentSource) : null
  const purchased: Purchased = r.purchased === "bought" || r.purchased === "not_bought" || r.purchased === "products" ? r.purchased : "any"
  const productIds = Array.isArray(r.productIds) ? [...new Set(r.productIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 50) : []
  return { joinedWithinDays: days, source, purchased: purchased === "products" && productIds.length === 0 ? "any" : purchased, productIds: purchased === "products" ? productIds : [] }
}

/**
 * "Bought one of these products" with none named. readRules reads that as
 * "anyone", which is everybody on the list, so a segment like it is refused
 * when it is saved rather than kept as something far wider than it says.
 */
export function namesNoProducts(raw: unknown): boolean {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return r.purchased === "products" && readRules(raw).productIds.length === 0
}

export const NO_PRODUCTS_ERROR = "Pick at least one product, or choose who to send to another way."

/** A segment's rules in a line, for the picker: "Joined in the last 30 days · bought something". */
export function describeRules(r: SegmentRules, productTitle: (id: string) => string | null = () => null): string {
  const parts: string[] = []
  if (r.joinedWithinDays) parts.push(r.joinedWithinDays === 365 ? "Joined in the last year" : `Joined in the last ${r.joinedWithinDays} days`)
  if (r.source) parts.push(`joined on ${SOURCE_LABEL[r.source].replace(/^Your /, "your ").replace(/^A /, "a ")}`)
  if (r.purchased === "bought") parts.push("bought something")
  if (r.purchased === "not_bought") parts.push("never bought")
  if (r.purchased === "products") {
    const names = r.productIds.map(productTitle).filter(Boolean) as string[]
    parts.push(names.length ? `bought ${names.slice(0, 2).join(" or ")}${names.length > 2 ? ` or ${names.length - 2} more` : ""}` : `bought one of ${r.productIds.length} products`)
  }
  if (parts.length === 0) return "Everyone on your list"
  const line = parts.join(" · ")
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** One subscriber against the rules, given what the server read about them. */
export function matchesRules(
  r: SegmentRules,
  s: { subscribedAt: string | null; source: string | null; email: string },
  bought: { anyByEmail: Set<string>; byProduct: Map<string, Set<string>> },
  now = Date.now(),
): boolean {
  if (r.joinedWithinDays) {
    const at = s.subscribedAt ? Date.parse(s.subscribedAt) : NaN
    if (!Number.isFinite(at) || now - at > r.joinedWithinDays * 86_400_000) return false
  }
  if (r.source && !SOURCE_VALUES[r.source].includes(s.source ?? "")) return false
  const email = s.email.trim().toLowerCase()
  if (r.purchased === "bought" && !bought.anyByEmail.has(email)) return false
  if (r.purchased === "not_bought" && bought.anyByEmail.has(email)) return false
  if (r.purchased === "products" && !r.productIds.some((id) => bought.byProduct.get(id)?.has(email))) return false
  return true
}

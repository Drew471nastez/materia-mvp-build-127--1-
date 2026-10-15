/**
 * ===========================================================================
 *  A ROW THE DATABASE CHANGED CLEARS WHAT IS CACHED FROM IT
 * ===========================================================================
 * The product editor, the course builder and the OnePage's products tab
 * write products straight from the browser, and a sale changes stock in the
 * database without passing through any route that purges. The storefront
 * only caught up when its sixty second hold ran out.
 *
 * Supabase part 179 (supabase/sql/run-now/179_cache_invalidation_pings.sql)
 * puts a trigger on products, product_variants, inventory_levels,
 * product_collections and product_collection_items that posts one small ping
 * per store, per kind and per product, per transaction, to
 * app/api/internal/invalidate through pg_net. This file is what that route
 * does with a ping: read it, and gather a burst of them so a store is purged
 * at most once per window per server, never losing the last change.
 *
 * Nothing here is needed for the site to be right: without the SQL or the
 * secret, no ping arrives and the holds expire as before.
 */

export const PING_KINDS = ["product", "variant", "inventory", "collection"] as const
export type PingKind = (typeof PING_KINDS)[number]

export interface Ping {
  creatorId: string
  kind: PingKind
  productId: string | null
  slug: string | null
  op: "INSERT" | "UPDATE" | "DELETE" | null
}

/** What one purge of a store clears. */
export interface Batch {
  creatorId: string
  productIds: string[]
  slugs: string[]
  /** Explore's catalogue: left, refreshed in the background, or dropped at once (a product deleted). */
  explore: "none" | "changed" | "taken-down"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/

/** A ping as the trigger sends it, or null for anything else. */
export function parsePing(body: unknown): Ping | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const creatorId = typeof b.creatorId === "string" && UUID.test(b.creatorId) ? b.creatorId.toLowerCase() : null
  const kind = (PING_KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as PingKind) : null
  if (!creatorId || !kind) return null
  const productId = typeof b.productId === "string" && UUID.test(b.productId) ? b.productId.toLowerCase() : null
  const slug = typeof b.slug === "string" && SLUG.test(b.slug) ? b.slug : null
  const op = b.op === "INSERT" || b.op === "UPDATE" || b.op === "DELETE" ? b.op : null
  return { creatorId, kind, productId, slug, op }
}

/* What a product or its price is, Explore lists; stock and collections it does not. */
function exploreOf(p: Ping): Batch["explore"] {
  if (p.kind === "product" && p.op === "DELETE") return "taken-down"
  return p.kind === "product" || p.kind === "variant" ? "changed" : "none"
}
const EXPLORE_RANK: Record<Batch["explore"], number> = { none: 0, changed: 1, "taken-down": 2 }

/* A burst of edits to many products purges the store's lists once and each product page; past this, the lists and the minute cover the rest. */
const MAX_PRODUCTS = 50

export function mergePing(into: Batch | null, p: Ping): Batch {
  const b: Batch = into ?? { creatorId: p.creatorId, productIds: [], slugs: [], explore: "none" }
  if (p.productId && !b.productIds.includes(p.productId) && b.productIds.length < MAX_PRODUCTS) b.productIds.push(p.productId)
  if (p.slug && !b.slugs.includes(p.slug) && b.slugs.length < MAX_PRODUCTS) b.slugs.push(p.slug)
  const e = exploreOf(p)
  if (EXPLORE_RANK[e] > EXPLORE_RANK[b.explore]) b.explore = e
  return b
}

/**
 * At most one purge per store per `windowMs` on this server, and never one
 * dropped. The first ping purges at once; one inside the window is held and
 * purged when the window ends (`later` says after how long), with every
 * ping that arrives meanwhile folded into it.
 */
export class PingGate {
  private stores = new Map<string, { last: number; pending: Batch | null; scheduled: boolean }>()
  constructor(private windowMs = 10_000, private now: () => number = Date.now, private max = 5000) {}

  add(p: Ping): { now: Batch } | { later: number } | { merged: true } {
    const t = this.now()
    let s = this.stores.get(p.creatorId)
    if (!s) {
      if (this.stores.size >= this.max) {
        for (const [k, v] of this.stores) if (!v.scheduled) { this.stores.delete(k); break }
      }
      s = { last: -Infinity, pending: null, scheduled: false }
      this.stores.set(p.creatorId, s)
    }
    s.pending = mergePing(s.pending, p)
    /* A held purge whose timer never ran (the server was stopped) is not waited on for ever: past twice the window, this ping purges. */
    if (s.scheduled && t - s.last < this.windowMs * 2) return { merged: true }
    if (t - s.last >= this.windowMs) {
      s.last = t
      const batch = s.pending
      s.pending = null
      return { now: batch }
    }
    s.scheduled = true
    return { later: Math.max(0, s.last + this.windowMs - t) }
  }

  /** The held purge for a store, when its window has ended. */
  take(creatorId: string): Batch | null {
    const s = this.stores.get(creatorId)
    if (!s) return null
    s.scheduled = false
    s.last = this.now()
    const batch = s.pending
    s.pending = null
    return batch
  }
}

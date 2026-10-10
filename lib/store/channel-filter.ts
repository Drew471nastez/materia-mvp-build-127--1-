/**
 * What a channel's pages ask (lib/store/channels.ts): which products are
 * taken off the Online store, the Creator page or Explore. Plain functions of
 * a database client, so a module the browser also loads can import this
 * file; the reads only ever run on the server. Both fail open: any error,
 * nothing hidden, so a page never loses its products to a database part
 * that has not run yet.
 */
import type { BuiltInKind } from "./channels"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The products of one store taken off a built-in channel. Fails open: any
 * error, nothing hidden.
 */
export async function offChannel(db: Db, creatorId: string | null | undefined, kind: BuiltInKind): Promise<Set<string>> {
  if (!creatorId) return new Set()
  try {
    const { data, error } = await db.from("product_channel_listings").select("product_id, sales_channels!inner(kind)").eq("creator_id", creatorId).eq("listed", false).eq("sales_channels.kind", kind).limit(5000)
    if (error) return new Set()
    return new Set(((data ?? []) as { product_id: string }[]).map((r) => r.product_id))
  } catch {
    return new Set()
  }
}

/** The same across stores, for Explore: which of these products are taken off it. */
export async function offChannelAmong(db: Db, productIds: string[], kind: BuiltInKind): Promise<Set<string>> {
  const ids = [...new Set(productIds.filter((id) => UUID.test(id)))]
  if (ids.length === 0) return new Set()
  try {
    const out = new Set<string>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await db.from("product_channel_listings").select("product_id, sales_channels!inner(kind)").in("product_id", ids.slice(i, i + 150)).eq("listed", false).eq("sales_channels.kind", kind)
      if (error) return new Set()
      for (const r of (data ?? []) as { product_id: string }[]) out.add(r.product_id)
    }
    return out
  } catch {
    return new Set()
  }
}

import "server-only"

/**
 * The order page's full address on the host the buyer knows (./order-link.ts
 * says the order). Never throws: a lookup that fails is storelib.com.
 */
import { getMainDomain } from "@/lib/url-helpers"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { firstServingSite, servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { orderPagePath, originSiteHost } from "./order-link"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** https://<the store's website> or https://storelib.com, for this creator and, when known, the website the order was placed on. */
export async function storeOriginFor(db: Db, creatorId: string, origin?: unknown): Promise<string> {
  const platform = `https://${getMainDomain()}`
  if (!creatorId) return platform
  try {
    const placed = originSiteHost(origin)
    if (placed) {
      const served = await servingSiteOrigin(db, creatorId, `https://${placed}`)
      if (served) return served
    }
    const own = await firstServingSite(db, creatorId, await siteHostsFor(creatorId, db))
    if (own) return own
  } catch {
    /* storelib.com below */
  }
  return platform
}

/** The full address of a physical order's page for its buyer, or storelib.com's when the token is not one. */
export async function orderPageUrl(db: Db, co: { creator_id: string; receipt_token: string; origin?: unknown }): Promise<string> {
  const path = orderPagePath(co.receipt_token) ?? `/checkout/physical/order/${encodeURIComponent(String(co.receipt_token ?? ""))}`
  return `${await storeOriginFor(db, co.creator_id, co.origin)}${path}`
}

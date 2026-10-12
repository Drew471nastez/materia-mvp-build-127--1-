import "server-only"

/**
 * The real order engine for ./sync-server.ts: load an order, and the link
 * a buyer opens to see it. Looked up when called (orders-server imports the
 * job queue, which imports this), as lib/integrations/fulfilment/forward-
 * deps-server.ts does for the print partners.
 */
import { loadOrder } from "@/lib/physical/orders-server"
import { orderPageUrl } from "@/lib/physical/order-link-server"
import type { MarketingDeps } from "./sync-server"

export const realMarketingDeps: MarketingDeps = {
  loadOrder: (db, where) => loadOrder(db, where),
  orderUrl: (db, co) => orderPageUrl(db, co),
  now: () => Date.now(),
}

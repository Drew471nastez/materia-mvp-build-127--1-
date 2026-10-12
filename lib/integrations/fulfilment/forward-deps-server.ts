import "server-only"

/**
 * The real order engine for ./forward-server.ts: load an order, ship its
 * items when a partner says so, write the timeline. Kept in a file of its
 * own so Settings' connect path (lib/physical/integrations-server.ts) does
 * not pull the order engine in. Each is looked up when called: jobs-server
 * imports this file and orders-server imports jobs-server, so at load they
 * may not be there yet.
 */
import { addOrderEvent } from "@/lib/physical/events-server"
import { loadOrder } from "@/lib/physical/orders-server"
import { partnerShipped } from "@/lib/physical/partner-server"
import type { ForwardDeps } from "./forward-server"
import { realStockDeps } from "./stock-deps-server"

export const realForwardDeps: ForwardDeps = {
  loadOrder: (db, where) => loadOrder(db, where),
  partnerShipped: (db, input) => partnerShipped(db, input),
  addOrderEvent: (db, e) => addOrderEvent(db, e),
  now: () => Date.now(),
  stock: realStockDeps,
}

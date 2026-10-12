import "server-only"

/**
 * The real order engine for ./labels-server.ts and ./shipstation-server.ts:
 * load an order, ship its items, cancel a shipment, write the timeline,
 * queue a job. Each is looked up when called: jobs-server imports this file
 * and orders-server imports jobs-server, so at load they may not be there
 * yet. A test hands in its own.
 */
import { addOrderEvent } from "@/lib/physical/events-server"
import { enqueueJob } from "@/lib/physical/jobs-server"
import { fulfilItems, loadOrder, updateShipment } from "@/lib/physical/orders-server"
import type { LabelDeps } from "./labels-server"
import type { ShipStationDeps } from "./shipstation-server"

export const realLabelDeps: LabelDeps = {
  loadOrder: (db, where) => loadOrder(db, where),
  fulfilItems: (db, creatorId, checkoutId, input) => fulfilItems(db, creatorId, checkoutId, input),
  updateShipment: (db, creatorId, id, input) => updateShipment(db, creatorId, id, input),
  addOrderEvent: (db, e) => addOrderEvent(db, e),
}

export const realShipStationDeps: ShipStationDeps = {
  loadOrder: (db, where) => loadOrder(db, where),
  fulfilItems: (db, creatorId, checkoutId, input) => fulfilItems(db, creatorId, checkoutId, input),
  updateShipment: (db, creatorId, id, input) => updateShipment(db, creatorId, id, input),
  addOrderEvent: (db, e) => addOrderEvent(db, e),
  enqueue: (db, j) => enqueueJob(db, j),
  now: () => Date.now(),
}

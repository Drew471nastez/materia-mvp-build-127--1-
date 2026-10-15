/**
 * ===========================================================================
 *  PHYSICAL PRODUCTS ON SALE THAT CAN'T BE BOUGHT OR SHIPPED
 * ===========================================================================
 * physical_readiness.not_ready (lib/physical/readiness-server.ts
 * noteReadiness): a store with physical products on sale went from fine, or
 * from nothing on sale, to a gap that stops a checkout or a shipment. Raised
 * once per episode: the first physical product published with no shipping
 * rate is one, the last zone deleted a month later is the next.
 *
 *   PHYSICAL_STORE_NOT_READY     15 minutes on: the bell and an email,
 *                                listing every blocking gap with its fix
 *   PHYSICAL_STORE_NOT_READY_2   3 days on: one reminder, email only
 *
 * Fifteen minutes, not at once: the banner, the editor and Settings already
 * say it on screen, and somebody who fixes it straight after publishing gets
 * nothing. Both read the store again just before they send (conditions.ts
 * physical_store_not_ready), so a store fixed in between hears nothing more.
 * Each type has a week's cooldown (registry.ts), so however often a store
 * breaks it is two emails a week at most, under the engine's daily caps and
 * the person's own settings (Settings > Notifications, Products and store).
 *
 * The older "finish setting up shipping" nudges (unfinished.ts, while setting
 * up) are cancelled: once something is on sale this is the one that speaks.
 * Never to a buyer: both types are creator only.
 */
import { DAY_MS, WORKFLOWS, cancelFor, job, plan, type Workflow } from "./common"

const MINUTE_MS = 60_000

export const physical: Workflow = (event, ctx) => {
  /*
    PAID ORDERS STILL NOT SHIPPED (lib/physical/orders-waiting-server.ts): one
    reminder for the store that day, sent at once, read again just before
    it goes (conditions.ts orders_still_waiting) and a day's cooldown on top.
  */
  if (event.name === "physical.orders_waiting") {
    const day = typeof event.payload.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.payload.day) ? event.payload.day : null
    if (!day) return null
    return plan([job("ORDERS_WAITING_TO_SHIP", event, ctx, { entityType: "creator", entityId: ctx.creatorId, step: `day_${day}`, expiresInMs: DAY_MS })])
  }
  if (event.name !== "physical_readiness.not_ready") return null
  const episode = Number(event.payload.episode)
  if (!Number.isInteger(episode) || episode < 1) return null
  const on = { workflow: WORKFLOWS.physicalReadiness, entityType: "creator" as const, entityId: ctx.creatorId, expiresInMs: 2 * DAY_MS, data: { reason: event.payload.reason === "broke" ? "broke" : "live" } }
  return plan(
    [
      job("PHYSICAL_STORE_NOT_READY", event, ctx, { ...on, step: `ep_${episode}`, delayMs: 15 * MINUTE_MS }),
      job("PHYSICAL_STORE_NOT_READY_2", event, ctx, { ...on, step: `ep_${episode}_reminder`, delayMs: 3 * DAY_MS }),
    ],
    cancelFor(ctx, WORKFLOWS.physicalSetup, "physical products on sale: the readiness notice speaks now"),
  )
}

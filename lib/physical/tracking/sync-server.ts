import "server-only"

/**
 * ===========================================================================
 *  FOLLOWING EVERY PARCEL: THE CRON, THE WEBHOOK, AND WHAT THEY CHANGE
 * ===========================================================================
 * A shipment with a tracking number (the seller's, or one a partner sent:
 * Printful, Printify, Gelato, CJ, ShipStation and the rest all land in
 * `fulfillments` through lib/physical/orders-server.ts) is followed with no
 * setup:
 *
 *   register   the first time the cron (/api/cron/physical, every ten
 *              minutes) sees it, the number is registered with the tracking
 *              aggregator (./provider.ts): Storelib's own account, or the
 *              store's own when it added one. The carrier is the one the
 *              seller picked, else the aggregator works it out.
 *   push       the aggregator's webhook (app/api/tracking/webhooks) says a
 *              parcel moved. Its signature is checked, the address token is
 *              Storelib's, and the parcel is then READ BACK from the
 *              aggregator: the body only says which one.
 *   poll       the cron also looks at open parcels whose next look is due
 *              (./model.ts nextCheckAt): soon while new, less often as they
 *              age, stopped once delivered, returned, expired or 60 days
 *              after shipping. Only shipments still on their way are read.
 *   apply      each scan is kept once on the shipment (fulfillment_events,
 *              keyed by what it says); the carrier's state is stored with
 *              the estimated delivery; and when it moves the shipment on
 *              (in transit, out for delivery, delivered, a delivery problem)
 *              the move is made by updateShipment, the same as a seller's
 *              press: the buyer's emails (Out for delivery, Delivered,
 *              Delivery issue, each once), the seller's email for a problem,
 *              the timeline, the order's status. Delivered takes the
 *              carrier's own time, so the return window counts from the day
 *              the parcel really arrived (lib/physical/status returnWindow).
 *   once       the state is written with a compare and set, so a webhook and
 *              a poll arriving together move a shipment once.
 *
 * The seller can still set any status by hand; the carrier only ever moves
 * a shipment forward from there, and the seller can pause automatic updates
 * on one shipment. Before part 160 nothing here runs: the cron says so and
 * the order pages read as they did.
 */

import type { Db } from "../auth"
import { addOrderEvent } from "../events-server"
import { canMoveShipment } from "../status"
import { carrierOf, carrierTrackingUrl } from "../carriers"
import { updateShipment } from "../orders-server"
import type { ShipmentStatus } from "../types"
import { TrackingError } from "./http"
import { AFTERSHIP_SLUG, checkpointId, isFinal, isTrackingStatus, nextCheckAt, problemText, shipmentStatusFor, TRACKING_LABEL, type TrackingSnapshot, type TrackingStatus } from "./model"
import { platformAccount, trackingProvider, type TrackingAccount } from "./provider"
import { accountFor, ownAccount } from "./accounts-server"

export const OPEN_SHIPMENT: ShipmentStatus[] = ["shipped", "in_transit", "out_for_delivery", "failed"]

export const SHIPMENT_TRACKING_COLUMNS =
  "id, checkout_id, creator_id, status, provider, carrier, tracking_number, tracking_url, shipped_at, notify_buyer, tracking_provider, tracking_account, tracking_ref, tracking_ref_number, tracking_carrier_code, tracking_status, tracking_failures, tracking_auto"

export interface TrackedShipment {
  id: string
  checkout_id: string
  creator_id: string
  status: ShipmentStatus
  provider: string
  carrier: string | null
  tracking_number: string | null
  tracking_url: string | null
  shipped_at: string | null
  notify_buyer: boolean | null
  tracking_provider: string | null
  tracking_account: string | null
  tracking_ref: string | null
  tracking_ref_number: string | null
  tracking_carrier_code: string | null
  tracking_status: string | null
  tracking_failures: number | null
  tracking_auto: boolean | null
}

const missingColumn = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(e.message ?? ""))
const missingTable = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message ?? ""))

/* ── reading a parcel ─────────────────────────────────────────────────── */

function carrierCodeFor(a: TrackingAccount, f: TrackedShipment): string | null {
  if (f.tracking_provider === a.provider && f.tracking_carrier_code) return f.tracking_carrier_code
  if (a.provider === "aftership") {
    const known = carrierOf(f.carrier)
    return known ? (AFTERSHIP_SLUG[known.name] ?? null) : null
  }
  return null
}

/** Registered with this account for this number already? Otherwise it is (again). */
function registered(a: TrackingAccount, f: TrackedShipment): boolean {
  return f.tracking_provider === a.provider && f.tracking_account === a.scope && !!f.tracking_ref_number && f.tracking_ref_number === f.tracking_number
}

async function readParcel(a: TrackingAccount, f: TrackedShipment): Promise<TrackingSnapshot> {
  const p = trackingProvider(a.provider)!
  const number = f.tracking_number!
  const carrierCode = carrierCodeFor(a, f)
  if (!registered(a, f)) return p.register(a, { number, carrierCode, orderRef: f.checkout_id })
  try {
    return await p.get(a, { ref: f.tracking_ref, number, carrierCode })
  } catch (e) {
    if (e instanceof TrackingError && e.code === "not_registered") return p.register(a, { number, carrierCode, orderRef: f.checkout_id })
    throw e
  }
}

/* ── applying what the carrier said ───────────────────────────────────── */

export interface ApplyResult {
  checkpointsAdded: number
  moved: ShipmentStatus | null
  status: TrackingStatus
}

/**
 * What the aggregator says about one shipment, applied: its scans kept,
 * its state stored, and the shipment moved on when the state says so.
 */
export async function applySnapshot(db: Db, f: TrackedShipment, snap: TrackingSnapshot, a: TrackingAccount, opts: { source: "provider" | "webhook"; now?: number; webhooks?: boolean }): Promise<ApplyResult> {
  const now = opts.now ?? Date.now()
  const nowIso = new Date(now).toISOString()
  const freshNumber = !!f.tracking_ref_number && f.tracking_ref_number !== f.tracking_number

  /* A changed number: what the old one said is not this parcel's story. */
  if (freshNumber) await db.from("fulfillment_events").delete().eq("fulfillment_id", f.id).like("external_id", "trk:%")

  /* 1. Each scan once. */
  let added = 0
  if (snap.checkpoints.length) {
    const { data: had } = await db.from("fulfillment_events").select("external_id").eq("fulfillment_id", f.id).like("external_id", "trk:%")
    const have = new Set(((had ?? []) as { external_id: string }[]).map((r) => r.external_id))
    const rows = snap.checkpoints
      .map((c) => ({ fulfillment_id: f.id, status: c.status, message: c.message, location: c.location, source: opts.source, external_id: checkpointId(c), occurred_at: c.at }))
      .filter((r) => !have.has(r.external_id))
    if (rows.length) {
      const { error } = await db.from("fulfillment_events").insert(rows)
      if (!error) added = rows.length
      else if (error.code === "23505") {
        /* Another reader got there first with some of them: one at a time, the rest kept. */
        for (const r of rows) {
          const { error: one } = await db.from("fulfillment_events").insert(r)
          if (!one) added++
        }
      }
    }
  }

  /* 2. The carrier's state, written once: the first reader to see a new state is the one that acts on it. */
  const before = freshNumber ? null : f.tracking_status
  let changed = false
  if (before !== snap.status) {
    const q = db.from("fulfillments").update({ tracking_status: snap.status, updated_at: nowIso }).eq("id", f.id)
    const { data: won } = await (before === null ? q.is("tracking_status", null) : q.eq("tracking_status", before)).select("id")
    changed = Array.isArray(won) && won.length > 0
  }
  const lastAt = snap.checkpoints[0]?.at ?? null
  const patch: Record<string, unknown> = {
    tracking_provider: a.provider,
    tracking_account: a.scope,
    tracking_ref: snap.ref ?? f.tracking_ref ?? null,
    tracking_ref_number: f.tracking_number,
    tracking_carrier_code: snap.carrierCode ?? f.tracking_carrier_code ?? null,
    tracking_substatus: snap.substatus,
    estimated_delivery_at: snap.estimatedDelivery,
    tracking_checked_at: nowIso,
    tracking_last_event_at: lastAt,
    tracking_failures: 0,
    tracking_error: null,
    tracking_next_check_at: nextCheckAt({ shippedAt: f.shipped_at, status: snap.status, now, webhooks: opts.webhooks }),
    tracking_stopped_at: isFinal(snap.status) ? nowIso : null,
  }
  /* A shipment saved without a carrier gets the one the aggregator found, and its link. */
  if (!f.carrier && (snap.carrierName || snap.carrierCode)) {
    const named = carrierOf(snap.carrierName) ?? carrierOf(snap.carrierCode)
    const carrier = (named?.name ?? snap.carrierName ?? "").slice(0, 40)
    if (carrier) {
      patch.carrier = carrier
      if (!f.tracking_url) patch.tracking_url = carrierTrackingUrl(carrier, f.tracking_number)
    }
  }
  await db.from("fulfillments").update(patch).eq("id", f.id)

  /* 3. The shipment moved on, made by the order engine as a seller's press would be. */
  let moved: ShipmentStatus | null = null
  if (changed && f.tracking_auto !== false) {
    const to = shipmentStatusFor(snap.status)
    const carrierName = (patch.carrier as string | undefined) ?? f.carrier ?? snap.carrierName ?? "the carrier"
    const latest = snap.checkpoints.find((c) => c.status === snap.status) ?? snap.checkpoints[0] ?? null
    if (to && canMoveShipment(f.status, to)) {
      const delivered = to === "delivered" ? (snap.checkpoints.find((c) => c.status === "delivered")?.at ?? nowIso) : null
      const r = await updateShipment(db, f.creator_id, f.id, {
        status: to,
        partner: { name: carrierName },
        /* Ready to collect from the carrier is not "out for delivery": the order page says where, without that email. */
        notifyBuyer: snap.status !== "available_for_pickup",
        problem: problemText(snap.status, latest?.message ?? null),
        deliveredAt: delivered && Date.parse(delivered) <= now ? delivered : null,
      })
      if (r.ok) moved = to
    } else if (to === "failed" && f.status === "failed" && snap.status === "returned") {
      /* Already a problem, and now it is going back: the seller is told (fulfillment.exception emails them), once. */
      await addOrderEvent(db, { checkoutId: f.checkout_id, creatorId: f.creator_id, kind: "fulfillment.exception", message: `${TRACKING_LABEL.returned.label}: ${f.tracking_number}`, actor: "webhook", key: `trk_returned:${f.id}:${f.tracking_number}` })
    }
  }
  return { checkpointsAdded: added, moved, status: snap.status }
}

/** Reading failed: looked at again later, further apart each time; the reason kept for the seller and /admin. */
async function noteFailure(db: Db, f: TrackedShipment, e: unknown, now: number): Promise<void> {
  const failures = (f.tracking_failures ?? 0) + 1
  const message = (e instanceof Error ? e.message : "Tracking could not be read.").slice(0, 300)
  const retry = !(e instanceof TrackingError) || e.retry
  await db
    .from("fulfillments")
    .update({
      tracking_failures: failures,
      tracking_error: message,
      tracking_checked_at: new Date(now).toISOString(),
      /* A number the aggregator refuses outright is tried once a day, five times, then left to the seller's own statuses. */
      tracking_next_check_at: !retry && failures >= 5 ? null : nextCheckAt({ shippedAt: f.shipped_at, status: isTrackingStatus(f.tracking_status) ? f.tracking_status : null, now, failures: retry ? failures : Math.max(failures, 8) }),
      tracking_stopped_at: !retry && failures >= 5 ? new Date(now).toISOString() : null,
    })
    .eq("id", f.id)
}

/** One shipment read and applied now (the cron's step, and a seller's Refresh). */
export async function syncShipment(db: Db, f: TrackedShipment, a: TrackingAccount, now = Date.now()): Promise<{ ok: true; result: ApplyResult } | { ok: false; error: string }> {
  if (!f.tracking_number) return { ok: false, error: "This shipment has no tracking number." }
  try {
    const snap = await readParcel(a, f)
    const result = await applySnapshot(db, f, snap, a, { source: "provider", now, webhooks: a.provider === "17track" || !!a.webhookSecret })
    return { ok: true, result }
  } catch (e) {
    await noteFailure(db, f, e, now)
    return { ok: false, error: e instanceof Error ? e.message : "Tracking could not be read." }
  }
}

/* ── the cron ─────────────────────────────────────────────────────────── */

export interface SweepResult {
  configured: boolean
  available: boolean
  checked: number
  moved: number
  failed: number
}

/**
 * Every open parcel whose next look is due, oldest first, up to `limit` in
 * `budgetMs`. Nothing is asked of anyone when no store has an account and
 * Storelib's own is not set up.
 */
export async function runTrackingSweep(db: Db, opts: { limit?: number; budgetMs?: number; now?: () => number } = {}): Promise<SweepResult> {
  const clock = opts.now ?? Date.now
  const started = clock()
  const platform = platformAccount()
  let ownStores: string[] = []
  {
    const { data, error } = await db.from("commerce_tracking_accounts").select("creator_id").eq("status", "connected").limit(1000)
    if (!error) ownStores = ((data ?? []) as { creator_id: string }[]).map((r) => r.creator_id)
  }
  if (!platform && ownStores.length === 0) return { configured: false, available: true, checked: 0, moved: 0, failed: 0 }
  const nowIso = new Date(started).toISOString()
  let q = db
    .from("fulfillments")
    .select(SHIPMENT_TRACKING_COLUMNS)
    .not("tracking_number", "is", null)
    .is("tracking_stopped_at", null)
    .eq("tracking_auto", true)
    .in("status", OPEN_SHIPMENT)
    .gte("shipped_at", new Date(started - 60 * 86_400_000).toISOString())
    .or(`tracking_next_check_at.is.null,tracking_next_check_at.lte."${nowIso}"`)
  if (!platform) q = q.in("creator_id", ownStores)
  const { data, error } = await q.order("tracking_next_check_at", { ascending: true, nullsFirst: true }).limit(opts.limit ?? 40)
  if (error) return { configured: true, available: !missingColumn(error) && !missingTable(error), checked: 0, moved: 0, failed: 0 }
  const cache = new Map<string, TrackingAccount | null>()
  let checked = 0
  let moved = 0
  let failed = 0
  for (const f of (data ?? []) as TrackedShipment[]) {
    if (clock() - started > (opts.budgetMs ?? 15_000)) break
    const a = await accountFor(db, f.creator_id, cache)
    if (!a) continue
    const r = await syncShipment(db, f, a, clock())
    checked++
    if (r.ok && r.result.moved) moved++
    if (!r.ok) failed++
  }
  return { configured: true, available: true, checked, moved, failed }
}

/* ── the webhook ──────────────────────────────────────────────────────── */

/**
 * A delivery from the aggregator, after its address token named whose
 * account it is ("platform" or a store). Checked against its signature,
 * then the parcel is read back from the aggregator and applied to every
 * open shipment with that number in that account. A delivery sent twice
 * changes nothing the second time.
 */
export async function handleTrackingWebhook(
  db: Db,
  input: { provider: string; owner: string; raw: string; headers: { get(name: string): string | null } },
  now = Date.now(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const p = trackingProvider(input.provider)
  if (!p) return { status: 404, body: { error: "Not found." } }
  const a = input.owner === "platform" ? platformAccount() : await ownAccount(db, input.owner)
  if (!a || a.provider !== p.id) return { status: 410, body: { error: "Not set up." } }
  if (!p.verifyWebhook(a, input.raw, input.headers)) return { status: 401, body: { error: "The signature did not match." } }
  const said = p.readWebhook(input.raw)
  if (!said) return { status: 200, body: { ok: true, ignored: true } }
  const number = said.number.replace(/\s+/g, "")
  let q = db.from("fulfillments").select(SHIPMENT_TRACKING_COLUMNS).in("tracking_number", [...new Set([number, number.toUpperCase()])]).in("status", OPEN_SHIPMENT).is("tracking_stopped_at", null).eq("tracking_auto", true)
  if (a.scope === "own") q = q.eq("creator_id", a.creatorId!)
  const { data, error } = await q.limit(20)
  if (error) return missingColumn(error) || missingTable(error) ? { status: 200, body: { ok: true, ignored: true } } : { status: 503, body: { error: "Try again." } }
  /* Storelib's own account answers for stores without one of their own. */
  let shipments = (data ?? []) as TrackedShipment[]
  if (a.scope === "platform" && shipments.length) {
    const { data: own } = await db.from("commerce_tracking_accounts").select("creator_id").eq("status", "connected").in("creator_id", [...new Set(shipments.map((s) => s.creator_id))])
    const mine = new Set(((own ?? []) as { creator_id: string }[]).map((r) => r.creator_id))
    shipments = shipments.filter((s) => !mine.has(s.creator_id))
  }
  if (shipments.length === 0) return { status: 200, body: { ok: true, ignored: true } }
  let snap: TrackingSnapshot
  try {
    snap = await p.get(a, { ref: said.ref ?? shipments[0].tracking_ref, number, carrierCode: said.carrierCode ?? shipments[0].tracking_carrier_code })
  } catch (e) {
    if (e instanceof TrackingError && !e.retry) return { status: 200, body: { ok: true, ignored: true } }
    return { status: 503, body: { error: "Try again." } }
  }
  let moved = 0
  for (const f of shipments) {
    const r = await applySnapshot(db, f, snap, a, { source: "webhook", now, webhooks: true })
    if (r.moved) moved++
  }
  if (a.scope === "own") await db.from("commerce_tracking_accounts").update({ last_webhook_at: new Date(now).toISOString() }).eq("creator_id", a.creatorId!)
  return { status: 200, body: { ok: true, shipments: shipments.length, moved } }
}


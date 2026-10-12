/**
 * ===========================================================================
 *  COURIER TRACKING: WHAT A PARCEL'S STATE IS, IN STORELIB'S WORDS
 * ===========================================================================
 * Storelib follows every shipment that has a tracking number through a
 * tracking aggregator (AfterShip or 17TRACK, ./aftership.ts and
 * ./seventeentrack.ts), so every carrier works without a connection of its
 * own. Each aggregator has its own words for where a parcel is; this file
 * turns both into one set (TrackingStatus), says which shipment status each
 * one moves the order to, and when to look again.
 *
 *   status          what the carrier said last, as the buyer and seller read it
 *   shipment move   in transit, out for delivery, delivered, or a delivery
 *                   problem (failed) for a failed attempt, an exception or a
 *                   parcel going back to the sender. The order engine
 *                   (lib/physical/orders-server.ts updateShipment) makes the
 *                   move, so the emails, timeline and stock are the ones a
 *                   seller's own press makes.
 *   checkpoints     each scan with its time, place and the carrier's message,
 *                   kept on fulfillment_events with an id made from what it
 *                   says, so the same scan read twice is kept once
 *   next look       soon while the parcel is new or out for delivery, less
 *                   often as it ages, never after it was delivered, returned,
 *                   expired, or 60 days after it shipped
 *
 * Pure: the cron, the webhook, both order pages and the tests read the same.
 */

import { createHash } from "node:crypto"
import type { ShipmentStatus } from "../types"

import { TRACKING_LABEL, type Checkpoint, type TrackingStatus } from "./labels"
export * from "./labels"

/** What the buyer is told for a delivery problem the carrier reported (the Delivery issue email and the order page). */
export function problemText(status: TrackingStatus, carrierMessage: string | null): string | null {
  const said = carrierMessage ? carrierMessage.replace(/\s+/g, " ").trim().slice(0, 160) : ""
  if (status === "attempt_failed") return said ? `The carrier tried to deliver it: ${said}` : "The carrier tried to deliver it and could not."
  if (status === "returned") return said ? `It is going back to the shop: ${said}` : "The carrier is sending it back to the shop."
  if (status === "exception") return said ? `The carrier reported: ${said}` : "The carrier reported a problem."
  return null
}

/**
 * The shipment status a carrier state moves a shipment to, or null when it
 * says nothing new about where the parcel is (a label made, no scan yet).
 * Ready to collect from the carrier reads as out for delivery: it is as
 * close to the buyer as it gets.
 */
export function shipmentStatusFor(status: TrackingStatus): ShipmentStatus | null {
  switch (status) {
    case "in_transit":
      return "in_transit"
    case "out_for_delivery":
    case "available_for_pickup":
      return "out_for_delivery"
    case "delivered":
      return "delivered"
    case "attempt_failed":
    case "exception":
    case "returned":
      return "failed"
    default:
      return null
  }
}

/** States after which nothing more will be said about the parcel: looking again costs and tells nothing. */
export function isFinal(status: TrackingStatus | null | undefined): boolean {
  return status === "delivered" || status === "returned" || status === "expired"
}

/* ── AfterShip's words ───────────────────────────────────────────────── */

/**
 * AfterShip Tracking API tags (Pending, InfoReceived, InTransit,
 * OutForDelivery, AvailableForPickup, AttemptFail, Exception, Delivered,
 * Expired). Exception_010 and Exception_011 are "being returned" and
 * "returned to sender"; a carrier that says so in words is read the same.
 */
export function fromAfterShipTag(tag: unknown, subtag?: unknown, message?: unknown): TrackingStatus {
  const t = String(tag ?? "").toLowerCase()
  const s = String(subtag ?? "")
  const m = String(message ?? "")
  if (t === "exception" && (/^Exception_01[01]$/.test(s) || /return(ed|ing)? to (the )?(sender|shipper)/i.test(m))) return "returned"
  switch (t) {
    case "pending":
      return "pending"
    case "inforeceived":
      return "info_received"
    case "intransit":
      return "in_transit"
    case "outfordelivery":
      return "out_for_delivery"
    case "availableforpickup":
      return "available_for_pickup"
    case "attemptfail":
      return "attempt_failed"
    case "exception":
      return "exception"
    case "delivered":
      return "delivered"
    case "expired":
      return "expired"
    default:
      return "pending"
  }
}

/* ── 17TRACK's words ─────────────────────────────────────────────────── */

/**
 * 17TRACK API v2.2 main statuses (NotFound, InfoReceived, InTransit,
 * Expired, AvailableForPickup, OutForDelivery, DeliveryFailure, Delivered,
 * Exception), with sub statuses Exception_Returning and Exception_Returned
 * for a parcel going back.
 */
export function from17TrackStatus(status: unknown, sub?: unknown, message?: unknown): TrackingStatus {
  const t = String(status ?? "").toLowerCase()
  const s = String(sub ?? "")
  const m = String(message ?? "")
  if ((t === "exception" || t === "deliveryfailure") && (/^Exception_Return(ing|ed)$/.test(s) || /return(ed|ing)? to (the )?(sender|shipper)/i.test(m))) return "returned"
  switch (t) {
    case "notfound":
      return "not_found"
    case "inforeceived":
      return "info_received"
    case "intransit":
      return "in_transit"
    case "expired":
      return "expired"
    case "availableforpickup":
      return "available_for_pickup"
    case "outfordelivery":
      return "out_for_delivery"
    case "deliveryfailure":
      return "attempt_failed"
    case "delivered":
      return "delivered"
    case "exception":
      return "exception"
    default:
      return "pending"
  }
}

/* ── checkpoints ─────────────────────────────────────────────────────── */

/** The same scan, read from a webhook and from a poll, makes the same id: kept once (fulfillment_events external_id). */
export function checkpointId(c: Pick<Checkpoint, "at" | "message" | "location">): string {
  const t = Date.parse(c.at)
  const when = Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) : c.at
  const h = createHash("sha256").update(`${when}|${c.message.trim().toLowerCase()}|${(c.location ?? "").trim().toLowerCase()}`).digest("hex").slice(0, 24)
  return `trk:${h}`
}

export const isCheckpointId = (id: unknown): boolean => typeof id === "string" && id.startsWith("trk:")

/** Newest first, each scan once, a time that parses, at most 60 kept. */
export function cleanCheckpoints(list: Checkpoint[]): Checkpoint[] {
  const seen = new Set<string>()
  const out: Checkpoint[] = []
  for (const c of list) {
    const t = Date.parse(c.at)
    if (!Number.isFinite(t)) continue
    const message = c.message.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || TRACKING_LABEL[c.status].label
    const location = c.location ? c.location.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || null : null
    const clean = { at: new Date(t).toISOString(), status: c.status, message, location }
    const id = checkpointId(clean)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(clean)
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60)
}

/** A date the aggregator gave, as ISO, or null when it is missing or nonsense (before 2000, or years away). */
export function readDate(v: unknown, now = Date.now()): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  const t = Date.parse(v)
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > now + 400 * 86_400_000) return null
  return new Date(t).toISOString()
}

/** "City, Region, Country" from whichever parts are there. */
export function placeOf(...parts: unknown[]): string | null {
  const words = parts.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean)
  const unique = words.filter((w, i) => words.findIndex((x) => x.toLowerCase() === w.toLowerCase()) === i)
  return unique.length ? unique.join(", ").slice(0, 200) : null
}

/* ── when to look again ──────────────────────────────────────────────── */

export const STOP_AFTER_DAYS = 60
const H = 3_600_000

/**
 * The next time Storelib asks about a parcel, or null to stop. Cheap on
 * purpose: only parcels still on their way are asked about, more often
 * while they are new or nearly there, less as they age, and with a webhook
 * (which tells Storelib the moment something happens) only as a check.
 */
export function nextCheckAt(input: { shippedAt: string | null; status: TrackingStatus | null; now?: number; webhooks?: boolean; failures?: number }): string | null {
  const now = input.now ?? Date.now()
  if (isFinal(input.status)) return null
  const shipped = input.shippedAt ? Date.parse(input.shippedAt) : NaN
  const age = Number.isFinite(shipped) ? now - shipped : 0
  if (age > STOP_AFTER_DAYS * 86_400_000) return null
  let wait: number
  if (input.status === "out_for_delivery" || input.status === "available_for_pickup") wait = 1 * H
  else if (age < 3 * 86_400_000) wait = 3 * H
  else if (age < 10 * 86_400_000) wait = 6 * H
  else if (age < 30 * 86_400_000) wait = 12 * H
  else wait = 24 * H
  if (input.webhooks) wait *= 2
  /* A provider that could not be read: back off further each time, up to a day. */
  const failures = Math.max(0, Math.floor(input.failures ?? 0))
  if (failures > 0) wait = Math.max(wait, Math.min(24 * H, 15 * 60_000 * 2 ** (failures - 1)))
  return new Date(now + wait).toISOString()
}

/* ── carriers, by the codes the aggregators use ──────────────────────── */

/**
 * AfterShip's courier slug for the carriers the seller picks from
 * (lib/physical/carriers.ts). Left out, AfterShip works the carrier out
 * from the number itself, which it does for over a thousand carriers.
 */
export const AFTERSHIP_SLUG: Record<string, string> = {
  USPS: "usps",
  UPS: "ups",
  FedEx: "fedex",
  "DHL Express": "dhl",
  "DHL Paket": "dhl-germany",
  "Royal Mail": "royal-mail",
  Evri: "hermes",
  Hermes: "hermes-de",
  DPD: "dpd",
  GLS: "gls",
  "Canada Post": "canada-post",
  "Australia Post": "australia-post",
  PostNL: "postnl",
  Aramex: "aramex",
  "Poste Italiane": "poste-italiane",
  "An Post": "an-post",
  Purolator: "purolator",
}

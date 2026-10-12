/**
 * Courier tracking states and their words (./model.ts says what each one
 * does). No server code here: the buyer's order page and the seller's order
 * panel import it in the browser.
 */

export type TrackingStatus =
  | "pending"
  | "not_found"
  | "info_received"
  | "in_transit"
  | "out_for_delivery"
  | "available_for_pickup"
  | "attempt_failed"
  | "exception"
  | "delivered"
  | "returned"
  | "expired"

export const TRACKING_STATUSES: TrackingStatus[] = ["pending", "not_found", "info_received", "in_transit", "out_for_delivery", "available_for_pickup", "attempt_failed", "exception", "delivered", "returned", "expired"]

export function isTrackingStatus(v: unknown): v is TrackingStatus {
  return typeof v === "string" && (TRACKING_STATUSES as string[]).includes(v)
}

export type TrackingProviderId = "aftership" | "17track"

/** One scan, as the carrier wrote it. */
export interface Checkpoint {
  at: string
  status: TrackingStatus
  message: string
  location: string | null
}

/** What the aggregator knows about one parcel. */
export interface TrackingSnapshot {
  /** The aggregator's own id for it (AfterShip's tracking id; 17TRACK uses the number). */
  ref: string | null
  number: string
  status: TrackingStatus
  /** The aggregator's finer state ("Exception_011", "Exception_Returned"), kept for support. */
  substatus: string | null
  /** The carrier the aggregator follows it with: its code and its name. */
  carrierCode: string | null
  carrierName: string | null
  /** When the carrier (or the aggregator) expects it to arrive, ISO. */
  estimatedDelivery: string | null
  checkpoints: Checkpoint[]
}

/** Buyer and seller words for each state, and a tone for the badge. */
export const TRACKING_LABEL: Record<TrackingStatus, { label: string; tone: "green" | "blue" | "amber" | "red" | "gray" }> = {
  pending: { label: "Waiting for the carrier", tone: "gray" },
  not_found: { label: "Waiting for the carrier", tone: "gray" },
  info_received: { label: "Label created", tone: "blue" },
  in_transit: { label: "In transit", tone: "blue" },
  out_for_delivery: { label: "Out for delivery", tone: "blue" },
  available_for_pickup: { label: "Ready to collect from the carrier", tone: "blue" },
  attempt_failed: { label: "Delivery attempted", tone: "amber" },
  exception: { label: "Delivery problem", tone: "red" },
  delivered: { label: "Delivered", tone: "green" },
  returned: { label: "Returned to sender", tone: "red" },
  expired: { label: "No recent updates", tone: "gray" },
}


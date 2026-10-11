import "server-only"

/**
 * The partner's two ways back (./partner-server.ts says what they do): the
 * signed link in the order email, and the signature on their webhook. Apart
 * from the orders, so the job queue that writes the email can sign the link
 * without importing what the link then does.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { ShipmentStatus } from "./types"

/* ── the signed link in the partner's email ─────────────────────────────── */

export const PARTNER_LINK_TTL_MS = 60 * 86_400_000
export const PARTNER_PAGE_PREFIX = "/checkout/physical/partner/"

export interface PartnerLink {
  /** The checkout (the order). */
  c: string
  /** The location (the partner) it was sent to. */
  l: string
  /** Expires, ms since the epoch. */
  e: number
  /** Who it was sent to (partnerLinkVersion): changing the location's email or how it forwards revokes the link. */
  v: string
}

/**
 * A short fingerprint of where the location sends its orders. In the signed
 * link and checked against the location as it is now, so a seller who
 * changes the supplier's email (a partner they stopped working with) or
 * stops forwarding by email closes every link that went to the old one.
 */
export function partnerLinkVersion(loc: { email?: string | null; forwarding?: string | null }): string {
  return createHmac("sha256", "storelib.partner-tracking.location").update(`${(loc.email ?? "").trim().toLowerCase()}|${loc.forwarding ?? ""}`).digest("base64url").slice(0, 16)
}

/** The link still points at this location as it is set up now. */
export function partnerLinkHolds(link: PartnerLink, loc: { id: string; email?: string | null; forwarding?: string | null }): boolean {
  return link.l === loc.id && link.v === partnerLinkVersion(loc)
}

function linkKey(): Buffer | null {
  const secret = process.env.ORDER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.partner-tracking.v1").digest()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A token naming one order and one partner location, or null when the server has no key. */
export function signPartnerLink(checkoutId: string, location: { id: string; email?: string | null; forwarding?: string | null }, now = Date.now()): string | null {
  const key = linkKey()
  if (!key || !UUID.test(checkoutId) || !UUID.test(location.id)) return null
  const body = Buffer.from(JSON.stringify({ c: checkoutId, l: location.id, e: now + PARTNER_LINK_TTL_MS, v: partnerLinkVersion(location) }), "utf8").toString("base64url")
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`
}

export function verifyPartnerLink(token: unknown, now = Date.now()): PartnerLink | null {
  const key = linkKey()
  if (!key || typeof token !== "string" || token.length > 600) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "base64url")
  const expected = createHmac("sha256", key).update(body).digest()
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PartnerLink
    if (!p || typeof p.e !== "number" || p.e < now || !UUID.test(String(p.c)) || !UUID.test(String(p.l)) || typeof p.v !== "string") return null
    return { c: p.c, l: p.l, e: p.e, v: p.v }
  } catch {
    return null
  }
}

/* ── the signed webhook a partner's system calls ────────────────────────── */

/** The same scheme Storelib signs its own order webhook with (./jobs-server.ts deliverWebhook), five minutes either way. */
export function webhookSignatureOk(secret: string, timestamp: string | null, signature: string | null, body: string, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  const given = signature.trim().replace(/^v1=/, "")
  if (!/^[0-9a-f]{64}$/i.test(given)) return false
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  return timingSafeEqual(Buffer.from(given.toLowerCase(), "hex"), Buffer.from(expected, "hex"))
}


/* ── what a partner may say ──────────────────────────────────────────── */

const STATUSES: ShipmentStatus[] = ["shipped", "in_transit", "out_for_delivery", "delivered", "failed"]

export function readPartnerStatus(value: unknown): ShipmentStatus | null {
  return typeof value === "string" && (STATUSES as string[]).includes(value) ? (value as ShipmentStatus) : null
}

/** The items of an order this location still has to ship, as fulfilItems takes them. */
export function openItemsAt(order: { lines: { orderId: string; requiresShipping: boolean; locationId: string | null; quantity: number; fulfilled: number }[] }, locationId: string | null): { orderId: string; quantity: number }[] {
  return order.lines
    .filter((l) => l.requiresShipping && (!locationId || l.locationId === locationId))
    .map((l) => ({ orderId: l.orderId, quantity: Math.max(0, l.quantity - l.fulfilled) }))
    .filter((i) => i.quantity > 0)
}


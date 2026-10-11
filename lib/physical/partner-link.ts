import "server-only"

/**
 * The partner's two ways back (./partner-server.ts says what they do): the
 * signed link in the order email, and the signature on their webhook. Apart
 * from the orders, so the job queue that writes the email can sign the link
 * without importing what the link then does.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

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
}

function linkKey(): Buffer | null {
  const secret = process.env.ORDER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.partner-tracking.v1").digest()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A token naming one order and one partner location, or null when the server has no key. */
export function signPartnerLink(checkoutId: string, locationId: string, now = Date.now()): string | null {
  const key = linkKey()
  if (!key || !UUID.test(checkoutId) || !UUID.test(locationId)) return null
  const body = Buffer.from(JSON.stringify({ c: checkoutId, l: locationId, e: now + PARTNER_LINK_TTL_MS }), "utf8").toString("base64url")
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
    if (!p || typeof p.e !== "number" || p.e < now || !UUID.test(String(p.c)) || !UUID.test(String(p.l))) return null
    return { c: p.c, l: p.l, e: p.e }
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


import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  PAYOUT SETUP IN THE APP'S BROWSER SHEET
 * ===========================================================================
 * In the iOS and Android apps, Stripe's embedded setup runs in the system's
 * browser sheet (SFSafariViewController on iOS, a Chrome Custom Tab on
 * Android) that slides over the app, on Storelib's page /payouts-sheet.
 * Inside the app's own web view Stripe's form opens windows of its own that
 * iOS hands to Safari, which took the creator out of the app. The sheet is a
 * real browser, so those windows stay in it.
 *
 * That sheet has no copy of the app's sign in. So the signed-in app asks the
 * server for a link, the server checks who is asking, and signs a token that
 * names one creator and one form for thirty minutes:
 *
 *     <payload, base64url JSON>.<HMAC-SHA256 of it, hex>
 *
 * The token rides in the address's #fragment, which a browser never sends to
 * a server or in a Referer. It only ever opens an Account Session for that
 * creator's own Stripe account (POST /api/payouts-sheet), the same session
 * the signed-in page gets from /api/payments/component.
 */

export const SHEET_TTL_MS = 30 * 60_000

export type SheetForm = "setup" | "bank"

export interface SheetLink {
  /** creators.id */
  c: string
  /** creators.user_id */
  u: string
  f: SheetForm
  e: number
}

function signingKey(): Buffer | null {
  const secret = process.env.ORDER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.payouts-sheet.v1").digest()
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("hex")
}

export function signSheetLink(payload: Omit<SheetLink, "e">, now = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const body = Buffer.from(JSON.stringify({ ...payload, e: now + SHEET_TTL_MS }), "utf8").toString("base64url")
  return `${body}.${sign(key, body)}`
}

export function verifySheetLink(token: unknown, now = Date.now()): SheetLink | null {
  const key = signingKey()
  if (!key || typeof token !== "string" || token.length > 4096) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "hex")
  const expected = Buffer.from(sign(key, body), "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: SheetLink
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || typeof payload.e !== "number" || payload.e < now) return null
  if (typeof payload.c !== "string" || !payload.c || typeof payload.u !== "string" || !payload.u) return null
  if (payload.f !== "setup" && payload.f !== "bank") return null
  return payload
}

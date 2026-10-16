import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  A LINK TO ONE FILE, FOR A BROWSER THAT IS NOT SIGNED IN
 * ===========================================================================
 * The phone app saves an invoice or an export by opening it in the system
 * browser sheet (lib/platform/save-file.ts), and that browser does not have
 * the app's session cookie. So the signed-in page asks the server for a link,
 * the server checks who is asking and that the order is theirs, and signs a
 * link that names exactly one file, for one creator, for five minutes.
 *
 *     <payload, base64url JSON>.<HMAC-SHA256 of it, hex>
 *
 * The key is ORDER_LINK_SECRET when it is set and otherwise one derived from
 * the Supabase service role key, the same fallback lib/admin-session.ts uses:
 * already server-only, already configured. Derived rather than used as is,
 * so a signature made here is useless anywhere else that key signs.
 *
 * The route that serves the file checks ownership again from the creator id
 * in the payload. The signature says who asked; it does not replace the check.
 */

export const LINK_TTL_MS = 5 * 60_000

export type OrderLink =
  | { k: "invoice"; c: string; o: string; z: string; d: "inline" | "attachment"; e: number }
  /* Orders by number (`n`), or a list as the Orders page draws it: its address (`q`) and the instants of its dates (`ws`, `we`; none for every order). */
  | { k: "csv"; c: string; n: string; q?: string; ws?: number; we?: number; f: "spreadsheet" | "plain"; z: string; name: string; d: "inline" | "attachment"; e: number }

/** A link before it is dated: every field but the expiry, per kind. */
export type OrderLinkRequest = OrderLink extends infer T ? (T extends unknown ? Omit<T, "e"> : never) : never

function signingKey(): Buffer | null {
  const secret = process.env.ORDER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.order-link.v1").digest()
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("hex")
}

/** A token for this payload, valid for LINK_TTL_MS from `now`. Null when there is no key. */
export function signOrderLink(payload: OrderLinkRequest, now = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const body = Buffer.from(JSON.stringify({ ...payload, e: now + LINK_TTL_MS }), "utf8").toString("base64url")
  return `${body}.${sign(key, body)}`
}

/** The payload, when this server signed the token and it has not expired. */
export function verifyOrderLink(token: string | null | undefined, now = Date.now()): OrderLink | null {
  const key = signingKey()
  if (!key || typeof token !== "string" || token.length > 8192) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "hex")
  const expected = Buffer.from(sign(key, body), "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: OrderLink
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || typeof payload.e !== "number" || payload.e < now) return null
  if (typeof payload.c !== "string" || !payload.c) return null
  if (payload.k !== "invoice" && payload.k !== "csv") return null
  return payload
}

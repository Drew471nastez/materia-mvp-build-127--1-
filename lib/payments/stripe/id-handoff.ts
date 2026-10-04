import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  VERIFY ID ON YOUR PHONE, FROM A COMPUTER
 * ===========================================================================
 * Setup on a computer shows a QR code at the Verify ID step, because the ID
 * camera is a phone thing. The phone that scans it is usually not signed in,
 * so the link carries a token that says exactly one thing: this creator may
 * add the photos of their ID, for thirty minutes. It cannot read anything
 * about the account, change the details or the bank, or be used for another
 * creator, and the routes that take it re-check the creator from the token.
 *
 *     <payload, base64url JSON>.<HMAC-SHA256 of it, hex>
 *
 * The key is ID_HANDOFF_SECRET when it is set and otherwise one derived from
 * the Supabase service role key (as lib/orders/signed-link.ts does), with its
 * own label so a signature made here is useless anywhere else.
 */

export const HANDOFF_TTL_MS = 30 * 60_000

interface HandoffPayload {
  k: "id"
  c: string
  e: number
}

function signingKey(): Buffer | null {
  const secret = process.env.ID_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.id-handoff.v1").digest()
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("hex")
}

/** A token that lets one creator add their ID photos from another device. Null when there is no key. */
export function signIdHandoff(creatorId: string, now = Date.now()): string | null {
  const key = signingKey()
  if (!key || !creatorId) return null
  const body = Buffer.from(JSON.stringify({ k: "id", c: creatorId, e: now + HANDOFF_TTL_MS } satisfies HandoffPayload), "utf8").toString("base64url")
  return `${body}.${sign(key, body)}`
}

/** The creator the token was made for, when this server signed it and it has not expired. */
export function verifyIdHandoff(token: string | null | undefined, now = Date.now()): string | null {
  const key = signingKey()
  if (!key || typeof token !== "string" || token.length > 1024) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "hex")
  const expected = Buffer.from(sign(key, body), "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: HandoffPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || payload.k !== "id" || typeof payload.e !== "number" || payload.e < now) return null
  if (typeof payload.c !== "string" || !payload.c) return null
  return payload.c
}

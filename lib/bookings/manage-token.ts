import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"

/*
  THE VISITOR'S LINK TO MOVE OR CANCEL A BOOKING (round AR).

  The confirmation email carries /booking/<token>. The token is the
  booking id and an HMAC of it (SHA-256, a key derived from
  COMMERCE_SECRETS_KEY or else the service role key, never sent to a
  browser), so a link cannot be made for another booking by changing the
  id, and nothing has to be stored. The same link keeps working after a
  move (the id does not change); after a cancel the page says it is
  cancelled. The signature covers its own purpose, so a booking payment
  token (lib/forms/booking-payment.ts) is never taken for one.
*/

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

function key(env: Record<string, string | undefined> = process.env): Buffer {
  const own = env.COMMERCE_SECRETS_KEY
  const base = own || env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign booking links with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-booking-manage"), Buffer.from(own ? "own" : "service"), 32))
}

const sig = (bookingId: string) => createHmac("sha256", key()).update(`booking-manage:v1:${bookingId.toLowerCase()}`).digest("base64url").slice(0, 27)

export function bookingManageToken(bookingId: string): string {
  if (!UUID.test(bookingId)) throw new Error("Not a booking id.")
  return `${bookingId.toLowerCase()}.${sig(bookingId)}`
}

/** The booking id when the token is one this server signed, else null. */
export function readManageToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 80) return null
  const m = /^([\da-f-]{36})\.([A-Za-z0-9_-]{27})$/.exec(token)
  if (!m || !UUID.test(m[1])) return null
  const want = Buffer.from(sig(m[1]))
  const got = Buffer.from(m[2])
  return want.length === got.length && timingSafeEqual(want, got) ? m[1].toLowerCase() : null
}

export function bookingManagePath(bookingId: string): string {
  return `/booking/${bookingManageToken(bookingId)}`
}

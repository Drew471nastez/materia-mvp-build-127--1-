import crypto from "crypto"

/**
 * A signed voucher for "this buyer may pay this amount for this product".
 *
 * Minted by the checkout page after it has verified an accepted offer against
 * the database, and verified again by the payment endpoint before it sets the
 * charge amount. The token exists so the endpoint does not have to repeat the
 * conversation lookups — but the price NEVER travels as a bare client field.
 * customPriceCents taught the shape of that mistake: any amount the client
 * asserts about itself is an amount an attacker can assert too. This one is
 * unforgeable without the server secret.
 *
 * Server-only — imports crypto and reads a service secret. Never ship to the
 * client bundle.
 */

const EXP_MS = 1000 * 60 * 30 // long enough to type a card number, no longer

function secret(): string {
  // Server-side secrets, in order of preference. Both are already required by
  // the app, so no new configuration.
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STRIPE_SECRET_KEY
  if (!s) throw new Error("offer-token: no server secret available")
  return s
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function mintOfferToken(input: { productId: string; buyerId: string; cents: number; offerId: string }): string {
  const payload = `${input.productId}.${input.buyerId}.${input.cents}.${input.offerId}.${Date.now() + EXP_MS}`
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`
}

export function verifyOfferToken(
  token: string | null | undefined,
  expect: { productId: string; buyerId: string | null },
): { cents: number; offerId: string } | null {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  let payload: string
  try {
    payload = Buffer.from(token.slice(0, dot), "base64url").toString()
  } catch {
    return null
  }
  const mac = token.slice(dot + 1)
  const expected = sign(payload)
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null

  const [productId, buyerId, centsRaw, offerId, expRaw] = payload.split(".")
  const cents = Number(centsRaw)
  const exp = Number(expRaw)
  if (!productId || !buyerId || !offerId || !Number.isFinite(cents) || cents <= 0) return null
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  if (productId !== expect.productId) return null
  // The voucher is personal: it only spends as the buyer it was minted for.
  if (!expect.buyerId || buyerId !== expect.buyerId) return null
  return { cents, offerId }
}

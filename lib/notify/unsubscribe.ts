/**
 * ===========================================================================
 *  A SIGNED LINK THAT TURNS ONE KIND OF EMAIL OFF, AND ONLY THAT
 * ===========================================================================
 * Optional and marketing email from the notification engine carries a link
 * (and the List-Unsubscribe header) made here. The token names the person
 * and one preference category, and is signed with a server key, so it can
 * only ever do one thing: set that category's email to off (or back on,
 * from the page it opens). No email address is in it, and the page never
 * shows one.
 *
 *   token   base64url("<userId>.<category>.<issuedAt>") + "." + base64url(HMAC-SHA256)
 *   key     NOTIFY_UNSUBSCRIBE_SECRET, falling back to EMAIL_LINK_SECRET,
 *           derived with a label of its own so a campaign link signature
 *           (lib/email-campaigns/link-sign.ts) can never pass for one of these
 *
 * Only the optional categories can be signed (UNSUBSCRIBABLE in
 * preference-view.ts): security, account, payouts and payments are always
 * sent, and a token naming one is refused whoever signed it.
 *
 * A link does not expire. People unsubscribe from mail that is months old,
 * and a link that stopped working would leave them the spam button.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { isUnsubscribable } from "./preference-view"
import { baseUrl, preferencesUrl } from "./urls"
import type { PreferenceCategory } from "./types"

const LABEL = "storelib.notify-unsubscribe.v1"
const USER_ID = /^[A-Za-z0-9-]{1,64}$/

function secret(): string {
  return process.env.NOTIFY_UNSUBSCRIBE_SECRET || process.env.EMAIL_LINK_SECRET || ""
}

function keyFrom(raw: string): Buffer | null {
  if (raw.length < 16) return null
  return createHmac("sha256", raw).update(LABEL).digest()
}

function mac(key: Buffer, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest()
}

/** Signs with a given secret. Exported for the tests; the app uses signUnsubscribe. */
export function signWith(rawSecret: string, userId: string, category: PreferenceCategory, issuedAt = Math.floor(Date.now() / 1000)): string {
  const key = keyFrom(rawSecret)
  if (!key) throw new Error("No unsubscribe key is configured")
  if (!USER_ID.test(userId)) throw new Error("Not a user id")
  if (!isUnsubscribable(category)) throw new Error("That category is always sent")
  const payload = `${userId}.${category}.${issuedAt}`
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${mac(key, payload).toString("base64url")}`
}

export function verifyWith(rawSecret: string, token: unknown): { userId: string; category: PreferenceCategory; issuedAt: number } | null {
  const key = keyFrom(rawSecret)
  if (!key || typeof token !== "string" || token.length > 400) return null
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  let payload: string
  let sig: Buffer
  try {
    payload = Buffer.from(parts[0], "base64url").toString("utf8")
    sig = Buffer.from(parts[1], "base64url")
  } catch {
    return null
  }
  const expected = mac(key, payload)
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  const [userId, category, issued, extra] = payload.split(".")
  if (extra !== undefined || !USER_ID.test(userId ?? "") || !isUnsubscribable(category)) return null
  const issuedAt = Number(issued)
  /* A token from the future was not made here. */
  if (!Number.isInteger(issuedAt) || issuedAt <= 0 || issuedAt > Date.now() / 1000 + 86_400) return null
  return { userId, category, issuedAt }
}

export function signUnsubscribe(userId: string, category: PreferenceCategory): string {
  return signWith(secret(), userId, category)
}

export function verifyUnsubscribe(token: unknown): { userId: string; category: PreferenceCategory } | null {
  const ok = verifyWith(secret(), token)
  return ok ? { userId: ok.userId, category: ok.category } : null
}

/** Where every notification setting is (urls.ts), for the email footer and the page. */
export { preferencesUrl }

/**
 * The link for an email's footer and List-Unsubscribe header. Without a key
 * (a preview, a missing variable) it is the settings page instead, so the
 * email still has a working way out and is never held back for it.
 */
export function unsubscribeUrl(userId: string, category: PreferenceCategory): string {
  try {
    return `${baseUrl()}/api/notify/unsubscribe?token=${encodeURIComponent(signUnsubscribe(userId, category))}`
  } catch {
    return preferencesUrl()
  }
}

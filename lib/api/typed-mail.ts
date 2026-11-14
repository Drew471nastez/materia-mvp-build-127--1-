import "server-only"

import { addressSubject, emailSubject, rateLimit, type RateLimitOptions, type RateWindow } from "@/lib/api/rate-limit"

/**
 * ===========================================================================
 *  MAIL TO AN ADDRESS SOMEBODY TYPED (round AY)
 * ===========================================================================
 * A booking confirmation, a download link, a welcome email: each goes to an
 * address a visitor typed into a public form, and nothing proves it is
 * theirs. So anyone could type somebody else's address over and over and
 * have Storelib mail them, from many stores and from many networks. The
 * route limits that already existed count per form or per hour; these count
 * the RECIPIENT across every store and every route, and the network the
 * requests come from, over a day as well.
 *
 * Set far above what a person does: nobody books, downloads or joins lists
 * more than a few times an hour. Counted in Postgres every time (never
 * memoryFirst: tests/public-delivery.test.ts keeps mail off that list), and
 * like every limit it fails open when the table cannot be read.
 *
 * When refused, the thing the visitor did is still kept (the booking, the
 * signup); only the mail to the typed address is held back.
 */
export const TYPED_MAIL_LIMITS: { recipient: readonly RateWindow[]; address: readonly RateWindow[] } = {
  recipient: [
    { limit: 10, seconds: 3600 },
    { limit: 30, seconds: 86_400 },
  ],
  /* A venue's or an office's wifi is one address for many real people. */
  address: [
    { limit: 60, seconds: 3600 },
    { limit: 300, seconds: 86_400 },
  ],
}

export type Limiter = (options: RateLimitOptions) => Promise<{ status: number } | null>

/**
 * True when Storelib may mail `email` now. `request` is the visitor's own
 * request, or null where only the recipient can be counted (a mail sent
 * later, away from the request).
 */
export async function typedMailAllowed(request: Request | null, email: unknown, limiter: Limiter = rateLimit): Promise<boolean> {
  const recipient = emailSubject(email)
  if (!recipient) return false
  if (await limiter({ bucket: "typed-mail-recipient", subjects: [recipient], windows: TYPED_MAIL_LIMITS.recipient })) return false
  const address = request ? addressSubject(request) : null
  if (address && (await limiter({ bucket: "typed-mail-address", subjects: [address], windows: TYPED_MAIL_LIMITS.address }))) return false
  return true
}

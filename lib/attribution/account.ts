/**
 * ===========================================================================
 *  A STORELIB ACCOUNT, AND WHERE ITS VISIT CAME FROM
 * ===========================================================================
 * Pure, so the suite drives it. app/api/auth/signup-attribution calls it for
 * a new account with what the page sent (lib/attribution/signup-browser),
 * and writes the row it gives once (part 346, account_attribution).
 *
 * UNTRUSTED UNTIL CHECKED, as every touch is (docs/analytics/attribution.md):
 * decodeTouches keeps only known fields within their limits and works the
 * source and the AI assistant out again from them. A touch must have landed
 * on storelib.com itself: a creator's subdomain or own domain is that
 * creator's visitor, not Storelib's, and anything else is made up. Without
 * a touch that survives, the account still gets its row, with no source.
 *
 * NEW ACCOUNTS ONLY. The account must have been made within the window
 * lib/auth/arrival uses to say "Account created", so a person signing in
 * to an old account cannot give it a source after the fact.
 */
import { NEW_ACCOUNT_WINDOW_MS } from "@/lib/auth/arrival"

import { decodeTouches, storedTouch, type Touch, type Touches } from "./touch"

export interface AccountAttributionRow {
  user_id: string
  first_touch: Record<string, string> | null
  last_touch: Record<string, string> | null
  first_ai_source: string | null
  last_ai_source: string | null
  signed_up_at: string | null
}

/** Whether an account made at `createdAt` is new enough to be given its sign up source now. */
export function isNewAccount(createdAt: string | null | undefined, now = Date.now()): boolean {
  const made = createdAt ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(made)) return false
  const age = now - made
  return age >= -60_000 && age <= NEW_ACCOUNT_WINDOW_MS
}

function onStorelib(t: Touch | null, mainDomain: string): Touch | null {
  if (!t) return null
  const main = mainDomain.toLowerCase().replace(/^www\./, "").split(":")[0]
  const landed = (t.landing_host ?? "").toLowerCase()
  const local = landed === "localhost" || landed === "127.0.0.1"
  return landed === main || local ? t : null
}

/** storelib.com's touches from what a page sent, or null. */
export function platformTouchesFrom(sent: unknown, mainDomain: string, now = Date.now()): Touches | null {
  const t = decodeTouches(sent, now)
  if (!t) return null
  const first = onStorelib(t.first, mainDomain)
  const last = onStorelib(t.last, mainDomain)
  if (!first && !last) return null
  return { first: first ?? last, last: last ?? first }
}

export function accountAttributionRow(user: { id: string; created_at?: string | null }, touches: Touches | null): AccountAttributionRow {
  return {
    user_id: user.id,
    first_touch: storedTouch(touches?.first),
    last_touch: storedTouch(touches?.last),
    first_ai_source: touches?.first?.ai_source ?? null,
    last_ai_source: touches?.last?.ai_source ?? null,
    signed_up_at: user.created_at ?? null,
  }
}

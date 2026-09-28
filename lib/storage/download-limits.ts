import "server-only"

/**
 * ===========================================================================
 *  HOW OFTEN ONE PERSON, AND ONE PURCHASE, MAY ASK FOR FILES
 * ===========================================================================
 * The download routes counted two things: the address a request came from,
 * and, for a link from an email, the token in it. Neither is the buyer. An
 * address is shared by everyone behind one router and changes when a phone
 * moves between wifi and mobile, so counting it alone lets one signed in
 * account pull every file it can reach from a handful of addresses, and
 * lets a leaked receipt link be worked at from a new address each time.
 *
 * So there are three counts now, and every one of them has to pass:
 *
 *   the address       as before, against a stranger hammering the route;
 *   the person        per signed in account, whatever address they are on;
 *   the purchase      per order or entitlement, so one receipt link is
 *                     bounded however many people were sent it.
 *
 * THE NUMBERS ARE SET AGAINST WHAT A REAL BUYER DOES. An order can hold
 * several products and a product up to its plan's file count; a buyer opens
 * their library, downloads the lot, finds a file did not finish on the train,
 * starts again, and does the same on a laptop that evening. That is tens of
 * requests in a few minutes from two addresses, and might reasonably be a
 * hundred over an hour for a large sample pack. Every limit below is well
 * past that and well under what makes taking somebody's receipt link worth
 * the trouble.
 *
 * A guest with a receipt link has no account, so the person count simply
 * does not apply to them and the other two do: their downloads keep working
 * exactly as before.
 *
 * Fails open, like every other limit here (lib/api/rate-limit.ts): a limit
 * that cannot reach its table must not take everybody's downloads with it.
 */
import type { NextResponse } from "next/server"

import { addressSubject, callerAddress, rateLimit, type RateWindow } from "@/lib/api/rate-limit"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { createAdminClient } from "@/lib/supabase/admin"

/** One address. A household, an office, a phone on mobile data. */
export const DOWNLOAD_IP_WINDOWS: readonly RateWindow[] = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 3600 },
]

/**
 * One signed in person, across every address they use. Three times the
 * address allowance, because the phone and the laptop are the same buyer and
 * they should never meet this by using both.
 */
export const DOWNLOAD_USER_WINDOWS: readonly RateWindow[] = [
  { limit: 90, seconds: 60 },
  { limit: 900, seconds: 3600 },
]

/**
 * One order, or one entitlement. A buyer re-downloading everything they
 * bought, twice over, on two devices, is well inside two hundred in ten
 * minutes; a link passed around a forum is not.
 */
export const DOWNLOAD_PURCHASE_WINDOWS: readonly RateWindow[] = [
  { limit: 200, seconds: 600 },
  { limit: 1000, seconds: 86_400 },
]

/** The words. Never "rate limited", which tells a buyer nothing. */
export const DOWNLOAD_TOO_MANY = "That is a lot of downloads at once. Wait a minute and try again."

/**
 * The address and, when somebody is signed in, the person. Runs before
 * anything is read, so it costs one count and no queries.
 */
export async function downloadRateLimit(
  request: Request,
  who: { userId?: string | null; assetId?: string | null },
): Promise<NextResponse | null> {
  const limited = await rateLimit({
    bucket: "download",
    subjects: [addressSubject(request), who.userId ? `user:${who.userId}` : null],
    windows: who.userId ? [...DOWNLOAD_IP_WINDOWS, ...DOWNLOAD_USER_WINDOWS] : DOWNLOAD_IP_WINDOWS,
    message: DOWNLOAD_TOO_MANY,
  })
  if (limited) logDownloadLimit({ code: who.userId ? "download_person" : "download_address", userId: who.userId, assetId: who.assetId, ip: callerAddress(request) })
  return limited
}

/**
 * The purchase this download is being made against, once it is known. Called
 * after access has been decided and before anything is signed, so a refusal
 * hands out nothing.
 */
export async function purchaseRateLimit(
  request: Request,
  what: { orderId?: string | null; entitlementId?: string | null; token?: string | null; userId?: string | null; assetId?: string | null },
): Promise<NextResponse | null> {
  const subjects = [
    what.orderId ? `order:${what.orderId}` : null,
    what.entitlementId ? `entitlement:${what.entitlementId}` : null,
    what.token ? `token:${what.token}` : null,
  ]
  if (subjects.every((s) => s === null)) return null
  const limited = await rateLimit({
    bucket: "download",
    subjects,
    windows: DOWNLOAD_PURCHASE_WINDOWS,
    message: DOWNLOAD_TOO_MANY,
  })
  if (limited) logDownloadLimit({ code: "download_purchase", userId: what.userId, assetId: what.assetId, ip: callerAddress(request) })
  return limited
}

/** A refusal in the security log, without holding up the answer. */
export function logDownloadLimit(where: { code: string; userId?: string | null; assetId?: string | null; ip?: string | null }): void {
  runAfterResponse(async () => {
    await logSecurityEvent(createAdminClient(), {
      event: "rate_limit",
      outcome: "limited",
      code: where.code,
      userId: where.userId ?? null,
      assetId: where.assetId ?? null,
      ip: where.ip ?? null,
    })
  })
}

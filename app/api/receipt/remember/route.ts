import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { guestAccessFromCookieHeader, guestAccessSetCookies, requestIsHttps, samePath } from "@/lib/receipts/guest-access"
import { rememberReceipt } from "@/lib/receipts/guest-access-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/receipt/remember   { receiptToken }
 *
 * The receipt page asks this once it is open, so the browser that paid (or
 * the one the emailed receipt link was opened on) keeps the purchase: the
 * product page then says it is owned and offers the files, with no account
 * and no link to keep (lib/receipts/guest-access.ts says how).
 *
 * The token is the proof, exactly as on the receipt page: the order it names
 * and the other lines of the same payment to the same address are written
 * into the httpOnly `sl_owned` cookie of THIS host, each grant signed with
 * the order's own token (lib/receipts/guest-access-server rememberReceipt).
 * Only lines that still deliver are remembered, and grants that no longer
 * hold (a refund since) are dropped while it is here. Nothing about the
 * order is answered back.
 *
 * GET /api/receipt/remember?receipt=<token>&next=/path
 *
 * The same, on the way back to a creator's website after paying on
 * storelib.com (app/api/checkout/cart/complete): the cookie is written on
 * the website's own host, then the browser goes on to `next`, a path on this
 * same host and nothing else.
 */
const NO_STORE = { "Cache-Control": "no-store" }

const LIMIT = { bucket: "receipt-remember", windows: [{ limit: 40, seconds: 600 }, { limit: 300, seconds: 86400 }] }

async function remembered(request: Request, receiptToken: string): Promise<string[] | null> {
  const raw = guestAccessFromCookieHeader(request.headers.get("cookie"))
  const next = await rememberReceipt(createAdminClient(), receiptToken, raw)
  if (!next) return null
  if (!next.value && !raw) return []
  return guestAccessSetCookies(next.value, requestIsHttps(request))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const receiptToken: unknown = body?.receiptToken
  if (!isPlausibleToken(receiptToken)) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })

  /* A receipt is opened a few times; a script walking tokens is not. Generous, and per address only (a token is ~190 bits, guessing is not the threat). */
  const limited = await rateLimit({ ...LIMIT, subjects: [addressSubject(request)] })
  if (limited) return limited

  const cookies = await remembered(request, receiptToken)
  if (!cookies) return NextResponse.json({ ok: false }, { headers: NO_STORE })
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE })
  for (const c of cookies) res.headers.append("Set-Cookie", c)
  return res
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  /* A relative Location: the host the browser asked, whatever the request looks like behind the proxy. */
  const res = new NextResponse(null, { status: 303, headers: { Location: samePath(url.searchParams.get("next")), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
  const receiptToken = url.searchParams.get("receipt")
  if (!isPlausibleToken(receiptToken)) return res
  const limited = await rateLimit({ ...LIMIT, subjects: [addressSubject(request)] })
  if (limited) return res
  for (const c of (await remembered(request, receiptToken)) ?? []) res.headers.append("Set-Cookie", c)
  return res
}

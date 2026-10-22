import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { canDeliver, isPlausibleToken } from "@/lib/receipts/rules"
import { GUEST_ACCESS_COOKIE, guestAccessCookieOptions, guestAccessFromCookieHeader, guestAccessKey, mergeGrants, readGrants, requestIsHttps, signGrant, writeGrants, type Grant } from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"

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
 * the order's own token. Only lines that still deliver are remembered, and
 * grants that no longer hold (a refund since) are dropped while it is here.
 * Nothing about the order is answered back.
 */
const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const receiptToken: unknown = body?.receiptToken
  if (!isPlausibleToken(receiptToken)) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })

  /* A receipt is opened a few times; a script walking tokens is not. Generous, and per address only (a token is ~190 bits, guessing is not the threat). */
  const limited = await rateLimit({ bucket: "receipt-remember", subjects: [addressSubject(request)], windows: [{ limit: 40, seconds: 600 }, { limit: 300, seconds: 86400 }] })
  if (limited) return limited

  const key = guestAccessKey()
  if (!key) return NextResponse.json({ ok: false }, { headers: NO_STORE })

  const admin = createAdminClient()
  const { data: order } = await admin.from("orders").select("*").eq("receipt_token", receiptToken).maybeSingle()
  if (!order) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })

  /* The whole payment: a basket's lines are rows of their own with tokens of their own (the same rule as the receipt loader). */
  let lines: any[] = [order]
  if (order.stripe_session_id && order.buyer_email) {
    const email = String(order.buyer_email).trim().toLowerCase()
    const { data: siblings } = await admin.from("orders").select("*").eq("stripe_session_id", order.stripe_session_id)
    lines = [order, ...((siblings ?? []) as any[]).filter((r) => r.id !== order.id && String(r.buyer_email ?? "").trim().toLowerCase() === email)]
  }

  const added: Grant[] = []
  for (const line of lines) {
    if (!canDeliver(line) || !isPlausibleToken(line.receipt_token)) continue
    const g = signGrant(key, { id: String(line.id), receiptToken: line.receipt_token })
    if (g) added.push(g)
  }

  const raw = guestAccessFromCookieHeader(request.headers.get("cookie"))
  /* What the cookie held before, less whatever no longer holds (a refund, an order gone). */
  const held = await heldGrants(admin, raw, { key })
  const kept = readGrants(raw).filter((g) => !held.stale.includes(g.orderId))
  const next = mergeGrants(kept, added)

  const res = NextResponse.json({ ok: true, remembered: added.length }, { headers: NO_STORE })
  if (next.length > 0) res.cookies.set(GUEST_ACCESS_COOKIE, writeGrants(next), guestAccessCookieOptions(requestIsHttps(request)))
  else if (raw) res.cookies.set(GUEST_ACCESS_COOKIE, "", { ...guestAccessCookieOptions(requestIsHttps(request)), maxAge: 0 })
  return res
}

/**
 * POST /api/payouts-sheet { token }
 *
 * A fresh Account Session for the creator a signed sheet link names
 * (lib/payments/stripe/app-sheet-link.ts), for Stripe's form on
 * /payouts-sheet in the apps' browser sheet. The form is the one the token
 * names: setup, or only the bank. The creator row is read again, so a link
 * for an account that has since gone opens nothing.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { verifySheetLink } from "@/lib/payments/stripe/app-sheet-link"
import { componentAuth, describe, PaymentsProblem } from "@/lib/payments/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }
const EXPIRED = "This link has run out. Close it and tap Set up payouts again."

export async function POST(request: NextRequest) {
  const body = ((await request.json().catch(() => null)) ?? {}) as { token?: unknown }
  const link = verifySheetLink(body.token)
  if (!link) return NextResponse.json({ error: EXPIRED }, { status: 401, headers: NO_STORE })
  const { data } = await createAdminClient().from("creators").select("id, user_id").eq("id", link.c).maybeSingle()
  const row = data as { id: string; user_id: string } | null
  if (!row || row.user_id !== link.u) return NextResponse.json({ error: EXPIRED }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({
    bucket: "payments-read",
    subjects: [row.id],
    windows: LIMITS.paymentsRead,
    message: "That is a lot of requests in a short time. Wait a few minutes and try again.",
  })
  if (limited) return limited
  try {
    const auth = await componentAuth({ id: row.id, userId: row.user_id, email: null }, link.f === "bank" ? "stripe_management" : "stripe_onboarding")
    if (!("clientSecret" in auth)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ clientSecret: auth.clientSecret, publishableKey: auth.publishableKey, form: link.f }, { headers: NO_STORE })
  } catch (e) {
    if (e instanceof PaymentsProblem) return NextResponse.json({ error: e.userMessage }, { status: e.status, headers: NO_STORE })
    console.error("[payouts sheet]", describe(e))
    return NextResponse.json({ error: "Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
}

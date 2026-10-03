import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { disconnectStripeAccount } from "@/lib/payments/stripe/connect"
import { PaymentsProblem } from "@/lib/payments/errors"

/**
 * The older disconnect, used by two older settings screens. It cleared the
 * connection outright, an active one included, with no confirmation and no
 * check for money still in the account, and repeated Stripe's error text to
 * the browser. It is the one safe disconnect now (disconnectStripeAccount in
 * lib/payments/stripe/connect.ts): an account that was ever started is let go
 * only with `{ "confirm": true }` and never while it holds a balance, an
 * account with history is never deleted, and orders are never touched.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to change your payments." }, { status: 401 })

  const { data: creator } = await createAdminClient().from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator profile not found." }, { status: 404 })

  const body = ((await request.json().catch(() => null)) ?? {}) as { confirm?: unknown }
  try {
    await disconnectStripeAccount(creator.id, { confirmed: body.confirm === true })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PaymentsProblem) return NextResponse.json({ error: error.userMessage }, { status: error.status })
    console.error("[stripe connect disconnect]", error instanceof Error ? error.message.slice(0, 160) : "unknown")
    return NextResponse.json({ error: "We couldn't disconnect just now. Nothing was changed. Try again in a moment." }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { statementDescriptorSuffix } from "@/lib/payments/platform-descriptor"
import { pushStatementName } from "@/lib/payments/stripe/descriptor"

/**
 * The name on buyers' bank statements, from Settings > Payments: kept on
 * the creator row (what checkout reads) and written to the creator's own
 * Stripe account (what a statement shows for a sale made on their behalf,
 * lib/payments/platform-descriptor). Answers whether Stripe took it.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { descriptor?: unknown }
  const descriptor = statementDescriptorSuffix(typeof body.descriptor === "string" ? body.descriptor : "")
  if (descriptor.length < 2 || !/[A-Z]/.test(descriptor)) {
    return NextResponse.json({ error: "Use at least two letters or numbers, with one letter." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id, stripe_account_id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })

  const { error } = await admin.from("creators").update({ statement_descriptor: descriptor }).eq("id", creator.id)
  if (error) return NextResponse.json({ error: "The name was not saved. Try again." }, { status: 500 })

  const stripe = await pushStatementName((creator as { stripe_account_id?: string | null }).stripe_account_id, descriptor)
  return NextResponse.json({ descriptor, stripe })
}

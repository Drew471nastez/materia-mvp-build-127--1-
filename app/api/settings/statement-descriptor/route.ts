import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { statementDescriptorSuffix } from "@/lib/payments/platform-descriptor"
import { pushStatementName } from "@/lib/payments/stripe/descriptor"
import { followsStoreName, sellerStatementName } from "@/lib/payments/statement-name-server"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"

/**
 * The name on buyers' bank statements, from Settings > Payments. Empty means
 * "use my store's name" (lib/payments/statement-name-server), which follows
 * a rename in Store details. Kept on the creator row (what checkout reads)
 * and written to the creator's own Stripe account (what a statement shows
 * for a sale made on their behalf). Answers whether Stripe took it.
 */
/* Round rel2-auth: the change asks Supabase Auth itself (`fresh`, Stripe settings are on the strict list), the read takes the request's one read; either way a refusal says 503 Try again when Auth did not answer (signedOutOrRetry). */
async function owner({ fresh = false }: { fresh?: boolean } = {}) {
  const who = await routeUser({ fresh })
  const user = who.kind === "user" ? who.user : null
  if (!user) return null
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id, stripe_account_id, statement_descriptor, display_name, slug").eq("user_id", user.id).maybeSingle()
  return creator ? { admin, creator: creator as Record<string, string | null> & { id: string } } : null
}

export async function GET() {
  const o = await owner()
  if (!o) return signedOutOrRetry(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
  const { data: store } = await o.admin.from("store_settings").select("store_name").eq("creator_id", o.creator.id).maybeSingle()
  const storeName = statementDescriptorSuffix((store as { store_name?: string | null } | null)?.store_name)
  const follows = followsStoreName({ custom: o.creator.statement_descriptor, storeName, displayName: o.creator.display_name, slug: o.creator.slug })
  return NextResponse.json({
    custom: follows ? "" : statementDescriptorSuffix(o.creator.statement_descriptor),
    storeName,
    name: await sellerStatementName(o.admin, o.creator.id),
  })
}

export async function POST(request: Request) {
  const o = await owner({ fresh: true })
  if (!o) return signedOutOrRetry(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), { fresh: true })

  const body = (await request.json().catch(() => ({}))) as { descriptor?: unknown }
  const descriptor = statementDescriptorSuffix(typeof body.descriptor === "string" ? body.descriptor : "")
  /* Empty: back to the store's name. */
  if (descriptor && (descriptor.length < 2 || !/[A-Z]/.test(descriptor))) {
    return NextResponse.json({ error: "Use at least two letters or numbers, with one letter." }, { status: 400 })
  }

  const { error } = await o.admin.from("creators").update({ statement_descriptor: descriptor || null }).eq("id", o.creator.id)
  if (error) return NextResponse.json({ error: "The name was not saved. Try again." }, { status: 500 })

  const name = await sellerStatementName(o.admin, o.creator.id)
  const stripe = await pushStatementName(o.creator.stripe_account_id, name)
  return NextResponse.json({ descriptor, name, stripe })
}

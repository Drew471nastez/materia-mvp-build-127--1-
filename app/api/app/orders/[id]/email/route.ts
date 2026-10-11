import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { storeIdFor } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanEmail, ownedOrderLines } from "@/lib/orders/owned"
import { recordOrderEvent, sendAccessEmails } from "@/lib/orders/notify"

export const runtime = "nodejs"

/**
 * POST /api/app/orders/:id/email   { email }
 *
 * The creator corrects the buyer's address, usually because the buyer wrote
 * and said they mistyped it. Every row of the order takes the new address
 * (the invoice, a refund's email and the export all read it from there),
 * and the access email goes to it straight away, so the buyer who could not
 * find their download has it.
 *
 * Only the creator of the order's products can do this. The buyer's own
 * one-time change, from the receipt page, is app/api/receipt/update-email and
 * is untouched; this is recorded under its own name so it does not use up
 * the buyer's one change.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  /* The store's, for its owner or a team member whose role has orders (lib/team). */
  const store = await storeIdFor("orders")
  if (store.ok === false) return NextResponse.json({ error: store.error }, { status: store.status })
  const creatorId = store.creatorId

  const body = await request.json().catch(() => null)
  const email = cleanEmail(body?.email)
  if (!email) return NextResponse.json({ error: "Enter a full email address, like name@example.com." }, { status: 400 })

  const { id } = await params
  const admin = createAdminClient()
  const lines = await ownedOrderLines(admin, creatorId, id)
  if (!lines) return NextResponse.json({ error: "This order was not found." }, { status: 404 })

  const current = (lines.map((l) => l.buyer_email || l.customer_email).find(Boolean) || "").trim()
  if (current.toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({ error: "That is already this order's email." }, { status: 400 })
  }

  const limited = await rateLimit({
    bucket: "order-email-change",
    subjects: [`order:${lines[0].id}`],
    windows: [{ limit: 3, seconds: 300 }, { limit: 10, seconds: 86400 }],
    message: "This order's email was just changed. Try again in a few minutes.",
  })
  if (limited) return limited

  const ids = lines.map((l) => l.id)
  const { error: updateError } = await admin.from("orders").update({ buyer_email: email }).in("id", ids)
  if (updateError) return NextResponse.json({ error: "The email was not changed. Try again." }, { status: 500 })
  /* Older rows carry the address in customer_email too, and the invoice and
     the refund email read that one first. Where it is set, it follows. */
  const withCustomerEmail = lines.filter((l) => l.customer_email).map((l) => l.id)
  if (withCustomerEmail.length > 0) {
    await admin.from("orders").update({ customer_email: email }).in("id", withCustomerEmail)
  }

  const report = await sendAccessEmails(admin, creatorId, lines, email)
  await recordOrderEvent(admin, lines[0].id, "email_changed_by_creator", { sent: report.sent, failed: report.failed })

  return NextResponse.json({
    email,
    ids,
    sent: report.sent,
    failed: report.failed,
    error: report.error,
    lines: report.lines,
  })
}

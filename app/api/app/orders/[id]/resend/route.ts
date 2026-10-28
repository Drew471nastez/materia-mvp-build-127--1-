import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { storeIdFor } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { canEmailAccess, cleanEmail, ownedOrderLines } from "@/lib/orders/owned"
import { recordOrderEvent, sendAccessEmails } from "@/lib/orders/notify"

export const runtime = "nodejs"

/**
 * POST /api/app/orders/:id/resend
 *
 * The creator sends the buyer their access email again, from the order's
 * page. Signed in, and only for an order of the creator's own products
 * (lib/orders/owned.ts). The receipt token stays on the server: the old path
 * took it from the browser, and it is the buyer's credential, not the
 * creator's.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  /* The store's, for its owner or a team member whose role has orders (lib/team). */
  const store = await storeIdFor("orders")
  if (store.ok === false) return NextResponse.json({ error: store.error }, { status: store.status })
  const creatorId = store.creatorId

  const { id } = await params
  const admin = createAdminClient()
  const lines = await ownedOrderLines(admin, creatorId, id)
  if (!lines) return NextResponse.json({ error: "This order was not found." }, { status: 404 })

  const eligible = lines.filter(canEmailAccess)
  if (eligible.length === 0) {
    return NextResponse.json({ error: "Nothing to send: this order has no paid item with a download." }, { status: 400 })
  }
  const to = cleanEmail(eligible.map((l) => l.buyer_email || l.customer_email).find(Boolean))
  if (!to) return NextResponse.json({ error: "This order has no email address to send to." }, { status: 400 })

  /* A held button, or a script, must not become a way to mail somebody. */
  const limited =
    (await rateLimit({
      bucket: "order-resend",
      subjects: [`order:${lines[0].id}`],
      windows: [{ limit: 3, seconds: 300 }, { limit: 10, seconds: 86400 }],
      message: "This receipt was just sent. Give it a few minutes before sending it again.",
    })) ??
    (await rateLimit({
      bucket: "order-resend-creator",
      subjects: [`creator:${creatorId}`],
      windows: [{ limit: 60, seconds: 3600 }],
      message: "That is a lot of receipts in an hour. Try again shortly.",
    }))
  if (limited) return limited

  const report = await sendAccessEmails(admin, creatorId, lines, to)
  await recordOrderEvent(admin, lines[0].id, "receipt_resent", { sent: report.sent, failed: report.failed }, store.role === "owner" ? null : store.userId)

  if (report.sent === 0) {
    return NextResponse.json({ error: `The email did not send. ${report.error ?? ""}`.trim(), lines: report.lines }, { status: 502 })
  }
  return NextResponse.json({ sent: report.sent, failed: report.failed, error: report.error, lines: report.lines })
}

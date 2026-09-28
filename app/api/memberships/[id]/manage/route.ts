import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { viewerMembership } from "@/lib/memberships/access"
import { retrieveSubscription, syncSubscription } from "@/lib/memberships/sync"
import { requestViewer } from "@/lib/memberships/viewer"
import { NOT_SET_UP, type MembershipRow } from "@/lib/memberships/server"
import { grantsAccess } from "@/lib/memberships/state"

export const runtime = "nodejs"

/**
 * POST /api/memberships/<id>/manage  { action }
 *
 *   cancel      stops it renewing: Stripe's cancel_at_period_end. The member
 *               keeps everything until the period they paid for ends, and
 *               can resume until then. Nothing is refunded; nothing more is
 *               charged. A trial cancelled ends with the trial, unpaid.
 *   resume      undoes cancel, before the period ends.
 *   retry       a past due member who has changed their card: the open
 *               invoice is paid again now instead of at Stripe's next retry.
 *   emails_off  no more emails for the creator's posts (the posts stay here)
 *   emails_on   and back on.
 *
 * Only the member's own membership, by account or by the confirmed address
 * it was paid with. The row is brought up to date from Stripe before the
 * answer, so the page shows what Stripe now says. Answers { membership }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requestViewer()
  if (!viewer) return NextResponse.json({ error: "Sign in to manage your membership." }, { status: 401 })
  let body: { action?: unknown }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const action = typeof body.action === "string" ? body.action : ""
  if (!["cancel", "resume", "retry", "emails_off", "emails_on"].includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 })

  const limited = await rateLimit({ bucket: "membership-manage", subjects: [`user:${viewer.id}`], windows: LIMITS.payment, message: "That is a lot of changes. Try again in a few minutes." })
  if (limited) return limited

  const admin = createAdminClient()
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  const row = read.value
  if (!row) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })

  if (action === "emails_off" || action === "emails_on") {
    const { data, error } = await admin.from("memberships").update({ email_updates: action === "emails_on" }).eq("id", row.id).select("email_updates").single()
    if (error) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 })
    return NextResponse.json({ membership: { ...row, email_updates: data.email_updates } })
  }

  try {
    if (action === "cancel") {
      if (!["active", "trialing", "past_due"].includes(row.status)) return NextResponse.json({ error: "This membership is not renewing." }, { status: 409 })
      await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true })
    } else if (action === "resume") {
      if (row.status !== "canceled" || !grantsAccess(row)) return NextResponse.json({ error: "This membership has ended. Join again from the creator's page." }, { status: 409 })
      await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: false })
    } else if (action === "retry") {
      if (row.status !== "past_due") return NextResponse.json({ error: "There is nothing to pay right now." }, { status: 409 })
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id
      if (!invoiceId) return NextResponse.json({ error: "There is nothing to pay right now." }, { status: 409 })
      try {
        await stripe.invoices.pay(invoiceId)
      } catch (err) {
        const e = err as { type?: string; raw?: { message?: string }; message?: string }
        const message = e?.type === "StripeCardError" ? e.raw?.message || e.message : null
        await syncSubscription(admin, row.stripe_subscription_id, { subscription: await retrieveSubscription(row.stripe_subscription_id) }).catch(() => null)
        return NextResponse.json({ error: message ? `${message} Update your card and try again.` : "The payment did not go through. Update your card and try again." }, { status: 402 })
      }
    }
    const { row: next } = await syncSubscription(admin, row.stripe_subscription_id, { subscription: await retrieveSubscription(row.stripe_subscription_id) })
    return NextResponse.json({ membership: (next ?? row) as MembershipRow })
  } catch (e) {
    console.error(`[memberships/manage] ${action} failed for ${row.id}:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "That did not go through. Nothing changed. Try again in a moment." }, { status: 502 })
  }
}

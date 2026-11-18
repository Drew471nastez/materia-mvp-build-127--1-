import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { reportError } from "@/lib/observability/report"
import { viewerMembership } from "@/lib/memberships/access"
import { portalConfiguration, refusalReason } from "@/lib/memberships/billing"
import { requestViewer } from "@/lib/memberships/viewer"
import { NOT_SET_UP, siteUrl } from "@/lib/memberships/server"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * POST /api/memberships/<id>/portal
 *
 * Changing the card a membership is paid with, on Stripe's own page (the
 * customer portal), opened straight at "update payment method", and back to
 * the membership afterwards with ?card=updated, where a past due member is
 * offered the payment again. Card numbers never touch Storelib.
 *
 * The portal is Storelib's (the customer is on the platform account, see
 * lib/memberships/billing.ts), with a configuration this code makes, so
 * nothing has to be set up in the Stripe dashboard first. If Stripe refuses
 * anyway, the member reads a plain sentence and the reason goes to the
 * admin's Health view. Answers { url }.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requestViewer()
  if (!viewer) return signedOutOrRetry(NextResponse.json({ error: "Sign in to manage your membership." }, { status: 401 }), { fresh: true })
  const admin = createAdminClient()
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  const row = read.value
  if (!row || !row.stripe_customer_id) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })
  try {
    const configuration = await portalConfiguration()
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      configuration,
      return_url: siteUrl(`/account/library/memberships/${row.id}?card=updated`),
      flow_data: {
        type: "payment_method_update",
        after_completion: { type: "redirect", redirect: { return_url: siteUrl(`/account/library/memberships/${row.id}?card=updated`) } },
      },
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    await reportError({ source: "payments", where: "memberships card portal", error, context: { membershipId: row.id, reason: refusalReason(error) } })
    return NextResponse.json({ error: "Changing the card is not available right now. Try again later, or write to support@storelib.com." }, { status: 502 })
  }
}

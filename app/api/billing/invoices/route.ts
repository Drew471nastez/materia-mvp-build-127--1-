import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { STRIPE_READ_TIMEOUT_MS } from "@/lib/billing/subscription-state"

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

export async function GET() {
  try {
    /* The store's rows, by the store's id (lib/team/money), for the owner and a team member alike. */
    const supabase = createAdminClient()

    /* The owner, or a team member who may see the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "view")
    if (!who.ok) return who.response

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
      .eq("id", who.creatorId)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    /* A read: the stored customer only. A customer is never created to list its invoices (there are none). */
    const stripeCustomerId: string | null =
      typeof creator.stripe_customer_id === "string" && creator.stripe_customer_id.startsWith("cus_") ? creator.stripe_customer_id : null

    if (!stripeCustomerId) {
      return NextResponse.json({ invoices: [] })
    }

    try {
      const stripeInvoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 20 }, { timeout: STRIPE_READ_TIMEOUT_MS })
      const invoices = stripeInvoices.data.map((inv) => ({
        id: inv.id,
        stripe_invoice_id: inv.id,
        amount_cents: inv.amount_paid || inv.total || 0,
        status: inv.status === "paid" ? "paid" : inv.status === "open" ? "open" : inv.status || "unknown",
        invoice_pdf_url: inv.invoice_pdf || null,
        hosted_invoice_url: inv.hosted_invoice_url || null,
        period_start: inv.period_start ? safeTimestamp(inv.period_start) : null,
        period_end: inv.period_end ? safeTimestamp(inv.period_end) : null,
        created_at: inv.created ? safeTimestamp(inv.created) : new Date().toISOString(),
        description: inv.lines?.data?.[0]?.description || "Subscription",
      }))

      return NextResponse.json({ invoices })
    } catch (err) {
      console.error("[Invoices API] Stripe fetch error:", err)
    }

    // Fallback to DB if Stripe fails
    try {
      const { data: dbInvoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(50)

      return NextResponse.json({ invoices: dbInvoices || [] })
    } catch (err) {
      console.error("[Invoices API] DB fallback error:", err)
    }

    return NextResponse.json({ invoices: [] })
  } catch (error: any) {
    console.error("Error in GET /api/billing/invoices:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

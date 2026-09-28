import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

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
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Fetch directly from Stripe (source of truth)
    let stripeCustomerId: string | null = null
    try {
      stripeCustomerId = await getOrCreateStripeCustomer({
        creatorId: creator.id,
        existingCustomerId: creator.stripe_customer_id,
        email: user.email,
        userId: user.id,
        username: creator.username || creator.slug || "creator",
      })
    } catch (err) {
      console.error("[Invoices API] Error getting Stripe customer:", err)
    }

    if (!stripeCustomerId) {
      return NextResponse.json({ invoices: [] })
    }

    try {
      const stripeInvoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 20 })
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

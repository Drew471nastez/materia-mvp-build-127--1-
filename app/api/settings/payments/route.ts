import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator profile
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    const body = await request.json()
    const { defaultCurrency, statementDescriptor, allowPaypal, paypalEmail } = body

    // Validate statement descriptor (max 22 chars, Stripe requirement)
    if (statementDescriptor && statementDescriptor.length > 22) {
      return NextResponse.json({ error: "Statement descriptor must be 22 characters or less" }, { status: 400 })
    }

    if (paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
      return NextResponse.json({ error: "Invalid PayPal email format" }, { status: 400 })
    }

    // Update payment settings
    await adminSupabase
      .from("creators")
      .update({
        default_currency: defaultCurrency || "USD",
        statement_descriptor: statementDescriptor || null,
        allow_paypal: allowPaypal || false,
        paypal_merchant_id: paypalEmail || null,
      })
      .eq("id", creator.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Payment Settings Update Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment settings" },
      { status: 500 },
    )
  }
}

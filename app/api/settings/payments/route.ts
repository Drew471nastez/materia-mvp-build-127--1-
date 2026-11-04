import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { statementDescriptorSuffix } from "@/lib/payments/platform-descriptor"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Check authentication
    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator profile
    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    const body = await request.json()
    const { defaultCurrency, allowPaypal, paypalEmail, statementDescriptor } = body

    const SUPPORTED_PAYOUT_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"]
    const payoutCurrency = SUPPORTED_PAYOUT_CURRENCIES.includes((defaultCurrency || "USD").toUpperCase())
      ? (defaultCurrency || "USD").toUpperCase()
      : "USD"

    if (paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
      return NextResponse.json({ error: "Invalid PayPal email format" }, { status: 400 })
    }

    // Validate and format statement descriptor suffix (seller part)
    // Platform part "STORELIB" + "*" + suffix will appear on bank statements
    const descriptorSuffix = statementDescriptorSuffix(statementDescriptor || creator.display_name || "STORE") || "STORE"

    // Update payment settings
    await adminSupabase
      .from("creators")
      .update({
        default_currency: defaultCurrency || "USD",
        payout_currency: payoutCurrency,
        statement_descriptor: descriptorSuffix,
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

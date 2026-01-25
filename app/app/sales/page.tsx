import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SalesClient } from "./sales-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sales | Storelib",
}

export default async function SalesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("id, stripe_account_id, stripe_onboarding_status, default_currency")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  // Fetch creator profile for PDF reports
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  // Fetch products for filters
  const { data: productsData } = await supabase
    .from("products")
    .select("id, title, type, price_cents")
    .eq("creator_id", creator.id)
    .order("title")

  const products = productsData || []

  // Get summary data for initial load
  const productIds = products.map((p) => p.id)

  let initialSummary = {
    totalSales: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    refundCount: 0,
    refundAmount: 0,
  }

  if (productIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("amount_cents, status, fee_cents")
      .in("product_id", productIds)
      .eq("status", "completed")

    const completedOrders = orders || []
    initialSummary.totalSales = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
    initialSummary.totalOrders = completedOrders.length
    initialSummary.avgOrderValue = completedOrders.length > 0
      ? Math.round(initialSummary.totalSales / completedOrders.length)
      : 0

    // Get refunds count
    const { data: refunds } = await supabase
      .from("orders")
      .select("amount_cents")
      .in("product_id", productIds)
      .eq("status", "refunded")

    initialSummary.refundCount = refunds?.length || 0
    initialSummary.refundAmount = refunds?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0
  }

  return (
    <SalesClient
      creatorId={creator.id}
      products={products}
      initialSummary={initialSummary}
      currency={creator.default_currency || "USD"}
      stripeConnected={creator.stripe_onboarding_status === "enabled"}
      storeName="Storelib"
      sellerName={profile?.display_name || "Seller"}
    />
  )
}

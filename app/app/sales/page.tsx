import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SalesClient } from "./sales-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sales | Storelib",
}

export default async function SalesPage() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Use admin client to fetch creator (bypass RLS)
  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("id, stripe_account_id, stripe_onboarding_status, default_currency")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    console.log("[Sales] Creator not found for user:", user.id, creatorError)
    redirect("/onboarding")
  }

  console.log("[Sales] Found creator:", creator.id)

  // Fetch creator profile for PDF reports
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  // Fetch ALL products for this creator (using admin to bypass RLS)
  const { data: productsData, error: productsError } = await adminSupabase
    .from("products")
    .select("id, title, type, price_cents, cover_image")
    .eq("creator_id", creator.id)
    .order("title")

  if (productsError) {
    console.log("[Sales] Products fetch error:", productsError)
  }

  const products = productsData || []
  const productIds = products.map((p) => p.id)

  console.log("[Sales] Found products:", products.length, "Product IDs:", productIds)

  let initialSummary = {
    totalSales: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    refundCount: 0,
    refundAmount: 0,
  }

  let initialOrders: any[] = []

  // Fetch ALL orders for this creator's products
  if (productIds.length > 0) {
    const { data: allOrders, error: ordersError } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .order("created_at", { ascending: false })

    if (ordersError) {
      console.log("[Sales] Orders fetch error:", ordersError)
    }

    console.log("[Sales] Found orders:", allOrders?.length || 0)

    initialOrders = (allOrders || []).map(order => {
      const product = products.find(p => p.id === order.product_id)
      return {
        ...order,
        product: product ? {
          id: product.id,
          title: product.title,
          type: product.type,
          cover_image: product.cover_image
        } : null
      }
    })

    // Calculate summary from completed orders
    const completedOrders = initialOrders.filter(o => o.status === "completed")
    initialSummary.totalSales = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
    initialSummary.totalOrders = completedOrders.length
    initialSummary.avgOrderValue = completedOrders.length > 0
      ? Math.round(initialSummary.totalSales / completedOrders.length)
      : 0

    // Get refunds count
    const refundedOrders = initialOrders.filter(o => o.status === "refunded")
    initialSummary.refundCount = refundedOrders.length
    initialSummary.refundAmount = refundedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

    console.log("[Sales] Summary:", initialSummary)
  } else {
    console.log("[Sales] No products found, skipping orders fetch")
  }

  return (
    <SalesClient
      creatorId={creator.id}
      products={products}
      initialSummary={initialSummary}
      initialOrders={initialOrders}
      currency={creator.default_currency || "USD"}
      stripeConnected={creator.stripe_onboarding_status === "enabled"}
      storeName="Storelib"
      sellerName={profile?.display_name || "Seller"}
    />
  )
}

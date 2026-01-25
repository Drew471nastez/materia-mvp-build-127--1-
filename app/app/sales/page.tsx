import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SalesClient } from "./sales-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

  // Step 1: Get creator
  const { data: creator } = await adminSupabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Step 2: Get profile
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  // Step 3: Get ALL products for this creator
  const { data: productsData } = await adminSupabase
    .from("products")
    .select("*")
    .eq("creator_id", creator.id)

  const products = productsData || []

  // Step 4: Get ALL orders for these products
  let initialOrders: any[] = []
  let initialSummary = {
    totalSales: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    refundCount: 0,
    refundAmount: 0,
  }

  if (products.length > 0) {
    const productIds = products.map(p => p.id)

    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .order("created_at", { ascending: false })

    // Map orders with product info
    initialOrders = (ordersData || []).map(order => {
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

    // Calculate summary
    const completedOrders = initialOrders.filter(o => o.status === "completed")
    initialSummary.totalSales = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
    initialSummary.totalOrders = completedOrders.length
    initialSummary.avgOrderValue = completedOrders.length > 0
      ? Math.round(initialSummary.totalSales / completedOrders.length)
      : 0

    const refundedOrders = initialOrders.filter(o => o.status === "refunded")
    initialSummary.refundCount = refundedOrders.length
    initialSummary.refundAmount = refundedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
  }

  return (
    <SalesClient
      creatorId={creator.id}
      products={products.map(p => ({
        id: p.id,
        title: p.title,
        type: p.type,
        price_cents: p.price_cents,
        cover_image: p.cover_image
      }))}
      initialSummary={initialSummary}
      initialOrders={initialOrders}
      currency={creator.default_currency || "USD"}
      stripeConnected={creator.stripe_onboarding_status === "enabled"}
      storeName="Storelib"
      sellerName={profile?.display_name || "Seller"}
    />
  )
}

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { SalesClient } from "./sales-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sales | Storelib",
}

// Create admin client directly to ensure it works
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export default async function SalesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Use admin client directly
  const adminSupabase = getAdminClient()

  // Fetch creator
  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("id, stripe_account_id, stripe_onboarding_status, default_currency")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    console.error("[Sales] Creator error:", creatorError)
    redirect("/onboarding")
  }

  // Fetch profile
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  // Fetch ALL products for this creator
  const { data: productsData, error: productsError } = await adminSupabase
    .from("products")
    .select("id, title, type, price_cents, cover_image")
    .eq("creator_id", creator.id)
    .order("title")

  if (productsError) {
    console.error("[Sales] Products error:", productsError)
  }

  const products = productsData || []
  const productIds = products.map((p) => p.id)

  console.log("[Sales] Creator ID:", creator.id)
  console.log("[Sales] Products found:", products.length)
  console.log("[Sales] Product IDs:", productIds)

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
      console.error("[Sales] Orders error:", ordersError)
    }

    console.log("[Sales] Orders found:", allOrders?.length || 0)

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
  }

  console.log("[Sales] Final summary:", initialSummary)
  console.log("[Sales] Final orders count:", initialOrders.length)

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

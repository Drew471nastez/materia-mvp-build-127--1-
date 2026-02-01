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

  // Step 3b: Get view counts from analytics_events table
  const productIds = products.map(p => p.id)
  let viewCountsMap: Record<string, number> = {}

  if (productIds.length > 0) {
    // Query unique views per product from analytics_events
    const { data: viewEvents } = await adminSupabase
      .from("analytics_events")
      .select("product_id, visitor_id, session_id")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .in("product_id", productIds)

    // Count unique views per product (dedupe by visitor_id or session_id)
    if (viewEvents) {
      const viewedKeys = new Map<string, Set<string>>()

      viewEvents.forEach(ev => {
        if (!ev.product_id) return

        const identity = ev.visitor_id || ev.session_id || "unknown"
        const key = `${identity}__${ev.product_id}`

        if (!viewedKeys.has(ev.product_id)) {
          viewedKeys.set(ev.product_id, new Set())
        }

        const productKeys = viewedKeys.get(ev.product_id)!
        if (!productKeys.has(key)) {
          productKeys.add(key)
          viewCountsMap[ev.product_id] = (viewCountsMap[ev.product_id] || 0) + 1
        }
      })
    }
  }

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
          thumbnail_url: product.thumbnail_url || product.gallery_images?.[0] || null
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
        thumbnail_url: p.thumbnail_url || p.gallery_images?.[0] || null,
        view_count: viewCountsMap[p.id] || 0
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

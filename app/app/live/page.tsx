import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LiveClient } from "./live-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Live",
}

export const dynamic = "force-dynamic"

export default async function LivePage() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await adminSupabase
    .from("creators")
    .select("id, slug, store_published")
    .eq("user_id", user.id)
    .single()

  if (!creator) redirect("/app")

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single()

  // Fetch products for order queries
  const { data: products } = await adminSupabase
    .from("products")
    .select("id, name, price_cents")
    .eq("creator_id", creator.id)

  const productIds = products?.map((p: any) => p.id) || []

  // Fetch today's orders
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let todayOrders: any[] = []
  if (productIds.length > 0) {
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("id, product_id, amount_cents, status, created_at, buyer_email")
      .in("product_id", productIds)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })

    todayOrders = (ordersData || []).filter(o => o.status === "completed")
  }

  // Today's revenue and sales count
  const todaySales = todayOrders.length
  const todayRevenue = todayOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0)

  // Check for connected custom domain
  const { data: activeDomain } = await adminSupabase
    .from("custom_domains")
    .select("domain")
    .eq("creator_id", creator.id)
    .eq("status", "active")
    .maybeSingle()

  // Build product name map for display
  const productMap: Record<string, string> = {}
  for (const p of products || []) {
    productMap[p.id] = p.name
  }

  return (
    <LiveClient
      creatorId={creator.id}
      username={profile?.username || creator.slug || ""}
      todaySales={todaySales}
      todayRevenue={todayRevenue}
      todayOrders={todayOrders}
      productMap={productMap}
      connectedDomain={activeDomain?.domain || null}
      storePublished={creator.store_published}
    />
  )
}

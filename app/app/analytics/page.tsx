import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Analytics",
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("id, views")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const { data: productsData } = await adminSupabase
    .from("products")
    .select("id, title, thumbnail_url")
    .eq("creator_id", creator.id)

  const products = productsData || []

  // Fetch orders for this creator's products (like Sales page does)
  let initialOrders: any[] = []
  if (products.length > 0) {
    const productIds = products.map((p: any) => p.id)
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .order("created_at", { ascending: false })

    initialOrders = (ordersData || []).map((order: any) => {
      const product = products.find((p: any) => p.id === order.product_id)
      return {
        ...order,
        product: product ? { id: product.id, title: product.title } : null
      }
    })
  }

  return <AnalyticsClient creatorId={creator.id} userId={user.id} products={products} initialOrders={initialOrders} />
}

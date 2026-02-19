import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OrdersClient } from "./orders-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Orders | Storelib",
}

export default async function OrdersPage() {
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
    .select("id, default_currency")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const { data: productsData } = await adminSupabase
    .from("products")
    .select("id, title, type, thumbnail_url")
    .eq("creator_id", creator.id)

  const products = productsData || []
  const productIds = products.map((p: any) => p.id)

  let initialOrders: any[] = []
  if (productIds.length > 0) {
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: false })

    if (ordersData) {
      initialOrders = ordersData.map((order: any) => {
        const product = products.find((p: any) => p.id === order.product_id)
        return {
          ...order,
          product: product ? { id: product.id, title: product.title, type: product.type, thumbnail_url: product.thumbnail_url } : null,
        }
      })
    }
  }

  return (
    <OrdersClient
      creatorId={creator.id}
      initialOrders={initialOrders}
      products={products}
      currency={(creator as any).default_currency || "USD"}
    />
  )
}

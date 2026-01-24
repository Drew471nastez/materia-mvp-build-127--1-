import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PayoutsClient } from "./payouts-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Payouts | Storelib",
}

export default async function PayoutsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  // Get products for this creator
  const { data: productsData } = await supabase
    .from("products")
    .select("id")
    .eq("creator_id", creator.id)

  const products = productsData || []
  const productIds = products.map((p) => p.id)

  // Calculate totals from orders
  let totalEarnings = 0
  let totalFees = 0
  let pendingAmount = 0
  let availableBalance = 0

  if (productIds.length > 0) {
    // Get all completed orders
    const { data: completedOrders } = await supabase
      .from("orders")
      .select("amount_cents, fee_cents, created_at")
      .in("product_id", productIds)
      .eq("status", "completed")

    if (completedOrders) {
      totalEarnings = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      totalFees = completedOrders.reduce((sum, o) => sum + (o.fee_cents || 0), 0)

      // Calculate pending (orders from last 7 days are pending payout)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      completedOrders.forEach((order) => {
        const orderDate = new Date(order.created_at)
        const netAmount = (order.amount_cents || 0) - (order.fee_cents || 0)
        if (orderDate > sevenDaysAgo) {
          pendingAmount += netAmount
        } else {
          availableBalance += netAmount
        }
      })
    }
  }

  const netEarnings = totalEarnings - totalFees

  return (
    <div className="h-full overflow-y-auto page-scroll">
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Payouts</h1>
          <p className="text-muted-foreground">Manage your earnings and payout settings</p>
        </div>

        <PayoutsClient
          creator={creator}
          initialData={{
            totalEarnings,
            totalFees,
            netEarnings,
            pendingAmount,
            availableBalance,
          }}
        />
      </div>
    </div>
  )
}

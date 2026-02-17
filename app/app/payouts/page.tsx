import { redirect } from "next/navigation"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PayoutsClient } from "./payouts-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Payouts",
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

  // Calculate totals from orders and fetch all completed orders with details
  let totalEarnings = 0
  let totalFees = 0
  let pendingAmount = 0
  let availableBalance = 0
  let allOrders: any[] = []

  if (productIds.length > 0) {
    // Get all orders (completed and refunded) with product info
    const { data: completedOrders } = await supabase
      .from("orders")
      .select("id, amount_cents, fee_cents, created_at, status, customer_email, product_id, stripe_payment_intent_id, product:products(title, thumbnail_url)")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: false })

    if (completedOrders) {
      allOrders = completedOrders
      const paidOrders = completedOrders.filter(o => o.status === "completed")
      totalEarnings = paidOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      totalFees = paidOrders.reduce((sum, o) => sum + (o.fee_cents || 0), 0)

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
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
      {/* Announcement Bar - matching analytics style */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
            <span className="text-[12px] md:text-[14px] text-white/90">
              <span className="font-semibold text-white">Try Pro free</span>
              <span className="hidden md:inline"> — our most popular plan for content creators and businesses.</span>
            </span>
            <Link
              href="/upgrade"
              className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
            >
              <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
              <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
              <span className="relative z-10">Upgrade</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Payouts</h1>
          <p className="text-[14px] text-[#6b7280] mt-1">Manage your earnings and payout settings</p>
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
          initialOrders={allOrders}
        />
      </div>
    </div>
  )
}

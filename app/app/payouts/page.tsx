import { redirect } from "next/navigation"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { PayoutsClient } from "./payouts-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Payouts",
}

export default async function PayoutsPage() {
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
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  // Get products for this creator
  const { data: productsData } = await adminSupabase
    .from("products")
    .select("*")
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
    // Get all orders (completed and refunded) — use select("*") to avoid column-not-found errors
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: false })

    if (ordersData) {
      // Server-side refund sync: check Stripe for refunded orders that DB still shows as completed
      // NOTE: This app uses destination charges — PIs live on the PLATFORM account, not the connected account.
      {
        const completedWithPI = ordersData.filter(
          (o) => o.status === "completed" && o.stripe_payment_intent_id
        )
        for (const order of completedWithPI) {
          try {
            const pi = await stripe.paymentIntents.retrieve(
              order.stripe_payment_intent_id,
              { expand: ["latest_charge"] }
            )
            const charge = pi.latest_charge as any
            if (charge && (charge.refunded === true || (charge.amount_refunded && charge.amount_refunded > 0))) {
              await adminSupabase
                .from("orders")
                .update({ status: "refunded" })
                .eq("id", order.id)
              order.status = "refunded"
              // Try extra columns
              try {
                await adminSupabase.from("orders").update({
                  refund_amount_cents: charge.amount_refunded || order.amount_cents,
                  refunded_at: new Date().toISOString(),
                }).eq("id", order.id)
              } catch { /* columns may not exist */ }
            }
          } catch {
            // Skip — PI might be invalid or Stripe rate limited
          }
        }
      }

      // Map orders with product info (like sales page does)
      allOrders = ordersData.map((order) => {
        const product = products.find((p) => p.id === order.product_id)
        return {
          ...order,
          product: product
            ? {
                title: product.title,
                thumbnail_url: product.thumbnail_url || product.gallery_images?.[0] || null,
              }
            : null,
        }
      })

      const paidOrders = ordersData.filter((o) => o.status === "completed")
      totalEarnings = paidOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      totalFees = paidOrders.reduce((sum, o) => sum + (o.fee_cents || 0), 0)
    }
  }

  // Fetch real Stripe balance for pending/available KPIs
  let stripePendingBalance = 0
  let stripeAvailableBalance = 0
  if (creator.stripe_account_id) {
    try {
      const balance = await stripe.balance.retrieve(
        { stripeAccount: creator.stripe_account_id }
      )
      stripePendingBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0)
      stripeAvailableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0)
    } catch (err) {
      console.error("[Payouts] Failed to fetch Stripe balance:", err)
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
              <span className="font-semibold text-white">Try Pro</span>
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
            pendingAmount: stripePendingBalance,
            availableBalance: stripeAvailableBalance,
          }}
          initialOrders={allOrders}
        />
      </div>
    </div>
  )
}

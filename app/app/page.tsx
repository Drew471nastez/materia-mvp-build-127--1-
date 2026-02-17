import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardClient } from "@/components/app/dashboard-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Storelib",
}

export const dynamic = "force-dynamic"

export default async function AppDashboard() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await adminSupabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single()

  // Fetch products using admin client
  const { data: products } = await adminSupabase
    .from("products")
    .select("id, status")
    .eq("creator_id", creator.id)

  const productIds = products?.map((p: any) => p.id) || []
  const hasProducts = (products?.length || 0) > 0

  // Check for OnePage
  const { data: onepage } = await adminSupabase
    .from("onepages")
    .select("id, status, draft_blocks")
    .eq("owner_id", user.id)
    .maybeSingle()

  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Check for Stripe connection
  const { data: stripeAccount } = await adminSupabase
    .from("stripe_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle()

  const hasPayoutsSetup = stripeAccount?.payouts_enabled === true

  // Fetch ALL orders for this creator's products (same source as Sales page)
  let allOrders: any[] = []
  if (productIds.length > 0) {
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("id, product_id, amount_cents, status, created_at")
      .in("product_id", productIds)
      .order("created_at", { ascending: false })

    allOrders = ordersData || []
  }

  // Calculate totals — totalOrders includes completed + refunded
  const completedOrders = allOrders.filter(o => o.status === "completed")
  const totalOrders = allOrders.filter(o => o.status === "completed" || o.status === "refunded").length
  const totalRevenue = completedOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0)

  // Branding check: has avatar, name, and bio
  const hasBranding = !!(profile?.avatar_url || creator.avatar_url) &&
                      !!(profile?.display_name || creator.display_name) &&
                      !!creator.bio

  // First sale check
  const hasFirstSale = totalOrders > 0

  // Setup checklist - 6 steps with concise tooltips
  const setupSteps = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Account created",
      tooltip: "Your account is ready!",
      completed: true,
      href: "/app/settings",
    },
    {
      id: "branding",
      title: "Branding",
      description: "Set your name, image, and bio",
      tooltip: "Add your profile photo, name, and bio",
      completed: hasBranding,
      href: "/app/settings",
    },
    {
      id: "product",
      title: "Create your first product",
      description: "Add something people can buy",
      tooltip: "Create a product to start selling",
      completed: hasProducts,
      href: "/app/products/new",
    },
    {
      id: "payouts",
      title: "Set up payouts",
      description: "Connect a payment method",
      tooltip: "Connect Stripe to receive payments",
      completed: hasPayoutsSetup,
      href: "/app/payouts",
    },
    {
      id: "onepage",
      title: "Create your OnePage",
      description: "Build your public page",
      tooltip: "Build your link-in-bio page",
      completed: hasOnePage && hasOnePageBlock,
      href: "/app/onepage",
    },
    {
      id: "sale",
      title: "Make your first sale",
      description: "Share your link and sell",
      tooltip: "Share your link to get sales",
      completed: hasFirstSale,
      href: "/app/sales",
    },
  ]

  const displayName = profile?.display_name || creator.display_name || "there"

  // Check for connected custom domain
  const { data: activeDomain } = await adminSupabase
    .from("custom_domains")
    .select("domain")
    .eq("creator_id", creator.id)
    .eq("status", "active")
    .maybeSingle()

  return (
    <DashboardClient
      creatorId={creator.id}
      displayName={displayName}
      initialSetupSteps={setupSteps}
      productIds={productIds}
      initialOrders={allOrders}
      initialTotalOrders={totalOrders}
      initialTotalRevenue={totalRevenue}
      creatorHandle={profile?.username || creator.slug || ""}
      connectedDomain={activeDomain?.domain || null}
    />
  )
}

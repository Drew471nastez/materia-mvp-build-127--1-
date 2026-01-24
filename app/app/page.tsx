import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardClient } from "@/components/app/dashboard-client"

export const dynamic = "force-dynamic"

export default async function AppDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const { data: profile } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single()

  const { data: products } = await supabase.from("products").select("id, status").eq("creator_id", creator.id)
  const productIds = products?.map((p: any) => p.id) || []
  const hasProducts = (products?.length || 0) > 0

  // Check for OnePage
  const { data: onepage } = await supabase
    .from("onepages")
    .select("id, status, draft_blocks")
    .eq("owner_id", user.id)
    .maybeSingle()

  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Check for Stripe connection
  const { data: stripeAccount } = await supabase
    .from("stripe_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle()

  const hasPayoutsSetup = stripeAccount?.payouts_enabled === true

  // Total orders (all time) for first sale check
  let totalOrders = 0
  if (productIds.length > 0) {
    const { data: allOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "completed")
      .in("product_id", productIds)

    totalOrders = allOrders?.length || 0
  }

  // Branding check: has avatar, name, and bio
  const hasBranding = !!(profile?.avatar_url || creator.avatar_url) &&
                      !!(profile?.display_name || creator.display_name) &&
                      !!creator.bio

  // First sale check
  const hasFirstSale = totalOrders > 0

  // Setup checklist - 6 steps with detailed tooltips
  const setupSteps = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Account created",
      tooltip: "This step is completed automatically when your account is created.",
      completed: true,
      href: "/app/settings",
    },
    {
      id: "branding",
      title: "Branding",
      description: "Set your name, image, and bio",
      tooltip: "Add a profile image, choose your name, and write a short bio. This appears on your store, OnePage, and public profile.",
      completed: hasBranding,
      href: "/app/settings",
    },
    {
      id: "product",
      title: "Create your first product",
      description: "Add something people can buy",
      tooltip: "Create a digital product, service, or paid link. You need at least one product to start selling.",
      completed: hasProducts,
      href: "/app/products/new",
    },
    {
      id: "payouts",
      title: "Set up payouts",
      description: "Connect a payment method",
      tooltip: "Connect your payment account so you can receive money from sales.",
      completed: hasPayoutsSetup,
      href: "/app/payouts",
    },
    {
      id: "onepage",
      title: "Create your OnePage",
      description: "Build your public page",
      tooltip: "Your OnePage is your main link. Add links, products, and content people will see first.",
      completed: hasOnePage && hasOnePageBlock,
      href: "/app/onepage",
    },
    {
      id: "sale",
      title: "Make your first sale",
      description: "Share your link and sell",
      tooltip: "Share your OnePage or store link. This step completes when your first sale comes in.",
      completed: hasFirstSale,
      href: "/app/sales",
    },
  ]

  const displayName = profile?.display_name || creator.display_name || "there"

  return (
    <DashboardClient
      creatorId={creator.id}
      displayName={displayName}
      initialSetupSteps={setupSteps}
      productIds={productIds}
    />
  )
}

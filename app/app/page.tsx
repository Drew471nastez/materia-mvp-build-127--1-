import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardClient } from "@/components/app/dashboard-client"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Use an absolute title to bypass the root "%s | Storelib" template so the
    // tab never shows "Storelib | Storelib".
    return { title: { absolute: "Storelib" } }
  }

  const adminSupabase = createAdminClient()
  const [{ data: profile }, { data: creator }] = await Promise.all([
    adminSupabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle(),
    adminSupabase
      .from("creators")
      .select("username, slug")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const username =
    profile?.username || creator?.username || creator?.slug || null

  // When a username exists, the root layout's "%s | Storelib" template
  // turns this into "username | Storelib". When it doesn't, fall back to
  // an absolute "Storelib" so we never show "Storelib | Storelib".
  return username
    ? { title: username }
    : { title: { absolute: "Storelib" } }
}

export const dynamic = "force-dynamic"

export default async function AppDashboard() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Fetch creator first (needed for redirect decisions)
  const { data: creator } = await adminSupabase
    .from("creators")
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, stripe_onboarding_status, stripe_account_id, store_published, subscription_plan_id")
    .eq("user_id", user.id)
    .single()

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  // Fire all independent queries in parallel — cuts total DB round-trips from ~6 sequential to 1 parallel batch
  const [
    { data: profile },
    { data: products },
    { data: onepage },
    { data: activeDomain },
  ] = await Promise.all([
    adminSupabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", user.id)
      .single(),
    adminSupabase
      .from("products")
      .select("id, status")
      .eq("creator_id", creator.id),
    adminSupabase
      .from("onepages")
      .select("id, status, draft_blocks, bio, avatar_url, title")
      .eq("owner_id", user.id)
      .maybeSingle(),
    adminSupabase
      .from("custom_domains")
      .select("domain")
      .eq("creator_id", creator.id)
      .eq("status", "active")
      .maybeSingle(),
  ])

  const productIds = products?.map((p: any) => p.id) || []
  const hasProducts = (products?.length || 0) > 0

  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Check for Stripe connection — read from creators table (source of truth)
  const hasPayoutsSetup = creator.payouts_enabled === true || creator.stripe_onboarding_status === "connected"

  // Fetch orders (depends on productIds from above)
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

  // Branding check: check each item independently
  const hasAvatar = !!(profile?.avatar_url || creator.avatar_url || onepage?.avatar_url)
  const hasName = !!(profile?.display_name || creator.display_name || profile?.username || creator.username || creator.slug)
  const hasBio = !!(creator.bio || onepage?.bio)
  const hasBranding = hasAvatar && hasName && hasBio

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
      href: "/app/orders",
    },
  ]

  const displayName = profile?.display_name || creator.display_name || "there"

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
      brandingDetail={{ hasAvatar, hasName, hasBio }}
      subscriptionPlanId={creator.subscription_plan_id || "free"}
    />
  )
}

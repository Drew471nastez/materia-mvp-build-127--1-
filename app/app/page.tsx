import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Check,
  User,
  Palette,
  Package,
  CreditCard,
  Link2,
  Trophy,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react"

export const dynamic = "force-dynamic"

// Helper function for analytics API calls with proper auth
async function fetchAnalyticsSummary(supabase: any, creatorId: string) {
  try {
    const { data: products } = await supabase.from("products").select("id").eq("creator_id", creatorId)
    const productIds = products?.map((p: any) => p.id) || []

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const endDate = new Date()

    const viewsQuery = supabase
      .from("analytics_events")
      .select("id, visitor_id, session_id, product_id, created_at")
      .eq("creator_id", creatorId)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    const { data: viewEvents } = await viewsQuery

    const uniqueViewKeys = new Set(
      (viewEvents || [])
        .map((e: any) => {
          const identity = e.visitor_id || e.session_id
          if (!identity) return null
          return `${identity}__${e.product_id || "store"}`
        })
        .filter(Boolean),
    )

    const totalViews = uniqueViewKeys.size || 0

    let ordersQuery = supabase
      .from("orders")
      .select("amount_cents")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productIds.length > 0) {
      ordersQuery = ordersQuery.in("product_id", productIds)
    } else {
      return {
        totalViews,
        sales7d: 0,
        revenue7d: 0,
        conversionRate: 0,
      }
    }

    const { data: orders7d } = await ordersQuery

    const sales7d = orders7d?.length || 0
    const revenue7d = orders7d?.reduce((sum: number, o: any) => sum + (o?.amount_cents || 0), 0) || 0

    let conversionRate = 0
    if (totalViews > 0) {
      conversionRate = (sales7d / totalViews) * 100
    }

    return {
      totalViews,
      sales7d,
      revenue7d,
      conversionRate: Number(conversionRate.toFixed(2)),
    }
  } catch (error) {
    console.error("[Dashboard] Error fetching analytics summary:", error)
    return {
      totalViews: 0,
      sales7d: 0,
      revenue7d: 0,
      conversionRate: 0,
    }
  }
}

// Progress circle component
function ProgressCircle({ progress, size = 40 }: { progress: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

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

  const analyticsData = await fetchAnalyticsSummary(supabase, creator.id)

  const { data: products } = await supabase.from("products").select("id, status").eq("creator_id", creator.id)
  const productIds = products?.map((p: any) => p.id) || []
  const hasProducts = (products?.length || 0) > 0
  const hasPublishedProduct = products?.some((p: any) => p.status === "published") || false

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

  // Total orders and revenue (all time)
  let totalOrders = 0
  let totalRevenue = 0
  if (productIds.length > 0) {
    const { data: allOrders } = await supabase
      .from("orders")
      .select("amount_cents")
      .eq("status", "completed")
      .in("product_id", productIds)

    totalOrders = allOrders?.length || 0
    totalRevenue = allOrders?.reduce((acc: number, o: any) => acc + (o?.amount_cents || 0), 0) || 0
  }

  const totalViews = analyticsData.totalViews
  const conversionRate = analyticsData.conversionRate
  const sales7d = analyticsData.sales7d
  const revenue7d = analyticsData.revenue7d

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Branding check: has avatar, name, and bio
  const hasBranding = !!(profile?.avatar_url || creator.avatar_url) &&
                      !!(profile?.display_name || creator.display_name) &&
                      !!creator.bio

  // First sale check
  const hasFirstSale = totalOrders > 0

  // Setup checklist - 6 steps
  const setupSteps = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Account created",
      tooltip: "This step is completed automatically when your account is created.",
      icon: User,
      completed: true, // Always true - account exists
      href: "/app/settings",
    },
    {
      id: "branding",
      title: "Branding",
      description: "Set your name, image, and bio",
      tooltip: "Add a profile image, choose your name, and write a short bio. This appears on your store, OnePage, and public profile.",
      icon: Palette,
      completed: hasBranding,
      href: "/app/settings",
    },
    {
      id: "product",
      title: "Create your first product",
      description: "Add something people can buy",
      tooltip: "Create a digital product, service, or paid link. You need at least one product to start selling.",
      icon: Package,
      completed: hasProducts,
      href: "/app/products/new",
    },
    {
      id: "payouts",
      title: "Set up payouts",
      description: "Connect a payment method",
      tooltip: "Connect your payment account so you can receive money from sales.",
      icon: CreditCard,
      completed: hasPayoutsSetup,
      href: "/app/payouts",
    },
    {
      id: "onepage",
      title: "Create your OnePage",
      description: "Build your public page",
      tooltip: "Your OnePage is your main link. Add links, products, and content people will see first.",
      icon: Link2,
      completed: hasOnePage && hasOnePageBlock,
      href: "/app/onepage",
    },
    {
      id: "sale",
      title: "Make your first sale",
      description: "Share your link and sell",
      tooltip: "Share your OnePage or store link. This step completes when your first sale comes in.",
      icon: Trophy,
      completed: hasFirstSale,
      href: "/app/sales",
    },
  ]

  const completedSteps = setupSteps.filter((s) => s.completed).length
  const totalSteps = setupSteps.length
  const allCompleted = completedSteps === totalSteps

  const displayName = profile?.display_name || creator.display_name || "there"

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] sm:text-[26px] font-semibold text-neutral-800 tracking-tight">
            Welcome back, {displayName}
          </h1>
          <p className="text-[14px] text-neutral-500 mt-0.5">Here's what's happening with your store</p>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
          {/* Total Views */}
          <div className="bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-neutral-500">Total Views</span>
              <Eye className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="text-[24px] sm:text-[28px] font-semibold text-neutral-800 tracking-tight">
              {totalViews.toLocaleString()}
            </div>
            <p className="text-[12px] text-neutral-400 mt-1">{totalViews.toLocaleString()} last 7 days</p>
          </div>

          {/* Total Orders */}
          <div className="bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-neutral-500">Total Orders</span>
              <ShoppingCart className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="text-[24px] sm:text-[28px] font-semibold text-neutral-800 tracking-tight">
              {totalOrders.toLocaleString()}
            </div>
            <p className="text-[12px] text-neutral-400 mt-1">{sales7d.toLocaleString()} last 7 days</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-neutral-500">Total Revenue</span>
              <DollarSign className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="text-[24px] sm:text-[28px] font-semibold text-neutral-800 tracking-tight">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-[12px] text-neutral-400 mt-1">{formatCurrency(revenue7d)} last 7 days</p>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-neutral-500">Conversion Rate</span>
              <TrendingUp className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="text-[24px] sm:text-[28px] font-semibold text-neutral-800 tracking-tight">
              {conversionRate.toFixed(2)}%
            </div>
            <p className="text-[12px] text-neutral-400 mt-1">Views to orders</p>
          </div>
        </div>

        {/* Store Setup Section */}
        {!allCompleted && (
          <div className="bg-white rounded-2xl border border-neutral-200/60 p-5 sm:p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[16px] font-semibold text-neutral-800">Store setup</h2>
                <span className="text-[13px] text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                  {completedSteps}/{totalSteps}
                </span>
              </div>
            </div>

            {/* Steps Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {setupSteps.map((step) => {
                const Icon = step.icon
                const stepProgress = step.completed ? 100 : 0

                return (
                  <Link
                    key={step.id}
                    href={step.href}
                    className="group relative flex items-start gap-3 p-4 rounded-xl border border-neutral-200/60 bg-neutral-50/50 hover:bg-white hover:border-violet-200 hover:shadow-sm transition-all duration-200"
                    title={step.tooltip}
                  >
                    {/* Progress circle or checkmark */}
                    <div className="relative shrink-0">
                      {step.completed ? (
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                          <Check className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
                        </div>
                      ) : (
                        <div className="relative">
                          <ProgressCircle progress={stepProgress} size={40} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-neutral-400" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-medium ${step.completed ? "text-emerald-700" : "text-neutral-800"}`}>
                        {step.title}
                      </p>
                      <p className="text-[12px] text-neutral-500 mt-0.5 truncate">{step.description}</p>
                    </div>

                    {/* Arrow on hover */}
                    {!step.completed && (
                      <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-violet-500 shrink-0 mt-0.5 transition-colors" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-6">
          <h2 className="text-[16px] font-semibold text-neutral-800 mb-4">Quick actions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/app/products/new"
              className="group flex items-center gap-4 bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm hover:border-violet-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 group-hover:bg-violet-100 transition-colors">
                <Package className="h-6 w-6 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-neutral-800 group-hover:text-violet-700 transition-colors">Add a product</p>
                <p className="text-[12px] text-neutral-500">Go from idea to product offer in minutes</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-violet-500 transition-colors" />
            </Link>

            <Link
              href="/app/onepage"
              className="group flex items-center gap-4 bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm hover:border-violet-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors">
                <Link2 className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-neutral-800 group-hover:text-blue-700 transition-colors">Edit your OnePage</p>
                <p className="text-[12px] text-neutral-500">Customize your link-in-bio</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-blue-500 transition-colors" />
            </Link>

            <Link
              href="/app/analytics"
              className="group flex items-center gap-4 bg-white rounded-2xl border border-neutral-200/60 p-4 sm:p-5 shadow-sm hover:border-violet-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-neutral-800 group-hover:text-emerald-700 transition-colors">View analytics</p>
                <p className="text-[12px] text-neutral-500">See how your store is performing</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-emerald-500 transition-colors" />
            </Link>
          </div>
        </div>

        {/* All setup completed celebration */}
        {allCompleted && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-200/60 p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                <Trophy className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-neutral-800">You're all set up!</h3>
                <p className="text-[13px] text-neutral-600 mt-0.5">
                  Your store is ready to go. Keep creating products and sharing your links to grow your audience.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

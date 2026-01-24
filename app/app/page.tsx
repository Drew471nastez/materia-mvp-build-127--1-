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
  ArrowRight,
  Sparkles,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react"
import { TimeFrameSelector } from "@/components/app/time-frame-selector"

export const dynamic = "force-dynamic"

// Helper function for analytics API calls with proper auth
async function fetchAnalyticsSummary(supabase: any, creatorId: string, days: number) {
  try {
    const { data: products } = await supabase.from("products").select("id").eq("creator_id", creatorId)
    const productIds = products?.map((p: any) => p.id) || []

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
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
        sales: 0,
        revenue: 0,
        conversionRate: 0,
      }
    }

    const { data: orders } = await ordersQuery

    const sales = orders?.length || 0
    const revenue = orders?.reduce((sum: number, o: any) => sum + (o?.amount_cents || 0), 0) || 0

    let conversionRate = 0
    if (totalViews > 0) {
      conversionRate = (sales / totalViews) * 100
    }

    return {
      totalViews,
      sales,
      revenue,
      conversionRate: Number(conversionRate.toFixed(2)),
    }
  } catch (error) {
    console.error("[Dashboard] Error fetching analytics summary:", error)
    return {
      totalViews: 0,
      sales: 0,
      revenue: 0,
      conversionRate: 0,
    }
  }
}

// Progress circle component with purple accent
function ProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 2.5
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
        stroke="#f3f4f6"
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

// Map time frame to days
function getTimeFrameDays(timeFrame: string): number {
  switch (timeFrame) {
    case "today":
      return 1
    case "48h":
      return 2
    case "7d":
      return 7
    case "30d":
      return 30
    case "this_month":
      return new Date().getDate()
    case "90d":
      return 90
    case "365d":
      return 365
    case "last_year":
      return 365
    default:
      return 7
  }
}

// Get time frame label
function getTimeFrameLabel(timeFrame: string): string {
  switch (timeFrame) {
    case "today":
      return "today"
    case "48h":
      return "last 48 hours"
    case "7d":
      return "last 7 days"
    case "30d":
      return "last 30 days"
    case "this_month":
      return "this month"
    case "90d":
      return "last 90 days"
    case "365d":
      return "last 365 days"
    case "last_year":
      return "last year"
    default:
      return "last 7 days"
  }
}

export default async function AppDashboard({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const timeFrame = (params.timeframe as string) || "7d"
  const days = getTimeFrameDays(timeFrame)
  const timeFrameLabel = getTimeFrameLabel(timeFrame)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const { data: profile } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single()

  const analyticsData = await fetchAnalyticsSummary(supabase, creator.id, days)

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

  // Setup checklist - 6 steps with detailed tooltips
  const setupSteps = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Account created",
      tooltip: "This step is completed automatically when your account is created.",
      icon: User,
      completed: true,
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
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Here's what's happening with your store</p>
          </div>
          <TimeFrameSelector currentTimeFrame={timeFrame} />
        </div>

        {/* Stats Cards - Clean, minimal design */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          {/* Total Views */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Views</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <Eye className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.totalViews.toLocaleString()}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">{analyticsData.totalViews.toLocaleString()} {timeFrameLabel}</p>
          </div>

          {/* Total Orders */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Orders</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.sales.toLocaleString()}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">{analyticsData.sales.toLocaleString()} {timeFrameLabel}</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {formatCurrency(analyticsData.revenue)}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">{formatCurrency(analyticsData.revenue)} {timeFrameLabel}</p>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Conversion Rate</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.conversionRate.toFixed(2)}%
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">Views to orders</p>
          </div>
        </div>

        {/* Storelib Banner - Like Shopify Editions */}
        <div className="hidden lg:block mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1a1a2e] via-[#2d2d44] to-[#1a1a2e] h-[140px]">
            {/* Background image */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: "url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a2e]/90 via-[#1a1a2e]/70 to-transparent" />

            {/* Content */}
            <div className="relative h-full flex items-center px-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-medium text-white/70">Storelib</span>
                  <span className="text-white/40">|</span>
                  <span className="text-[13px] font-medium text-white/70">2026 Edition</span>
                </div>
                <h3 className="text-[20px] font-semibold text-white mb-3">
                  The creator economy is here.
                </h3>
                <div className="flex items-center gap-3">
                  <Link
                    href="/upgrade"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-[13px] font-medium text-[#1a1a2e] hover:bg-white/90 transition-colors"
                  >
                    Explore features
                  </Link>
                  <Link
                    href="/help"
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 rounded-lg text-[13px] font-medium text-white/90 hover:bg-white/20 transition-colors border border-white/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    What's new
                  </Link>
                </div>
              </div>

              {/* Right side decorative image */}
              <div className="hidden xl:block w-[200px] h-full relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[180px] h-[100px] rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                  <img
                    src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
                    alt="Storelib"
                    className="h-12 w-12 opacity-80"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          {!allCompleted && (
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Store setup</h2>
                <span className="text-[13px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">
                  {completedSteps}/{totalSteps}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>

              {/* Steps List */}
              <div className="space-y-1">
                {setupSteps.map((step) => {
                  const Icon = step.icon

                  return (
                    <Link
                      key={step.id}
                      href={step.href}
                      className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-[#f9fafb] transition-all duration-150"
                      title={step.tooltip}
                    >
                      {/* Checkmark or Progress circle */}
                      <div className="relative shrink-0">
                        {step.completed ? (
                          <div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                          </div>
                        ) : (
                          <div className="relative">
                            <ProgressCircle progress={0} size={32} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-medium ${step.completed ? "text-[#8b5cf6]" : "text-[#1a1a2e]"}`}>
                          {step.title}
                        </p>
                        <p className="text-[11px] text-[#9ca3af] mt-0.5 truncate">{step.description}</p>
                      </div>

                      {/* Arrow on hover for incomplete steps */}
                      {!step.completed && (
                        <ChevronRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] shrink-0 transition-colors" />
                      )}

                      {/* Tooltip on hover - hidden on mobile */}
                      <div className="hidden lg:block absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                        <div className="bg-[#1a1a2e] text-white text-[11px] px-3 py-2 rounded-lg shadow-lg max-w-[200px] whitespace-normal">
                          {step.tooltip}
                          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#1a1a2e]" />
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Right Column - Quick Actions */}
          <div className="space-y-4">
            {/* Add a product card */}
            <Link
              href="/app/products/new"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe]">
                <Package className="h-6 w-6 text-[#8b5cf6]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">Add a product</p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Go from idea to product offer in minutes</p>
              </div>
              <div className="hidden sm:block w-20 h-20 rounded-xl bg-gradient-to-br from-[#f9fafb] to-[#f3f4f6] overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-[#d1d5db]" />
                </div>
              </div>
            </Link>

            {/* Market your products card */}
            <Link
              href="/app/onepage"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5]">
                <Link2 className="h-6 w-6 text-[#10b981]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">Edit your OnePage</p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Customize your link-in-bio page</p>
              </div>
            </Link>

            {/* View analytics card */}
            <Link
              href="/app/analytics"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#fef3c7] to-[#fde68a]">
                <TrendingUp className="h-6 w-6 text-[#f59e0b]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">View analytics</p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">See how your store is performing</p>
              </div>
            </Link>
          </div>
        </div>

        {/* All setup completed celebration */}
        {allCompleted && (
          <div className="mt-6 bg-gradient-to-r from-[#f5f3ff] via-[#ede9fe] to-[#f5f3ff] rounded-2xl border border-[#8b5cf6]/20 p-6">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#8b5cf6]">
                <Trophy className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] font-semibold text-[#1a1a2e]">You're all set up!</h3>
                  <Sparkles className="h-5 w-5 text-[#8b5cf6]" />
                </div>
                <p className="text-[14px] text-[#6b7280] mt-1">
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

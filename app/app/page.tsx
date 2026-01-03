import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  DollarSign,
  Package,
  Users,
  ArrowRight,
  Eye,
  ExternalLink,
  TrendingUp,
  Check,
  Sparkles,
  Palette,
  UserPlus,
  CreditCard,
  Banknote,
  Share2,
  Zap,
  ShoppingCart,
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

    /**
     * ✅ Views (DEDUPED) — must match analytics page logic
     * - use visitor_id when available (more stable than session_id)
     * - fallback to session_id
     * - key includes product_id OR "store" for null product_id
     */
    const viewsQuery = supabase
      .from("analytics_events")
      .select("id, visitor_id, session_id, product_id, created_at")
      .eq("creator_id", creatorId)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    // Homepage should behave like analytics "All products":
    // do NOT filter product_id, because store/profile views have product_id = null
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

    /**
     * ✅ Orders (last 7 days) — scoped ONLY to this creator's products
     */
    let ordersQuery = supabase
      .from("orders")
      .select("amount_cents")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    // Scope to this creator's products, otherwise you're counting platform-wide orders
    if (productIds.length > 0) {
      ordersQuery = ordersQuery.in("product_id", productIds)
    } else {
      // No products for this creator => no orders
      const sales7d = 0
      const revenue7d = 0
      const conversionRate = 0

      return {
        totalViews,
        sales7d,
        revenue7d,
        conversionRate,
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
    console.error("[v0] Error fetching analytics summary:", error)
    return {
      totalViews: 0,
      sales7d: 0,
      revenue7d: 0,
      conversionRate: 0,
    }
  }
}

export default async function AppDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("*, views").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const { data: profile } = await supabase.from("profiles").select("username, display_name").eq("id", user.id).single()

  const analyticsData = await fetchAnalyticsSummary(supabase, creator.id)

  const { data: products } = await supabase.from("products").select("id").eq("creator_id", creator.id)
  const productIds = products?.map((p: any) => p.id) || []

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

  // Getting started checklist
  const hasProducts = (products?.length || 0) > 0
  const storeUsername = profile?.username || creator.slug

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://v0-materia-mvp-build.vercel.app"
  const storeUrl = storeUsername ? `${baseUrl}/u/${storeUsername}` : `${baseUrl}/app/settings`

  const gettingStartedCards = [
    {
      id: "welcome",
      title: "Welcome aboard",
      description: "Complete your profile",
      icon: Sparkles,
      completed: true,
      href: "/app/settings",
    },
    {
      id: "impression",
      title: "Make an impression",
      description: "Customize your storefront",
      icon: Palette,
      completed: !!creator.bio || !!creator.headline,
      href: "/app/settings",
    },
    {
      id: "showtime",
      title: "Showtime",
      description: "Create your first product",
      icon: Package,
      completed: hasProducts,
      href: "/app/products/new",
    },
    {
      id: "tribe",
      title: "Build your tribe",
      description: "Publish your store",
      icon: UserPlus,
      completed: creator.store_published,
      href: "/app/settings",
    },
    {
      id: "chaching",
      title: "Cha-ching",
      description: "Make your first sale",
      icon: CreditCard,
      completed: totalOrders > 0,
      href: "/app/orders",
    },
    {
      id: "money",
      title: "Money inbound",
      description: "Set up payouts",
      icon: Banknote,
      completed: false,
      href: "/app/settings",
    },
    {
      id: "waves",
      title: "Making waves",
      description: "Share your products",
      icon: Share2,
      completed: false,
      href: storeUsername ? `/u/${storeUsername}` : "/app/settings",
    },
    {
      id: "smart",
      title: "Smart move",
      description: "Set up automations",
      icon: Zap,
      completed: false,
      href: "/app/workflows",
    },
  ]

  const completedCount = gettingStartedCards.filter((c) => c.completed).length

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-muted-foreground">Here's what's happening with your store</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Card className="border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{totalViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalViews.toLocaleString()} last 7 days</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{totalOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{sales7d.toLocaleString()} last 7 days</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(revenue7d)} last 7 days</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{conversionRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Views to orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Getting Started Grid */}
      {completedCount < gettingStartedCards.length && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Getting started</h2>
            <span className="text-sm text-muted-foreground">
              {completedCount} of {gettingStartedCards.length} complete
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gettingStartedCards.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className={`group relative flex flex-col rounded-lg border p-4 transition-all hover:shadow-md ${
                    card.completed ? "border-green-200 bg-green-50/50" : "border-border bg-white hover:border-blue-200"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        card.completed ? "bg-green-100" : "bg-muted"
                      }`}
                    >
                      {card.completed ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    {!card.completed && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </div>
                  <p className={`font-medium ${card.completed ? "text-green-700" : "text-foreground"}`}>{card.title}</p>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Large Banner - Share Your Store */}
      {creator.store_published && storeUsername && (
        <Card className="mb-8 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">Your store is live!</h3>
              <p className="text-muted-foreground">Share your store link with your audience</p>

              <p className="mt-2 font-mono text-sm text-blue-600 break-all">{storeUrl}</p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto bg-transparent" asChild>
                <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Store
                </a>
              </Button>

              <Button className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto" asChild>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my store: ${storeUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/app/products/new"
          className="flex items-center gap-4 rounded-lg border border-border bg-white p-4 transition-all hover:border-blue-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
            <Package className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-foreground">Create product</p>
            <p className="text-sm text-muted-foreground">Digital download</p>
          </div>
        </Link>

        <Link
          href="/app/courses/new"
          className="flex items-center gap-4 rounded-lg border border-border bg-white p-4 transition-all hover:border-blue-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
            <TrendingUp className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="font-medium text-foreground">Create course</p>
            <p className="text-sm text-muted-foreground">Video lessons</p>
          </div>
        </Link>

        <Link
          href="/app/community"
          className="flex items-center gap-4 rounded-lg border border-border bg-white p-4 transition-all hover:border-blue-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50">
            <Users className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-medium text-foreground">Post to community</p>
            <p className="text-sm text-muted-foreground">Engage your audience</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

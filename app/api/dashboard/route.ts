import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { startTimer, logSlowRequest } from "@/lib/perf"
import { creatorPageHostFromRows } from "@/lib/custom-domains/client"
import { timed } from "@/lib/perf/server-timing"

/**
 * GET /api/dashboard
 *
 * Consolidated dashboard endpoint — returns all data the creator dashboard
 * needs in a single HTTP request instead of 6+ separate round-trips.
 *
 * Returns: creator info, products, orders summary, setup progress, and
 * quick analytics snapshot (last 7 days).
 */
async function handleGET(request: NextRequest) {
  const timer = startTimer()
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1. Fetch creator (needed for everything else)
    const { data: creator } = await admin
      .from("creators")
      .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, stripe_onboarding_status, stripe_account_id, store_published, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // 2. Fire ALL independent queries in parallel (single round-trip batch)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      { data: profile },
      { data: products },
      { data: onepage },
      { data: activeDomains },
      { data: recentViews },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .single(),
      admin
        .from("products")
        .select("id, title, status, thumbnail_url, price_cents, sales_count, created_at")
        .eq("creator_id", creator.id),
      admin
        .from("onepages")
        .select("id, status, draft_blocks, bio, avatar_url, title")
        .eq("owner_id", user.id)
        .maybeSingle(),
      admin
        .from("custom_domains")
        /* Every live domain, not maybeSingle: a creator can have several now, and
           one row too many read as none. The creator page's is picked below. */
        .select("*")
        .eq("creator_id", creator.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      // Quick analytics: views in last 7 days
      admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("event_type", "view")
        .gte("created_at", sevenDaysAgo.toISOString()),
    ])

    const productIds = products?.map((p: any) => p.id) || []
    const hasProducts = productIds.length > 0

    // 3. Fetch orders (depends on productIds)
    let totalOrders = 0
    let totalRevenue = 0
    let recentOrderCount = 0

    if (hasProducts) {
      const [
        { data: allOrders },
        /* A head:true count query has no rows: the number is in `count`. */
        { count: recentOrders },
      ] = await Promise.all([
        admin
          .from("orders")
          .select("id, amount_cents, status")
          .in("product_id", productIds)
          .in("status", ["completed", "refunded"]),
        admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("product_id", productIds)
          .eq("status", "completed")
          .gte("created_at", sevenDaysAgo.toISOString()),
      ])

      const completedOrders = allOrders?.filter(o => o.status === "completed") || []
      totalOrders = allOrders?.length || 0
      totalRevenue = completedOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0)
      recentOrderCount = recentOrders || 0
    }

    // 4. Compute setup steps
    const hasOnePage = !!onepage
    const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1
    const hasPayoutsSetup = creator.payouts_enabled === true || creator.stripe_onboarding_status === "connected"
    const hasAvatar = !!(profile?.avatar_url || creator.avatar_url || onepage?.avatar_url)
    const hasName = !!(profile?.display_name || creator.display_name || profile?.username || creator.username || creator.slug)
    const hasBio = !!(creator.bio || onepage?.bio)
    const hasBranding = hasAvatar && hasName && hasBio
    const hasFirstSale = totalOrders > 0

    const setupSteps = [
      { id: "welcome", completed: true },
      { id: "branding", completed: hasBranding },
      { id: "product", completed: hasProducts },
      { id: "payouts", completed: hasPayoutsSetup },
      { id: "onepage", completed: hasOnePage && hasOnePageBlock },
      { id: "sale", completed: hasFirstSale },
    ]

    const displayName = profile?.display_name || creator.display_name || "there"

    logSlowRequest(timer, request)

    return NextResponse.json({
      creator: {
        id: creator.id,
        slug: creator.slug,
        displayName,
        handle: profile?.username || creator.slug || "",
        avatarUrl: profile?.avatar_url || creator.avatar_url || onepage?.avatar_url || null,
        storePublished: creator.store_published,
        stripeConnected: !!creator.stripe_account_id,
        subscriptionPlanId: creator.subscription_plan_id || "free",
        connectedDomain: creatorPageHostFromRows(activeDomains),
      },
      products: {
        total: products?.length || 0,
        published: products?.filter((p: any) => p.status === "published").length || 0,
        items: products?.slice(0, 5).map((p: any) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          thumbnailUrl: p.thumbnail_url,
          priceCents: p.price_cents,
          salesCount: p.sales_count || 0,
        })) || [],
      },
      orders: {
        totalOrders,
        totalRevenue,
        recentOrders: recentOrderCount,
      },
      analytics: {
        recentViews: recentViews || 0,
        recentOrders: recentOrderCount,
      },
      setupSteps,
      setupProgress: {
        completed: setupSteps.filter(s => s.completed).length,
        total: setupSteps.length,
      },
    })
  } catch (error) {
    logSlowRequest(timer, request, { error: "exception" })
    console.error("[dashboard] API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}

/* Timed for /admin/performance, one request in five (lib/perf/server-timing.ts). */
export const GET = timed("app", "/api/dashboard", handleGET)

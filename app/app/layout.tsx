import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar } from "@/components/app/sidebar"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { Toaster } from "@/components/ui/toaster"
import { NativeAuthGate } from "@/components/native-auth-gate"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch creator first (needed for redirect decision and as FK for later queries)
  const { data: creator } = await supabase
    .from("creators")
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, stripe_onboarding_status, stripe_account_id, store_published")
    .eq("user_id", user.id)
    .maybeSingle()

  // No creator record or onboarding not completed - redirect to welcome selection
  if (!creator || creator.onboarding_completed !== true) {
    redirect("/signup/success")
  }

  // Fire all independent queries in parallel
  const [
    { data: profile },
    { data: onepage },
    { data: storeConfig },
    { data: products },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, username")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("onepages")
      .select("id, avatar_url, published, draft_blocks, bio")
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("store_builder_configs")
      .select("published_config")
      .eq("creator_id", user.id)
      .eq("page_type", "shop")
      .maybeSingle(),
    supabase.from("products").select("id").eq("creator_id", creator.id),
  ])

  const storeBuilderAvatar = (storeConfig?.published_config as Record<string, unknown>)?.headerSettings
    ? ((storeConfig?.published_config as Record<string, unknown>)?.headerSettings as Record<string, unknown>)?.avatarUrl as string | null
    : null

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

  // Avatar fallback order: Profile (manually set) → Store Builder → OnePage → Google → Initials
  const rawAvatarUrl = profile?.avatar_url || storeBuilderAvatar || onepage?.avatar_url || googleAvatar || null
  const avatarUrl = rawAvatarUrl && !rawAvatarUrl.includes("placeholder.svg") ? rawAvatarUrl : null

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || creator.slug

  const hasProducts = (products?.length || 0) > 0
  const productIds = products?.map((p: any) => p.id) || []

  // Check for Stripe connection — read from creators table (source of truth)
  const hasPayoutsSetup = creator.payouts_enabled === true || creator.stripe_onboarding_status === "connected"

  // OnePage check
  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Branding check — check each item independently, including onepage data
  const hasBranding = !!(profile?.avatar_url || creator.avatar_url || onepage?.avatar_url) &&
                      !!(profile?.display_name || creator.display_name || profile?.username || creator.username || creator.slug) &&
                      !!(creator.bio || onepage?.bio)

  // First sale check — single query with limit 1 (very fast with idx_orders_product_status index)
  let hasFirstSale = false
  if (productIds.length > 0) {
    const { data: allOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "completed")
      .in("product_id", productIds)
      .limit(1)
    hasFirstSale = (allOrders?.length || 0) > 0
  }

  // Setup steps calculation
  const setupSteps = [
    { id: "welcome", completed: true },
    { id: "branding", completed: hasBranding },
    { id: "product", completed: hasProducts },
    { id: "payouts", completed: hasPayoutsSetup },
    { id: "onepage", completed: hasOnePage && hasOnePageBlock },
    { id: "sale", completed: hasFirstSale },
  ]

  const completedSteps = setupSteps.filter(s => s.completed).length
  const totalSteps = setupSteps.length

  return (
    <NativeAuthGate>
    <AppLayoutWrapper>
      <div className="min-h-svh overflow-x-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
        <AppSidebar
          creatorSlug={creator.slug}
          username={profile?.username || creator.slug}
          storePublished={creator.store_published}
          avatarUrl={avatarUrl}
          displayName={displayName}
          stripeConnected={!!creator.stripe_account_id}
          stripeStatus={creator.stripe_onboarding_status || "not_connected"}
          onePagePublished={!!onepage}
          setupProgress={{ completed: completedSteps, total: totalSteps }}
        />
        <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[58px] md:pl-[220px] bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
          <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">{children}</div>
        </main>
        <Toaster />
      </div>
    </AppLayoutWrapper>
    </NativeAuthGate>
  )
}

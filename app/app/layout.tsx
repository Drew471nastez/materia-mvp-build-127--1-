import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar } from "@/components/app/sidebar"

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

  // Check for creator record with onboarding completed - database is the source of truth
  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  // No creator record or onboarding not completed - redirect to welcome selection
  if (!creator || creator.onboarding_completed !== true) {
    redirect("/signup/success")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username")
    .eq("id", user.id)
    .maybeSingle()

  const { data: onepage } = await supabase
    .from("onepages")
    .select("id, avatar_url, published, draft_blocks")
    .eq("owner_id", user.id)
    .maybeSingle()

  const { data: storeConfig } = await supabase
    .from("store_builder_configs")
    .select("published_config")
    .eq("creator_id", user.id)
    .eq("page_type", "shop")
    .maybeSingle()

  const storeBuilderAvatar = (storeConfig?.published_config as Record<string, unknown>)?.headerSettings
    ? ((storeConfig?.published_config as Record<string, unknown>)?.headerSettings as Record<string, unknown>)?.avatarUrl as string | null
    : null

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

  const rawAvatarUrl = profile?.avatar_url || onepage?.avatar_url || storeBuilderAvatar || googleAvatar || null
  const avatarUrl = rawAvatarUrl && !rawAvatarUrl.includes("placeholder.svg") ? rawAvatarUrl : null

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || creator.slug

  // Calculate setup steps for the sidebar widget
  const { data: products } = await supabase.from("products").select("id").eq("creator_id", creator.id)
  const hasProducts = (products?.length || 0) > 0
  const productIds = products?.map((p: any) => p.id) || []

  // Check for Stripe connection
  const { data: stripeAccount } = await supabase
    .from("stripe_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle()
  const hasPayoutsSetup = stripeAccount?.payouts_enabled === true

  // OnePage check
  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Branding check
  const hasBranding = !!(profile?.avatar_url || creator.avatar_url) &&
                      !!(profile?.display_name || creator.display_name) &&
                      !!creator.bio

  // First sale check
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
    <div className="min-h-svh overflow-x-hidden bg-[#111111] md:bg-white">
      <AppSidebar
        creatorSlug={creator.slug}
        storePublished={creator.store_published}
        avatarUrl={avatarUrl}
        displayName={displayName}
        stripeConnected={!!creator.stripe_account_id}
        stripeStatus={creator.stripe_onboarding_status || "not_connected"}
        onePagePublished={onepage?.published || false}
        setupProgress={{ completed: completedSteps, total: totalSteps }}
      />
      <main className="h-svh pt-[68px] md:pl-[220px] md:pt-0 bg-white rounded-t-[20px] md:rounded-none overflow-hidden">
        <div className="h-[calc(100svh-68px)] md:h-svh overflow-hidden">{children}</div>
      </main>
    </div>
  )
}

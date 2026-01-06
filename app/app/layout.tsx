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

  const { data: creator } = await supabase
    .from("creators")
    .select("slug, store_published")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/onboarding")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single()

  const { data: onepage } = await supabase
    .from("onepages")
    .select("avatar_url")
    .eq("seller_id", user.id)
    .single()

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

  const avatarUrl = profile?.avatar_url || onepage?.avatar_url || storeBuilderAvatar || googleAvatar || null

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || creator.slug

  return (
    <div className="min-h-svh overflow-x-hidden">
      <AppSidebar
        creatorSlug={creator.slug}
        storePublished={creator.store_published}
        avatarUrl={avatarUrl}
        displayName={displayName}
      />
      <main className="min-h-svh pt-14 md:pl-[220px] md:pt-0">
        <div className="min-h-[calc(100svh-3.5rem)] md:min-h-svh px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </main>
    </div>
  )
}

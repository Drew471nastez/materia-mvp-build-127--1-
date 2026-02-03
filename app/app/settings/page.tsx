import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SettingsFormNew } from "@/components/app/settings-form-new"

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle()

  if (!creator) redirect("/onboarding")

  // Fetch OnePage data for avatar fallback (use owner_id to match layout.tsx)
  const { data: onepage } = await supabase
    .from("onepages")
    .select("avatar_url")
    .eq("owner_id", user.id)
    .maybeSingle()

  // Fetch Store Builder avatar
  const { data: storeConfig } = await supabase
    .from("store_builder_configs")
    .select("published_config")
    .eq("creator_id", user.id)
    .eq("page_type", "shop")
    .maybeSingle()

  const storeBuilderAvatarUrl = (storeConfig?.published_config as Record<string, unknown>)?.headerSettings
    ? ((storeConfig?.published_config as Record<string, unknown>)?.headerSettings as Record<string, unknown>)?.avatarUrl as string | null
    : null

  // Get Google avatar from user metadata (if authenticated with Google)
  const googleAvatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

  let finalProfile = profile
  if (!finalProfile) {
    const { data: newProfile } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email || "",
        display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "User",
        is_creator: true,
      })
      .select()
      .single()

    finalProfile = newProfile
  }

  const safeProfile = finalProfile || {
    id: user.id,
    email: user.email || "",
    display_name: user.user_metadata?.display_name || "User",
    avatar_url: null,
    username: null,
    is_creator: true,
    role: "user" as const,
    created_at: new Date().toISOString(),
  }

  return (
    <SettingsFormNew
      profile={safeProfile}
      creator={creator}
      storeBuilderAvatarUrl={storeBuilderAvatarUrl}
      onepageAvatarUrl={onepage?.avatar_url || null}
      googleAvatarUrl={googleAvatarUrl}
    />
  )
}

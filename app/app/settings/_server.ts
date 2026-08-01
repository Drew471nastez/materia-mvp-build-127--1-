import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export type SettingsTab = "general" | "security" | "privacy" | "billing" | "payments" | "stores"

/**
 * Shared loader for both settings surfaces.
 *
 * `requireCreator` exists because the two callers want opposite things from a
 * missing `creators` row. /app/settings is the seller dashboard's own settings
 * screen and SettingsFormNew dereferences `creator` directly (slug, id,
 * avatar_url, headline), so someone with no creator row genuinely belongs in
 * onboarding there. The marketplace /settings passes false: it is where the
 * Profile tab's gear lands, and redirecting a buyer who has never listed
 * anything out of their own account settings is precisely the bug that made
 * that tab look broken. It returns `creator: null` and the page decides what to
 * render around it.
 */
export async function loadSettingsData({ requireCreator = true }: { requireCreator?: boolean } = {}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle()

  if (!creator && requireCreator) redirect("/onboarding")

  const { data: onepage } = await supabase
    .from("onepages")
    .select("avatar_url")
    .eq("owner_id", user.id)
    .maybeSingle()

  const { data: storeConfig } = creator
    ? await supabase
        .from("store_builder_configs")
        .select("published_config, draft_config")
        .eq("creator_id", creator.id)
        .eq("page_type", "shop")
        .maybeSingle()
    : { data: null }

  // Check published_config first, then fall back to draft_config for avatar
  const publishedHeader = (storeConfig?.published_config as Record<string, unknown>)?.headerSettings as Record<string, unknown> | undefined
  const draftHeader = (storeConfig?.draft_config as Record<string, unknown>)?.headerSettings as Record<string, unknown> | undefined
  const storeBuilderAvatarUrl = (publishedHeader?.avatarUrl as string | null) || (draftHeader?.avatarUrl as string | null) || null

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

  return {
    profile: safeProfile,
    creator,
    storeBuilderAvatarUrl,
    onepageAvatarUrl: onepage?.avatar_url || null,
    googleAvatarUrl,
  }
}

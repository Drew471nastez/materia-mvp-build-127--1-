import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { readNewsletter } from "@/lib/account/preferences"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"

export type SettingsTab = "general" | "security" | "privacy" | "billing" | "payments" | "stores"

/**
 * THREE TRIPS, WHERE THERE WERE SIX. The user; then the profile, the creator
 * row and the OnePage together, which need only the user; then the store's
 * header and whether a website is published together, which need the
 * creator's id. They were asked one after another. Each is the query it was,
 * on the caller's own client, so row-level security answers as before. The
 * user is the /app layout's answer, through the per-request cache
 * (lib/auth/request-scope.ts).
 */
export async function loadSettingsData() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time. null, not /login: the /app layout's gate
     recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null

  const [{ data: profile }, { data: creator }, { data: onepage }, newsletter] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("onepages")
      .select("avatar_url")
      .eq("owner_id", user.id)
      .maybeSingle(),
    /* The Privacy tab's newsletter switch: is this account's address on
       Storelib's own list. The table is closed to browsers. */
    (async () => {
      try {
        return await readNewsletter(createAdminClient(), user.email, user.user_metadata?.storelib_newsletter === true)
      } catch {
        return false
      }
    })(),
  ])

  if (!creator) redirect("/onboarding")

  const [{ data: storeConfig }, { data: publishedSite }, websiteHandle] = await Promise.all([
    supabase
      .from("store_builder_configs")
      .select("published_config, draft_config")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
      .maybeSingle(),
    /**
     * PUBLISHED, not "has an install". Every account is seeded with theme
     * installs the first time it opens the website builder, so existence would
     * put an address in Quick access for a site nobody has made.
     */
    supabase
      .from("store_theme_installs")
      .select("id, name")
      .eq("creator_id", creator.id)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    /* The name the website answers to when it has one of its own (set in its
       Domains); null means it is at the username. Fails soft to null. */
    websiteHandleOf(creator.id),
  ])

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

  /* The Privacy tab's recommendations switch: the column, or the choice kept
     on the account while the database has no column for it yet. */
  const column = (safeProfile as { personalized_recommendations?: boolean }).personalized_recommendations
  const personalizedProfile = {
    ...safeProfile,
    personalized_recommendations: typeof column === "boolean" ? column : user.user_metadata?.personalized_recommendations !== false,
  }

  return {
    profile: personalizedProfile,
    creator,
    storeBuilderAvatarUrl,
    onepageAvatarUrl: onepage?.avatar_url || null,
    googleAvatarUrl,
    websitePublished: !!publishedSite,
    /* General shows the published website's address and opens its settings. */
    website: publishedSite
      ? { installId: (publishedSite as { id: string }).id, name: (publishedSite as { name?: string | null }).name ?? null, handle: websiteHandle }
      : { installId: null, name: null, handle: websiteHandle },
    newsletter,
  }
}

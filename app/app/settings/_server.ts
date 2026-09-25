import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { readNewsletter } from "@/lib/account/preferences"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { accountTimeZone } from "@/lib/account/time-zone"

export type SettingsTab = "general" | "security" | "privacy" | "billing" | "payments" | "domains"

/**
 * THREE TRIPS, WHERE THERE WERE SIX. The user; then the profile and the
 * creator row together, which need only the user; then whether a website is
 * published and its address together, which need the creator's id. Each is
 * on the caller's own client, so row-level security answers as before. The
 * user is the /app layout's answer, through the per-request cache
 * (lib/auth/request-scope.ts).
 *
 * The store header's photo, the OnePage's and the Google picture are no
 * longer read: the profile photo is the profile's own (lib/account/avatar).
 */
export async function loadSettingsData() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time. null, not /login: the /app layout's gate
     recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null

  const [{ data: profile }, { data: creator }, newsletter] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle(),
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

  const [{ data: publishedSite }, websiteHandle] = await Promise.all([
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
    /* The account's time zone (lib/account/time-zone): the column, else the one kept on the account. */
    timeZone: accountTimeZone((safeProfile as { timezone?: unknown }).timezone, user.user_metadata),
    websitePublished: !!publishedSite,
    /* General shows the published website's address and opens its settings. */
    website: publishedSite
      ? { installId: (publishedSite as { id: string }).id, name: (publishedSite as { name?: string | null }).name ?? null, handle: websiteHandle }
      : { installId: null, name: null, handle: websiteHandle },
    newsletter,
  }
}

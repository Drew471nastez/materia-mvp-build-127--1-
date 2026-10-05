import { personName } from "@/lib/profile/display-name"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { readNewsletter } from "@/lib/account/preferences"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { accountTimeZone } from "@/lib/account/time-zone"
import { connectedBioPlatforms } from "@/components/app/share/share-data"
import { businessGroup } from "@/lib/businesses/server"
import { groupIds } from "@/lib/businesses/rules"
import { providerFor } from "@/lib/payments/service"

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

  const [{ data: profile }, { data: creator }, { data: onepage }, newsletter, group] = await Promise.all([
    createAdminClient().from("profiles").select("*").eq("id", user.id).maybeSingle(),
    createAdminClient().from("creators").select("*").eq("user_id", user.id).maybeSingle(),
    /* The share pill: whether the OnePage is live, and the platforms it links to. */
    supabase
      .from("onepages")
      .select("status, social_links, instagram, tiktok, youtube")
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
    /*
      The other businesses of this login, if any (lib/businesses). Settings
      needs one thing from them and one only: deleting the login's first
      account takes the rest with it (app/api/auth/delete-account), so the
      confirmation has to say so. Two small reads at most, and a failure
      reads as "no others", which is what almost every account is.
    */
    businessGroup(user.id).catch(() => null),
  ])

  if (!creator) redirect("/onboarding")

  const [{ data: publishedSite }, websiteHandle, { data: pageSocials }] = await Promise.all([
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
    /* The creator page header's socials, for the share pill's "My platforms". Only that path of the config, not the whole page. */
    supabase
      .from("store_builder_configs")
      .select("published:published_config->headerSettings->socialLinks, draft:draft_config->headerSettings->socialLinks")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
      .maybeSingle(),
  ])

  /* The platforms the creator is on: the creator page first, the OnePage second, as the home page reads them (app/app/page.tsx). */
  const oneSocials = (onepage?.social_links as Record<string, string | null> | null) ?? {}
  const sharePlatforms = connectedBioPlatforms({
    creatorPage: ((pageSocials as { published?: unknown; draft?: unknown } | null)?.published ??
      (pageSocials as { published?: unknown; draft?: unknown } | null)?.draft ??
      null) as Parameters<typeof connectedBioPlatforms>[0]["creatorPage"],
    onePage: {
      ...oneSocials,
      instagram: oneSocials.instagram ?? onepage?.instagram ?? null,
      tiktok: oneSocials.tiktok ?? onepage?.tiktok ?? null,
      youtube: oneSocials.youtube ?? onepage?.youtube ?? null,
    },
  })

  let finalProfile = profile
  if (!finalProfile) {
    const { data: newProfile } = await createAdminClient()
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email || "",
        /* Nothing worth calling them stays empty, never a placeholder in the row (lib/profile/display-name). */
        display_name: personName({ name: user.user_metadata?.display_name, meta: user.user_metadata, email: user.email }, "") || null,
        is_creator: true,
      })
      .select()
      .single()

    finalProfile = newProfile
  }

  const safeProfile = finalProfile || {
    id: user.id,
    email: user.email || "",
    display_name: personName({ name: user.user_metadata?.display_name, meta: user.user_metadata, email: user.email }),
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
    onePageLive: onepage?.status === "published",
    sharePlatforms,
    /* General shows the published website's address and opens its settings. */
    website: publishedSite
      ? { installId: (publishedSite as { id: string }).id, name: (publishedSite as { name?: string | null }).name ?? null, handle: websiteHandle }
      : { installId: null, name: null, handle: websiteHandle },
    newsletter,
    /* Businesses of this login that go when this account goes: none unless this account is the login's first. */
    otherStores: group && group.ownerId === user.id ? groupIds(group, user.id).length - 1 : 0,
    /* Who pays this creator: the Payments tab draws Stripe's card, or Storelib Payments on Airwallex (lib/payments). */
    paymentsProvider: await providerFor(creator.id),
  }
}

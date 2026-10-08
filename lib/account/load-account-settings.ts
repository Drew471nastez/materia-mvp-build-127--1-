import "server-only"

import { displayEmail } from "@/lib/businesses/email-alias"
import { readNewsletter } from "@/lib/account/preferences"
import { profileForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { ensureUsername } from "@/lib/profile/ensure-username"
import { readPrivacy } from "@/lib/profile/privacy"
import { accountIsCreator } from "@/lib/profile/account-creator"
import { missingCoverColumn } from "@/lib/profile/cover"
import { readProfileLocation } from "@/lib/profile/location"
import type { ComponentProps } from "react"
import type { AccountSettings } from "@/components/account/account-settings"

const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" }

export type AccountSettingsPayload = ComponentProps<typeof AccountSettings>

export type SettingsSectionKey = "profile" | "account" | "privacy" | "notifications" | "preferences"

/** Same data as app/account/settings/page.tsx, for the overlay and the API route. */
export async function loadAccountSettingsForUser(
  user: { id: string; email?: string | null; created_at: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
  initialSection: SettingsSectionKey = "profile",
): Promise<AccountSettingsPayload> {
  const admin = createAdminClient()
  const locationRead = readProfileLocation(admin, user.id)
  const [profile, bio, access, newsletter, personalized, username, privacy, handleOwner, cover, creator] = await Promise.all([
    profileForRequest(user.id),
    (async () => {
      try {
        const supabase = await createClient()
        const { data, error } = await supabase.from("profiles").select("bio").eq("id", user.id).maybeSingle()
        if (error) return { text: "", supported: !(error.code === "PGRST204" || error.code === "42703") }
        return { text: ((data as { bio?: string | null } | null)?.bio || "").trim(), supported: true }
      } catch {
        return { text: "", supported: false }
      }
    })(),
    sellerAccessForRequest(user.id).catch(() => null),
    (async () => {
      try {
        return await readNewsletter(createAdminClient(), user.email, user.user_metadata?.storelib_newsletter === true)
      } catch {
        return false
      }
    })(),
    (async () => {
      try {
        const { data } = await createAdminClient().from("profiles").select("personalized_recommendations").eq("id", user.id).maybeSingle()
        const column = (data as { personalized_recommendations?: boolean } | null)?.personalized_recommendations
        return typeof column === "boolean" ? column : user.user_metadata?.personalized_recommendations !== false
      } catch {
        return true
      }
    })(),
    ensureUsername(admin, user.id),
    readPrivacy(admin, user.id),
    (async () => {
      try {
        const [creatorRow, page] = await Promise.all([
          admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
          admin.from("onepages").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
        ])
        return !!creatorRow.data || !!page.data
      } catch {
        return false
      }
    })(),
    (async () => {
      try {
        const { data, error } = await admin.from("profiles").select("cover_url").eq("id", user.id).maybeSingle()
        if (error) return { url: null, supported: !missingCoverColumn(error) }
        return { url: ((data as { cover_url?: string | null } | null)?.cover_url || "").trim() || null, supported: true }
      } catch {
        return { url: null, supported: false }
      }
    })(),
    accountIsCreator(user.id),
  ])

  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter(Boolean) as string[]
  const hasPassword = providers.length === 0 || providers.includes("email")
  const via = providers.filter((p) => p !== "email").map((p) => PROVIDER_NAMES[p] ?? p).join(" or ")
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string }

  return {
    userId: user.id,
    email: displayEmail(user.email) || "",
    name: profile?.display_name || meta.full_name || meta.name || "",
    bio: bio.text,
    bioSupported: bio.supported,
    avatarUrl: profile?.avatar_url || null,
    createdAt: user.created_at,
    hasPassword,
    via,
    isSeller: access?.state === "seller",
    newsletter,
    personalized,
    username: username || profile?.username || "",
    usernameEditable: !handleOwner,
    privacy,
    creator,
    cover,
    location: await locationRead,
    initialSection,
  }
}

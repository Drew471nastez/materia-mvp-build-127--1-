import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { pageUser } from "@/lib/auth/page-user"
import { profileForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { readNewsletter } from "@/lib/account/preferences"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { AccountSettings } from "@/components/account/account-settings"
import { ensureUsername } from "@/lib/profile/ensure-username"
import { readPrivacy } from "@/lib/profile/privacy"
import { accountIsCreator } from "@/lib/profile/account-creator"
import { missingCoverColumn } from "@/lib/profile/cover"
import { readProfileLocation } from "@/lib/profile/location"

/** ?section= from a link: the profile's Settings pill (account), "Change" on a hidden list (privacy), straight to Notifications (notifications). */
const SECTION_KEYS = ["profile", "account", "privacy", "notifications", "preferences"] as const
type SectionKey = (typeof SECTION_KEYS)[number]
function sectionFrom(value: unknown): SectionKey {
  return SECTION_KEYS.includes(value as SectionKey) ? (value as SectionKey) : "profile"
}

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Settings" }

/** The sign in methods an account has, by the name a person knows them by. */
const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" }

/**
 * The profile's Settings, read in one round of requests: the profile, the
 * bio, seller access (the delete row says what goes with a store), the
 * newsletter and the recommendations choice. The profile on the person's
 * own client where row level security answers, and the newsletter with the
 * service role because its table is closed to browsers
 * (app/app/settings/_server.ts reads it the same way).
 */
export default async function AccountSettingsRoute({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await pageUser(accountLoginPath("/account/settings"))
  /* Supabase did not answer in time: the layout's gate recovers the session
     in the browser (lib/auth/page-user.ts). */
  if (!user) return null

  const admin = createAdminClient()
  /* Where they are from (run-now part 98): started with the batch below, not in it; unsupported before the part runs, and the fields are then not drawn. */
  const locationRead = readProfileLocation(admin, user.id)
  const [profile, bio, access, newsletter, personalized, username, privacy, handleOwner, cover, { section }, creator] = await Promise.all([
    profileForRequest(user.id),
    /* THE BIO, AND WHETHER THERE IS ANYWHERE TO PUT ONE. profiles.bio comes
       from supabase/sql/RUN_PROFILE_COVER_BIO.sql; where that has not run,
       PostgREST answers "no such column" (PGRST204, or 42703 from Postgres
       itself) and the field is simply not drawn, rather than drawn and then
       failing to save. */
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
    /* Read as the preferences route reads it (app/api/account/preferences):
       the column is private, so the service role, for this person's own row. */
    (async () => {
      try {
        const { data } = await createAdminClient().from("profiles").select("personalized_recommendations").eq("id", user.id).maybeSingle()
        const column = (data as { personalized_recommendations?: boolean } | null)?.personalized_recommendations
        /* A column not there yet reads the choice kept on the account, and on without one. */
        return typeof column === "boolean" ? column : user.user_metadata?.personalized_recommendations !== false
      } catch {
        return true
      }
    })(),
    /* The handle the Username field starts from: made now when they never had one (the account page is a first need). */
    ensureUsername(admin, user.id),
    readPrivacy(admin, user.id),
    /* A store or a OnePage shares the handle as its address, so it moves from /app Settings with them. */
    (async () => {
      try {
        const [creator, page] = await Promise.all([
          admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
          admin.from("onepages").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
        ])
        return !!creator.data || !!page.data
      } catch {
        return false
      }
    })(),
    /* The profile's own cover (lib/profile/cover.ts): the service role, and no field where the column is not there. */
    (async () => {
      try {
        const { data, error } = await admin.from("profiles").select("cover_url").eq("id", user.id).maybeSingle()
        if (error) return { url: null, supported: !missingCoverColumn(error) }
        return { url: ((data as { cover_url?: string | null } | null)?.cover_url || "").trim() || null, supported: true }
      } catch {
        return { url: null, supported: false }
      }
    })(),
    searchParams,
    /* A live store: no activity anywhere, so Privacy has no switch for it (the layout asked the same, cached). */
    accountIsCreator(user.id),
  ])

  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter(Boolean) as string[]
  /* An account that has only ever signed in with Google or Apple has no password to change; it can set one. */
  const hasPassword = providers.length === 0 || providers.includes("email")
  const via = providers.filter((p) => p !== "email").map((p) => PROVIDER_NAMES[p] ?? p).join(" or ")

  return (
    <AccountSettings
      userId={user.id}
      email={user.email || ""}
      name={profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || ""}
      bio={bio.text}
      bioSupported={bio.supported}
      /* The only photo on this screen is Settings' own: the profile header is not drawn here. */
      avatarUrl={profile?.avatar_url || null}
      createdAt={user.created_at}
      hasPassword={hasPassword}
      via={via}
      /* SELLER ACCESS: lib/account/seller-access.ts, the same answer the
         header reads to show Dashboard. Only the delete card's words use it. */
      isSeller={access?.state === "seller"}
      newsletter={newsletter}
      personalized={personalized}
      username={username || profile?.username || ""}
      usernameEditable={!handleOwner}
      privacy={privacy}
      creator={creator}
      cover={cover}
      location={await locationRead}
      initialSection={sectionFrom(section)}
    />
  )
}

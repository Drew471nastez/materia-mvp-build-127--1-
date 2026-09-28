import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { profileForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { readNewsletter } from "@/lib/account/preferences"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { AccountSettings } from "@/components/account/account-settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Settings" }

/** The sign in methods an account has, by the name a person knows them by. */
const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" }

/**
 * The profile's Settings, read in one round of requests: the profile, seller
 * access (the delete card says what goes with a store), the newsletter and
 * the recommendations choice. The profile on the person's own client where
 * row level security answers, and the newsletter with the service role
 * because its table is closed to browsers (app/app/settings/_server.ts reads
 * it the same way).
 */
export default async function AccountSettingsRoute() {
  const user = await pageUser(accountLoginPath("/account/settings"))
  /* Supabase did not answer in time: the layout's gate recovers the session
     in the browser (lib/auth/page-user.ts). */
  if (!user) return null

  const [profile, access, newsletter, personalized] = await Promise.all([
    profileForRequest(user.id),
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
      createdAt={user.created_at}
      hasPassword={hasPassword}
      via={via}
      /* SELLER ACCESS: lib/account/seller-access.ts, the same answer the
         header reads to show Dashboard. Only the delete card's words use it. */
      isSeller={access?.state === "seller"}
      newsletter={newsletter}
      personalized={personalized}
    />
  )
}

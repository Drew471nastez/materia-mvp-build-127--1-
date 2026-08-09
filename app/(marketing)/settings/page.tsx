import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SettingsHub } from "@/components/settings/settings-hub"

/**
 * /settings — the account hub.
 *
 * It used to mount the seller dashboard's 1,700-line account form through
 * loadSettingsData, and it crashed client-side for anyone whose data did not
 * fit that form's assumptions — the page greeted people with "Application
 * error" instead of their own account. See components/settings/settings-hub
 * for what stands here now: a table of contents whose rows go to screens that
 * already exist, so nothing on this page edits in place and nothing on it can
 * fall over on somebody's data.
 *
 * The server's whole job is three reads: who is signed in, their profile row,
 * and nothing else. A missing profile row renders fine — the hub falls back to
 * the email — because a buyer who signed up yesterday IS a normal account.
 */
export const metadata: Metadata = {
  title: "Setări | Storelib",
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) redirect("/login?redirect=/settings")

  let profile: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
    profile = data
  } catch {
    // The hub renders from auth metadata alone.
  }

  return (
    <SettingsHub
      displayName={profile?.display_name ?? user.user_metadata?.display_name ?? null}
      username={profile?.username ?? null}
      avatarUrl={profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null}
      email={user.email ?? null}
    />
  )
}

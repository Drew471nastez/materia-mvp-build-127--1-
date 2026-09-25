import { createClient } from "@/lib/supabase/server"
import { BuyerSettings } from "./buyer-settings"
import { pageUser } from "@/lib/auth/page-user"

export const dynamic = "force-dynamic"

export default async function LibrarySettingsPage() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username")
    .eq("id", user.id)
    .maybeSingle()

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || ""
  /* The profile's photo only (lib/account/avatar): a removed photo stays removed. */
  const avatarUrl = profile?.avatar_url || null
  const username = profile?.username || ""

  return (
    <BuyerSettings
      userId={user.id}
      email={user.email || ""}
      displayName={displayName}
      avatarUrl={avatarUrl}
      username={username}
      createdAt={user.created_at}
    />
  )
}

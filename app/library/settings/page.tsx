import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BuyerSettings } from "./buyer-settings"

export const dynamic = "force-dynamic"

export default async function LibrarySettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username")
    .eq("id", user.id)
    .maybeSingle()

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || ""
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null
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

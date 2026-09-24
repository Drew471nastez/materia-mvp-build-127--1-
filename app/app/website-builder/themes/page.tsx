import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ThemeMarketplaceClient } from "./themes-client"

export const metadata: Metadata = {
  title: "Theme marketplace",
}

/**
 * /app/website-builder/themes: the theme Storelib offers, shown whole, with
 * one-click Add (BROWSABLE_THEMES in lib/website-builder/theme-registry.ts).
 *
 * The server only needs to know which themes the creator already has and how
 * many slots are used; the catalogue itself is code.
 */
export default async function ThemeMarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) redirect("/app")

  const { data: installs } = await supabase.from("store_theme_installs").select("id, name, theme_id, status").eq("creator_id", creator.id)

  return (
    <ThemeMarketplaceClient
      installedThemeIds={(installs ?? []).map((i) => i.theme_id)}
      slotsUsed={installs?.length ?? 0}
      library={(installs ?? []).map((i) => ({ id: i.id as string, name: (i.name as string) || "Website", live: i.status === "published" }))}
    />
  )
}

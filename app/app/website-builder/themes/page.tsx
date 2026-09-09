import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ThemeMarketplaceClient } from "./themes-client"

export const metadata: Metadata = {
  title: "Theme marketplace",
}

/**
 * /app/website-builder/themes — every theme in the registry, filterable by
 * industry, with a detail view and one-click Add. The old page linked here
 * and the route did not exist.
 *
 * The server only needs to know which themes the creator already has and how
 * many slots are used; the catalogue itself is code.
 */
export default async function ThemeMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; industry?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) redirect("/app")

  const [{ data: installs }, params] = await Promise.all([
    supabase.from("store_theme_installs").select("theme_id, status").eq("creator_id", creator.id),
    searchParams,
  ])

  return (
    <ThemeMarketplaceClient
      installedThemeIds={(installs ?? []).map((i) => i.theme_id)}
      slotsUsed={installs?.length ?? 0}
      initialTheme={typeof params.theme === "string" ? params.theme : null}
      initialIndustry={typeof params.industry === "string" ? params.industry : null}
    />
  )
}

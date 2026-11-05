import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { websitePage } from "@/lib/team/website"
import { ThemeMarketplaceClient } from "./themes-client"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Theme marketplace"),
  }
}

/**
 * /app/website-builder/themes: the theme Storelib offers, shown whole, with
 * one-click Add (BROWSABLE_THEMES in lib/website-builder/theme-registry.ts).
 *
 * The server only needs to know which themes the creator already has and how
 * many slots are used; the catalogue itself is code.
 */
export default async function ThemeMarketplacePage() {
  /* The owner's own store, or the one a team member with Website works in (lib/team/website). */
  const access = await websitePage()
  if (access.kind === "closed") return null
  if (access.kind === "none") redirect("/app")
  const supabase = access.db
  const creator = { id: access.creatorId }

  const { data: installs } = await supabase.from("store_theme_installs").select("id, name, theme_id, status").eq("creator_id", creator.id)

  return (
    <ThemeMarketplaceClient
      installedThemeIds={(installs ?? []).map((i) => i.theme_id)}
      slotsUsed={installs?.length ?? 0}
      library={(installs ?? []).map((i) => ({ id: i.id as string, name: (i.name as string) || "Website", live: i.status === "published" }))}
    />
  )
}

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { creatorFor } from "@/lib/team/server"
import { getServerTt } from "@/lib/i18n/server"
import { listWidgetConfigs } from "@/lib/reviews/widgets/server"
import { siteLanguages } from "@/lib/markets/live"
import { WidgetsGallery } from "@/components/reviews/widgets/widgets-gallery"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Review widgets") }
}

/**
 * Storelib Reviews › Widgets: the gallery of review widgets, each with a
 * preview from the store's own reviews, the customizer, the looks the store
 * saved, and Add to website (components/reviews/widgets/widgets-gallery.tsx).
 * The store's owner, or a teammate with the store area.
 */
export default async function ReviewWidgetsPage() {
  const { user } = await currentUserForRequest()
  /* No session yet: the app shell's gate draws its own frame over this while it restores the session. */
  if (!user) return null
  const db = createAdminClient()
  const found = await creatorFor<{ id: string; display_name: string | null }>(db, user.id, "store", "id, display_name")
  if (found.kind === "none") redirect("/sell")
  if (found.kind === "denied") redirect("/app")
  const creator = found.creator
  const [{ configs, ready }, langs] = await Promise.all([listWidgetConfigs(db, creator.id), siteLanguages(creator.id)])
  return (
    <WidgetsGallery
      initialConfigs={configs}
      ready={ready}
      shopName={creator.display_name ?? ""}
      languages={{ defaultLanguage: langs.defaultLanguage, others: langs.others }}
    />
  )
}

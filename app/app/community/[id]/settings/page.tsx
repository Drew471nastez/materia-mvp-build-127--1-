import { communityHead, loadSettings, sectionPage } from "@/lib/communities/server/creator"
import { providerStates } from "@/lib/video/provider"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { settingsTabOf } from "@/components/community/creator/logic"

export const dynamic = "force-dynamic"

/** /app/community/<id>/settings?tab=page|access|features|gamification|notifications|advanced (general and discovery still land on theirs). */
export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  const [head, data] = await Promise.all([communityHead(ctx), loadSettings(ctx)])
  return <SettingsSection head={head} data={data} tab={settingsTabOf(query.tab)} videoProviders={providerStates()} />
}

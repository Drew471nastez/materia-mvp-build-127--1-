import { communityHead, loadSettings, sectionPage } from "@/lib/communities/server/creator"
import { providerStates } from "@/lib/video/provider"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import { SectionSeed } from "@/components/community/creator/community-shell"

export const dynamic = "force-dynamic"

/** /app/community/<id>/settings?tab=page|access|features|gamification|notifications|advanced (general and discovery still land on theirs). */
export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  const [head, data] = await Promise.all([communityHead(ctx), loadSettings(ctx)])
  /* A phone opens on the list of panels unless the address names one (round 31). */
  return (
    <SectionSeed id="settings">
      <SettingsSection head={head} data={data} tab={settingsTabOf(query.tab)} asked={settingsTabAsked(query.tab)} videoProviders={providerStates()} />
    </SectionSeed>
  )
}

import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { settingsReads } from "@/lib/communities/server/admin-sections"
import { providerStates } from "@/lib/video/provider"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/settings?tab=page|access|features|gamification|notifications|advanced (general and discovery still land on theirs). The frame first (round 32). */
export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  return (
    <SectionSeed id="settings">
      <Suspense fallback={<SectionFrame id="settings" facts={{ settingsList: !settingsTabAsked(query.tab) }} />}>
        {settingsBody({ ctx, query })}
      </Suspense>
    </SectionSeed>
  )
}

async function settingsBody({ ctx, query }: { ctx: CreatorPageContext; query: { tab?: string } }) {
  const { head, data } = await settingsReads(ctx)
  /* A phone opens on the list of panels unless the address names one (round 31). */
  return <SettingsSection head={head} data={data} tab={settingsTabOf(query.tab)} asked={settingsTabAsked(query.tab)} videoProviders={providerStates()} />
}

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { settingsReads } from "@/lib/communities/server/admin-sections"
import { providerStates } from "@/lib/video/provider"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { communityEmailsHref, emailsTabAsked, pageTabAsked, settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/**
 * /app/community/<id>/settings?tab=access|address|discovery|features|advanced|roles|policies|gamification|notifications
 * (older names still land on theirs). The frame first (round 32). ?tab=emails opens Emails › Customer emails ›
 * Communities on this community, where member emails are managed now.
 *
 * Round 33: the community's page is a section of its own. An address from before that named it here (?tab=page,
 * ?tab=general, a bookmark, an email) opens /app/community/<slug>/page instead.
 */
export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  if (pageTabAsked(query.tab)) redirect(`/app/community/${ctx.community.slug}/page`)
  /* Member emails are managed in Emails now, with the store's other emails: an old link opens them there. */
  if (emailsTabAsked(query.tab)) redirect(communityEmailsHref(ctx.community.id))
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

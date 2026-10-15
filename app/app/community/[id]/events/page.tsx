import { communityHead, loadEvents, ruleOptions, sectionPage } from "@/lib/communities/server/creator"
import { EventsSection } from "@/components/community/creator/events-section"
import { SectionSeed } from "@/components/community/creator/community-shell"

export const dynamic = "force-dynamic"

/** /app/community/<id>/events: schedule, edit, cancel, and the replays. */
export default async function CommunityEventsAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_events")
  if (!ctx) return null
  const [head, events, options] = await Promise.all([communityHead(ctx), loadEvents(ctx.db, ctx.community.id), ruleOptions(ctx.db, ctx.community.id)])
  return (
    <SectionSeed id="events" stamp={query.new === "1" ? "new" : ""}>
      <EventsSection head={head} initial={events} options={options} openNew={query.new === "1"} />
    </SectionSeed>
  )
}

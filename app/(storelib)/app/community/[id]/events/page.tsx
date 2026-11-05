import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { eventsReads } from "@/lib/communities/server/admin-sections"
import { EventsSection } from "@/components/community/creator/events-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/events: schedule, edit, cancel, and the replays. The frame first, the events as they come (round 32). */
export default async function CommunityEventsAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_events")
  if (!ctx) return null
  return (
    <SectionSeed id="events" stamp={query.new === "1" ? "new" : ""}>
      <Suspense fallback={<SectionFrame id="events" />}>
        {eventsBody({ ctx, openNew: query.new === "1" })}
      </Suspense>
    </SectionSeed>
  )
}

async function eventsBody({ ctx, openNew }: { ctx: CreatorPageContext; openNew: boolean }) {
  const { head, events, options } = await eventsReads(ctx)
  return <EventsSection head={head} initial={events} options={options} openNew={openNew} />
}

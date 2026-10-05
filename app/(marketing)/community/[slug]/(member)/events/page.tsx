import type { Metadata } from "next"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { EventsPage } from "@/components/community/events/events-page"
import { admin } from "@/lib/communities/server/db"
import { openMemberPage } from "@/lib/communities/server/classroom"
import { listEvents, monthEvents } from "@/lib/communities/server/events"
import { eventHrefFor } from "@/lib/communities/server/wall"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Events", robots: { index: false, follow: false } }

/**
 * /community/<slug>/events: Upcoming and Past, and on a computer the month
 * as a calendar. The page body only, inside the member layout; it checks
 * the switch, the community, the section and the membership itself
 * (openMemberPage). The first page of Upcoming and this month's grid come
 * with it; the rest is asked for from GET /api/community/<id>/events.
 */
export default async function CommunityEventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = admin()
  const open = await openMemberPage(db, slug, "events", `/community/${slug}/events`)
  if (!open) return <SessionRecovery />
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const [upcoming, monthList] = await Promise.all([listEvents(db, open.community, open.viewer, { when: "upcoming" }), monthEvents(db, open.community, open.viewer, year, month)])
  const fallbackZone = upcoming.events[0]?.timezone || monthList[0]?.timezone || "UTC"
  /* The people who run events get Schedule an event when there are none (round 11). */
  return <EventsPage communityId={open.community.id} initial={upcoming} month={{ year, month, events: monthList }} fallbackZone={fallbackZone} manageHref={eventHrefFor(open.community, open.viewer)} />
}

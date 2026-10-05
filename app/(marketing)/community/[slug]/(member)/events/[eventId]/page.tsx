import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { EventDetail } from "@/components/community/events/event-detail"
import { admin } from "@/lib/communities/server/db"
import { openMemberPage } from "@/lib/communities/server/classroom"
import { eventDetail, isEventId } from "@/lib/communities/server/events"
import { eventFacts } from "./event-facts"
import { eventMetadata } from "./event-seo"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ slug: string; eventId: string }> }): Promise<Metadata> {
  const { slug, eventId } = await params
  const facts = await eventFacts(slug, eventId)
  if (!facts) return { title: "Event", robots: { index: false, follow: false } }
  return eventMetadata(facts)
}

/**
 * /community/<slug>/events/<eventId>: one event of this community (another
 * community's is a 404). The meeting link is only in the data from 15
 * minutes before the start, for a member the event is open to
 * (lib/communities/server/events.ts eventDetail).
 */
export default async function CommunityEventPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params
  if (!isEventId(eventId)) notFound()
  const db = admin()
  const open = await openMemberPage(db, slug, "events", `/community/${slug}/events/${eventId}`)
  if (!open) return <SessionRecovery />
  const event = await eventDetail(db, open.community, open.viewer, eventId)
  if (!event) notFound()
  return <EventDetail event={event} eventsHref={`/community/${open.community.slug}/events`} aboutHref={`/community/${open.community.slug}/about`} />
}

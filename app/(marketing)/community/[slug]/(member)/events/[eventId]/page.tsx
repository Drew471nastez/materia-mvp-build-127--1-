import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PlacePage } from "@/components/community/member/place-page"
import { isEventId } from "@/lib/communities/server/events"
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
 * /community/<slug>/events/<eventId>: one event of this community (another community's is a 404). The meeting link is only
 * in the data from 15 minutes before the start (lib/communities/server/events.ts eventDetail). Round 15: seeds the shell.
 */
export default async function CommunityEventPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params
  if (!isEventId(eventId)) notFound()
  return <PlacePage slug={slug} place={{ kind: "event", id: eventId }} />
}

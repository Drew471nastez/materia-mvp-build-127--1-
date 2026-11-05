import type { Metadata } from "next"
import { PlacePage } from "@/components/community/member/place-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Events", robots: { index: false, follow: false } }

/**
 * /community/<slug>/events: Upcoming and Past, and on a computer the month as a calendar. Round 15: seeds the community's
 * shell with the place (place-page.tsx); the rest is asked for from GET /api/community/<id>/events.
 */
export default async function CommunityEventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "calendar" }} />
}

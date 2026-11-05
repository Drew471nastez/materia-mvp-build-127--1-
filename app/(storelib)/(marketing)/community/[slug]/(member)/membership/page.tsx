import type { Metadata } from "next"
import { PlacePage } from "@/components/community/member/place-page"

/* The tab says which page this is, after the community's name (the community's layout adds the name). */
export const metadata: Metadata = { title: "Membership" }

/**
 * /community/<slug>/membership: a member's own page in this community (round 13, ask 29), reached from "Membership" in the
 * bar's "..." menu: their plan, what they hear about, contacting the owner, leaving. Round 15: seeds the shell.
 */
export default async function CommunityMembershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "membership" }} />
}

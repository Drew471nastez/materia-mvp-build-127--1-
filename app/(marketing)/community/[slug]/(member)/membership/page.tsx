import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { admin } from "@/lib/communities/server/db"
import { loadSalesPage } from "@/lib/communities/server/public"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { memberPage } from "@/components/community/member/data"
import { MembershipPage, type MembershipFacts } from "@/components/community/member/membership"

/* The tab says which page this is, after the community's name (the community's layout adds the name). */
export const metadata: Metadata = { title: "Membership" }

/**
 * /community/<slug>/membership: A MEMBER'S OWN PAGE IN THIS COMMUNITY
 * (round 13, ask 29), reached from "Membership" in the bar's "..." menu.
 * What they are here and since when, their plan (and for a paid one where
 * to manage or cancel it), what they hear about, contacting the owner, and
 * leaving. Members only: the (member) layout above sends anybody else to
 * About. Everything shown is the member's own row; the plan and the leave
 * rules are the same decision the About page makes (loadSalesPage's join).
 */
export default async function CommunityMembershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer?.userId) notFound()
  const { community, viewer } = page
  const [load, askWhy] = await Promise.all([loadSalesPage(community.slug, viewer.userId), leaveReasonsReady(admin())])
  if (!load) notFound()
  const m = viewer.member
  const facts: MembershipFacts = {
    role: viewer.isOwner ? "owner" : (m?.role ?? "member"),
    source: m?.source ?? null,
    joinedAt: m?.joined_at ?? m?.created_at ?? null,
    expiresAt: m?.expires_at ?? null,
    planName: load.data.join.option && m?.tier_id && load.data.join.option.tierId === m.tier_id ? load.data.join.option.name : (load.data.community.options.find((o) => o.tierId && o.tierId === m?.tier_id)?.name ?? null),
    notifyLevel: m?.notify_level ?? "important",
  }
  return <MembershipPage community={load.data.community} join={load.data.join} askWhy={askWhy && load.data.join.canLeave} facts={facts} />
}

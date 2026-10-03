import { notFound } from "next/navigation"
import { can } from "@/lib/communities/permissions"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { memberProfile } from "@/lib/communities/server/directory"
import { accessOf } from "@/lib/communities/server/feed"
import { memberPage } from "@/components/community/member/data"
import { MemberProfile } from "@/components/community/member/member-profile"

/** /community/<slug>/members/<userId>: one member's page here. No email, no payment data. */
export default async function CommunityMemberProfilePage({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  if (!community.directory_enabled && !can(viewer.role, "manage_members") && viewer.userId !== userId) notFound()
  const member = await memberProfile(admin(), community, userId, { ...accessOf(viewer), userId: viewer.userId })
  if (!member) notFound()
  return <MemberProfile communityId={community.id} slug={community.slug} member={member} viewer={viewerView(viewer)} gamification={community.gamification_enabled} />
}

import { notFound } from "next/navigation"
import { can } from "@/lib/communities/permissions"
import { admin } from "@/lib/communities/server/db"
import { listMembers } from "@/lib/communities/server/directory"
import { memberPage } from "@/components/community/member/data"
import { MembersDirectory } from "@/components/community/member/members"

/** /community/<slug>/members: the member directory, when the community has it on (staff always). */
export default async function CommunityMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  if (!community.directory_enabled && !can(viewer.role, "manage_members")) notFound()
  const first = await listMembers(admin(), community.id, {})
  return <MembersDirectory communityId={community.id} slug={community.slug} memberCount={community.member_count} initial={first} meId={viewer.userId} canMessage={community.chat_enabled} />
}

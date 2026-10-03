import { communityHead, loadClassroom, ruleOptions, sectionPage } from "@/lib/communities/server/creator"
import { ClassroomSection } from "@/components/community/creator/classroom-section"

export const dynamic = "force-dynamic"

/** /app/community/<id>/classroom: the creator's courses, attached to the community. */
export default async function CommunityClassroomAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_classroom")
  if (!ctx) return null
  const [head, classroom, options] = await Promise.all([communityHead(ctx), loadClassroom(ctx.db, ctx.community.id, ctx.creatorId), ruleOptions(ctx.db, ctx.community.id)])
  return <ClassroomSection head={head} initial={classroom} options={options} />
}

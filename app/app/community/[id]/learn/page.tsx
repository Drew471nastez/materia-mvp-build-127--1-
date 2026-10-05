import { sectionPage } from "@/lib/communities/server/creator"
import { learnBuilderFor } from "@/lib/communities/server/learn"
import { LearnBuilder } from "@/components/community/learn/learn-builder"

export const dynamic = "force-dynamic"

/** /app/community/<id>/learn: the community's programs and the courses attached to it, read here so the builder lands filled. */
export default async function CommunityLearnAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_classroom")
  if (!ctx) return null
  const initial = await learnBuilderFor(ctx.db, ctx.community).catch(() => null)
  return <LearnBuilder communityId={ctx.community.id} initial={initial} />
}

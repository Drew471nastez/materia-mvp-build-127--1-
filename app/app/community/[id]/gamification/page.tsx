import { communityHead, loadBadges, loadLevels, sectionPage } from "@/lib/communities/server/creator"
import { GamificationPanel } from "@/components/community/creator/gamification-panel"

export const dynamic = "force-dynamic"

/** /app/community/<id>/gamification: points, levels and badges (also under Settings). */
export default async function CommunityGamificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_gamification")
  if (!ctx) return null
  const [head, levels, badges] = await Promise.all([communityHead(ctx), loadLevels(ctx.db, ctx.community.id), loadBadges(ctx.db, ctx.community.id)])
  return <GamificationPanel head={head} levels={levels} badges={badges} />
}

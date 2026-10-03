import { redirect } from "next/navigation"
import { sectionPage } from "@/lib/communities/server/creator"

export const dynamic = "force-dynamic"

/** /app/community/<id>/gamification: points, levels and badges live in Settings now; an old link lands there. */
export default async function CommunityGamificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_gamification")
  if (!ctx) return null
  redirect(`/app/community/${ctx.community.id}/settings?tab=gamification`)
}

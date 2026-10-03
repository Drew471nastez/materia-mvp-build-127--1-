import { communityHead, loadSpaces, ruleOptions, sectionPage } from "@/lib/communities/server/creator"
import { SpacesSection } from "@/components/community/creator/spaces-section"

export const dynamic = "force-dynamic"

/** /app/community/<id>/spaces: the rooms of the community, in order. */
export default async function CommunitySpacesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_spaces")
  if (!ctx) return null
  const [head, spaces, options] = await Promise.all([communityHead(ctx), loadSpaces(ctx.db, ctx.community.id), ruleOptions(ctx.db, ctx.community.id)])
  return <SpacesSection head={head} initial={spaces} options={options} />
}

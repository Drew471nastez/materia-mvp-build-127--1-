import { communityHead, loadOverview, sectionPage } from "@/lib/communities/server/creator"
import { Overview } from "@/components/community/creator/overview"

export const dynamic = "force-dynamic"

/** /app/community/<id>: what to do next, the figures, the next events, what is waiting. */
export default async function CommunityOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "view")
  if (!ctx) return null
  const [head, data] = await Promise.all([communityHead(ctx), loadOverview(ctx)])
  return <Overview head={head} data={data} created={query.created === "1"} />
}

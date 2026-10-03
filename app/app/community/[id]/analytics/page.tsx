import { communityHead, sectionPage } from "@/lib/communities/server/creator"
import { loadAnalytics } from "@/lib/communities/server/analytics"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"

export const dynamic = "force-dynamic"

/** /app/community/<id>/analytics: the daily figures, from the nightly rollup, and today live. */
export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "view_analytics")
  if (!ctx) return null
  const [head, data] = await Promise.all([communityHead(ctx), loadAnalytics(ctx.db, ctx.community, 30)])
  return <AnalyticsSection head={head} initial={data} />
}

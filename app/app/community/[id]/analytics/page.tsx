import { communityHead, sectionPage } from "@/lib/communities/server/creator"
import { loadAnalytics } from "@/lib/communities/server/analytics"
import { loadMoneyAndGrowth } from "@/lib/communities/server/stats"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import { SectionSeed } from "@/components/community/creator/community-shell"

export const dynamic = "force-dynamic"

/** /app/community/<id>/analytics: revenue and joins, the daily figures from the nightly rollup, and today live. */
export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "view_analytics")
  if (!ctx) return null
  const [head, data, money] = await Promise.all([communityHead(ctx), loadAnalytics(ctx.db, ctx.community, 30), loadMoneyAndGrowth(ctx.db, ctx.community.id, 30)])
  return (
    <SectionSeed id="analytics">
      <AnalyticsSection head={head} initial={{ ...data, money }} />
    </SectionSeed>
  )
}

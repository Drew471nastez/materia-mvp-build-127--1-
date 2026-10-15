import { communityHead, sectionPage } from "@/lib/communities/server/creator"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"

export const dynamic = "force-dynamic"

/**
 * /app/community/<id>/analytics. Round 31: the section asks for the period
 * in the address itself, in the viewer's time zone, as /app Analytics does
 * (app/api/app/community/<id>/analytics, lib/communities/server/
 * analytics-report.ts), so the page reads only the community's head. The
 * section still accepts the earlier `initial` and draws nothing from it.
 */
export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "view_analytics")
  if (!ctx) return null
  const head = await communityHead(ctx)
  return <AnalyticsSection head={head} />
}

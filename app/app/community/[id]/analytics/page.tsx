import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { analyticsReads } from "@/lib/communities/server/admin-sections"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/**
 * /app/community/<id>/analytics. Round 31: the section asks for the period
 * in the address itself, in the viewer's time zone, as /app Analytics does
 * (app/api/app/community/<id>/analytics, lib/communities/server/
 * analytics-report.ts), so the page reads only the community's head. The
 * section still accepts the earlier `initial` and draws nothing from it.
 * Round 32: the frame first, as every section.
 */
export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "view_analytics")
  if (!ctx) return null
  return (
    <SectionSeed id="analytics">
      <Suspense fallback={<SectionFrame id="analytics" />}>
        {analyticsBody({ ctx })}
      </Suspense>
    </SectionSeed>
  )
}

async function analyticsBody({ ctx }: { ctx: CreatorPageContext }) {
  const { head } = await analyticsReads(ctx)
  return <AnalyticsSection head={head} />
}

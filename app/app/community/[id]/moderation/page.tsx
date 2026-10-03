import { can } from "@/lib/communities/permissions"
import { communityHead, sectionPage } from "@/lib/communities/server/creator"
import { auditLog, listReports } from "@/lib/communities/server/moderation"
import { ModerationSection } from "@/components/community/creator/moderation-section"

export const dynamic = "force-dynamic"

/** /app/community/<id>/moderation: the report queue and the audit log. */
export default async function CommunityModerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "review_reports")
  if (!ctx) return null
  const [head, reports, audit] = await Promise.all([communityHead(ctx), listReports(ctx.db, ctx.community.id, { status: "open", cursor: null }), can(ctx.role, "view_audit") ? auditLog(ctx.db, ctx.community.id, null) : Promise.resolve(null)])
  return <ModerationSection head={head} initialReports={reports} initialAudit={audit} />
}

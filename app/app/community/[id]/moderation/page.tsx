import { can } from "@/lib/communities/permissions"
import { communityHead, listMembers, loadBadges, sectionPage } from "@/lib/communities/server/creator"
import { auditLog, listReports } from "@/lib/communities/server/moderation"
import { slowModeOf } from "@/lib/communities/server/safety"
import { wordSettingsOf } from "@/lib/communities/word-filter"
import { ModerationSection, type ModerationTab } from "@/components/community/creator/moderation-section"

export const dynamic = "force-dynamic"

const TABS: readonly ModerationTab[] = ["reports", "resolved", "restricted", "rules", "audit"]

/**
 * /app/community/<id>/moderation?tab=reports|resolved|restricted|rules|audit:
 * the report queue, who is muted, suspended or banned, the rules, and the
 * audit log. What a tab needs is read only when the role may use it.
 */
export default async function CommunityModerationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "review_reports")
  if (!ctx) return null
  const { db, community: c } = ctx
  const restrict = can(ctx.role, "mute", ctx.viewer.perms) || can(ctx.role, "suspend", ctx.viewer.perms) || can(ctx.role, "ban", ctx.viewer.perms)
  const page = (status: "muted" | "paused" | "banned") => listMembers(db, c.id, { status, role: null, tierId: null, q: "", cursor: null }, { withEmail: can(ctx.role, "manage_members", ctx.viewer.perms) })
  const [head, reports, audit, muted, paused, banned, tiers, badges] = await Promise.all([
    communityHead(ctx),
    listReports(db, c.id, { status: query.tab === "resolved" ? "closed" : "open", cursor: null }),
    can(ctx.role, "view_audit", ctx.viewer.perms) ? auditLog(db, c.id, null) : Promise.resolve(null),
    restrict ? page("muted") : Promise.resolve(null),
    restrict ? page("paused") : Promise.resolve(null),
    restrict ? page("banned") : Promise.resolve(null),
    can(ctx.role, "manage_members", ctx.viewer.perms) ? db.from("community_tiers").select("id, name, kind").eq("community_id", c.id).is("archived_at", null).order("position", { ascending: true }).limit(50) : Promise.resolve({ data: [] }),
    c.gamification_enabled && can(ctx.role, "award_points", ctx.viewer.perms) ? loadBadges(db, c.id) : Promise.resolve([]),
  ])
  const asked = TABS.find((t) => t === query.tab) ?? "reports"
  const tab = (asked === "audit" && !audit) || (asked === "restricted" && !restrict) ? "reports" : asked
  return (
    <ModerationSection
      head={head}
      meId={ctx.userId}
      initialTab={tab}
      initialReports={reports}
      initialAudit={audit}
      rules={Array.isArray(c.rules) ? c.rules : []}
      restricted={muted && paused && banned ? { muted, paused, banned } : null}
      tiers={(tiers.data as { id: string; name: string; kind: string }[] | null) ?? []}
      badges={badges}
      slowMode={slowModeOf(c)}
      blockedWords={wordSettingsOf(c.onboarding)}
    />
  )
}

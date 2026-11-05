import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { moderationReads } from "@/lib/communities/server/admin-sections"
import { slowModeOf } from "@/lib/communities/server/safety"
import { wordSettingsOf } from "@/lib/communities/word-filter"
import { ModerationSection, type ModerationTab } from "@/components/community/creator/moderation-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

const TABS: readonly ModerationTab[] = ["reports", "resolved", "restricted", "rules", "audit"]

/**
 * /app/community/<id>/moderation?tab=reports|resolved|restricted|rules|audit:
 * the report queue, who is muted, suspended, banned or removed (each with
 * who did it and the way back), the rules, and the audit log. What a tab
 * needs is read only when the role may use it (lib/communities/server/
 * admin-sections.ts). The frame first, the queue as it comes (round 32).
 */
export default async function CommunityModerationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "review_reports")
  if (!ctx) return null
  return (
    <SectionSeed id="moderation">
      <Suspense fallback={<SectionFrame id="moderation" />}>
        {moderationBody({ ctx, query })}
      </Suspense>
    </SectionSeed>
  )
}

async function moderationBody({ ctx, query }: { ctx: CreatorPageContext; query: { tab?: string } }) {
  const c = ctx.community
  const r = await moderationReads(ctx, query)
  const asked = TABS.find((t) => t === query.tab) ?? "reports"
  const tab = (asked === "audit" && !r.audit) || (asked === "restricted" && !r.restrictAllowed) ? "reports" : asked
  return (
    <ModerationSection
      head={r.head}
      meId={ctx.userId}
      initialTab={tab}
      initialReports={r.reports}
      initialAudit={r.audit}
      rules={Array.isArray(c.rules) ? c.rules : []}
      restricted={r.restricted}
      tiers={r.tiers}
      badges={r.badges}
      slowMode={slowModeOf(c)}
      blockedWords={wordSettingsOf(c.onboarding)}
    />
  )
}

import { communityHead, loadOverview, sectionPage } from "@/lib/communities/server/creator"
import { Overview } from "@/components/community/creator/overview"
import { MessagesSetupNote } from "@/components/community/member/messages-setup-note"
import { LeaveReasonsCard } from "@/components/community/creator/leave-reasons-card"
import { leaveReasonsSummary } from "@/lib/communities/server/leave-reasons"
import { meetsRole } from "@/lib/communities/permissions"

export const dynamic = "force-dynamic"

/** /app/community/<id>: what to do next, the figures, the next events, what is waiting. */
export default async function CommunityOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "view")
  if (!ctx) return null
  /* Why people left (round 12): the owner and admins only, and only once part 98 has made the table. */
  const [head, data, left] = await Promise.all([communityHead(ctx), loadOverview(ctx), meetsRole(ctx.role, "admin") ? leaveReasonsSummary(ctx.db, ctx.community.id) : Promise.resolve(null)])
  return (
    <>
      {/* Staff see why members have no Messages button, when the only reason is the missing database part. */}
      <MessagesSetupNote chatEnabled={!!ctx.community.chat_enabled} />
      <Overview head={head} data={data} created={query.created === "1"} />
      {left ? (
        <div className="mt-4">
          <LeaveReasonsCard summary={left} />
        </div>
      ) : null}
    </>
  )
}

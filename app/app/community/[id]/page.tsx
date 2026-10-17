import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { overviewReads } from "@/lib/communities/server/admin-sections"
import { Overview } from "@/components/community/creator/overview"
import { MessagesSetupNote } from "@/components/community/member/messages-setup-note"
import { LeaveReasonsCard } from "@/components/community/creator/leave-reasons-card"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/**
 * /app/community/<id>: what to do next, the figures, the next events, what is waiting.
 *
 * Round 32: the gate first, then the section inside a Suspense boundary, so the shell and the section's frame are sent
 * (and painted) while its reads run (lib/communities/server/admin-sections.ts). Every section page has this shape.
 */
export default async function CommunityOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "view")
  if (!ctx) return null
  /* Kept by the shell for the way back (round 31); ?created=1 is a one time ask, so it starts the overview again. */
  /* Round 26: the frame draws as many figures as the Overview will (four for a community that charges, three otherwise). */
  return (
    <SectionSeed id="overview" stamp={query.created === "1" ? "created" : ""}>
      <Suspense fallback={<SectionFrame id="overview" facts={{ figures: ctx.community.access === "paid" ? 4 : 3 }} />}>
        {overviewBody({ ctx, created: query.created === "1" })}
      </Suspense>
    </SectionSeed>
  )
}

async function overviewBody({ ctx, created }: { ctx: CreatorPageContext; created: boolean }) {
  /* Why people left (round 12): the owner and admins only, and only once part 98 has made the table. */
  const { head, data, left } = await overviewReads(ctx)
  return (
    <>
      {/* Staff see why members have no Messages button, when the only reason is the missing database part. */}
      <MessagesSetupNote chatEnabled={!!ctx.community.chat_enabled} />
      <Overview head={head} data={data} created={created} />
      {/* Round 26: only once somebody has said why; before that the card was one more box saying nothing yet. */}
      {left && left.total > 0 ? (
        <div className="mt-4">
          <LeaveReasonsCard summary={left} />
        </div>
      ) : null}
    </>
  )
}

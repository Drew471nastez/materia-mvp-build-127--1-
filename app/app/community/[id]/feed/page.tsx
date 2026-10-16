import { Suspense } from "react"
import { can } from "@/lib/communities/permissions"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { feedReads } from "@/lib/communities/server/admin-sections"
import { FeedSection } from "@/components/community/creator/feed-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/feed: post as the community, and keep the feed in order. The frame first, the posts as they come (round 32). */
export default async function CommunityFeedAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ compose?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "moderate_content")
  if (!ctx) return null
  /* The writer's card is in the frame for whoever may post, as the shell's own frame decides it (community-shell frameFacts). */
  const composer = can(ctx.role, "post", ctx.viewer.perms) && !(ctx.community.status === "archived" || ctx.community.archived_at)
  return (
    <SectionSeed id="feed" stamp={query.compose ? `compose:${query.compose}` : ""}>
      <Suspense fallback={<SectionFrame id="feed" facts={{ composer }} />}>
        {feedBody({ ctx, compose: query.compose ?? null })}
      </Suspense>
    </SectionSeed>
  )
}

async function feedBody({ ctx, compose }: { ctx: CreatorPageContext; compose: string | null }) {
  const { head, rows, spaces } = await feedReads(ctx)
  return <FeedSection head={head} initial={rows} spaces={spaces} compose={compose} />
}

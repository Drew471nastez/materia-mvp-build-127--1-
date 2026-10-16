import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { learnReads } from "@/lib/communities/server/admin-sections"
import { LearnBuilder } from "@/components/community/learn/learn-builder"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/learn: the community's programs and the courses attached to it, read here so the builder lands filled. The frame first (round 32). */
export default async function CommunityLearnAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_classroom")
  if (!ctx) return null
  return (
    <SectionSeed id="classroom">
      <Suspense fallback={<SectionFrame id="classroom" />}>
        {learnBody({ ctx })}
      </Suspense>
    </SectionSeed>
  )
}

async function learnBody({ ctx }: { ctx: CreatorPageContext }) {
  const { initial } = await learnReads(ctx)
  return <LearnBuilder communityId={ctx.community.id} initial={initial} />
}

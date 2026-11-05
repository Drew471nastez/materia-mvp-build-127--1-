import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { spacesReads } from "@/lib/communities/server/admin-sections"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/spaces: the rooms of the community, in order. The frame first, the spaces as they come (round 32). */
export default async function CommunitySpacesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_spaces")
  if (!ctx) return null
  return (
    <SectionSeed id="spaces">
      <Suspense fallback={<SectionFrame id="spaces" />}>
        {spacesBody({ ctx })}
      </Suspense>
    </SectionSeed>
  )
}

async function spacesBody({ ctx }: { ctx: CreatorPageContext }) {
  const { head, spaces, options } = await spacesReads(ctx)
  return <SpacesSection head={head} initial={spaces} options={options} />
}

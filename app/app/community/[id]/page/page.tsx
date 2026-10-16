import { Suspense } from "react"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { pageEditorReads } from "@/lib/communities/server/page-editor"
import { PageEditor } from "@/components/community/creator/page-editor/page-editor"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/**
 * /app/community/<slug>/page: the community's page as visitors see it, edited in place (round 33). The frame first, the
 * preview as its reads come (round 32's shape: the gate, then the section inside a Suspense boundary).
 */
export default async function CommunityPageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  return (
    <SectionSeed id="page">
      <Suspense fallback={<SectionFrame id="page" />}>{pageBody(ctx)}</Suspense>
    </SectionSeed>
  )
}

async function pageBody(ctx: CreatorPageContext) {
  const r = await pageEditorReads(ctx)
  return <PageEditor head={r.head} data={r.data} preview={r.preview} creatorId={r.creatorId} />
}

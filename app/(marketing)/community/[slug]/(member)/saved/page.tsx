import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listSaved } from "@/lib/communities/server/feed"
import { FeedColumns } from "@/components/community/member/columns"
import { memberPage } from "@/components/community/member/data"
import { FeedView } from "@/components/community/member/feed"
import { PageTitle } from "@/components/community/member/headers"

/** /community/<slug>/saved: the posts this member saved here, newest saved first. */
export default async function CommunitySavedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const saved = await listSaved(admin(), community, viewer, null)
  return (
    <FeedColumns
      header={<PageTitle title="Saved" />}
      main={<FeedView communityId={community.id} slug={community.slug} viewer={viewerView(viewer)} initial={{ pinned: [], posts: saved.posts, nextCursor: saved.nextCursor }} mode="saved" />}
    />
  )
}

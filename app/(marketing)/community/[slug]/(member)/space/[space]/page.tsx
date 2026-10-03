import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listFeed } from "@/lib/communities/server/feed"
import { listMessages } from "@/lib/communities/server/chat"
import { ChatView } from "@/components/community/member/chat"
import { FeedAside, FeedColumns } from "@/components/community/member/columns"
import { composerSpaces, fileProductFor, meOf, memberPage, shellData, upcomingEventFor } from "@/components/community/member/data"
import { FeedView } from "@/components/community/member/feed"
import { SpaceHeader } from "@/components/community/member/headers"

/**
 * /community/<slug>/space/<space>: one space's feed, or its chat when the
 * space is a chat space. Only spaces this member may see; any other address
 * is a 404 (the shell's layout has already checked membership).
 */
export default async function CommunitySpacePage({ params }: { params: Promise<{ slug: string; space: string }> }) {
  const { slug, space: spaceSlug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const shell = await shellData(community.id, viewer, community)
  const space = shell.spaces.find((s) => s.slug === decodeURIComponent(spaceSlug).toLowerCase())
  const row = space ? shell.rows.find((r) => r.id === space.id) : null
  if (!space || !row) notFound()
  const view = viewerView(viewer)
  const readOnly = shell.community.archived || !!viewer.mutedUntil

  if (space.kind === "chat") {
    const first = await listMessages(admin(), community, viewer, row, {})
    return <ChatView communityId={community.id} slug={community.slug} space={space} viewer={view} initial={first} readOnly={readOnly || !space.canPost} />
  }

  const [feed, me, fileProductId, upcoming] = await Promise.all([
    listFeed(admin(), community, viewer, { sort: "latest", spaceId: space.id }),
    meOf(community.id, viewer),
    fileProductFor(community, viewer),
    upcomingEventFor(community, viewer),
  ])
  const canPost = space.canPost && !readOnly
  return (
    <FeedColumns
      header={<SpaceHeader space={space} />}
      main={
        <FeedView
          communityId={community.id}
          slug={community.slug}
          viewer={view}
          initial={feed}
          spaceId={space.id}
          readOnly={readOnly}
          emptyText={canPost ? "Be the first to post here." : "Nothing here yet."}
          composer={canPost && viewer.userId ? { communityId: community.id, userId: viewer.userId, me, spaces: composerSpaces([space]), fixedSpaceId: space.id, fileProductId } : null}
        />
      }
      aside={<FeedAside community={shell.community} upcoming={upcoming} />}
    />
  )
}

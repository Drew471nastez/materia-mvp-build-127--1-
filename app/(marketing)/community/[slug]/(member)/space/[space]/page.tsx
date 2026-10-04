import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listFeed } from "@/lib/communities/server/feed"
import { listMessages } from "@/lib/communities/server/chat"
import { ChatView } from "@/components/community/member/chat"
import { FeedColumns } from "@/components/community/member/columns"
import { composerSpaces, eventHrefFor, fileProductFor, meOf, memberPage, shellData } from "@/components/community/member/data"
import { FeedView } from "@/components/community/member/feed"
import { SpaceChips } from "@/components/community/member/space-chips"

/**
 * /community/<slug>/space/<space>: one space's feed, or its chat when the
 * space is a chat space, under the spaces as chips with this one chosen.
 * Only spaces this member may see; any other address is a 404 (the
 * community's layout has already checked membership).
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

  const chips = <SpaceChips slug={community.slug} spaces={shell.spaces} active={space.slug} />
  if (space.kind === "chat") {
    const first = await listMessages(admin(), community, viewer, row, {})
    return (
      <div className="max-w-[760px]">
        {chips}
        <ChatView communityId={community.id} slug={community.slug} space={space} viewer={view} initial={first} readOnly={readOnly || !space.canPost} />
      </div>
    )
  }

  const [feed, me, fileProductId] = await Promise.all([
    listFeed(admin(), community, viewer, { sort: "latest", spaceId: space.id }),
    meOf(community.id, viewer),
    fileProductFor(community, viewer),
  ])
  const canPost = space.canPost && !readOnly
  return (
    <FeedColumns
      header={
        <>
          {chips}
          {space.description ? <p className="-mt-0.5 mb-3 px-1 text-[13.5px] leading-relaxed text-[#6b7280]" data-space-description="">{space.description}</p> : null}
        </>
      }
      main={
        <FeedView
          communityId={community.id}
          slug={community.slug}
          viewer={view}
          initial={feed}
          spaceId={space.id}
          readOnly={readOnly}
          emptyText={canPost ? "Be the first to post here." : "Nothing here yet."}
          composer={canPost && viewer.userId ? { communityId: community.id, userId: viewer.userId, me, spaces: composerSpaces([space]), fixedSpaceId: space.id, fileProductId, eventHref: eventHrefFor(community, viewer) } : null}
        />
      }
    />
  )
}

import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listFeed } from "@/lib/communities/server/feed"
import { listMessages } from "@/lib/communities/server/chat"
import { ChatView } from "@/components/community/member/chat"
import { eventHrefFor, fileProductFor, meOf, memberPage, shellData } from "@/components/community/member/data"
import { CommunityFeed } from "@/components/community/member/feed"
import { SpaceChips } from "@/components/community/member/space-chips"

/**
 * /community/<slug>/space/<space>: one space's feed, or its chat when the
 * space is a chat space, under the spaces as chips with this one chosen.
 * Only spaces this member may see; any other address is a 404 (the
 * community's layout has already checked membership). A feed space is the
 * same feed as the community's home (feed.tsx CommunityFeed), arriving on
 * this space: its chips switch the list in place from here on (round 7).
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
    return (
      <div className="max-w-[760px]">
        <SpaceChips slug={community.slug} spaces={shell.spaces} active={space.slug} />
        <ChatView communityId={community.id} slug={community.slug} space={space} viewer={view} initial={first} readOnly={readOnly || !space.canPost} />
      </div>
    )
  }

  const [feed, me, fileProductId] = await Promise.all([
    listFeed(admin(), community, viewer, { sort: "default", spaceId: space.id }),
    meOf(community.id, viewer),
    fileProductFor(community, viewer),
  ])
  return (
    <CommunityFeed
      communityId={community.id}
      slug={community.slug}
      viewer={view}
      spaces={shell.spaces}
      start={{ kind: "space", id: space.id }}
      initial={feed}
      servedAt={Date.now()}
      readOnly={readOnly}
      compose={viewer.userId ? { userId: viewer.userId, me, fileProductId, eventHref: eventHrefFor(community, viewer) } : null}
    />
  )
}

import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listSaved } from "@/lib/communities/server/feed"
import { eventHrefFor, fileProductFor, meOf, memberPage, shellData } from "@/components/community/member/data"
import { CommunityFeed } from "@/components/community/member/feed"

/**
 * /community/<slug>/saved: the posts this member saved here, newest saved
 * first. The same feed as the community's home (feed.tsx CommunityFeed),
 * arriving on Saved, so its chips go back to All or a space in place.
 */
export default async function CommunitySavedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const [saved, shell, me, fileProductId] = await Promise.all([listSaved(admin(), community, viewer, null), shellData(community.id, viewer, community), meOf(community.id, viewer), fileProductFor(community, viewer)])
  return (
    <CommunityFeed
      communityId={community.id}
      slug={community.slug}
      viewer={viewerView(viewer)}
      spaces={shell.spaces}
      start={{ kind: "saved" }}
      initial={{ pinned: [], posts: saved.posts, nextCursor: saved.nextCursor }}
      servedAt={Date.now()}
      readOnly={shell.community.archived || !!viewer.mutedUntil}
      compose={viewer.userId ? { userId: viewer.userId, me, fileProductId, eventHref: eventHrefFor(community, viewer) } : null}
    />
  )
}

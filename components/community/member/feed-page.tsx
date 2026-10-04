import "server-only"

/**
 * ===========================================================================
 *  CommunityFeedPage: A COMMUNITY'S HOME, FOR A MEMBER
 * ===========================================================================
 * /community/[slug] belongs to the public side (W3): it shows the sales page
 * to everybody else and renders this for an active member. Inside the frame
 * (the community's layout): the feed (feed.tsx CommunityFeed) with the spaces
 * as chips (All chosen), the sort button and Saved, the welcome (once), the
 * composer, and the posts with pinned ones first. The first page is read on
 * the server, so the page arrives with posts in it; from there the chips
 * switch the list in place, without coming back here (round 7). The columns
 * either side are the frame's (shell-frame.tsx).
 *
 * It checks again on its own: with communities off or no such community it
 * is a 404, and anybody who is not an active member is sent to the
 * community's about page.
 */
import { notFound, redirect } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listFeed } from "@/lib/communities/server/feed"
import { eventHrefFor, fileProductFor, meOf, memberPage, onboardingFor, shellData } from "./data"
import { CommunityFeed } from "./feed"
import { MemberStateScreen } from "./member-state"

async function CommunityFeedPageAsync({ slug }: { slug: string }) {
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  if (page.state !== "member" || !page.viewer) {
    if (page.state === "banned" || page.state === "pending" || page.state === "closed" || page.state === "unknown") return <MemberStateScreen state={page.state} community={page.community} />
    redirect(`/community/${page.community.slug}/about`)
  }
  const { community, viewer } = page
  const [shell, feed, me, fileProductId] = await Promise.all([
    shellData(community.id, viewer, community),
    listFeed(admin(), community, viewer, { sort: "default" }),
    meOf(community.id, viewer),
    fileProductFor(community, viewer),
  ])
  const readOnly = shell.community.archived || !!viewer.mutedUntil
  return (
    /* The frame around this is the community layout's (app/(marketing)/community/[slug]/layout.tsx), shared with every member page. */
    <CommunityFeed
      communityId={community.id}
      slug={community.slug}
      viewer={viewerView(viewer)}
      spaces={shell.spaces}
      start={{ kind: "all" }}
      initial={feed}
      servedAt={Date.now()}
      readOnly={readOnly}
      onboarding={onboardingFor(community, viewer, shell.spaces)}
      compose={viewer.userId ? { userId: viewer.userId, me, fileProductId, eventHref: eventHrefFor(community, viewer) } : null}
    />
  )
}

/** For JSX, as CommunityShell (shell.tsx) explains: `<CommunityFeedPage slug={slug} />`. */
export const CommunityFeedPage = CommunityFeedPageAsync as unknown as (props: { slug: string }) => React.ReactElement

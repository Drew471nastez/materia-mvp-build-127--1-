import "server-only"

/**
 * ===========================================================================
 *  CommunityFeedPage: A COMMUNITY'S HOME, FOR A MEMBER
 * ===========================================================================
 * /community/[slug] belongs to the public side (W3): it shows the sales page
 * to everybody else and renders this for an active member. Inside the frame
 * (the community's layout): the spaces as chips (All chosen), the welcome
 * (once), the composer, the feed with pinned posts first, and from 1024px
 * the side column with the community's card. The first page of the feed is
 * read on the server, so the page arrives with posts in it.
 *
 * It checks again on its own: with communities off or no such community it
 * is a 404, and anybody who is not an active member is sent to the
 * community's about page.
 */
import { notFound, redirect } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listFeed } from "@/lib/communities/server/feed"
import { FeedAside, FeedColumns } from "./columns"
import { composerSpaces, fileProductFor, meOf, memberPage, onboardingFor, shellData, statsFor, upcomingEventFor } from "./data"
import { FeedView } from "./feed"
import { MemberStateScreen } from "./member-state"
import { SpaceChips } from "./space-chips"

async function CommunityFeedPageAsync({ slug }: { slug: string }) {
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  if (page.state !== "member" || !page.viewer) {
    if (page.state === "banned" || page.state === "pending" || page.state === "closed" || page.state === "unknown") return <MemberStateScreen state={page.state} community={page.community} />
    redirect(`/community/${page.community.slug}/about`)
  }
  const { community, viewer } = page
  const [shell, feed, me, fileProductId, upcoming, stats] = await Promise.all([
    shellData(community.id, viewer, community),
    listFeed(admin(), community, viewer, { sort: "latest" }),
    meOf(community.id, viewer),
    fileProductFor(community, viewer),
    upcomingEventFor(community, viewer),
    statsFor(community),
  ])
  const spaces = composerSpaces(shell.spaces)
  const readOnly = shell.community.archived || !!viewer.mutedUntil
  return (
    /* The frame around this is the community layout's (app/(marketing)/community/[slug]/layout.tsx), shared with every member page. */
    <FeedColumns
        header={<SpaceChips slug={community.slug} spaces={shell.spaces} active={null} />}
        main={
          <FeedView
            communityId={community.id}
            slug={community.slug}
            viewer={viewerView(viewer)}
            initial={feed}
            readOnly={readOnly}
            onboarding={onboardingFor(community, viewer, shell.spaces)}
            composer={viewer.userId && spaces.length ? { communityId: community.id, userId: viewer.userId, me, spaces, fileProductId } : null}
          />
        }
        aside={<FeedAside community={shell.community} stats={stats} upcoming={upcoming} />}
      />
  )
}

/** For JSX, as CommunityShell (shell.tsx) explains: `<CommunityFeedPage slug={slug} />`. */
export const CommunityFeedPage = CommunityFeedPageAsync as unknown as (props: { slug: string }) => React.ReactElement

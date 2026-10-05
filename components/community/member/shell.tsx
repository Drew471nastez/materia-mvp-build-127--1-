import "server-only"

/**
 * CommunityShell: the member area's frame around every page of a community,
 * drawn once by the community's layout (app/(marketing)/community/[slug]/
 * layout.tsx) so it stays put while the member moves around. It reads the
 * top bar's facts (whose it is, who is looking, their other communities),
 * the unread messages and the wall's side columns (the community card, the
 * next event, the top contributors: lib/communities/server/wall.ts), then
 * hands plain data to the client frame (shell-frame.tsx).
 *
 * CommunityPublicShell is the same top bar alone, for somebody who is not a
 * member: the sales page, the invite landing, a request waiting.
 *
 * `active` marks a section; left out, the frame works it out from the
 * address ("home" | "classroom" | "events" | "members" | "leaderboard" |
 * "saved" | "notifications" | "about" | "space:<slug>").
 *
 * Both draw MediaLinks (media-viewer.tsx) once: a press on a picture or a
 * video anywhere in the community opens the app's own viewer, never the raw
 * file in a new tab.
 */
import type { Viewer } from "@/lib/communities/server/context"
import { viewerView } from "@/lib/communities/server/context"
import { topBarData } from "@/lib/communities/server/public"
import { admin } from "@/lib/communities/server/db"
import { wallData } from "@/lib/communities/server/wall"
import type { CommunityRow } from "@/lib/communities/types"
import { CommunityPublicFrame } from "@/components/community/public/public-frame"
import { shellData, toShellCommunity } from "./data"
import { MediaLinks } from "./media-viewer"
import { ShellFrame } from "./shell-frame"
import type { ShellSection } from "./view-types"

async function CommunityShellAsync({ community, viewer, active, children }: { community: CommunityRow; viewer: Viewer; active?: ShellSection; children: React.ReactNode }) {
  const [data, topBar, wall] = await Promise.all([shellData(community.id, viewer, community), topBarData(community, viewer), wallData(admin(), community, viewer)])
  return (
    <>
      <ShellFrame community={data.community} viewer={viewerView(viewer)} topBar={topBar} unreadMessages={data.unreadMessages} wall={wall} active={active}>
        {children}
      </ShellFrame>
      <MediaLinks communityId={community.id} />
    </>
  )
}

async function CommunityPublicShellAsync({ community, viewer, children }: { community: CommunityRow; viewer: Viewer | null; children: React.ReactNode }) {
  const topBar = await topBarData(community, viewer)
  /*
    THE LEFT COLUMN'S CARD FOR A VISITOR (round 12): the member frame's community card from what the page already has, its cover,
    name, address and member count (the trigger kept count). No faces, no Online, no Admins: who is in it is a member's to see.
  */
  const card = { community: toShellCommunity(community), card: { stats: { members: community.member_count ?? 0, online: null, admins: null }, faces: [], more: 0, settingsHref: null } }
  return (
    <>
      <CommunityPublicFrame topBar={topBar} card={card}>
        {children}
      </CommunityPublicFrame>
      <MediaLinks communityId={community.id} />
    </>
  )
}

/*
  AN ASYNC SERVER COMPONENT, TYPED FOR JSX. This repo's @types/react (19.0.0)
  rejects a component that returns a Promise in JSX (app/layout.tsx has the
  same error for its own async root), although React and Next render it.
  The cast keeps `<CommunityShell ... />` free of that error for every page
  that uses it, without changing what renders.
*/
export const CommunityShell = CommunityShellAsync as unknown as (props: { community: CommunityRow; viewer: Viewer; active?: ShellSection; children: React.ReactNode }) => React.ReactElement

/** The top bar alone around a community page, for somebody who is not a member. */
export const CommunityPublicShell = CommunityPublicShellAsync as unknown as (props: { community: CommunityRow; viewer: Viewer | null; children: React.ReactNode }) => React.ReactElement

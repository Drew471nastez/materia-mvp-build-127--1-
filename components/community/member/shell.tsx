import "server-only"

/**
 * CommunityShell: the member area's frame around a page, for the route
 * group's layout (app/(marketing)/community/[slug]/(member)/layout.tsx) and
 * for the community's home (feed-page.tsx), which W3's /community/[slug]
 * renders for members. It reads the spaces this viewer may see, their unread
 * chat counts and the unread notifications, then hands plain data to the
 * client frame (shell-frame.tsx).
 *
 * `active` marks a section; left out, the frame works it out from the
 * address ("home" | "classroom" | "events" | "members" | "leaderboard" |
 * "saved" | "notifications" | "space:<slug>").
 */
import type { Viewer } from "@/lib/communities/server/context"
import { viewerView } from "@/lib/communities/server/context"
import type { CommunityRow } from "@/lib/communities/types"
import { shellData } from "./data"
import { ShellFrame } from "./shell-frame"
import type { ShellSection } from "./view-types"

async function CommunityShellAsync({ community, viewer, active, children }: { community: CommunityRow; viewer: Viewer; active?: ShellSection; children: React.ReactNode }) {
  const data = await shellData(community.id, viewer, community)
  return (
    <ShellFrame community={data.community} viewer={viewerView(viewer)} spaces={data.spaces} unreadNotifications={data.unreadNotifications} active={active}>
      {children}
    </ShellFrame>
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

/**
 * The community's picture, or its initials on a quiet grey square: the top
 * bar's (top-bar.tsx) and the wall card's (wall.tsx). While the picture is
 * on its way the square stays a quiet grey and the picture fades in over
 * it; the initials only stand in when there is no picture, or it is slow
 * (app-avatar.tsx BLANK_LIMIT_MS), so a community never shows its initials
 * and then swaps them for its logo. On its own, so the wall
 * (and the tests that read it) do not pull in the bar and the Storelib
 * account menu it carries. Server safe: no hooks.
 */
import { AppAvatar } from "@/components/app/app-avatar"
import type { TopBarCommunity } from "./view-types"

const MARK_DEPTH = "shadow-[0_0_0_1px_rgba(16,24,40,0.07),0_1px_2px_rgba(16,24,40,0.1)]"

export function CommunityMark({
  community,
  size,
  priority = false,
}: {
  community: Pick<TopBarCommunity, "name" | "logoUrl">
  size: number
  /** In the bar: fetch at once rather than as the mark nears the screen. */
  priority?: boolean
}) {
  return (
    <AppAvatar
      src={community.logoUrl}
      name={community.name}
      alt=""
      size={size}
      className={`shrink-0 rounded-[10px] bg-[#f1f2f4] ${MARK_DEPTH}`}
      kind="mark"
      lazy={!priority}
    />
  )
}

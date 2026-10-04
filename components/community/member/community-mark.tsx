/**
 * The community's picture, or its initials on a quiet grey square: the top
 * bar's (top-bar.tsx) and the wall card's (wall.tsx). On its own, so the wall
 * (and the tests that read it) do not pull in the bar and the Storelib
 * account menu it carries. Server safe: no hooks.
 */
import { AppAvatar } from "@/components/app/app-avatar"
import type { TopBarCommunity } from "./view-types"

export function CommunityMark({ community, size }: { community: Pick<TopBarCommunity, "name" | "logoUrl">; size: number }) {
  return <AppAvatar src={community.logoUrl} name={community.name} alt="" size={size} className="shrink-0 rounded-[10px]" markWhileLoading />
}

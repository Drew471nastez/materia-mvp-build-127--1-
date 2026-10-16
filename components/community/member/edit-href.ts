/**
 * Where the admin changes a block of the member side (round 33, ./edit-hint.tsx): for somebody who may open /app for this
 * community (the owner, or staff with a creator account) and may change that block. Pure; no components.
 */
import type { CommunityAction } from "@/lib/communities/permissions"
import type { ViewerView } from "@/lib/communities/types"

/** The admin's place for this block, for a viewer who may open it and change it; null for everybody else. */
export function adminHref(slug: string, viewer: Pick<ViewerView, "isOwner" | "isCreatorAccount" | "active" | "can"> | null | undefined, action: CommunityAction, tab: string): string | null {
  if (!viewer || !viewer.active || !(viewer.isOwner || viewer.isCreatorAccount) || !viewer.can?.[action]) return null
  return `/app/community/${slug}/${tab}`
}

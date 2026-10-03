/**
 * The moderator's actions from a member screen, sent to the moderation
 * routes (app/api/community/[communityId]/moderation/*, ARCH 4). What a menu
 * offers is decided by can() and canActOn() from the viewer's role, and the
 * route decides again on the server: a menu item is a convenience, never the
 * permission. Browser safe.
 */
import { canActOn } from "@/lib/communities/permissions"
import type { Role, ViewerView } from "@/lib/communities/types"
import { api, apiBase, type ApiResult } from "./api"

export type ContentAction = "remove" | "restore" | "pin" | "unpin" | "lock" | "unlock" | "feature" | "unfeature" | "move"
export type MemberAction = "mute" | "unmute" | "suspend" | "unsuspend" | "ban" | "unban" | "remove" | "approve" | "reject" | "role"

export function actOnContent(
  communityId: string,
  body: { action: ContentAction; targetType: "post" | "comment" | "message"; targetId: string; reason?: string; spaceId?: string },
): Promise<ApiResult<Record<string, unknown>>> {
  return api(`${apiBase(communityId)}/moderation/act`, { body })
}

export function actOnMember(communityId: string, body: { action: MemberAction; userId: string; reason?: string; until?: string; role?: Role }): Promise<ApiResult<Record<string, unknown>>> {
  return api(`${apiBase(communityId)}/moderation/members`, { body })
}

/** What this viewer may do about a piece of content and its author, from their role alone. */
export function moderationMenu(viewer: Pick<ViewerView, "can" | "role" | "userId">, author: { id: string; role: Role | null } | null) {
  const onAuthor = !!author && author.id !== viewer.userId && canActOn(viewer.role, author.role ?? "member")
  return {
    remove: !!viewer.can.moderate_content,
    pin: !!viewer.can.pin,
    lock: !!viewer.can.lock,
    mute: !!viewer.can.mute && onAuthor,
    ban: !!viewer.can.ban && onAuthor,
  }
}

/** A mute from now, for a day. */
export function muteUntil(hours = 24, now = Date.now()): string {
  return new Date(now + hours * 3_600_000).toISOString()
}

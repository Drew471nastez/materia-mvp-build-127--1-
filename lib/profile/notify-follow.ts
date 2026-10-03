import "server-only"

/**
 * "Ana followed you", in the person's notifications.
 *
 * Written through the notifications inbox (lib/notifications/user-inbox.ts
 * notifyUser, run-now part 85). Before that part has run there is no inbox,
 * and the follow simply happens without a notice: nothing is logged and
 * nothing fails. One notice per follower and person, ever (the dedupe key),
 * so following, unfollowing and following again does not knock three times.
 */
import { notifyUser } from "@/lib/notifications/user-inbox"
import { personHref } from "./person-href"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export function followDedupeKey(followerId: string, targetId: string): string {
  return `follow:${followerId}:${targetId}`
}

export async function notifyNewFollower(db: Db, input: { followerId: string; targetId: string }): Promise<"sent" | "skipped"> {
  if (!input.followerId || !input.targetId || input.followerId === input.targetId) return "skipped"
  try {
    const [{ data: profile }, { data: creator }] = await Promise.all([
      db.from("profiles").select("display_name, username, avatar_url").eq("id", input.followerId).maybeSingle(),
      db.from("creators").select("onboarding_completed").eq("user_id", input.followerId).maybeSingle(),
    ])
    const p = (profile ?? {}) as { display_name?: string | null; username?: string | null; avatar_url?: string | null }
    const name = (p.display_name || "").trim() || (p.username ? `@${p.username}` : "Someone")
    const outcome = await notifyUser(db, {
      userId: input.targetId,
      kind: "new_follower",
      source: "following",
      actorId: input.followerId,
      title: `${name.slice(0, 120)} followed you`,
      url: personHref({ username: p.username ?? null, hasStorefront: !!(creator as { onboarding_completed?: boolean } | null)?.onboarding_completed }),
      imageUrl: p.avatar_url || null,
      dedupeKey: followDedupeKey(input.followerId, input.targetId),
    })
    return outcome === "sent" ? "sent" : "skipped"
  } catch {
    return "skipped"
  }
}

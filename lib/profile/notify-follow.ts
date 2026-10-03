import "server-only"

/**
 * "Ana followed you", in the person's notifications.
 *
 * Written straight to `user_notifications` (run-now part 85). Before that
 * part has run there is no inbox, and the follow simply happens without a
 * notice: nothing is logged and nothing fails. One notice per follower and
 * person, ever (the dedupe key), so following, unfollowing and following
 * again does not knock three times.
 *
 * The notifications worker's notifyUser (lib/notifications/user-inbox.ts)
 * writes the same row; this stays small so a follow never waits on more
 * than one insert.
 */
import { personHref } from "./person-href"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const SILENT = new Set(["42P01", "PGRST205", "42703", "PGRST204", "23505"])

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
    const { error } = await db.from("user_notifications").insert({
      user_id: input.targetId,
      kind: "new_follower",
      source: "following",
      actor_id: input.followerId,
      title: `${name.slice(0, 120)} followed you`,
      url: personHref({ username: p.username ?? null, hasStorefront: !!(creator as { onboarding_completed?: boolean } | null)?.onboarding_completed }),
      image_url: p.avatar_url || null,
      dedupe_key: followDedupeKey(input.followerId, input.targetId),
    })
    if (error) {
      if (!SILENT.has(String(error.code ?? ""))) console.error("[follow] notification not written", error.code, error.message)
      return "skipped"
    }
    return "sent"
  } catch {
    return "skipped"
  }
}

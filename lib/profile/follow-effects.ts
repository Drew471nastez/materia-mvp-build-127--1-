import "server-only"

/**
 * What a new follow sets off, after the follow itself is saved by the
 * person's own client (app/api/follow): the follower gets a handle if they
 * had none, so the notice can link to them, and the person followed gets
 * "Ana followed you". Never throws and never undoes the follow.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureUsername } from "./ensure-username"
import { notifyNewFollower } from "./notify-follow"

export async function afterFollow(followerId: string, targetId: string): Promise<void> {
  try {
    const db = createAdminClient()
    await ensureUsername(db, followerId)
    await notifyNewFollower(db, { followerId, targetId })
  } catch (e) {
    console.error("[follow] after follow", e instanceof Error ? e.message : e)
  }
}

import "server-only"

/**
 * The Activity tab's next page, for the page itself and for "Show more"
 * (app/api/profile/activity). One place decides whether there is anything
 * to show: a person who hid their activity shows none to anybody but
 * themselves, and community activity only exists while communities are on.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { readProfileActivity, type ProfileActivityItem } from "./activity"
import { decodeCursor, encodeCursor } from "./activity-cursor"
import { readPrivacy } from "./privacy"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ActivityAnswer {
  items: ProfileActivityItem[]
  next: string | null
  hidden: boolean
}

export async function activityFor(
  db: Db,
  input: { userId: string; viewerId: string | null; cursor?: unknown; creator?: { id: string; handle: string | null } | null; showActivity?: boolean },
): Promise<ActivityAnswer> {
  const self = !!input.viewerId && input.viewerId === input.userId
  const show = typeof input.showActivity === "boolean" ? input.showActivity : (await readPrivacy(db, input.userId)).showActivity
  if (!show && !self) return { items: [], next: null, hidden: true }
  let creator = input.creator
  if (creator === undefined) {
    const { data } = await db.from("creators").select("id, onboarding_completed").eq("user_id", input.userId).maybeSingle()
    const row = data as { id: string; onboarding_completed: boolean | null } | null
    const { data: p } = await db.from("profiles").select("username").eq("id", input.userId).maybeSingle()
    creator = row?.onboarding_completed ? { id: row.id, handle: (p as { username?: string | null } | null)?.username ?? null } : null
  }
  const page = await readProfileActivity(db, {
    userId: input.userId,
    creatorId: creator?.id ?? null,
    storeHandle: creator?.handle ?? null,
    communities: await communitiesEnabled().catch(() => false),
    after: decodeCursor(input.cursor),
  })
  return { items: page.items, next: page.next ? encodeCursor(page.next) : null, hidden: !show }
}

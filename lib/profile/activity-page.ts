import "server-only"

/**
 * The Activity tab's next page, for the page itself and for "Show more"
 * (app/api/profile/activity). One place decides whether there is anything
 * to show: a person who hid their activity shows none to anybody but
 * themselves, and community activity only exists while communities are on.
 *
 * NOBODY WITH A STORE HAS ACTIVITY. The owner: "In creator pages or creator
 * profiles there should be no activity." Their pages draw no Activity tab,
 * and this answers an empty list for them too, so "Show more" or a direct
 * call to app/api/profile/activity cannot bring it back.
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
    creator = row?.onboarding_completed ? { id: row.id, handle: null } : null
  }
  if (creator) return { items: [], next: null, hidden: false }
  const page = await readProfileActivity(db, {
    userId: input.userId,
    creatorId: null,
    storeHandle: null,
    communities: await communitiesEnabled().catch(() => false),
    after: decodeCursor(input.cursor),
  })
  return { items: page.items, next: page.next ? encodeCursor(page.next) : null, hidden: !show }
}

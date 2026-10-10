import "server-only"

/**
 * A store's analytics and ad pixel IDs (lib/store/tracking.ts), in
 * store_settings.tracking (SQL part 112). Read for every published page of
 * the store's website through a short cache, so a visitor's page never waits
 * on it; a save clears that cache, so the next view carries the change.
 */
import { unstable_cache, revalidateTag } from "next/cache"
import { TRACKER_ORDER, readTracking, tidyId, TRACKERS, type Tracking, type TrackerId } from "./tracking"
import { isMissingTable } from "./settings-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const TRACKING_NEEDS_PART = "Analytics and pixels need their database update. Run SQL part 112 in Supabase, then try again."
export const trackingTag = (creatorId: string) => `store-tracking:${creatorId}`

export async function loadTracking(db: Db, creatorId: string): Promise<{ tracking: Tracking; ready: boolean }> {
  const { data, error } = await db.from("store_settings").select("tracking").eq("creator_id", creatorId).maybeSingle()
  if (error) return { tracking: {}, ready: !isMissingTable(error) }
  return { tracking: readTracking(data?.tracking), ready: true }
}

/** For a published page: the IDs, cached for five minutes and cleared on save. Never throws. */
export function publishedTracking(db: Db, creatorId: string): Promise<Tracking> {
  return unstable_cache(
    async () => {
      try {
        return (await loadTracking(db, creatorId)).tracking
      } catch {
        return {}
      }
    },
    ["store-tracking", creatorId],
    { revalidate: 300, tags: [trackingTag(creatorId)] },
  )()
}

/** One ID set or removed (null). */
export async function saveTrackerId(db: Db, creatorId: string, id: unknown, value: unknown): Promise<{ ok: true; tracking: Tracking } | { ok: false; error: string; status: number }> {
  if (typeof id !== "string" || !(TRACKER_ORDER as string[]).includes(id)) return { ok: false, error: "That integration was not found.", status: 404 }
  const tracker = id as TrackerId
  const tidy = tidyId(tracker, value)
  if (tidy === "bad") return { ok: false, error: `That isn't a ${TRACKERS[tracker].name} ${TRACKERS[tracker].label.toLowerCase()}. It looks like ${TRACKERS[tracker].example}.`, status: 400 }
  const now = await loadTracking(db, creatorId)
  if (!now.ready) return { ok: false, error: TRACKING_NEEDS_PART, status: 409 }
  const next: Tracking = { ...now.tracking }
  if (tidy) next[tracker] = tidy
  else delete next[tracker]
  const { error } = await db.from("store_settings").upsert({ creator_id: creatorId, tracking: next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (error) return { ok: false, error: isMissingTable(error) ? TRACKING_NEEDS_PART : "It could not be saved.", status: isMissingTable(error) ? 409 : 500 }
  try {
    revalidateTag(trackingTag(creatorId), { expire: 0 })
  } catch {
    /* Outside a request (tests): the cache runs out on its own in five minutes. */
  }
  return { ok: true, tracking: next }
}

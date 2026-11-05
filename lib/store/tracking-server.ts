import "server-only"

/**
 * A store's analytics and ad pixel IDs (lib/store/tracking.ts), in
 * store_settings.tracking (SQL part 112). Read for every published page of
 * the store's website through a short cache, so a visitor's page never waits
 * on it; a save clears that cache, so the next view carries the change.
 */
import { unstable_cache, revalidateTag } from "next/cache"
import { TRACKER_ORDER, readTracking, tidyAdsLabel, tidyId, TRACKERS, type Tracking, type TrackerId } from "./tracking"
import { isMissingTable } from "./settings-server"
import { readGaInput } from "./ga"

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

/** Google Ads' purchase conversion label (lib/store/tracking.ts tidyAdsLabel), set or removed (null). It needs the Conversion ID saved first. */
async function saveAdsLabel(db: Db, creatorId: string, value: unknown): Promise<{ ok: true; tracking: Tracking } | { ok: false; error: string; status: number }> {
  const tidy = tidyAdsLabel(value)
  if (tidy === "bad") return { ok: false, error: "That isn't a conversion label. It looks like AbC-D_efGh12, the part after the slash in send_to.", status: 400 }
  const now = await loadTracking(db, creatorId)
  if (!now.ready) return { ok: false, error: TRACKING_NEEDS_PART, status: 409 }
  if (tidy && !now.tracking.google_ads) return { ok: false, error: "Add your Conversion ID first.", status: 409 }
  if (tidy?.id && tidy.id !== now.tracking.google_ads) return { ok: false, error: `That label is for ${tidy.id}. Your Conversion ID is ${now.tracking.google_ads}.`, status: 400 }
  const next: Tracking = { ...now.tracking }
  if (tidy) next.google_ads_label = tidy.label
  else delete next.google_ads_label
  return writeTracking(db, creatorId, next)
}

async function writeTracking(db: Db, creatorId: string, next: Tracking): Promise<{ ok: true; tracking: Tracking } | { ok: false; error: string; status: number }> {
  const { error } = await db.from("store_settings").upsert({ creator_id: creatorId, tracking: next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (error) return { ok: false, error: isMissingTable(error) ? TRACKING_NEEDS_PART : "It could not be saved.", status: isMissingTable(error) ? 409 : 500 }
  try {
    revalidateTag(trackingTag(creatorId), { expire: 0 })
  } catch {
    /* Outside a request (tests): the cache runs out on its own in five minutes. */
  }
  return { ok: true, tracking: next }
}

/** One ID set or removed (null); `google_ads_label` is Google Ads' purchase conversion label. */
export async function saveTrackerId(db: Db, creatorId: string, id: unknown, value: unknown): Promise<{ ok: true; tracking: Tracking } | { ok: false; error: string; status: number }> {
  if (id === "google_ads_label") return saveAdsLabel(db, creatorId, value)
  if (typeof id !== "string" || !(TRACKER_ORDER as string[]).includes(id)) return { ok: false, error: "That integration was not found.", status: 404 }
  const tracker = id as TrackerId
  const tidy = tidyId(tracker, value)
  if (tidy === "bad") {
    /* Google Analytics says what was pasted instead (a UA- ID, a property number, a GT- tag), lib/store/ga.ts. */
    const said = tracker === "ga4" ? readGaInput(value) : null
    return { ok: false, error: said && said.ok === false ? said.error : `That isn't a ${TRACKERS[tracker].name} ${TRACKERS[tracker].label.toLowerCase()}. It looks like ${TRACKERS[tracker].example}.`, status: 400 }
  }
  const now = await loadTracking(db, creatorId)
  if (!now.ready) return { ok: false, error: TRACKING_NEEDS_PART, status: 409 }
  const next: Tracking = { ...now.tracking }
  if (tidy) next[tracker] = tidy
  else delete next[tracker]
  /* A label goes with the ID it was issued for: a new or removed Conversion ID takes it away. */
  if (tracker === "google_ads" && next.google_ads !== now.tracking.google_ads) delete next.google_ads_label
  return writeTracking(db, creatorId, next)
}

/**
 * ===========================================================================
 *  IS GOOGLE ANALYTICS RECEIVING DATA?
 * ===========================================================================
 * store_settings.tracking_seen (SQL part 173), per service:
 *
 *   at          the last time a visitor's browser saw Google take a hit with
 *               the store's measurement ID (lib/store/ga.ts gaSeenJs, sent
 *               to app/api/store/ga-seen at most once a tab)
 *   checkedAt   the last time the owner's Check in Settings loaded the tag
 *               and saw the hit leave (app/api/store/ga-check)
 *
 * Both are for the ID they were seen with: a new ID starts over. Written at
 * most once a minute a store, so a busy website costs nothing. Until part
 * 173 runs nothing is kept and Settings shows the Check's answer alone.
 */
export interface GaStatus {
  id: string | null
  /** A visitor's page sent Google a hit with this ID (ISO time). */
  seenAt: string | null
  /** The owner's Check loaded the tag and saw it send (ISO time). */
  checkedAt: string | null
  /** False until SQL part 173 has run. */
  ready: boolean
}

type Seen = { ga4?: { id?: unknown; at?: unknown; checkedAt?: unknown } }

export async function loadGaStatus(db: Db, creatorId: string, gaId?: string | null): Promise<GaStatus> {
  const id = gaId === undefined ? (await loadTracking(db, creatorId)).tracking.ga4 ?? null : gaId
  const { data, error } = await db.from("store_settings").select("tracking_seen").eq("creator_id", creatorId).maybeSingle()
  if (error) return { id, seenAt: null, checkedAt: null, ready: false }
  const g = ((data?.tracking_seen ?? {}) as Seen).ga4
  const same = !!g && typeof g.id === "string" && g.id === id
  const iso = (v: unknown) => (same && typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null)
  return { id, seenAt: iso(g?.at), checkedAt: iso(g?.checkedAt), ready: true }
}

const seenWritten = new Map<string, number>()

/** A hit seen (`at`) or the owner's Check passed (`checkedAt`), for the store's current ID only. Never throws; false when nothing was kept. */
export async function recordGaSeen(db: Db, creatorId: string, id: string, field: "at" | "checkedAt", now = Date.now()): Promise<boolean> {
  try {
    const key = `${creatorId}:${field}`
    /* One question to the database a minute a store, whether or not anything is kept: a page that floods this costs nothing. */
    if (field === "at" && now - (seenWritten.get(key) ?? 0) < 60_000) return false
    if (seenWritten.size > 10_000) seenWritten.clear()
    if (field === "at") seenWritten.set(key, now)
    const { tracking } = await loadTracking(db, creatorId)
    if (!tracking.ga4 || tracking.ga4 !== id) return false
    const { data, error } = await db.from("store_settings").select("tracking_seen").eq("creator_id", creatorId).maybeSingle()
    if (error) return false
    const seen = ((data?.tracking_seen ?? {}) as Seen & Record<string, unknown>) || {}
    const prev = seen.ga4 && seen.ga4.id === id ? seen.ga4 : {}
    if (field === "at" && typeof prev.at === "string" && now - Date.parse(prev.at) < 60_000) return false
    const next = { ...seen, ga4: { ...prev, id, [field]: new Date(now).toISOString() } }
    const { error: wrote } = await db.from("store_settings").update({ tracking_seen: next }).eq("creator_id", creatorId)
    return !wrote
  } catch {
    return false
  }
}

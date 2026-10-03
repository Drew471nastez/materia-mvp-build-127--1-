import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S VIDEOS: SENT, CHECKED, PLAYED, KEPT IN STEP
 * ===========================================================================
 * Every video is a media_videos row with the community it belongs to and the
 * creator whose storage holds it. The provider (lib/video/provider.ts) is
 * fixed at upload: Storelib's own storage unless a video service is
 * connected.
 *
 * SENDING (prepareVideoUpload, completeVideoUpload). The server checks the
 * name, the declared type and the size before a byte moves (the same
 * precheck every upload on Storelib gets), checks the creator's storage
 * quota for the storage provider (their product files, their courses and
 * their community videos together), makes the row and hands back a ticket.
 * When the browser says it is done, a stored file is checked where it
 * landed (its real size and its first bytes) and removed if it fails;
 * then the video is ready, with the length the browser read from the
 * file's own metadata. A video on a service waits for its webhook, and a
 * video_poll job asks the service in case the webhook never comes.
 *
 * WHO MAY WATCH (videoAccess). Decided from where the video is used, on
 * every play: the community's cover video is public on a published public
 * page; an event's replay follows the event's access rule and opens when
 * the event is over; a post's video follows its space's access rule. Staff
 * may watch everything in their community. A video used nowhere is for
 * staff only. A video of another community is never found.
 *
 * WEBHOOKS (applyVideoWebhook). Each event is taken once: its id goes in
 * media_video_events first, and a second delivery of the same id changes
 * nothing. An update never moves a ready video back to processing (events
 * can arrive out of order).
 */
import { STORAGE_BUCKET, getPlanLimits } from "@/lib/storage/plans"
import { getCreatorStorageUsage } from "@/lib/storage/quota"
import { readStoredHead, storedObjectSize } from "@/lib/storage/upload-guard"
import { inspectHead, precheckUpload } from "@/lib/security/uploads/inspect"
import { CAPTION_MAX_BYTES, isCaptionName, looksLikeCaptions } from "@/lib/courses/captions"
import { activeProvider, adapterFor, isProviderName } from "@/lib/video/provider"
import { communityMediaPath, isCommunityMediaPath } from "@/lib/video/storage"
import { MEMBER_VIDEO_MAX_BYTES, PLAYBACK_SECONDS, STAFF_VIDEO_MAX_BYTES, cleanDimension, cleanDuration, type UploadTicket, type VideoPlayback, type VideoProviderName, type VideoStatusView } from "@/lib/video/types"
import { evaluateAccess, parseAccessRule } from "../access"
import { meetsRole } from "../permissions"
import type { CommunityRow, MediaVideoRow } from "../types"
import type { Viewer } from "./context"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"
import { queueJob } from "./notify"

export const VIDEO_COLUMNS =
  "id, creator_id, community_id, provider, status, storage_path, provider_asset_id, playback_id, thumbnail_url, duration_seconds, width, height, size_bytes, mime, captions_path, error, created_at, updated_at"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Videos one community may have half sent at once. */
export const MAX_PENDING_VIDEOS = 8

/** How long the video_poll job keeps asking a service about a video: every two minutes for a day. */
export const VIDEO_POLL_EVERY_MS = 2 * 60_000
export const VIDEO_POLL_MAX_TRIES = 720

export type VideoFailure = { ok: false; status: number; error: string; message: string }
const fail = (status: number, error: string, message: string): VideoFailure => ({ ok: false, status, error, message })

export function videoStatusView(v: MediaVideoRow): VideoStatusView {
  return {
    id: v.id,
    provider: v.provider,
    status: v.status,
    durationSeconds: v.duration_seconds,
    width: v.width,
    height: v.height,
    sizeBytes: v.size_bytes,
    thumbnailUrl: v.thumbnail_url,
    hasCaptions: Boolean(v.captions_path),
    error: v.error,
    createdAt: v.created_at,
  }
}

/** A video of THIS community, or null (another community's video is never found). */
export async function readCommunityVideo(db: Db, communityId: string, videoId: string): Promise<MediaVideoRow | null> {
  if (!UUID.test(videoId) || !UUID.test(communityId)) return null
  const { data, error } = await db.from("media_videos").select(VIDEO_COLUMNS).eq("id", videoId).eq("community_id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] video read: ${reasonOf(error)}`)
    return null
  }
  return (data as MediaVideoRow | null) ?? null
}

/** Bytes a creator's community videos hold in Storelib's storage. */
export async function communityVideoBytes(db: Db, creatorId: string): Promise<number> {
  const { data, error } = await db.from("media_videos").select("size_bytes").eq("creator_id", creatorId).eq("provider", "storage").neq("status", "failed")
  if (error) return 0
  return ((data as { size_bytes: number | null }[] | null) ?? []).reduce((s, r) => s + (Number(r.size_bytes) || 0), 0)
}

async function creatorPlan(db: Db, creatorId: string): Promise<string | null> {
  const { data } = await db.from("creators").select("subscription_plan_id").eq("id", creatorId).maybeSingle()
  return (data as { subscription_plan_id?: string | null } | null)?.subscription_plan_id ?? null
}

/** Whether this viewer is staff in the community: they may send bigger files and watch everything. */
export function isStaff(viewer: Pick<Viewer, "role" | "active">): boolean {
  return viewer.active && meetsRole(viewer.role, "moderator")
}

export interface PrepareInput {
  community: CommunityRow
  staff: boolean
  fileName: unknown
  contentType: unknown
  fileSize: unknown
  origin: string | null
  /** Tests pass the env a provider reads. */
  env?: Record<string, string | undefined>
}

export async function prepareVideoUpload(db: Db, input: PrepareInput): Promise<{ ok: true; ticket: UploadTicket; video: MediaVideoRow } | VideoFailure> {
  const creatorId = input.community.creator_id
  if (!creatorId) return fail(409, "no_creator", "This community has no creator account to keep its videos.")
  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 255) : ""
  const contentType = typeof input.contentType === "string" ? input.contentType.slice(0, 120) : ""
  const size = Number(input.fileSize)
  if (!fileName || !Number.isFinite(size) || size <= 0) return fail(400, "empty", "That file is empty.")
  const maxBytes = input.staff ? STAFF_VIDEO_MAX_BYTES : MEMBER_VIDEO_MAX_BYTES
  const verdict = precheckUpload({ fileName, size, declaredMime: contentType, context: "video", maxBytes })
  if (!verdict.ok) return fail(verdict.code === "too_large" ? 413 : 415, verdict.code, verdict.userMessage || "This file can't be uploaded.")

  const provider = activeProvider(input.env)
  const { count: pending, error: pendingError } = await db
    .from("media_videos")
    .select("id", { count: "exact", head: true })
    .eq("community_id", input.community.id)
    .eq("status", "uploading")
    .gte("created_at", nowIso(Date.now() - 60 * 60_000))
  if (pendingError) {
    if (missing(pendingError)) return fail(503, "not_set_up", "Videos are not set up on Storelib yet. Try again later.")
    return fail(500, "failed", "Could not start the upload. Try again.")
  }
  if ((pending ?? 0) >= MAX_PENDING_VIDEOS) return fail(429, "too_many", "A few videos are still uploading. Wait for them to finish, then try again.")

  if (provider === "storage") {
    const quota = getPlanLimits(await creatorPlan(db, creatorId)).storageQuotaBytes
    const used = (await getCreatorStorageUsage(db, creatorId).catch(() => 0)) + (await communityVideoBytes(db, creatorId))
    if (used + size > quota) return fail(403, "quota", `This would go over the ${Math.round(quota / 1024 ** 3)} GB of storage on this community's plan.`)
  }

  const id = crypto.randomUUID()
  const row = { id, creator_id: creatorId, community_id: input.community.id, provider, status: "uploading", mime: contentType.startsWith("video/") ? contentType : null, size_bytes: Math.round(size) }
  const { data: made, error } = await db.from("media_videos").insert(row).select(VIDEO_COLUMNS).single()
  if (error || !made) {
    console.error(`[communities] video row: ${reasonOf(error)}`)
    return fail(500, "failed", "Could not start the upload. Try again.")
  }
  const video = made as MediaVideoRow
  try {
    const plan = await adapterFor(provider).createUpload(db, { video, fileName, contentType, size, origin: input.origin }, input.env)
    const { error: patchError } = await db.from("media_videos").update(plan.patch).eq("id", id)
    if (patchError) throw new Error(reasonOf(patchError))
    return {
      ok: true,
      video: { ...video, ...plan.patch } as MediaVideoRow,
      ticket: { videoId: id, provider, method: plan.method, url: plan.url, path: plan.path, token: plan.token, headers: plan.headers },
    }
  } catch (e) {
    console.error(`[communities] video upload start (${provider}): ${reasonOf(e)}`)
    await db.from("media_videos").update({ status: "failed", error: "The upload could not start." }).eq("id", id)
    return fail(502, "failed", "Could not start the upload. Try again.")
  }
}

export interface CompleteInput {
  community: CommunityRow
  videoId: unknown
  durationSeconds?: unknown
  width?: unknown
  height?: unknown
  staff: boolean
}

export async function completeVideoUpload(db: Db, input: CompleteInput): Promise<{ ok: true; video: MediaVideoRow } | VideoFailure> {
  const video = typeof input.videoId === "string" ? await readCommunityVideo(db, input.community.id, input.videoId) : null
  if (!video) return fail(404, "not_found", "Upload not found.")
  /* Asked twice: the first answer stands. */
  if (video.status !== "uploading") return { ok: true, video }
  const duration = cleanDuration(input.durationSeconds)
  const width = cleanDimension(input.width)
  const height = cleanDimension(input.height)

  if (video.provider !== "storage") {
    const patch = { status: "processing" as const, ...(duration ? { duration_seconds: duration } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}) }
    await db.from("media_videos").update(patch).eq("id", video.id).eq("status", "uploading")
    await queueJob(db, { kind: "video_poll", payload: { videoId: video.id, tries: 0 }, runAt: new Date(Date.now() + VIDEO_POLL_EVERY_MS), idempotencyKey: `video_poll:${video.id}` })
    return { ok: true, video: { ...video, ...patch } }
  }

  const path = video.storage_path
  if (!isCommunityMediaPath(path, video.creator_id, video.id)) return fail(404, "not_found", "Upload not found.")
  const size = await storedObjectSize(db, STORAGE_BUCKET, path)
  if (size === null) return fail(400, "missing", "The upload did not arrive. Try again.")
  const refuse = async (status: number, message: string): Promise<VideoFailure> => {
    await db.storage.from(STORAGE_BUCKET).remove([path]).then(() => undefined, () => undefined)
    await db.from("media_videos").update({ status: "failed", error: message.slice(0, 300), storage_path: null }).eq("id", video.id)
    return fail(status, "refused", message)
  }
  const head = await readStoredHead(db, STORAGE_BUCKET, path)
  const verdict = inspectHead({ fileName: path.split("/").pop() || "video.mp4", declaredMime: video.mime, size, head, context: "video", maxBytes: input.staff ? STAFF_VIDEO_MAX_BYTES : MEMBER_VIDEO_MAX_BYTES })
  if (!verdict.ok) return refuse(verdict.code === "too_large" ? 413 : 415, verdict.userMessage || "This file can't be uploaded.")

  const patch = { status: "ready" as const, size_bytes: size, duration_seconds: duration, width, height, error: null }
  const { error } = await db.from("media_videos").update(patch).eq("id", video.id).eq("status", "uploading")
  if (error) return refuse(500, "The video could not be saved. Try again.")
  return { ok: true, video: { ...video, ...patch } }
}

/* ── Captions, for a video kept in storage ──────────────────────────────── */

export async function prepareCaptions(db: Db, community: CommunityRow, input: { videoId: unknown; fileName: unknown; fileSize: unknown }): Promise<{ ok: true; ticket: UploadTicket } | VideoFailure> {
  const video = typeof input.videoId === "string" ? await readCommunityVideo(db, community.id, input.videoId) : null
  if (!video) return fail(404, "not_found", "Video not found.")
  if (video.provider !== "storage") return fail(409, "provider", "Captions for this video are managed by its video service.")
  const name = typeof input.fileName === "string" ? input.fileName : ""
  const size = Number(input.fileSize)
  if (!isCaptionName(name)) return fail(415, "type", "Captions need to be a .vtt or .srt file.")
  if (!(size > 0) || size > CAPTION_MAX_BYTES) return fail(413, "too_large", "That caption file is too large.")
  const path = communityMediaPath(video.creator_id, video.id, name, "vtt")
  const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) return fail(500, "failed", "Could not start the upload. Try again.")
  return { ok: true, ticket: { videoId: video.id, provider: "storage", method: "storage", url: data.signedUrl ?? null, path, token: data.token, headers: {} } }
}

export async function completeCaptions(db: Db, community: CommunityRow, input: { videoId: unknown; path: unknown }): Promise<{ ok: true; video: MediaVideoRow } | VideoFailure> {
  const video = typeof input.videoId === "string" ? await readCommunityVideo(db, community.id, input.videoId) : null
  if (!video) return fail(404, "not_found", "Video not found.")
  if (!isCommunityMediaPath(input.path, video.creator_id, video.id) || !/\.(vtt|srt)$/.test(input.path)) return fail(404, "not_found", "Upload not found.")
  const path = input.path
  const size = await storedObjectSize(db, STORAGE_BUCKET, path)
  const head = size ? await readStoredHead(db, STORAGE_BUCKET, path) : null
  if (!size || size > CAPTION_MAX_BYTES || !looksLikeCaptions(new TextDecoder().decode(head ?? new Uint8Array()))) {
    await db.storage.from(STORAGE_BUCKET).remove([path]).then(() => undefined, () => undefined)
    return fail(415, "refused", "That file does not look like captions. Use a .vtt or .srt file.")
  }
  const old = video.captions_path
  const { error } = await db.from("media_videos").update({ captions_path: path }).eq("id", video.id)
  if (error) return fail(500, "failed", "The captions could not be saved. Try again.")
  if (old && old !== path && isCommunityMediaPath(old, video.creator_id, video.id)) await db.storage.from(STORAGE_BUCKET).remove([old]).then(() => undefined, () => undefined)
  return { ok: true, video: { ...video, captions_path: path } }
}

/* ── Who may watch ──────────────────────────────────────────────────────── */

export type VideoAccess = { ok: true; use: "cover" | "event" | "post" | "staff" } | { ok: false; reason: "not_member" | "forbidden" | "not_yet" }

/**
 * Whether this viewer may watch this video of this community, from where
 * it is used. The caller has already found the video in THIS community.
 */
export async function videoAccess(db: Db, community: CommunityRow, viewer: Viewer, video: MediaVideoRow, now: number = Date.now()): Promise<VideoAccess> {
  if (video.community_id !== community.id) return { ok: false, reason: "forbidden" }
  const publicPage = community.status === "published" && (community.visibility === "public" || community.visibility === "unlisted") && !community.suspended_at && !community.deleted_at
  if (community.cover_video_id === video.id && publicPage) return { ok: true, use: "cover" }
  if (!viewer.active || !viewer.role) return { ok: false, reason: "not_member" }
  if (isStaff(viewer)) return { ok: true, use: "staff" }
  const accessViewer = { role: viewer.role, active: viewer.active, tierId: viewer.tierId, ownedProductIds: viewer.ownedProductIds, level: viewer.level }
  if (community.cover_video_id === video.id) return { ok: true, use: "cover" }

  const { data: events } = await db
    .from("community_events")
    .select("id, access, starts_at, ends_at, status")
    .eq("community_id", community.id)
    .eq("replay_video_id", video.id)
    .limit(5)
  for (const e of (events as { access: unknown; starts_at: string; ends_at: string | null; status: string }[] | null) ?? []) {
    if (!evaluateAccess(parseAccessRule(e.access), accessViewer).ok) continue
    const over = Date.parse(e.ends_at ?? e.starts_at) + (e.ends_at ? 0 : 60 * 60_000)
    if (now < over) return { ok: false, reason: "not_yet" }
    return { ok: true, use: "event" }
  }

  const { data: posts } = await db
    .from("community_feed_posts")
    .select("id, space_id")
    .eq("community_id", community.id)
    .eq("status", "published")
    .contains("media", [{ videoId: video.id }])
    .limit(5)
  const list = (posts as { id: string; space_id: string | null }[] | null) ?? []
  if (list.length) {
    const spaceIds = [...new Set(list.map((p) => p.space_id).filter((s): s is string => !!s))]
    if (list.some((p) => !p.space_id)) return { ok: true, use: "post" }
    const { data: spaces } = await db.from("community_spaces").select("id, view_access, archived_at").eq("community_id", community.id).in("id", spaceIds)
    for (const s of (spaces as { view_access: unknown; archived_at: string | null }[] | null) ?? []) {
      if (!s.archived_at && evaluateAccess(parseAccessRule(s.view_access), accessViewer).ok) return { ok: true, use: "post" }
    }
  }
  return { ok: false, reason: "forbidden" }
}

/** A playback address for a ready video, good for PLAYBACK_SECONDS, or null. */
export async function videoPlayback(db: Db, video: MediaVideoRow, env?: Record<string, string | undefined>): Promise<VideoPlayback | null> {
  if (video.status !== "ready" || !isProviderName(video.provider)) return null
  try {
    const address = await adapterFor(video.provider).playback(db, video, PLAYBACK_SECONDS, env)
    if (!address) return null
    return {
      url: address.url,
      expiresAt: address.expiresAt,
      mime: address.mime,
      captions: video.captions_path && video.community_id ? `/api/community/${video.community_id}/videos/${video.id}/captions` : null,
      poster: address.poster ?? video.thumbnail_url,
      durationSeconds: video.duration_seconds,
    }
  } catch (e) {
    console.error(`[communities] video playback ${video.id}: ${reasonOf(e)}`)
    return null
  }
}

/* ── Webhooks and polling ───────────────────────────────────────────────── */

/** A patch made safe to apply over this row: a ready video never goes back to processing. */
export function mergeVideoPatch(row: Pick<MediaVideoRow, "status">, patch: Partial<MediaVideoRow>): Partial<MediaVideoRow> {
  const out: Partial<MediaVideoRow> = {}
  const allowed: (keyof MediaVideoRow)[] = ["status", "provider_asset_id", "playback_id", "thumbnail_url", "duration_seconds", "width", "height", "size_bytes", "error"]
  for (const k of allowed) if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k]
  if (row.status === "ready" && out.status && out.status !== "ready" && out.status !== "failed") delete out.status
  if (row.status === "failed" && out.status && out.status !== "ready") delete out.status
  if (out.status === "ready") out.error = null
  return out
}

export interface WebhookResult {
  applied: number
  duplicates: number
  unmatched: number
}

/**
 * Applies a service's webhook updates, each once. Throws when a write
 * fails after the event was taken, having let go of it, so the service's
 * retry can apply it.
 */
export async function applyVideoWebhook(db: Db, provider: VideoProviderName, updates: { eventId: string; videoId: string | null; assetId: string | null; patch: Partial<MediaVideoRow> }[]): Promise<WebhookResult> {
  const result: WebhookResult = { applied: 0, duplicates: 0, unmatched: 0 }
  for (const u of updates) {
    const eventId = u.eventId.slice(0, 300)
    const { error: takeError } = await db.from("media_video_events").insert({ provider, event_id: eventId })
    if (takeError) {
      if (isUniqueViolation(takeError)) {
        result.duplicates++
        continue
      }
      throw new Error(`video event not taken: ${reasonOf(takeError)}`)
    }
    let q = db.from("media_videos").select(VIDEO_COLUMNS).eq("provider", provider)
    if (u.videoId && UUID.test(u.videoId)) q = q.eq("id", u.videoId)
    else if (u.assetId) q = q.eq("provider_asset_id", u.assetId)
    else {
      result.unmatched++
      continue
    }
    const { data: row } = await q.maybeSingle()
    if (!row) {
      result.unmatched++
      continue
    }
    const patch = mergeVideoPatch(row as MediaVideoRow, u.patch)
    if (Object.keys(patch).length === 0) continue
    const { error } = await db.from("media_videos").update(patch).eq("id", (row as MediaVideoRow).id)
    if (error) {
      await db.from("media_video_events").delete().eq("provider", provider).eq("event_id", eventId)
      throw new Error(`video ${(row as MediaVideoRow).id} not updated: ${reasonOf(error)}`)
    }
    result.applied++
  }
  return result
}

/** Asks the service where one video is. Answers whether it is settled (ready or failed). */
export async function pollVideo(db: Db, videoId: string, env?: Record<string, string | undefined>): Promise<"settled" | "waiting" | "gone"> {
  const { data } = await db.from("media_videos").select(VIDEO_COLUMNS).eq("id", videoId).maybeSingle()
  const video = data as MediaVideoRow | null
  if (!video) return "gone"
  if (video.status === "ready" || video.status === "failed") return "settled"
  if (!isProviderName(video.provider) || video.provider === "storage") return "settled"
  const patch = await adapterFor(video.provider).poll(video, env)
  if (patch) {
    const safe = mergeVideoPatch(video, patch)
    if (Object.keys(safe).length) await db.from("media_videos").update(safe).eq("id", video.id)
    if (safe.status === "ready" || safe.status === "failed") return "settled"
  }
  return "waiting"
}

/* ── The creator's list ─────────────────────────────────────────────────── */

export async function listCommunityVideos(db: Db, communityId: string, opts: { cursor?: string | null; limit?: number } = {}): Promise<{ videos: VideoStatusView[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 24))
  let q = db.from("media_videos").select(VIDEO_COLUMNS).eq("community_id", communityId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
  const cursor = decodeCursor(opts.cursor)
  if (cursor) q = q.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`)
  const { data, error } = await q
  if (error) return { videos: [], nextCursor: null }
  const rows = (data as MediaVideoRow[] | null) ?? []
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { videos: page.map(videoStatusView), nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null }
}

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`).toString("base64url")
}

export function decodeCursor(raw: string | null | undefined): { at: string; id: string } | null {
  if (!raw || raw.length > 200) return null
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|")
    if (!UUID.test(id ?? "") || !Number.isFinite(Date.parse(at ?? ""))) return null
    return { at: new Date(at).toISOString(), id }
  } catch {
    return null
  }
}

/** Removes a video and its stored files. Places that used it show it as unavailable. */
export async function deleteCommunityVideo(db: Db, community: CommunityRow, videoId: string): Promise<boolean> {
  const video = await readCommunityVideo(db, community.id, videoId)
  if (!video) return false
  const files = [video.storage_path, video.captions_path].filter((p): p is string => isCommunityMediaPath(p, video.creator_id, video.id))
  if (files.length) await db.storage.from(STORAGE_BUCKET).remove(files).then(() => undefined, () => undefined)
  const { error } = await db.from("media_videos").delete().eq("id", video.id).eq("community_id", community.id)
  return !error
}

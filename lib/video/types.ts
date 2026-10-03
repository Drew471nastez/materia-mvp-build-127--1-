/**
 * ===========================================================================
 *  A VIDEO, AS PAGES AND ROUTES TALK ABOUT IT
 * ===========================================================================
 * One media_videos row per video (supabase/sql/run-now/81_communities.sql),
 * whoever stores it: Storelib's own private bucket (the default, which needs
 * nothing set up) or a video service a platform admin connected with env
 * keys (Mux, Cloudflare Stream, Bunny Stream). Pages never see where a file
 * lives: they ask for a video by id and get a short lived address back.
 *
 * Pure and browser safe.
 */

export type VideoProviderName = "storage" | "mux" | "cloudflare" | "bunny"

/** What a player is handed: an address that works for an hour, never a permanent one. */
export interface VideoPlayback {
  url: string
  /** ms since the epoch; the player asks again before this. */
  expiresAt: number
  mime: string | null
  /** A same origin WebVTT address, or null. */
  captions: string | null
  poster: string | null
  durationSeconds: number | null
}

/**
 * How the browser sends the file, once the server has said yes.
 *   storage   Supabase's signed upload (uploadToSignedUrl with `path` and `token`)
 *   put       one PUT of the whole file to `url` (Mux direct upload)
 *   post      one multipart POST with the file as "file" (Cloudflare direct upload)
 *   bunny     one PUT to `url` with the given headers (Bunny's signed upload)
 */
export type UploadMethod = "storage" | "put" | "post" | "bunny"

export interface UploadTicket {
  videoId: string
  provider: VideoProviderName
  method: UploadMethod
  url: string | null
  path: string | null
  token: string | null
  headers: Record<string, string>
}

export interface VideoStatusView {
  id: string
  provider: VideoProviderName
  status: "uploading" | "processing" | "ready" | "failed"
  durationSeconds: number | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  thumbnailUrl: string | null
  hasCaptions: boolean
  error: string | null
  createdAt: string
}

/** How long a playback address works. The same hour as a lesson's (lib/courses/server.ts). */
export const PLAYBACK_SECONDS = 60 * 60

/** The biggest video a member who is not staff may send to a community. */
export const MEMBER_VIDEO_MAX_BYTES = 500 * 1024 * 1024

/** The biggest video staff may send: the upload pipeline's own ceiling for video. */
export const STAFF_VIDEO_MAX_BYTES = 2_000_000_000

/** Seconds the browser read from the file's own metadata, kept only when they make sense. */
export function cleanDuration(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60 * 60) return null
  return Math.round(n)
}

/** A width or height in pixels from the browser, kept only when it makes sense. */
export function cleanDimension(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 16 || n > 16384) return null
  return Math.round(n)
}

/** "4:05", "1:02:09". */
export function videoClock(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`
}

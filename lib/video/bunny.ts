import "server-only"

/**
 * BUNNY STREAM, when VIDEO_PROVIDER=bunny and its keys are set:
 *
 *   BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY   the API (never sent to a browser)
 *   BUNNY_STREAM_CDN_HOST                           the library's pull zone, e.g. vz-1234.b-cdn.net
 *   BUNNY_STREAM_TOKEN_KEY                          the pull zone's token authentication key
 *   BUNNY_STREAM_WEBHOOK_SECRET                     put in the webhook address as ?secret=
 *
 * The server makes the video at Bunny and hands the browser a TUS upload
 * signed for that one video for a day (the API key stays here). The
 * library's MP4 fallback plays it, through a token that expires with the
 * hour (BUNNY_STREAM_MP4 picks the file, play_720p.mp4 when unset).
 *
 * Bunny's webhooks are not signed, so the address itself carries a secret
 * that is compared in constant time.
 */
import { createHash } from "node:crypto"
import type { MediaVideoRow } from "@/lib/communities/types"
import { callJson, missingOf, sameSecret, type Env, type VideoAdapter } from "./provider"

const KEYS = ["BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_CDN_HOST", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_WEBHOOK_SECRET"] as const
const API = "https://video.bunnycdn.com"
export const BUNNY_TUS_URL = `${API}/tusupload`

const lib = (env: Env) => encodeURIComponent(env.BUNNY_STREAM_LIBRARY_ID || "")

/** Bunny's token authentication: base64url(sha256(key + path + expires)). */
export function bunnyToken(key: string, path: string, expires: number): string {
  return createHash("sha256").update(`${key}${path}${expires}`).digest("base64").replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/** A video object's status as Bunny's API answers it: 4 finished, 5 and 6 failed. */
function objectPatch(v: { status?: number; length?: number; width?: number; height?: number }): Partial<MediaVideoRow> {
  const patch: Partial<MediaVideoRow> = {}
  if (typeof v.length === "number" && v.length > 0) patch.duration_seconds = Math.round(v.length)
  if (v.width && v.width > 0) patch.width = v.width
  if (v.height && v.height > 0) patch.height = v.height
  if (v.status === 4) patch.status = "ready"
  else if (v.status === 5 || v.status === 6) {
    patch.status = "failed"
    patch.error = "Bunny Stream could not process this video."
  } else patch.status = "processing"
  return patch
}

export const bunnyAdapter: VideoAdapter = {
  name: "bunny",
  connected: (env = process.env) => missingOf(env, KEYS).length === 0,
  missingKeys: (env = process.env) => missingOf(env, KEYS),
  async createUpload(_db, input, env = process.env) {
    const made = await callJson("bunny", `${API}/library/${lib(env)}/videos`, {
      method: "POST",
      headers: { AccessKey: env.BUNNY_STREAM_API_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.video.id }),
    })
    const guid = typeof made.guid === "string" ? made.guid : ""
    if (!guid) throw new Error("bunny: no video made")
    const expire = Math.floor(Date.now() / 1000) + 24 * 60 * 60
    const signature = createHash("sha256").update(`${env.BUNNY_STREAM_LIBRARY_ID}${env.BUNNY_STREAM_API_KEY}${expire}${guid}`).digest("hex")
    return {
      method: "bunny",
      url: BUNNY_TUS_URL,
      path: null,
      token: null,
      headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expire), VideoId: guid, LibraryId: String(env.BUNNY_STREAM_LIBRARY_ID) },
      patch: { provider_asset_id: guid, status: "uploading" },
    }
  },
  async playback(_db, video, seconds, env = process.env) {
    if (video.status !== "ready" || !video.provider_asset_id) return null
    const expiresAt = Date.now() + seconds * 1000
    const expires = Math.floor(expiresAt / 1000)
    const file = (env.BUNNY_STREAM_MP4 || "play_720p.mp4").replace(/[^a-z0-9_.]/gi, "")
    const path = `/${video.provider_asset_id}/${file}`
    const thumb = `/${video.provider_asset_id}/thumbnail.jpg`
    const key = env.BUNNY_STREAM_TOKEN_KEY || ""
    const host = `https://${env.BUNNY_STREAM_CDN_HOST}`
    return {
      url: `${host}${path}?token=${bunnyToken(key, path, expires)}&expires=${expires}`,
      expiresAt,
      mime: "video/mp4",
      poster: `${host}${thumb}?token=${bunnyToken(key, thumb, expires)}&expires=${expires}`,
    }
  },
  async poll(video, env = process.env) {
    if (!video.provider_asset_id) return null
    const v = await callJson("bunny", `${API}/library/${lib(env)}/videos/${encodeURIComponent(video.provider_asset_id)}`, { headers: { AccessKey: env.BUNNY_STREAM_API_KEY || "" } })
    return objectPatch(v as { status?: number; length?: number; width?: number; height?: number })
  },
  async webhook(raw, _headers, url, env = process.env) {
    if (!sameSecret(url.searchParams.get("secret"), env.BUNNY_STREAM_WEBHOOK_SECRET)) return "bad_signature"
    let body: { VideoLibraryId?: number | string; VideoGuid?: string; Status?: number }
    try {
      body = JSON.parse(raw)
    } catch {
      return []
    }
    if (!body.VideoGuid || String(body.VideoLibraryId) !== String(env.BUNNY_STREAM_LIBRARY_ID)) return []
    /* The webhook's own numbers: 3 finished, 5 and 8 failed; the rest are steps along the way. */
    const s = Number(body.Status)
    const patch: Partial<MediaVideoRow> =
      s === 3 ? { status: "ready" } : s === 5 || s === 8 ? { status: "failed", error: "Bunny Stream could not process this video." } : { status: "processing" }
    /* The length and size come from the API once it is finished. */
    if (s === 3) {
      const full = await bunnyAdapter.poll({ provider_asset_id: body.VideoGuid } as MediaVideoRow, env).catch(() => null)
      if (full) Object.assign(patch, full, { status: "ready" })
    }
    return [{ eventId: `${body.VideoGuid}:${s}`, videoId: null, assetId: body.VideoGuid, patch }]
  },
}

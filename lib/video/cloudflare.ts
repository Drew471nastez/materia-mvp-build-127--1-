import "server-only"

/**
 * CLOUDFLARE STREAM, when VIDEO_PROVIDER=cloudflare and its keys are set:
 *
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_TOKEN   the API
 *   CLOUDFLARE_STREAM_WEBHOOK_SECRET                 checks each webhook
 *   CLOUDFLARE_STREAM_CUSTOMER_CODE                  the customer-<code> playback host
 *
 * The browser POSTs the file to a one time direct upload address. Every
 * video requires signed URLs. Once Stream says it is ready to stream, the
 * MP4 download is switched on; the video is ready when that MP4 is, and it
 * plays through a signed token that expires with the hour.
 */
import type { MediaVideoRow } from "@/lib/communities/types"
import { callJson, freshTimestamp, hmacMatches, missingOf, signatureParts, type Env, type VideoAdapter } from "./provider"

const KEYS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_TOKEN", "CLOUDFLARE_STREAM_WEBHOOK_SECRET", "CLOUDFLARE_STREAM_CUSTOMER_CODE"] as const

const api = (env: Env, path: string) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID || "")}/stream${path}`
const headersOf = (env: Env) => ({ Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`, "Content-Type": "application/json" })

type StreamVideo = {
  uid?: string
  readyToStream?: boolean
  status?: { state?: string; errorReasonText?: string }
  duration?: number
  input?: { width?: number; height?: number }
  meta?: { videoId?: string }
  modified?: string
}

function videoPatch(v: StreamVideo): Partial<MediaVideoRow> {
  const patch: Partial<MediaVideoRow> = {}
  if (typeof v.duration === "number" && v.duration > 0) patch.duration_seconds = Math.round(v.duration)
  if (v.input?.width && v.input.width > 0) patch.width = v.input.width
  if (v.input?.height && v.input.height > 0) patch.height = v.input.height
  if (v.status?.state === "error") {
    patch.status = "failed"
    patch.error = (v.status.errorReasonText || "Cloudflare Stream could not process this video.").slice(0, 300)
  } else patch.status = "processing"
  return patch
}

/** Switches the MP4 on (idempotent at Cloudflare) and says whether it is ready yet. */
async function mp4Ready(uid: string, env: Env): Promise<boolean> {
  const made = await callJson("cloudflare", api(env, `/${encodeURIComponent(uid)}/downloads`), { method: "POST", headers: headersOf(env) })
  const status = ((made.result as { default?: { status?: string } } | undefined)?.default?.status) || ""
  return status === "ready"
}

export const cloudflareAdapter: VideoAdapter = {
  name: "cloudflare",
  connected: (env = process.env) => missingOf(env, KEYS).length === 0,
  missingKeys: (env = process.env) => missingOf(env, KEYS),
  async createUpload(_db, input, env = process.env) {
    const body = await callJson("cloudflare", api(env, "/direct_upload"), {
      method: "POST",
      headers: headersOf(env),
      body: JSON.stringify({ maxDurationSeconds: 6 * 60 * 60, requireSignedURLs: true, meta: { videoId: input.video.id, name: input.fileName.slice(0, 120) } }),
    })
    const result = (body.result ?? {}) as { uploadURL?: string; uid?: string }
    if (!result.uploadURL || !result.uid) throw new Error("cloudflare: no upload address")
    return { method: "post", url: result.uploadURL, path: null, token: null, headers: {}, patch: { provider_asset_id: result.uid, status: "uploading" } }
  },
  async playback(_db, video, seconds, env = process.env) {
    if (video.status !== "ready" || !video.provider_asset_id) return null
    const expiresAt = Date.now() + seconds * 1000
    const made = await callJson("cloudflare", api(env, `/${encodeURIComponent(video.provider_asset_id)}/token`), {
      method: "POST",
      headers: headersOf(env),
      body: JSON.stringify({ exp: Math.floor(expiresAt / 1000), downloadable: true }),
    })
    const token = (made.result as { token?: string } | undefined)?.token
    if (!token) return null
    const host = `https://customer-${env.CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com`
    return { url: `${host}/${token}/downloads/default.mp4`, expiresAt, mime: "video/mp4", poster: `${host}/${token}/thumbnails/thumbnail.jpg` }
  },
  async poll(video, env = process.env) {
    const uid = video.provider_asset_id
    if (!uid) return null
    const body = await callJson("cloudflare", api(env, `/${encodeURIComponent(uid)}`), { headers: headersOf(env) })
    const v = (body.result ?? {}) as StreamVideo
    const patch = videoPatch(v)
    if (patch.status !== "failed" && v.readyToStream && (await mp4Ready(uid, env))) patch.status = "ready"
    return patch
  },
  async webhook(raw, headers, _url, env = process.env) {
    const sig = signatureParts(headers.get("webhook-signature"))
    if (!freshTimestamp(sig.time) || !hmacMatches(env.CLOUDFLARE_STREAM_WEBHOOK_SECRET || "", `${sig.time}.${raw}`, sig.sig1 || "")) return "bad_signature"
    let v: StreamVideo
    try {
      v = JSON.parse(raw)
    } catch {
      return []
    }
    if (!v.uid) return []
    const patch = videoPatch(v)
    /* Ready to stream is not yet ready to play here: the MP4 is switched on now and the poll job sees it through. */
    if (patch.status !== "failed" && v.readyToStream) await mp4Ready(v.uid, env).then((ready) => ready && (patch.status = "ready"), () => undefined)
    return [{ eventId: `${v.uid}:${v.status?.state ?? ""}:${v.readyToStream ? 1 : 0}:${v.modified ?? ""}`, videoId: v.meta?.videoId ?? null, assetId: v.uid, patch }]
  },
}

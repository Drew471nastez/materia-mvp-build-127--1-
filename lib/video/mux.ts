import "server-only"

/**
 * MUX, when VIDEO_PROVIDER=mux and its keys are set:
 *
 *   MUX_TOKEN_ID, MUX_TOKEN_SECRET          the API (direct uploads, assets)
 *   MUX_WEBHOOK_SECRET                      checks each webhook's signature
 *   MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY     signs playback (base64 PEM private key)
 *
 * The browser PUTs the file to a Mux direct upload address. Every asset is
 * created with a SIGNED playback policy (no public playback id) and a
 * capped 1080p MP4 rendition, which is what the player plays, through a
 * token that expires with the hour. Our own video id rides along as the
 * asset's passthrough, so each webhook finds its row by it.
 *
 * Ready means the MP4 rendition is ready (video.asset.static_renditions.ready),
 * not only the asset, because that rendition is what plays.
 */
import { createSign } from "node:crypto"
import type { MediaVideoRow } from "@/lib/communities/types"
import { callJson, freshTimestamp, hmacMatches, missingOf, signatureParts, type Env, type VideoAdapter, type WebhookUpdate } from "./provider"

const API = "https://api.mux.com/video/v1"
const KEYS = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY"] as const
const RENDITION = "capped-1080p"

function auth(env: Env): string {
  return `Basic ${Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString("base64")}`
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

/** A Mux playback token (RS256 JWT): `aud` "v" for video, "t" for a thumbnail. */
export function muxToken(playbackId: string, aud: "v" | "t", expiresAt: number, env: Env): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: env.MUX_SIGNING_KEY_ID }))
  const payload = b64url(JSON.stringify({ sub: playbackId, aud, exp: Math.floor(expiresAt / 1000) }))
  const pem = Buffer.from(env.MUX_SIGNING_KEY || "", "base64").toString("utf8")
  const sig = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(pem)
  return `${header}.${payload}.${b64url(sig)}`
}

type MuxAsset = {
  id?: string
  status?: string
  duration?: number
  passthrough?: string
  playback_ids?: { id: string; policy: string }[]
  tracks?: { type?: string; max_width?: number; max_height?: number }[]
  static_renditions?: { status?: string }
  errors?: { messages?: string[] }
}

function assetPatch(a: MuxAsset): Partial<MediaVideoRow> {
  const patch: Partial<MediaVideoRow> = {}
  if (a.id) patch.provider_asset_id = a.id
  const playback = a.playback_ids?.find((p) => p.policy === "signed") ?? a.playback_ids?.[0]
  if (playback) patch.playback_id = playback.id
  if (typeof a.duration === "number" && a.duration > 0) patch.duration_seconds = Math.round(a.duration)
  const video = a.tracks?.find((t) => t.type === "video")
  if (video?.max_width) patch.width = video.max_width
  if (video?.max_height) patch.height = video.max_height
  if (a.status === "errored") {
    patch.status = "failed"
    patch.error = (a.errors?.messages?.[0] || "Mux could not process this video.").slice(0, 300)
  } else if (a.static_renditions?.status === "ready" && a.status === "ready") patch.status = "ready"
  else patch.status = "processing"
  return patch
}

export const muxAdapter: VideoAdapter = {
  name: "mux",
  connected: (env = process.env) => missingOf(env, KEYS).length === 0,
  missingKeys: (env = process.env) => missingOf(env, KEYS),
  async createUpload(_db, input, env = process.env) {
    const body = await callJson("mux", `${API}/uploads`, {
      method: "POST",
      headers: { Authorization: auth(env), "Content-Type": "application/json" },
      body: JSON.stringify({
        cors_origin: input.origin || "*",
        new_asset_settings: { playback_policy: ["signed"], mp4_support: RENDITION, passthrough: input.video.id },
      }),
    })
    const data = (body.data ?? {}) as { id?: string; url?: string }
    if (!data.url || !data.id) throw new Error("mux: no upload address")
    /* The upload's id until the asset exists; the asset.created webhook replaces it. */
    return { method: "put", url: data.url, path: null, token: null, headers: {}, patch: { provider_asset_id: `upload:${data.id}`, status: "uploading" } }
  },
  async playback(_db, video, seconds, env = process.env) {
    if (video.status !== "ready" || !video.playback_id) return null
    const expiresAt = Date.now() + seconds * 1000
    const id = video.playback_id
    return {
      url: `https://stream.mux.com/${id}/${RENDITION}.mp4?token=${muxToken(id, "v", expiresAt, env)}`,
      expiresAt,
      mime: "video/mp4",
      poster: `https://image.mux.com/${id}/thumbnail.jpg?token=${muxToken(id, "t", expiresAt, env)}`,
    }
  },
  async poll(video, env = process.env) {
    const asset = video.provider_asset_id
    if (!asset || asset.startsWith("upload:")) {
      if (!asset) return null
      const up = await callJson("mux", `${API}/uploads/${encodeURIComponent(asset.slice(7))}`, { headers: { Authorization: auth(env) } })
      const assetId = (up.data as { asset_id?: string } | undefined)?.asset_id
      return assetId ? { provider_asset_id: assetId, status: "processing" } : null
    }
    const body = await callJson("mux", `${API}/assets/${encodeURIComponent(asset)}`, { headers: { Authorization: auth(env) } })
    return assetPatch((body.data ?? {}) as MuxAsset)
  },
  async webhook(raw, headers, _url, env = process.env) {
    const sig = signatureParts(headers.get("mux-signature"))
    if (!freshTimestamp(sig.t) || !hmacMatches(env.MUX_WEBHOOK_SECRET || "", `${sig.t}.${raw}`, sig.v1 || "")) return "bad_signature"
    let event: { id?: string; type?: string; data?: Record<string, unknown> }
    try {
      event = JSON.parse(raw)
    } catch {
      return []
    }
    const eventId = String(event.id || "")
    const data = (event.data ?? {}) as MuxAsset & { asset_id?: string; new_asset_settings?: { passthrough?: string } }
    if (!eventId) return []
    const updates: WebhookUpdate[] = []
    switch (event.type) {
      case "video.upload.asset_created":
        updates.push({ eventId, videoId: data.new_asset_settings?.passthrough ?? null, assetId: null, patch: { provider_asset_id: data.asset_id ?? null, status: "processing" } })
        break
      case "video.asset.created":
      case "video.asset.ready":
      case "video.asset.static_renditions.ready":
      case "video.asset.errored":
        updates.push({ eventId, videoId: data.passthrough ?? null, assetId: data.id ?? null, patch: assetPatch(data) })
        break
      case "video.upload.errored":
      case "video.upload.cancelled":
        updates.push({ eventId, videoId: data.new_asset_settings?.passthrough ?? null, assetId: null, patch: { status: "failed", error: "The upload to Mux did not finish." } })
        break
    }
    return updates
  },
}

import "server-only"

/**
 * ===========================================================================
 *  WHERE A COMMUNITY'S VIDEOS LIVE
 * ===========================================================================
 * One interface, four places:
 *
 *   storage      Storelib's own PRIVATE bucket (digital-products), exactly
 *                the way lesson videos are kept: a signed upload straight
 *                from the browser, checked where it landed, and played from
 *                a signed address that works for an hour. Needs nothing set
 *                up, so it is the default and always works.
 *   mux          Mux, cloudflare Cloudflare Stream, bunny Bunny Stream: used
 *   cloudflare   only when VIDEO_PROVIDER names one AND its keys are in the
 *   bunny        environment. Without the keys an adapter says "not
 *                connected" and new uploads go to storage, so a half set up
 *                service can never break an upload.
 *
 * Every adapter plays back as an MP4 address that expires (a signed token),
 * never a permanent public link, because the player is one <video> element
 * (components/courses/lesson-video.tsx) and plays MP4 everywhere.
 *
 * Webhooks reach /api/webhooks/video/<provider>; each adapter checks the
 * signature with its own secret and turns the body into updates. Each
 * event is applied once (media_video_events, lib/communities/server/videos.ts).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { MediaVideoRow } from "@/lib/communities/types"
import type { UploadMethod, VideoProviderName } from "./types"
import { storageAdapter } from "./storage"
import { muxAdapter } from "./mux"
import { cloudflareAdapter } from "./cloudflare"
import { bunnyAdapter } from "./bunny"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VideoDb = any

export type Env = Record<string, string | undefined>

export interface UploadInput {
  video: MediaVideoRow
  fileName: string
  contentType: string
  size: number
  /** The site's own origin, for a service that needs to allow the browser's upload. */
  origin: string | null
}

export interface UploadPlan {
  method: UploadMethod
  url: string | null
  path: string | null
  token: string | null
  headers: Record<string, string>
  /** Written to the video's row before the ticket goes back (the service's id for it, the path). */
  patch: Partial<MediaVideoRow>
}

export type PlaybackQuality = "auto" | "low"

export function playbackQuality(raw: unknown): PlaybackQuality {
  return raw === "low" ? "low" : "auto"
}

export interface PlaybackAddress {
  url: string
  expiresAt: number
  mime: string | null
  poster: string | null
}

/** One thing a service told us about one video. */
export interface WebhookUpdate {
  /** The service's id for this event: applied once. */
  eventId: string
  /** How to find the row: our own id (passed through at upload), or the service's asset id. */
  videoId: string | null
  assetId: string | null
  patch: Partial<MediaVideoRow>
}

export interface VideoAdapter {
  name: VideoProviderName
  /** Whether its keys are in the environment. */
  connected(env?: Env): boolean
  /** The keys it still needs, by name, for the "not connected" line. Never their values. */
  missingKeys(env?: Env): string[]
  createUpload(db: VideoDb, input: UploadInput, env?: Env): Promise<UploadPlan>
  /** `quality` "low" asks for the lighter rendition where the service keeps one (Save Data, a slow network, a preview). */
  playback(db: VideoDb, video: MediaVideoRow, seconds: number, env?: Env, quality?: PlaybackQuality): Promise<PlaybackAddress | null>
  /** Asks the service where a video is now: the repair for a webhook that never came. Null when it cannot say. */
  poll(video: MediaVideoRow, env?: Env): Promise<Partial<MediaVideoRow> | null>
  /** The updates in a webhook, or "bad_signature" when it is not from the service. */
  webhook(raw: string, headers: Headers, url: URL, env?: Env): Promise<WebhookUpdate[] | "bad_signature">
}

export const ADAPTERS: Record<VideoProviderName, VideoAdapter> = {
  storage: storageAdapter,
  mux: muxAdapter,
  cloudflare: cloudflareAdapter,
  bunny: bunnyAdapter,
}

export function isProviderName(value: unknown): value is VideoProviderName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ADAPTERS, value)
}

export function adapterFor(name: VideoProviderName): VideoAdapter {
  return ADAPTERS[name]
}

/**
 * The provider new uploads go to: the one VIDEO_PROVIDER names when it is
 * connected, otherwise storage.
 */
export function activeProvider(env: Env = process.env): VideoProviderName {
  const asked = (env.VIDEO_PROVIDER || "storage").trim().toLowerCase()
  if (!isProviderName(asked) || asked === "storage") return "storage"
  return ADAPTERS[asked].connected(env) ? asked : "storage"
}

export interface ProviderState {
  name: VideoProviderName
  connected: boolean
  active: boolean
  /** Env names it still needs, for the admin's "not connected" line. */
  missing: string[]
}

/** Every provider and whether it is connected, for a settings line. Never a key's value. */
export function providerStates(env: Env = process.env): ProviderState[] {
  const active = activeProvider(env)
  return (Object.keys(ADAPTERS) as VideoProviderName[]).map((name) => ({
    name,
    connected: ADAPTERS[name].connected(env),
    active: name === active,
    missing: ADAPTERS[name].missingKeys(env),
  }))
}

/* ── Shared by the adapters ─────────────────────────────────────────────── */

/** The env names a service needs that are empty. */
export function missingOf(env: Env, names: readonly string[]): string[] {
  return names.filter((n) => !(env[n] || "").trim())
}

/** Hex HMAC-SHA256 compared in constant time. */
export function hmacMatches(secret: string, message: string, givenHex: string): boolean {
  if (!secret || !givenHex || !/^[0-9a-f]+$/i.test(givenHex)) return false
  const want = createHmac("sha256", secret).update(message).digest()
  const got = Buffer.from(givenHex, "hex")
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Two strings compared in constant time. */
export function sameSecret(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** "t=1,v1=abc" or "time=1,sig1=abc" as a map. */
export function signatureParts(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header || "").split(",")) {
    const eq = part.indexOf("=")
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return out
}

/** A signed webhook older than this is refused, so a captured one cannot be sent again later. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export function freshTimestamp(seconds: string | undefined, now: number = Date.now()): boolean {
  const t = Number(seconds)
  return Number.isFinite(t) && Math.abs(now / 1000 - t) <= WEBHOOK_TOLERANCE_SECONDS
}

/** A service answered with an error: one line for the log, never a key. */
export class ProviderError extends Error {
  constructor(
    readonly provider: VideoProviderName,
    message: string,
  ) {
    super(`${provider}: ${message}`)
  }
}

export async function callJson(provider: VideoProviderName, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status}`)
  return body
}

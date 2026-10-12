import "server-only"

/**
 * ===========================================================================
 *  WHICH TRACKING AGGREGATOR, WITH WHOSE KEY
 * ===========================================================================
 * Storelib's own tracking is set up once for every store, from the server's
 * environment:
 *
 *   TRACKING_PROVIDER         aftership or 17track (left out: whichever has
 *                             a key, AfterShip first)
 *   AFTERSHIP_API_KEY         AfterShip's API key
 *   AFTERSHIP_WEBHOOK_SECRET  the webhook secret from AfterShip's settings
 *   SEVENTEENTRACK_API_KEY    17TRACK's API key (it also signs its webhooks)
 *
 * A store can use its own AfterShip or 17TRACK account instead
 * (Settings > Integrations > Courier tracking, ./accounts-server.ts); its
 * key is sealed with COMMERCE_SECRETS_KEY and never sent to a browser.
 * With no key anywhere nothing is asked of anyone: shipments keep the
 * statuses the seller sets and the carrier's own tracking link.
 */

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"
import { getMainDomain } from "@/lib/url-helpers"
import type { TrackingProviderId, TrackingSnapshot } from "./model"
import { aftership } from "./aftership"
import { seventeentrack } from "./seventeentrack"

export interface TrackingAccount {
  provider: TrackingProviderId
  apiKey: string
  /** AfterShip's webhook secret; 17TRACK signs with the API key. */
  webhookSecret: string | null
  /** Storelib's own, for every store, or one store's own account. */
  scope: "platform" | "own"
  creatorId: string | null
}

export interface TrackingProvider {
  id: TrackingProviderId
  name: string
  /** Start following a number; answers what is known about it already. */
  register(a: TrackingAccount, input: { number: string; carrierCode: string | null; orderRef?: string | null }): Promise<TrackingSnapshot>
  /** What is known now. */
  get(a: TrackingAccount, input: { ref: string | null; number: string; carrierCode: string | null }): Promise<TrackingSnapshot>
  /** The carriers a number could belong to (AfterShip); 17TRACK answers none and works it out on register. */
  detect(a: TrackingAccount, number: string): Promise<{ code: string; name: string }[]>
  /** The delivery is the aggregator's: its signature over the raw body. */
  verifyWebhook(a: TrackingAccount, raw: string, headers: { get(name: string): string | null }): boolean
  /** Which parcel a delivery is about. Nothing else in the body is believed: the parcel is read back with get. */
  readWebhook(raw: string): { ref: string | null; number: string; carrierCode: string | null } | null
}

export const TRACKING_PROVIDERS: Record<TrackingProviderId, TrackingProvider> = { aftership, "17track": seventeentrack }

export function trackingProvider(id: string | null | undefined): TrackingProvider | null {
  return id === "aftership" || id === "17track" ? TRACKING_PROVIDERS[id] : null
}

const env = (name: string) => {
  const v = process.env[name]
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Storelib's own tracking account, from the environment, or null when it is not set up. */
export function platformAccount(): TrackingAccount | null {
  const want = (env("TRACKING_PROVIDER") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  const after = env("AFTERSHIP_API_KEY")
  const seventeen = env("SEVENTEENTRACK_API_KEY") ?? env("SEVENTEEN_TRACK_API_KEY") ?? env("TRACK17_API_KEY")
  const asAfter = after ? { provider: "aftership" as const, apiKey: after, webhookSecret: env("AFTERSHIP_WEBHOOK_SECRET"), scope: "platform" as const, creatorId: null } : null
  const as17 = seventeen ? { provider: "17track" as const, apiKey: seventeen, webhookSecret: null, scope: "platform" as const, creatorId: null } : null
  if (want === "aftership") return asAfter
  if (want === "17track" || want === "seventeentrack") return as17
  return asAfter ?? as17
}

/** What /admin and Settings say about Storelib's own tracking. No key ever leaves: only which and whether. */
export function platformTrackingState(): { configured: boolean; provider: TrackingProviderId | null; providerName: string | null; webhooks: boolean; chosen: string | null } {
  const a = platformAccount()
  return {
    configured: !!a,
    provider: a?.provider ?? null,
    providerName: a ? TRACKING_PROVIDERS[a.provider].name : null,
    webhooks: !!a && (a.provider === "17track" || !!a.webhookSecret),
    chosen: env("TRACKING_PROVIDER"),
  }
}

/* ── the webhook address: a token only Storelib can make ──────────────── */

function urlKey(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign tracking webhook addresses with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-tracking-webhooks"), Buffer.from(own ? "own" : "service"), 32))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "platform.<sig>" for Storelib's own account, "<creator>.<sig>" for a store's own. */
export function trackingWebhookToken(provider: TrackingProviderId, owner: string): string {
  const who = owner === "platform" ? "platform" : owner.toLowerCase()
  const sig = createHmac("sha256", urlKey()).update(`${provider}:${who}`).digest("base64url").slice(0, 32)
  return `${who}.${sig}`
}

/** Whose account a webhook address belongs to ("platform" or a creator id), or null when the token is not Storelib's. */
export function readTrackingWebhookToken(provider: TrackingProviderId, token: string): string | null {
  const [who, sig] = String(token ?? "").split(".")
  if (!who || !sig || (who !== "platform" && !UUID.test(who))) return null
  let want: Buffer
  try {
    want = Buffer.from(trackingWebhookToken(provider, who).split(".")[1])
  } catch {
    return null
  }
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got) ? (who === "platform" ? "platform" : who.toLowerCase()) : null
}

export function trackingWebhookUrl(provider: TrackingProviderId, owner: string): string {
  return `https://${getMainDomain()}/api/tracking/webhooks/${provider}/${trackingWebhookToken(provider, owner)}`
}

/**
 * ===========================================================================
 *  AFTERSHIP TRACKING API
 * ===========================================================================
 * Public docs: https://www.aftership.com/docs/tracking (version 2024-10).
 *
 *   auth       header `as-api-key: <key>`
 *   register   POST /trackings { tracking_number, slug? }. Without a slug
 *              AfterShip works out the carrier from the number. A number
 *              already there answers meta.code 4003; it is then read back
 *              with GET /trackings?tracking_numbers=<n>.
 *   read       GET /trackings/<id>: tag and subtag, checkpoints
 *              (checkpoint_time, message, location or city/state/country),
 *              and the estimated delivery the carrier or AfterShip gives.
 *   detect     POST /couriers/detect { tracking_number }: the carriers the
 *              number could belong to.
 *   webhook    POST with header `aftership-hmac-sha256`: base64 HMAC-SHA256
 *              of the raw body with the webhook secret from AfterShip's
 *              settings. Body { event: "tracking_update", msg: <tracking> }.
 *
 * Older API versions wrap the tracking as data.tracking; both are read.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { ask, TrackingError } from "./http"
import { cleanCheckpoints, fromAfterShipTag, placeOf, readDate, type TrackingSnapshot } from "./model"
import type { TrackingAccount, TrackingProvider } from "./provider"

export const AFTERSHIP_BASE = "https://api.aftership.com/tracking/2024-10"

const head = (a: TrackingAccount) => ({ "as-api-key": a.apiKey })

function trackingOf(body: any): any {
  const d = body?.data
  if (!d || typeof d !== "object") return null
  if (d.tracking && typeof d.tracking === "object") return d.tracking
  if (Array.isArray(d.trackings)) return d.trackings[0] ?? null
  return d
}

export function parseAfterShip(t: any, now = Date.now()): TrackingSnapshot {
  if (!t || typeof t !== "object" || typeof t.tracking_number !== "string") throw new TrackingError("AfterShip sent a tracking Storelib could not read.", 200, true)
  const checkpoints = cleanCheckpoints(
    (Array.isArray(t.checkpoints) ? t.checkpoints : []).map((c: any) => ({
      at: String(c?.checkpoint_time ?? c?.created_at ?? ""),
      status: fromAfterShipTag(c?.tag, c?.subtag, c?.message),
      message: String(c?.message ?? c?.subtag_message ?? ""),
      location: (typeof c?.location === "string" && c.location.trim()) || placeOf(c?.city, c?.state, c?.country_region_name ?? c?.country_name ?? c?.country_iso3),
    })),
  )
  const est =
    readDate(t.courier_estimated_delivery_date?.estimated_delivery_date, now) ??
    readDate(t.courier_estimated_delivery_date?.estimated_delivery_date_max, now) ??
    readDate(t.aftership_estimated_delivery_date?.estimated_delivery_date, now) ??
    readDate(t.custom_estimated_delivery_date?.estimated_delivery_date, now) ??
    readDate(t.first_estimated_delivery?.datetime, now) ??
    readDate(t.expected_delivery, now)
  return {
    ref: typeof t.id === "string" ? t.id : null,
    number: t.tracking_number,
    status: fromAfterShipTag(t.tag, t.subtag, checkpoints[0]?.message),
    substatus: typeof t.subtag === "string" ? t.subtag.slice(0, 60) : null,
    carrierCode: typeof t.slug === "string" ? t.slug.slice(0, 60) : null,
    carrierName: typeof t.courier_name === "string" ? t.courier_name.slice(0, 60) : null,
    estimatedDelivery: est,
    checkpoints,
  }
}

function refusal(body: any, status: number): TrackingError {
  const msg = typeof body?.meta?.message === "string" ? body.meta.message.slice(0, 160) : `answered ${status}`
  return new TrackingError(`AfterShip: ${msg}`, status, false, String(body?.meta?.code ?? status))
}

async function byNumber(a: TrackingAccount, number: string, slug: string | null): Promise<TrackingSnapshot> {
  const q = new URLSearchParams({ tracking_numbers: number })
  if (slug) q.set("slug", slug)
  const r = await ask("AfterShip", `${AFTERSHIP_BASE}/trackings?${q}`, { headers: head(a) })
  if (r.status !== 200) throw refusal(r.body, r.status)
  const t = trackingOf(r.body)
  if (!t) throw new TrackingError("AfterShip does not have this tracking number.", 404, false, "not_registered")
  return parseAfterShip(t)
}

export const aftership: TrackingProvider = {
  id: "aftership",
  name: "AfterShip",
  async register(a, input) {
    const r = await ask("AfterShip", `${AFTERSHIP_BASE}/trackings`, {
      method: "POST",
      headers: head(a),
      body: { tracking_number: input.number, ...(input.carrierCode ? { slug: input.carrierCode } : {}), ...(input.orderRef ? { order_id: input.orderRef } : {}) },
    })
    if (r.status === 200 || r.status === 201) return parseAfterShip(trackingOf(r.body))
    /* Already there (4003): read it back rather than make a second one. */
    if (r.body?.meta?.code === 4003 || r.status === 409) return byNumber(a, input.number, input.carrierCode)
    throw refusal(r.body, r.status)
  },
  async get(a, input) {
    if (!input.ref) return byNumber(a, input.number, input.carrierCode)
    const r = await ask("AfterShip", `${AFTERSHIP_BASE}/trackings/${encodeURIComponent(input.ref)}`, { headers: head(a) })
    if (r.status === 404 || r.body?.meta?.code === 4004) throw new TrackingError("AfterShip no longer has this tracking.", 404, false, "not_registered")
    if (r.status !== 200) throw refusal(r.body, r.status)
    return parseAfterShip(trackingOf(r.body))
  },
  async detect(a, number) {
    const r = await ask("AfterShip", `${AFTERSHIP_BASE}/couriers/detect`, { method: "POST", headers: head(a), body: { tracking_number: number } })
    if (r.status !== 200) return []
    const list = r.body?.data?.couriers
    return Array.isArray(list) ? list.filter((c: any) => typeof c?.slug === "string").map((c: any) => ({ code: String(c.slug), name: String(c.name ?? c.slug) })).slice(0, 10) : []
  },
  verifyWebhook(a, raw, headers) {
    const secret = a.webhookSecret
    const got = String(headers.get("aftership-hmac-sha256") ?? "").trim()
    if (!secret || !got) return false
    const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("base64"))
    const have = Buffer.from(got)
    return want.length === have.length && timingSafeEqual(want, have)
  },
  readWebhook(raw) {
    try {
      const b = JSON.parse(raw)
      const t = b?.msg ?? b?.data?.tracking ?? b?.data
      if (!t || typeof t.tracking_number !== "string") return null
      return { ref: typeof t.id === "string" ? t.id : null, number: t.tracking_number, carrierCode: typeof t.slug === "string" ? t.slug : null }
    } catch {
      return null
    }
  },
}

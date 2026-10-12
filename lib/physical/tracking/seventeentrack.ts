/**
 * ===========================================================================
 *  17TRACK API v2.2
 * ===========================================================================
 * Public docs: https://api.17track.net/en/doc?version=v2.2
 *
 *   auth       header `17token: <key>`
 *   register   POST /register [{ number, carrier? }]. Without a carrier code
 *              17TRACK works the carrier out from the number. A number that
 *              is already registered is rejected with -18019901, which is
 *              fine: it is read as it is.
 *   read       POST /gettrackinfo [{ number, carrier? }]: track_info with
 *              latest_status { status, sub_status }, time_metrics
 *              estimated_delivery_date { from, to }, and tracking.providers
 *              [{ provider { name }, events [{ time_iso, description,
 *              location, sub_status }] }]. A number not registered is
 *              rejected with -18019902, and is registered again.
 *   stop       POST /stoptrack, when the seller changes the number.
 *   webhook    POST with header `sign`: SHA-256 hex of the raw body, "/" and
 *              the API key. Body { event: "TRACKING_UPDATED", data: {
 *              number, carrier, track_info } }.
 *
 * Every call answers 200 with { code, data: { accepted, rejected } }; a
 * code other than 0 is a refusal of the whole request.
 */

import { createHash, timingSafeEqual } from "node:crypto"
import { ask, TrackingError } from "./http"
import { cleanCheckpoints, from17TrackStatus, placeOf, readDate, type TrackingSnapshot } from "./model"
import type { TrackingAccount, TrackingProvider } from "./provider"

export const SEVENTEENTRACK_BASE = "https://api.17track.net/track/v2.2"

const head = (a: TrackingAccount) => ({ "17token": a.apiKey })

function item(number: string, carrier: string | null) {
  const code = carrier && /^\d{1,7}$/.test(carrier) ? Number(carrier) : null
  return { number, ...(code ? { carrier: code } : {}) }
}

function whole(body: any, status: number): void {
  if (status !== 200) throw new TrackingError(`17TRACK answered ${status}.`, status, status >= 500, String(status))
  if (body?.code !== 0) {
    const msg = typeof body?.data?.errors?.[0]?.message === "string" ? body.data.errors[0].message : `code ${body?.code}`
    throw new TrackingError(`17TRACK: ${String(msg).slice(0, 160)}`, 200, false, String(body?.code ?? ""))
  }
}

export function parse17Track(entry: any, now = Date.now()): TrackingSnapshot {
  const info = entry?.track_info ?? {}
  if (typeof entry?.number !== "string") throw new TrackingError("17TRACK sent a tracking Storelib could not read.", 200, true)
  const providers = Array.isArray(info?.tracking?.providers) ? info.tracking.providers : []
  const events = providers.flatMap((p: any) => (Array.isArray(p?.events) ? p.events : []))
  const checkpoints = cleanCheckpoints(
    events.map((e: any) => {
      const sub = String(e?.sub_status ?? "")
      return {
        at: String(e?.time_iso ?? e?.time_utc ?? ""),
        status: from17TrackStatus(sub.split("_")[0] || e?.stage, sub, e?.description),
        message: String(e?.description ?? ""),
        location: (typeof e?.location === "string" && e.location.trim()) || placeOf(e?.address?.city, e?.address?.state, e?.address?.country),
      }
    }),
  )
  const latest = info?.latest_status ?? {}
  const eta = info?.time_metrics?.estimated_delivery_date
  return {
    ref: null,
    number: entry.number,
    status: from17TrackStatus(latest.status, latest.sub_status, checkpoints[0]?.message),
    substatus: typeof latest.sub_status === "string" ? latest.sub_status.slice(0, 60) : null,
    carrierCode: entry.carrier != null && String(entry.carrier) !== "0" ? String(entry.carrier).slice(0, 20) : null,
    carrierName: typeof providers[0]?.provider?.name === "string" ? providers[0].provider.name.slice(0, 60) : null,
    estimatedDelivery: readDate(eta?.to, now) ?? readDate(eta?.from, now),
    checkpoints,
  }
}

async function read(a: TrackingAccount, number: string, carrier: string | null): Promise<TrackingSnapshot> {
  const r = await ask("17TRACK", `${SEVENTEENTRACK_BASE}/gettrackinfo`, { method: "POST", headers: head(a), body: [item(number, carrier)] })
  whole(r.body, r.status)
  const ok = Array.isArray(r.body?.data?.accepted) ? r.body.data.accepted[0] : null
  if (ok) return parse17Track(ok)
  const no = Array.isArray(r.body?.data?.rejected) ? r.body.data.rejected[0] : null
  const code = no?.error?.code
  if (code === -18019902) throw new TrackingError("17TRACK is not following this number yet.", 200, false, "not_registered")
  throw new TrackingError(`17TRACK: ${String(no?.error?.message ?? "the number was refused").slice(0, 160)}`, 200, false, String(code ?? ""))
}

export const seventeentrack: TrackingProvider = {
  id: "17track",
  name: "17TRACK",
  async register(a, input) {
    const r = await ask("17TRACK", `${SEVENTEENTRACK_BASE}/register`, { method: "POST", headers: head(a), body: [{ ...item(input.number, input.carrierCode), ...(input.orderRef ? { tag: input.orderRef.slice(0, 100) } : {}) }] })
    whole(r.body, r.status)
    const no = Array.isArray(r.body?.data?.rejected) ? r.body.data.rejected[0] : null
    /* -18019901: already registered, by this account. Read as it is. */
    if (no && no.error?.code !== -18019901) throw new TrackingError(`17TRACK: ${String(no.error?.message ?? "the number was refused").slice(0, 160)}`, 200, false, String(no.error?.code ?? ""))
    const ok = Array.isArray(r.body?.data?.accepted) ? r.body.data.accepted[0] : null
    const carrier = ok?.carrier != null && String(ok.carrier) !== "0" ? String(ok.carrier) : input.carrierCode
    try {
      return await read(a, input.number, carrier)
    } catch (e) {
      /* Just registered, nothing fetched yet: it is waiting for the carrier, and the next look reads it. */
      if (e instanceof TrackingError && e.code === "not_registered") return { ref: null, number: input.number, status: "pending", substatus: null, carrierCode: carrier, carrierName: null, estimatedDelivery: null, checkpoints: [] }
      throw e
    }
  },
  async get(a, input) {
    return read(a, input.number, input.carrierCode)
  },
  async detect() {
    /* 17TRACK works the carrier out when the number is registered; it has no separate detect call. */
    return []
  },
  verifyWebhook(a, raw, headers) {
    const got = String(headers.get("sign") ?? "").trim().toLowerCase()
    if (!a.apiKey || !/^[0-9a-f]{64}$/.test(got)) return false
    const want = Buffer.from(createHash("sha256").update(`${raw}/${a.apiKey}`, "utf8").digest("hex"))
    const have = Buffer.from(got)
    return want.length === have.length && timingSafeEqual(want, have)
  },
  readWebhook(raw) {
    try {
      const b = JSON.parse(raw)
      const d = b?.data
      if (!d || typeof d.number !== "string") return null
      return { ref: null, number: d.number, carrierCode: d.carrier != null && String(d.carrier) !== "0" ? String(d.carrier) : null }
    } catch {
      return null
    }
  },
}

/** Stop following a number (the seller changed it); quiet when it fails. */
export async function stop17Track(a: TrackingAccount, number: string, carrier: string | null): Promise<void> {
  await ask("17TRACK", `${SEVENTEENTRACK_BASE}/stoptrack`, { method: "POST", headers: head(a), body: [item(number, carrier)] }, 1).catch(() => undefined)
}

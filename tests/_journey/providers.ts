/**
 * The outside services round 24 talks to, each a small stub of its public
 * API answered through the journey's network (./net.ts routes): AfterShip
 * (tracking), Shippo (labels), ShipStation (orders out, shipments back),
 * Gelato and CJ (print and dropship partners), Klaviyo and Omnisend
 * (marketing). Every request is recorded, so a step can say what was sent,
 * and only the documented hosts are answered: anything else stays refused.
 */
import { createHmac } from "node:crypto"
import type { Net } from "./net"

type Obj = Record<string, any>
export interface ProviderCall {
  host: string
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: any
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

export class Providers {
  calls: ProviderCall[] = []
  /** AfterShip's trackings, by number. */
  aftership = new Map<string, Obj>()
  private seq = 0

  constructor(net: Net) {
    const read = async (req: Request): Promise<ProviderCall> => {
      const url = new URL(req.url)
      const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text()
      let body: any = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }
      const c = { host: url.host, method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body }
      this.calls.push(c)
      return c
    }
    net.routes.push({ match: (u) => u.host === "api.aftership.com", answer: async (req) => this.afterShip(await read(req)) })
    net.routes.push({ match: (u) => u.host in this.handlers, answer: async (req) => this.handlers[new URL(req.url).host](await read(req)) })
  }

  /** Extra hosts a step stubs (Shippo, ShipStation, Gelato, CJ, Klaviyo, Omnisend), keyed by host. */
  handlers: Record<string, (c: ProviderCall) => Response | Promise<Response>> = {}
  on(host: string, handler: (c: ProviderCall) => Response | Promise<Response> | null): void {
    const before = this.handlers[host]
    this.handlers[host] = async (c) => (await handler(c)) ?? (before ? before(c) : json({ message: `not stubbed: ${c.method} ${c.path}` }, 404))
  }

  to(host: string, path?: RegExp): ProviderCall[] {
    return this.calls.filter((c) => c.host === host && (!path || path.test(c.path)))
  }

  /* ── AfterShip Tracking API 2024-10 ─────────────────────────────────── */

  private afterShip(c: ProviderCall): Response {
    if (c.headers.get("as-api-key") !== process.env.AFTERSHIP_API_KEY) return json({ meta: { code: 401, message: "Invalid API key." } }, 401)
    const base = "/tracking/2024-10"
    if (c.method === "POST" && c.path === `${base}/trackings`) {
      const n = String(c.body?.tracking_number ?? "")
      if (this.aftership.has(n)) return json({ meta: { code: 4003, message: "Tracking already exists." }, data: {} }, 400)
      const t = { id: `as_${++this.seq}`, tracking_number: n, slug: c.body?.slug ?? "dhl", courier_name: "DHL", tag: "InfoReceived", subtag: "InfoReceived_001", checkpoints: [], order_id: c.body?.order_id ?? null }
      this.aftership.set(n, t)
      return json({ meta: { code: 201 }, data: { tracking: t } }, 201)
    }
    const byId = new RegExp(`^${base}/trackings/([^/]+)$`).exec(c.path)
    if (c.method === "GET" && byId) {
      const t = [...this.aftership.values()].find((x) => x.id === decodeURIComponent(byId[1]))
      return t ? json({ meta: { code: 200 }, data: { tracking: t } }) : json({ meta: { code: 4004, message: "Tracking does not exist." } }, 404)
    }
    if (c.method === "GET" && c.path === `${base}/trackings`) {
      const t = this.aftership.get(c.query.get("tracking_numbers") ?? "")
      return json({ meta: { code: 200 }, data: { trackings: t ? [t] : [] } })
    }
    if (c.method === "POST" && c.path === `${base}/couriers/detect`) return json({ meta: { code: 200 }, data: { couriers: [{ slug: "dhl", name: "DHL" }] } })
    return json({ meta: { code: 404, message: "Not found" } }, 404)
  }

  /** The carrier scanned the parcel: AfterShip's tracking moves on, newest checkpoint first. */
  scan(number: string, tag: string, message: string, at: string, extra: Obj = {}): Obj {
    const t = this.aftership.get(number)
    if (!t) throw new Error(`AfterShip has no ${number}`)
    t.tag = tag
    t.subtag = `${tag}_001`
    t.checkpoints = [{ checkpoint_time: at, tag, subtag: `${tag}_001`, message, location: "Cluj-Napoca, RO" }, ...t.checkpoints]
    Object.assign(t, extra)
    return t
  }

  /** AfterShip's webhook: the tracking in `msg`, signed with the webhook secret (base64 HMAC-SHA256 of the raw body). */
  aftershipWebhook(number: string): { raw: string; headers: Record<string, string> } {
    const t = this.aftership.get(number)!
    const raw = JSON.stringify({ event: "tracking_update", event_id: `ev_${++this.seq}`, is_tracking_first_tag: false, msg: t, ts: Math.floor(Date.now() / 1000) })
    const sig = createHmac("sha256", process.env.AFTERSHIP_WEBHOOK_SECRET!).update(raw, "utf8").digest("base64")
    return { raw, headers: { "content-type": "application/json", "aftership-hmac-sha256": sig } }
  }
}

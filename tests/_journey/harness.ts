/**
 * ===========================================================================
 *  THE COMMERCE JOURNEY HARNESS
 * ===========================================================================
 * One Storelib, in a process: the real route handlers and server modules,
 * over an in-memory PostgREST (./postgrest.ts, with the SQL's defaults, keys
 * and the commerce functions ported in ./rpcs.ts), a GoTrue that knows the
 * journey's people, a Mailgun mailbox, and a Stripe world (./stripe-fake.ts)
 * whose webhooks are signed and delivered to the real webhook route.
 *
 *   const j = await Journey.start()
 *   const seller = await j.signUp("maker@example.com")
 *   await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "maker" } })
 *
 * `call` takes "METHOD /path" with the path's own ids, finds the route file
 * by its folders ([id], [token]), and hands the handler a Request with the
 * person's session cookie, as Next would. The answer comes back parsed.
 *
 * Import ./env first (before anything that reads process.env on load).
 */
import { randomBytes, randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { MemoryDb } from "./postgrest"
import { installRpcs } from "./rpcs"
import { Net, SUPABASE_HOST, type AuthUser } from "./net"
import { StripeWorld } from "./stripe-fake"
import { Providers } from "./providers"

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response
type RouteModule = Record<string, Handler | unknown>

/* Every route the journey drives, by its folder path. Literal imports, so the compiler takes each one along. */
const ROUTES: Record<string, () => Promise<RouteModule>> = {
  "/api/onboarding/finalize": () => import("@/app/api/onboarding/finalize/route"),
  "/api/store/settings": () => import("@/app/api/store/settings/route"),
  "/api/store/currency": () => import("@/app/api/store/currency/route"),
  "/api/store/taxes": () => import("@/app/api/store/taxes/route"),
  "/api/store/taxes/regions": () => import("@/app/api/store/taxes/regions/route"),
  "/api/store/taxes/regions/[id]": () => import("@/app/api/store/taxes/regions/[id]/route"),
  "/api/store/channels": () => import("@/app/api/store/channels/route"),
  "/api/store/channels/product": () => import("@/app/api/store/channels/product/route"),
  "/api/stripe/connect/start": () => import("@/app/api/stripe/connect/start/route"),
  "/api/stripe/connect/status": () => import("@/app/api/stripe/connect/status/route"),
  "/api/stripe/webhook": () => import("@/app/api/stripe/webhook/route"),
  "/api/stripe/webhook/connect": () => import("@/app/api/stripe/webhook/connect/route"),
  "/api/stripe/refund": () => import("@/app/api/stripe/refund/route"),
  "/api/stripe/seller-balance": () => import("@/app/api/stripe/seller-balance/route"),
  "/api/physical/settings": () => import("@/app/api/physical/settings/route"),
  "/api/physical/onboarding": () => import("@/app/api/physical/onboarding/route"),
  "/api/physical/locations": () => import("@/app/api/physical/locations/route"),
  "/api/physical/locations/[id]": () => import("@/app/api/physical/locations/[id]/route"),
  "/api/physical/packages": () => import("@/app/api/physical/packages/route"),
  "/api/physical/shipping/profiles": () => import("@/app/api/physical/shipping/profiles/route"),
  "/api/physical/shipping/zones": () => import("@/app/api/physical/shipping/zones/route"),
  "/api/physical/shipping/rates": () => import("@/app/api/physical/shipping/rates/route"),
  "/api/physical/shipping/quick-setup": () => import("@/app/api/physical/shipping/quick-setup/route"),
  "/api/physical/tax-rates": () => import("@/app/api/physical/tax-rates/route"),
  "/api/physical/products/[id]": () => import("@/app/api/physical/products/[id]/route"),
  "/api/physical/inventory": () => import("@/app/api/physical/inventory/route"),
  "/api/physical/storefront/product": () => import("@/app/api/physical/storefront/product/route"),
  "/api/physical/storefront/shop": () => import("@/app/api/physical/storefront/shop/route"),
  "/api/physical/checkout": () => import("@/app/api/physical/checkout/route"),
  "/api/physical/checkout/quote": () => import("@/app/api/physical/checkout/quote/route"),
  "/api/physical/checkout/complete": () => import("@/app/api/physical/checkout/complete/route"),
  "/api/physical/orders": () => import("@/app/api/physical/orders/route"),
  "/api/physical/orders/[id]": () => import("@/app/api/physical/orders/[id]/route"),
  "/api/physical/order-status/[token]/cancel": () => import("@/app/api/physical/order-status/[token]/cancel/route"),
  "/api/physical/order-status/[token]/return": () => import("@/app/api/physical/order-status/[token]/return/route"),
  "/api/physical/analytics": () => import("@/app/api/physical/analytics/route"),
  "/api/cron/physical": () => import("@/app/api/cron/physical/route"),
  "/api/cron/process-scheduled-emails": () => import("@/app/api/cron/process-scheduled-emails/route"),
  "/api/cron/notify": () => import("@/app/api/cron/notify/route"),
  "/api/coupons": () => import("@/app/api/coupons/route"),
  "/api/tracking/webhooks/[provider]/[token]": () => import("@/app/api/tracking/webhooks/[provider]/[token]/route"),
  "/api/order-help": () => import("@/app/api/order-help/route"),
  "/api/order-help/[id]": () => import("@/app/api/order-help/[id]/route"),
  "/api/store/cases": () => import("@/app/api/store/cases/route"),
  "/api/store/cases/[id]": () => import("@/app/api/store/cases/[id]/route"),
  "/api/store/integrations/marketing": () => import("@/app/api/store/integrations/marketing/route"),
  "/api/physical/integrations": () => import("@/app/api/physical/integrations/route"),
  "/api/physical/integrations/[provider]": () => import("@/app/api/physical/integrations/[provider]/route"),
  "/api/physical/integrations/[provider]/links": () => import("@/app/api/physical/integrations/[provider]/links/route"),
  "/api/physical/orders/[id]/label": () => import("@/app/api/physical/orders/[id]/label/route"),
  "/api/integrations/shipstation/[token]": () => import("@/app/api/integrations/shipstation/[token]/route"),
  "/api/integrations/webhooks/[provider]/[token]": () => import("@/app/api/integrations/webhooks/[provider]/[token]/route"),
  "/api/physical/coupons/[id]": () => import("@/app/api/physical/coupons/[id]/route"),
  "/api/payments/[action]": () => import("@/app/api/payments/[action]/route"),
  "/api/checkout/site": () => import("@/app/api/checkout/site/route"),
  "/api/settings/payments": () => import("@/app/api/settings/payments/route"),
  "/api/store/markets": () => import("@/app/api/store/markets/route"),
  "/api/store/translations": () => import("@/app/api/store/translations/route"),
  "/api/store/translations/draft": () => import("@/app/api/store/translations/draft/route"),
  "/api/store/translations/jobs": () => import("@/app/api/store/translations/jobs/route"),
}

/* Columns production has that no SQL file created were added by run-now part 165; none are taken on trust any more. */
const DASHBOARD_COLUMNS: string[] = []

export interface Answer<T = any> {
  status: number
  json: T
  headers: Headers
  location: string | null
}

export interface Person extends AuthUser {
  cookies: Map<string, string>
}

export class Journey {
  db = new MemoryDb()
  net = new Net(this.db)
  world = new StripeWorld()
  /** AfterShip, Shippo, ShipStation, Gelato, CJ, Klaviyo, Omnisend: stubs of their public APIs. */
  providers = new Providers(this.net)
  stripe!: Stripe
  /** Every route answer that was a 5xx, for the end of the suite. */
  serverErrors: { route: string; status: number; body: unknown }[] = []
  /** Work scheduled with after() that threw. */
  afterErrors: { route: string; error: string }[] = []

  static async start(): Promise<Journey> {
    const j = new Journey()
    installRpcs(j.db)
    /*
      Made in the Supabase dashboard before the repository kept SQL: the live
      database has them (onboarding has written them since the first day), no
      file here creates them.
    */
    for (const c of DASHBOARD_COLUMNS) j.db.extraColumns.add(c)
    j.net.install()
    const { stripe } = await import("@/lib/stripe")
    j.stripe = stripe
    /* The proxy makes the client on first use; installing on its resources patches that one client. */
    j.world.install(stripe)
    /* Physical commerce switched on in /admin. */
    j.db.rows("platform_settings").push({ key: "physical_commerce_enabled", value: true, updated_at: new Date().toISOString() })
    return j
  }

  /** A person who signed up (Supabase auth), with the profile row the auth trigger makes. */
  async signUp(email: string, opts: { confirmed?: boolean; name?: string } = {}): Promise<Person> {
    const id = randomUUID()
    const token = `jwt.${randomBytes(12).toString("hex")}`
    const user: Person = { id, email, email_confirmed_at: opts.confirmed === false ? null : new Date().toISOString(), user_metadata: { full_name: opts.name ?? null }, app_metadata: { provider: "email" }, token, cookies: new Map() }
    this.net.users.set(id, user)
    this.db.rows("profiles").push({ id, email, full_name: opts.name ?? null, created_at: new Date().toISOString() })
    const session = { access_token: token, refresh_token: `r.${token}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24, user: { id, email, aud: "authenticated", role: "authenticated", email_confirmed_at: user.email_confirmed_at, user_metadata: user.user_metadata, app_metadata: user.app_metadata } }
    user.cookies.set(`sb-${SUPABASE_HOST.split(".")[0]}-auth-token`, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`)
    return user
  }

  private findRoute(path: string): { load: () => Promise<RouteModule>; params: Record<string, string> } {
    const parts = path.split("/").filter(Boolean)
    for (const [pattern, load] of Object.entries(ROUTES)) {
      const p = pattern.split("/").filter(Boolean)
      if (p.length !== parts.length) continue
      const params: Record<string, string> = {}
      if (p.every((seg, i) => (seg.startsWith("[") ? ((params[seg.slice(1, -1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) return { load, params }
    }
    throw new Error(`no route for ${path} in the journey's list`)
  }

  /**
   * "POST /api/physical/checkout", as a person (their session cookie) or
   * anonymous; `headers` adds to the request (a Stripe signature, a cron
   * secret, a visitor's country).
   */
  async call<T = any>(route: string, opts: { as?: Person | null; body?: unknown; raw?: string; headers?: Record<string, string>; host?: string; cookies?: Record<string, string> } = {}): Promise<Answer<T>> {
    const [method, target] = route.split(" ")
    const url = new URL(target, `https://${opts.host ?? "storelib.com"}`)
    const { load, params } = this.findRoute(url.pathname)
    const mod = await load()
    const handler = mod[method] as Handler | undefined
    if (typeof handler !== "function") throw new Error(`${url.pathname} has no ${method}`)
    const jar = new Map<string, string>(opts.as?.cookies ?? [])
    for (const [k, v] of Object.entries(opts.cookies ?? {})) jar.set(k, v)
    const headers = new Headers({ host: url.host, "user-agent": "Mozilla/5.0 (journey)", "x-forwarded-for": "203.0.113.9", "x-vercel-ip-country": "RO", ...(opts.headers ?? {}) })
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "))
    const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
    if (body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    const request = new Request(url, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body })
    const setCookies: Record<string, string> = {}
    ;(globalThis as any).__PUSH_TEST_NEXT_HEADERS__ = {
      cookies: () => ({
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
        has: (name: string) => jar.has(name),
        set: (name: string | { name: string; value: string }, value?: string) => {
          const n = typeof name === "string" ? name : name.name
          const v = typeof name === "string" ? value ?? "" : name.value
          jar.set(n, v)
          setCookies[n] = v
        },
        delete: (name: string) => jar.delete(name),
      }),
      headers: () => headers,
    }
    const later: (() => unknown)[] = []
    ;(globalThis as any).__PUSH_TEST_AFTER__ = (task: unknown) => {
      if (typeof task === "function") later.push(task as () => unknown)
      else if (task && typeof (task as Promise<unknown>).then === "function") later.push(() => task)
    }
    let res: Response
    try {
      res = await handler(request, { params: Promise.resolve(params) })
      /* next/server's after(): run once the answer is made, as Next runs it. */
      for (const task of later) {
        try {
          await task()
        } catch (e) {
          this.afterErrors.push({ route, error: e instanceof Error ? e.message : String(e) })
        }
      }
    } finally {
      delete (globalThis as any).__PUSH_TEST_NEXT_HEADERS__
      delete (globalThis as any).__PUSH_TEST_AFTER__
    }
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    if (opts.as) for (const [k, v] of Object.entries(setCookies)) opts.as.cookies.set(k, v)
    if (res.status >= 500) this.serverErrors.push({ route, status: res.status, body: json })
    return { status: res.status, json, headers: res.headers, location: res.headers.get("location") }
  }

  /** A Stripe event, signed and delivered to the webhook route as Stripe sends it. */
  async webhook(type: string, object: Record<string, any>, opts: { connect?: boolean; account?: string; id?: string } = {}): Promise<Answer & { eventId: string }> {
    const secret = opts.connect ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET! : process.env.STRIPE_WEBHOOK_SECRET!
    const signed = this.world.webhook(this.stripe, type, object, { secret, account: opts.account, id: opts.id })
    const answer = await this.call(`POST ${opts.connect ? "/api/stripe/webhook/connect" : "/api/stripe/webhook"}`, { raw: signed.body, headers: signed.headers })
    return { ...answer, eventId: signed.eventId }
  }

  /** The ten minute cron: held stock expired, queued jobs (emails) sent. */
  async cron(): Promise<Answer> {
    const auth = { authorization: `Bearer ${process.env.CRON_SECRET}` }
    const physical = await this.call("GET /api/cron/physical", { headers: auth })
    /* The notification engine's own cron (seller emails, disputes), as production runs it beside the physical one. */
    await this.call("GET /api/cron/notify", { headers: auth })
    return physical
  }

  rows(table: string) {
    return this.db.rows(table)
  }
}

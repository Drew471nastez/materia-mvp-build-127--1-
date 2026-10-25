import "server-only"

/**
 * ===========================================================================
 *  CJ DROPSHIPPING (https://developers.cjdropshipping.com, API 2.0)
 * ===========================================================================
 * The seller's CJ API key (My CJ › Authorization › API) is exchanged for an
 * access token, sent as CJ-Access-Token:
 *
 *   token        POST /authentication/getAccessToken { apiKey }: an access
 *                token (15 days) and a refresh token (180 days). Kept
 *                sealed in the integration's config; a token close to its
 *                end is renewed with POST /authentication/refreshAccessToken
 *                { refreshToken }, and a token CJ refuses is fetched again
 *                from the key, once, before the call is given up.
 *   connect      the token exchange itself: a key CJ refuses is not saved.
 *   submit       each item by the CJ variant (vid) the seller matched it to
 *                in Storelib (links-server.ts). An item not matched goes by
 *                its SKU only when CJ confirms that exact SKU as one of its
 *                variants (GET /product/variant/query?variantSku=), never a
 *                near one. The shipping method is the seller's choice, or
 *                the cheapest CJ quotes for these items from the chosen
 *                warehouse country (POST /logistic/freightCalculate).
 *                POST /shopping/order/createOrderV2 with payType 3: the
 *                order is made in CJ and waits there for the seller to pay
 *                it (draft). With Send to production on, it is then
 *                confirmed (PATCH /shopping/order/confirmOrder) and paid
 *                from the seller's CJ balance (POST /shopping/pay/payBalance);
 *                a balance too low leaves it made and unpaid in CJ, and the
 *                order says so.
 *   fetchOrder   GET /shopping/order/getOrderDetail?orderId=: status, the
 *                CJ tracking number and shipping method, and whether
 *                GET /logistic/trackInfo says it was delivered.
 *   webhooks     POST /webhook/set: order, logistics and stock messages to
 *                Storelib's signed address (CJ keeps one address a topic, so
 *                the card says it replaces another set in CJ). CJ does not
 *                sign these messages, so a delivery only names what to read
 *                again with the seller's token.
 *   stock        GET /product/stock/queryByVid?vid=: each warehouse's
 *                stock, summed for the warehouse country orders ship from,
 *                for the variants the seller asked to keep in step.
 *
 * CJ answers HTTP 200 with its own code in the body; anything but 200 is an
 * error, and its "too many requests" is retried like a 429. CJ allows about
 * one request a second on a new account, so calls are spaced.
 */

import { call, cancelling, ProviderError, providerMessage } from "./http"
import { toMinor } from "@/lib/integrations/shipping/money"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import type { ConnectorCredential, FulfilmentConnector, ProviderOrderInput, ProviderOrderStage, ProviderOrderState } from "./types"

export const CJ_API = "https://developers.cjdropshipping.com/api2.0/v1"
const NAME = "CJ Dropshipping"

/* ── spacing: about one call a second ─────────────────────────────────── */

let gapMs = 1100
let last = 0
/** Tests space nothing. */
export function setCjSpacing(ms: number): void {
  gapMs = Math.max(0, ms)
}
async function spaced(): Promise<void> {
  const wait = last + gapMs - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
}

/* ── one call, CJ's envelope read ─────────────────────────────────────── */

interface Envelope<T> {
  code?: number
  result?: boolean
  message?: string
  data?: T
}

class CjAuthError extends ProviderError {}

async function cj<T>(path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; token?: string | null; body?: unknown }): Promise<T> {
  await spaced()
  let env: Envelope<T>
  try {
    env = await call<Envelope<T>>(NAME, `${CJ_API}${path}`, {
      method: init.method ?? "GET",
      headers: init.token ? { "CJ-Access-Token": init.token } : {},
      body: init.body,
    })
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) throw new CjAuthError(e.message, e.status, false)
    throw e
  }
  const code = Number(env?.code ?? 200)
  if (env && (env.result === false || (code !== 200 && code !== 0))) {
    const said = providerMessage(env) ?? `code ${code}`
    if (code === 1600200 || code === 1600201 || /too (many|much|frequent)|rate limit|qps/i.test(said)) throw new ProviderError(`${NAME} is busy right now. Storelib tries again shortly.`, 429, true)
    if ((code >= 1600001 && code <= 1600099) || /access.?token|apikey|api key|unauthori[sz]ed|authentication/i.test(said)) throw new CjAuthError(`${NAME} no longer accepts the saved key. Connect it again in Settings › Integrations.`, 401, false)
    if (/system (error|busy|exception)|internal (server )?error|service unavailable|timeout/i.test(said)) throw new ProviderError(`${NAME} had a problem. Storelib tries again shortly.`, 502, true)
    throw new ProviderError(`${NAME}: ${said}`, 422, false)
  }
  return env?.data as T
}

/* ── the access token ─────────────────────────────────────────────────── */

interface TokenData {
  accessToken?: string
  accessTokenExpiryDate?: string
  refreshToken?: string
  refreshTokenExpiryDate?: string
  openId?: number | string
}

interface SavedTokens {
  at: string
  at_exp: string | null
  rt: string | null
  rt_exp: string | null
}

const HOUR = 3600_000

function sealTokens(d: TokenData): SavedTokens {
  if (!d?.accessToken) throw new ProviderError(`${NAME} did not send an access token.`, 502, true)
  return { at: sealSecret(d.accessToken), at_exp: d.accessTokenExpiryDate ?? null, rt: d.refreshToken ? sealSecret(d.refreshToken) : null, rt_exp: d.refreshTokenExpiryDate ?? null }
}

const fresh = (exp: string | null, now: number) => !!exp && Date.parse(exp) - now > HOUR

/** A token from the key itself. */
export async function cjTokenFromKey(apiKey: string): Promise<TokenData> {
  return cj<TokenData>("/authentication/getAccessToken", { method: "POST", body: { apiKey } })
}

async function keep(cred: ConnectorCredential, saved: SavedTokens): Promise<void> {
  cred.config.cj = saved
  await cred.persist?.({ cj: saved })
}

/** The access token to call with: the saved one while it lasts, else refreshed, else fetched again from the key. */
export async function cjToken(cred: ConnectorCredential, force = false, now = Date.now()): Promise<string> {
  const saved = (cred.config.cj ?? null) as SavedTokens | null
  if (!force && saved?.at && fresh(saved.at_exp, now)) {
    const at = openSecret(saved.at)
    if (at) return at
  }
  if (!force && saved?.rt && fresh(saved.rt_exp, now)) {
    const rt = openSecret(saved.rt)
    if (rt) {
      try {
        const d = await cj<TokenData>("/authentication/refreshAccessToken", { method: "POST", body: { refreshToken: rt } })
        const next = sealTokens(d)
        await keep(cred, next)
        return d.accessToken as string
      } catch (e) {
        if (!(e instanceof CjAuthError)) throw e
      }
    }
  }
  const d = await cjTokenFromKey(cred.key)
  await keep(cred, sealTokens(d))
  return d.accessToken as string
}

/** A call with the seller's token, fetched again once if CJ refuses the saved one. */
export async function cjAuthed<T>(cred: ConnectorCredential, path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<T> {
  try {
    return await cj<T>(path, { ...init, token: await cjToken(cred) })
  } catch (e) {
    if (!(e instanceof CjAuthError)) throw e
    return cj<T>(path, { ...init, token: await cjToken(cred, true) })
  }
}

/* ── the catalogue, for matching ──────────────────────────────────────── */

export interface CjVariant {
  vid: string
  pid: string | null
  sku: string
  name: string
  image: string | null
  price: string | null
}
export interface CjProduct {
  pid: string
  sku: string
  name: string
  image: string | null
  price: string | null
}

function readVariant(v: any): CjVariant | null {
  const vid = v?.vid != null ? String(v.vid) : ""
  if (!vid) return null
  return {
    vid,
    pid: v?.pid != null ? String(v.pid) : null,
    sku: typeof v?.variantSku === "string" ? v.variantSku : "",
    name: typeof v?.variantNameEn === "string" && v.variantNameEn ? v.variantNameEn : typeof v?.variantKey === "string" ? v.variantKey : "",
    image: typeof v?.variantImage === "string" ? v.variantImage : null,
    price: v?.variantSellPrice != null ? String(v.variantSellPrice) : null,
  }
}

const listOf = (d: unknown): any[] => (Array.isArray(d) ? d : d && typeof d === "object" && Array.isArray((d as any).list) ? (d as any).list : d && typeof d === "object" ? [d] : [])

/** CJ's variants with exactly this SKU (case as typed): the only way an unmatched item is ever sent. */
export async function cjVariantsBySku(cred: ConnectorCredential, sku: string): Promise<CjVariant[]> {
  const s = sku.trim()
  if (!s) return []
  const d = await cjAuthed<unknown>(cred, `/product/variant/query?variantSku=${encodeURIComponent(s)}`).catch((e) => {
    if (e instanceof ProviderError && !e.retry && !(e instanceof CjAuthError)) return []
    throw e
  })
  return listOf(d).map(readVariant).filter((v): v is CjVariant => !!v && v.sku === s)
}

export async function cjVariantsOfProduct(cred: ConnectorCredential, pid: string): Promise<CjVariant[]> {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(pid)) return []
  const d = await cjAuthed<unknown>(cred, `/product/variant/query?pid=${encodeURIComponent(pid)}`)
  return listOf(d).map(readVariant).filter((v): v is CjVariant => !!v)
}

export async function cjVariantByVid(cred: ConnectorCredential, vid: string): Promise<CjVariant | null> {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(vid)) return null
  const d = await cjAuthed<unknown>(cred, `/product/variant/queryByVid?vid=${encodeURIComponent(vid)}`).catch((e) => {
    if (e instanceof ProviderError && !e.retry && !(e instanceof CjAuthError)) return null
    throw e
  })
  const v = readVariant(Array.isArray(d) ? d[0] : d)
  return v && v.vid === vid ? v : null
}

/** CJ's catalogue by keyword or SKU (GET /product/listV2), and the variants with that exact SKU first. */
export async function cjSearch(cred: ConnectorCredential, q: string): Promise<{ variants: CjVariant[]; products: CjProduct[] }> {
  const query = q.trim().slice(0, 100)
  if (query.length < 2) return { variants: [], products: [] }
  const variants = /^[A-Za-z0-9._-]{3,64}$/.test(query) ? await cjVariantsBySku(cred, query) : []
  const d = await cjAuthed<{ content?: { productList?: any[] }[] }>(cred, `/product/listV2?keyWord=${encodeURIComponent(query)}&page=1&size=20`)
  const products: CjProduct[] = []
  for (const c of Array.isArray(d?.content) ? d.content : []) {
    for (const p of Array.isArray(c?.productList) ? c.productList : []) {
      const pid = p?.id != null ? String(p.id) : ""
      if (!pid || products.some((x) => x.pid === pid)) continue
      products.push({ pid, sku: typeof p?.sku === "string" ? p.sku : "", name: typeof p?.nameEn === "string" ? p.nameEn : "", image: typeof p?.bigImage === "string" ? p.bigImage : null, price: p?.sellPrice != null ? String(p.sellPrice) : null })
    }
  }
  return { variants, products }
}

/** A variant's stock in CJ's warehouses: in one country when given, else all of them. */
export async function cjStock(cred: ConnectorCredential, vid: string, country: string | null): Promise<number> {
  const d = await cjAuthed<unknown>(cred, `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`)
  let total = 0
  for (const w of listOf(d)) {
    if (country && String(w?.countryCode ?? "").toUpperCase() !== country) continue
    const n = Number(w?.totalInventoryNum ?? w?.storageNum ?? 0)
    if (Number.isFinite(n) && n > 0) total += Math.floor(n)
  }
  return total
}

/* ── orders ───────────────────────────────────────────────────────────── */

const STAGE: Record<string, ProviderOrderStage> = {
  CREATED: "draft",
  IN_CART: "draft",
  UNPAID: "draft",
  UNSHIPPED: "in_production",
  PENDING: "in_production",
  PROCESSING: "in_production",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
}

export function readCjOrder(o: any, delivered = false): ProviderOrderState {
  const status = String(o?.orderStatus ?? "CREATED").toUpperCase()
  let stage = STAGE[status] ?? "pending"
  const number = o?.trackNumber != null && String(o.trackNumber).trim() ? String(o.trackNumber).trim() : null
  if (stage === "shipped" && delivered) stage = "delivered"
  return {
    providerOrderId: o?.orderId != null ? String(o.orderId) : "",
    externalId: typeof o?.orderNumber === "string" ? o.orderNumber : typeof o?.orderNum === "string" ? o.orderNum : null,
    stage,
    problem: null,
    shipments: number ? [{ carrier: typeof o?.logisticName === "string" && o.logisticName.trim() ? o.logisticName.trim() : null, trackingNumber: number, trackingUrl: typeof o?.trackingUrl === "string" ? o.trackingUrl : null, delivered: stage === "delivered" }] : [],
  }
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/** Each item's CJ variant: the matched one, else the variant CJ confirms has exactly this SKU. Refused when either is missing. */
export async function cjVariantsFor(cred: ConnectorCredential, order: ProviderOrderInput): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const missing: string[] = []
  for (const l of order.lines) {
    if (l.link?.providerVariantId) {
      out.set(l.lineId, l.link.providerVariantId)
      continue
    }
    const found = l.sku ? await cjVariantsBySku(cred, l.sku) : []
    if (found.length === 1) out.set(l.lineId, found[0].vid)
    else missing.push(l.sku ? `${l.title} (SKU ${l.sku})` : l.title)
  }
  if (missing.length > 0) throw new ProviderError(`CJ has no variant matched to ${missing.join(", ")}. Match ${missing.length === 1 ? "it" : "them"} in Settings › Integrations › CJ Dropshipping.`, 422, false)
  return out
}

/** The shipping method: the seller's, else the cheapest CJ quotes for these items. */
export async function cjLogistic(cred: ConnectorCredential, from: string, to: string, items: { vid: string; quantity: number }[]): Promise<string> {
  const chosen = typeof cred.config.logistic === "string" ? cred.config.logistic.trim() : ""
  if (chosen && chosen !== "cheapest") return chosen.slice(0, 50)
  const quotes = await cjAuthed<{ logisticName?: string; logisticPrice?: number | string }[]>(cred, "/logistic/freightCalculate", { method: "POST", body: { startCountryCode: from, endCountryCode: to, products: items } })
  const list = (Array.isArray(quotes) ? quotes : []).filter((q) => typeof q.logisticName === "string" && q.logisticName).sort((a, b) => Number(a.logisticPrice ?? Infinity) - Number(b.logisticPrice ?? Infinity))
  if (list.length === 0) throw new ProviderError(`CJ has no shipping method from ${from} to ${to} for these items.`, 422, false)
  return String(list[0].logisticName)
}

const fromCountryOf = (cred: ConnectorCredential) => (typeof cred.config.from_country === "string" && /^[A-Z]{2}$/.test(cred.config.from_country) ? cred.config.from_country : "CN")

export const cjDropshipping: FulfilmentConnector = {
  id: "cj_dropshipping",
  name: NAME,
  matching: "link",
  locationKind: "dropshipper",

  async connect(key) {
    if (!/@api@/i.test(key) && key.length < 20) throw new ProviderError(`${NAME}: that doesn't look like a CJ API key.`, 400, false)
    let d: TokenData
    try {
      d = await cjTokenFromKey(key)
    } catch (e) {
      if (e instanceof CjAuthError) throw new ProviderError(`${NAME} did not accept that key.`, 401, false)
      throw e
    }
    return { config: { cj: sealTokens(d), from_country: "CN", logistic: "cheapest" }, account: d.openId != null ? `CJ account ${String(d.openId).slice(0, 40)}` : null }
  },

  async submit(cred, order) {
    const vids = await cjVariantsFor(cred, order)
    const from = fromCountryOf(cred)
    const a = order.address
    const products = order.lines.map((l) => ({ vid: vids.get(l.lineId) as string, quantity: l.quantity }))
    const logisticName = await cjLogistic(cred, from, a.country, products)
    const made = await cjAuthed<{ orderId?: string | number; orderStatus?: string; orderAmount?: string | number }>(cred, "/shopping/order/createOrderV2", {
      method: "POST",
      body: {
        orderNumber: order.externalId,
        shippingCountryCode: a.country,
        shippingCountry: countryName(a.country),
        shippingProvince: a.region ?? a.city,
        shippingCity: a.city,
        shippingAddress: a.line1,
        shippingAddress2: a.line2 ?? undefined,
        shippingZip: a.postalCode ?? undefined,
        shippingCustomerName: a.name,
        shippingPhone: a.phone ?? undefined,
        email: a.email ?? undefined,
        remark: `Storelib order ${order.label}`.slice(0, 200),
        logisticName,
        fromCountryCode: from,
        payType: 3,
        products,
      },
    })
    const id = made?.orderId != null && String(made.orderId) ? String(made.orderId) : null
    if (!id) throw new ProviderError("CJ took the order but did not say its number.", 502, true)
    /* CJ prices in US dollars: products and postage together. */
    const amount = toMinor(made?.orderAmount, "USD")
    const cost = amount != null && amount > 0 ? { cents: amount, currency: "USD" } : null
    if (!order.autoConfirm) return { providerOrderId: id, stage: "draft", cost }
    /* Send to production: confirmed and paid from the CJ balance. Made either way; a payment CJ refuses is said, not retried into a second order. */
    try {
      await cjAuthed(cred, "/shopping/order/confirmOrder", { method: "PATCH", body: { orderId: id } })
      await cjAuthed(cred, "/shopping/pay/payBalance", { method: "POST", body: { orderId: id } })
      return { providerOrderId: id, stage: "in_production", cost }
    } catch (e) {
      if (e instanceof ProviderError && !e.retry) return { providerOrderId: id, stage: "draft", cost, note: `CJ made the order but could not pay it from your CJ balance (${e.message.replace(/^[^:]+:\s*/, "").slice(0, 120)}). Pay it in CJ to have it shipped.` }
      return { providerOrderId: id, stage: "draft", cost, note: "CJ made the order, but confirming and paying it did not finish. Pay it in CJ to have it shipped." }
    }
  },

  /* CJ deletes an order not yet paid (DELETE /shopping/order/deleteOrder); a paid one is refused, and is cancelled in CJ by the seller. */
  async cancel(cred, providerOrderId) {
    if (!/^[A-Za-z0-9-]{4,64}$/.test(providerOrderId)) return { cancelled: false, note: "CJ: that is not a CJ order." }
    return cancelling(() => cjAuthed(cred, `/shopping/order/deleteOrder?orderId=${encodeURIComponent(providerOrderId)}`, { method: "DELETE" }))
  },

  async fetchOrder(cred, providerOrderId) {
    if (!/^[A-Za-z0-9-]{4,64}$/.test(providerOrderId)) throw new ProviderError("CJ: that is not a CJ order.", 400, false)
    const o = await cjAuthed<any>(cred, `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(providerOrderId)}`)
    let delivered = String(o?.orderStatus ?? "").toUpperCase() === "DELIVERED"
    const number = o?.trackNumber != null ? String(o.trackNumber).trim() : ""
    if (!delivered && number && String(o?.orderStatus ?? "").toUpperCase() === "SHIPPED") {
      /* CJ's own status can stay SHIPPED after the carrier delivered it: its tracking says so. */
      const t = await cjAuthed<any[]>(cred, `/logistic/trackInfo?trackNumber=${encodeURIComponent(number)}`).catch(() => null)
      delivered = (Array.isArray(t) ? t : []).some((x) => /deliver/i.test(String(x?.trackingStatus ?? "")) && !/undeliver|not delivered/i.test(String(x?.trackingStatus ?? "")))
    }
    return readCjOrder(o, delivered)
  },

  async registerWebhooks(cred, url) {
    const on = { type: "ENABLE", callbackUrls: [url] }
    await cjAuthed(cred, "/webhook/set", { method: "POST", body: { product: { type: "CANCEL", callbackUrls: [] }, stock: on, order: on, logistics: on } })
    return { ok: true, note: "CJ sends order, tracking and stock updates to Storelib. CJ keeps one address for each, so an address set there before for these was replaced." }
  },

  async removeWebhooks(cred) {
    const off = { type: "CANCEL", callbackUrls: [] }
    await cjAuthed(cred, "/webhook/set", { method: "POST", body: { product: off, stock: off, order: off, logistics: off } })
  },
}

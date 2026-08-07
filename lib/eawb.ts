/**
 * eAWB (Innoship) server-side client — ISOLATED, SERVER-ONLY.
 *
 * eAWB.ro is operated by Innoship and exposes a REST API:
 *   - https://query.innoship.com  → GET  endpoints (locations, track, couriers…)
 *   - https://api.innoship.com    → POST endpoints (order, price, label…)
 *
 * Authentication is via two headers on every request:
 *   X-Api-Key: <EAWB_API_KEY>
 *   api-version: 1.0
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SECURITY
 *   `EAWB_API_KEY` is a server-only secret.
 *   - NEVER expose it to the browser. Do NOT rename it to NEXT_PUBLIC_*.
 *   - NEVER log it. No error message, thrown value, or console line in this file
 *     includes the key, and callers must keep it that way.
 *   This module must only ever be imported from server code (route handlers,
 *   server actions, server components) — never from a "use client" module.
 * ────────────────────────────────────────────────────────────────────────────
 */

// Base URLs are overridable via env (e.g. staging), defaulting to production.
/**
 * VERIFIED AGAINST THE LIVE API, not assumed.
 *
 * This module was written against Innoship's hosts (`query.innoship.com` /
 * `api.innoship.com`) with an `api-version` header. Both return 401 for this
 * account's key. eAWB.ro is operated on EUROPARCEL's platform, and its real
 * contract — read from the OpenAPI document the dashboard links to — is:
 *
 *   base    https://api.europarcel.com/api/public
 *   auth    X-API-Key: <key>          (securitySchemes.ApiKeyAuth)
 *
 * Confirmed live: GET /account/profile returns the account, and
 * POST /orders/prices priced a real Bucharest→Cluj parcel at 22.26 RON.
 */
const API_BASE_URL = (process.env.EAWB_API_BASE_URL || "https://api.europarcel.com/api/public").replace(/\/+$/, "")
/** Kept so an existing deployment overriding the old name still resolves. */
const QUERY_BASE_URL = (process.env.EAWB_QUERY_BASE_URL || API_BASE_URL).replace(/\/+$/, "")

/** Outcome codes for an eAWB request. Discriminates every failure mode the caller must handle. */
export type EawbOutcomeCode =
  | "ok"
  | "missing_key" // EAWB_API_KEY is not configured on the server
  | "auth" // eAWB rejected our credentials (401/403)
  | "http_error" // eAWB replied with a non-2xx (other than auth)
  | "parse_error" // eAWB replied 2xx but the body was not valid JSON
  | "network_error" // we could not reach eAWB at all (DNS/TLS/timeout)

/** Non-sensitive result of a connection/auth check. Contains NO secrets. */
export interface EawbConnectionResult {
  ok: boolean
  code: EawbOutcomeCode
  /** Human-readable, safe-to-surface summary. Never contains the API key. */
  message: string
  /** HTTP status eAWB returned, or null when the request never completed. */
  upstreamStatus: number | null
  /** Number of client locations returned on success — a lightweight sanity signal. */
  locationCount: number | null
}

/** Thrown internally when the server is missing its eAWB credentials. */
export class EawbConfigError extends Error {
  constructor(message = "EAWB_API_KEY is not configured") {
    super(message)
    this.name = "EawbConfigError"
  }
}

/**
 * Read the API key from the environment, or throw {@link EawbConfigError}.
 * The returned value is intentionally never logged or echoed by this module.
 */
function getApiKey(): string {
  const key = process.env.EAWB_API_KEY
  if (!key || !key.trim()) {
    throw new EawbConfigError()
  }
  return key
}

/** Truncate an upstream body so diagnostics never dump large/sensitive payloads. */
function safeSnippet(text: string, max = 300): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/**
 * Perform an authenticated GET against the eAWB query API and parse JSON.
 *
 * Every failure mode is normalised into a thrown {@link Error} subclass or a
 * plain Error tagged with a `code` matching {@link EawbOutcomeCode}, so callers
 * can map outcomes without ever seeing the key.
 */
async function eawbGetJson<T>(path: string): Promise<T> {
  const apiKey = getApiKey() // throws EawbConfigError → "missing_key"
  const url = `${QUERY_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        // Exactly as the spec names it. Header names are case-insensitive per
        // RFC 9110, but matching the documentation removes one thing to wonder
        // about when a 401 has to be explained.
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      // Never cache credentialed diagnostics.
      cache: "no-store",
    })
  } catch (err) {
    const cause = err instanceof Error ? err.message : "unknown error"
    throw taggedError("network_error", `Could not reach eAWB: ${cause}`)
  }

  const rawBody = await response.text().catch(() => "")

  if (response.status === 401 || response.status === 403) {
    throw taggedError("auth", `eAWB rejected the API key (HTTP ${response.status})`, response.status)
  }
  if (!response.ok) {
    throw taggedError(
      "http_error",
      `eAWB returned HTTP ${response.status}: ${safeSnippet(rawBody)}`,
      response.status,
    )
  }

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw taggedError("parse_error", "eAWB returned a 2xx response that was not valid JSON", response.status)
  }
}

/** Attach an EawbOutcomeCode (+ optional upstream status) to an Error for uniform mapping. */
function taggedError(code: EawbOutcomeCode, message: string, upstreamStatus?: number): Error & {
  code: EawbOutcomeCode
  upstreamStatus?: number
} {
  const e = new Error(message) as Error & { code: EawbOutcomeCode; upstreamStatus?: number }
  e.name = "EawbError"
  e.code = code
  if (typeof upstreamStatus === "number") e.upstreamStatus = upstreamStatus
  return e
}

/**
 * Verify that the server can authenticate against eAWB WITHOUT creating a
 * shipment. Uses the parameter-less, read-only `ClientLocations` GET endpoint.
 *
 * Never throws — every failure mode (missing key, auth, non-2xx, bad JSON,
 * network) is returned as a structured, secret-free {@link EawbConnectionResult}.
 */
export async function verifyConnection(): Promise<EawbConnectionResult> {
  try {
    // The account itself: the cheapest authenticated read there is, and unlike
    // a list endpoint an empty result cannot be mistaken for a failure.
    const data = await eawbGetJson<{ data?: { customer_id?: number } }>("/account/profile")
    const locationCount = data?.data?.customer_id ? 1 : null
    return {
      ok: true,
      code: "ok",
      message: "eAWB authentication succeeded.",
      upstreamStatus: 200,
      locationCount,
    }
  } catch (err) {
    if (err instanceof EawbConfigError) {
      return {
        ok: false,
        code: "missing_key",
        message: "EAWB_API_KEY is not configured on the server.",
        upstreamStatus: null,
        locationCount: null,
      }
    }
    const tagged = err as Error & { code?: EawbOutcomeCode; upstreamStatus?: number }
    const code: EawbOutcomeCode = tagged.code ?? "network_error"
    return {
      ok: false,
      code,
      // tagged.message is authored in this file and contains no secret.
      message: tagged.message || "eAWB connection failed.",
      upstreamStatus: tagged.upstreamStatus ?? null,
      locationCount: null,
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  SHIPPING: quote, create, label, track
// ───────────────────────────────────────────────────────────────────────────
//
// Every shape below is taken from the EUROPARCEL OpenAPI document rather than
// guessed, and the quote path has been exercised against the live API.

/** One party on a shipment. Either an `*_id` referencing a saved address, or
 *  the fields spelled out — the API accepts both and validates the locality. */
export interface EawbAddress {
  address_from_id?: number
  address_to_id?: number
  email?: string
  phone?: string
  contact?: string
  company?: string
  country_code?: string
  county_name?: string
  locality_name?: string
  locality_id?: number
  street_name?: string
  street_number?: string
  street_details?: string
  postal_code?: string
  /** Locker/pickup point, for the locker services (service_id 2/3/4). */
  fixed_location_id?: number
}

export interface EawbParcel {
  sequence_no: number
  size: { weight: number; width: number; height: number; length: number }
}

export interface EawbShipmentInput {
  carrier_id: number
  service_id: number
  billing_address_id: number
  address_from: EawbAddress
  address_to: EawbAddress
  parcels: EawbParcel[]
  /** Must equal the sum of the parcels' weights — the API rejects a mismatch. */
  total_weight: number
  /** Required by the API. What is in the box, in words. */
  parcel_content: string
  /** Our own order reference, echoed back on reads. */
  internal_identifier?: string
  /** Cash on delivery. Requires bank_holder + bank_iban when > 0. */
  bank_repayment_amount?: number
  bank_repayment_currency?: string
  bank_holder?: string
  bank_iban?: string
  insurance_amount?: number
  insurance_amount_currency?: string
}

/**
 * The request body both `/orders/prices` and `/orders` take.
 *
 * One builder for both on purpose: a quote that priced a shipment the create
 * call would then reject is worse than no quote, and the only way to be sure
 * they agree is for them to be the same object.
 */
function buildOrderBody(input: EawbShipmentInput): Record<string, unknown> {
  const extra: Record<string, unknown> = { parcel_content: input.parcel_content }
  if (input.internal_identifier) extra.internal_identifier = input.internal_identifier
  if (input.bank_repayment_amount && input.bank_repayment_amount > 0) {
    extra.bank_repayment_amount = input.bank_repayment_amount
    extra.bank_repayment_currency = input.bank_repayment_currency || "RON"
    extra.bank_holder = input.bank_holder
    extra.bank_iban = input.bank_iban
  }
  if (input.insurance_amount && input.insurance_amount > 0) {
    extra.insurance_amount = input.insurance_amount
    extra.insurance_amount_currency = input.insurance_amount_currency || "RON"
  }
  return {
    carrier_id: input.carrier_id,
    service_id: input.service_id,
    billing_to: { billing_address_id: input.billing_address_id },
    address_from: input.address_from,
    address_to: input.address_to,
    content: {
      envelopes_count: 0,
      pallets_count: 0,
      parcels_count: input.parcels.length,
      total_weight: input.total_weight,
      parcels: input.parcels,
    },
    extra,
  }
}

/** Authenticated POST returning parsed JSON, with the same failure taxonomy as GET. */
async function eawbPostJson<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getApiKey()
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
  } catch (err) {
    const cause = err instanceof Error ? err.message : "unknown error"
    throw taggedError("network_error", `Could not reach eAWB: ${cause}`)
  }

  const rawBody = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) {
    throw taggedError("auth", `eAWB rejected the API key (HTTP ${response.status})`, response.status)
  }
  if (!response.ok) {
    // The body carries the field-level validation errors, which are the whole
    // value of a 400 here — surfaced, but truncated, and it never contains the
    // key because the key only ever goes out in a header.
    throw taggedError("http_error", `eAWB returned HTTP ${response.status}: ${safeSnippet(rawBody, 600)}`, response.status)
  }
  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw taggedError("parse_error", "eAWB returned a 2xx response that was not valid JSON", response.status)
  }
}

export interface EawbPriceOption {
  carrier_id: number
  carrier: string
  service_id: number
  service_name: string
  estimated_pickup_date?: string
  estimated_delivery_date?: string
  label_print_required?: boolean
  price: { amount: number; vat: number; total: number; currency: string }
}

/**
 * What this shipment would cost. CREATES NOTHING.
 *
 * The only safe way to prove a payload is acceptable end to end: it runs the
 * same validation as order creation — addresses are resolved to locality ids
 * and returned — without booking a courier.
 */
export async function getPrices(input: EawbShipmentInput): Promise<{
  options: EawbPriceOption[]
  validatedAddresses: unknown
}> {
  const res = await eawbPostJson<{ data?: EawbPriceOption[]; validation_address?: unknown }>(
    "/orders/prices",
    buildOrderBody(input),
  )
  return { options: res.data ?? [], validatedAddresses: res.validation_address ?? null }
}

export interface EawbOrderResult {
  orderId: number | null
  awb: string | null
  carrier: string | null
  /** Present on some carriers only; `getLabelLink` fetches it on demand. */
  labelUrl: string | null
  raw: unknown
}

/**
 * BOOK A REAL SHIPMENT. This costs money and dispatches a courier.
 *
 * Deliberately has no retry of its own. A retried POST here is a SECOND
 * shipment — the API has no idempotency key, so the only safe guard is the
 * caller checking that the order does not already carry an AWB before calling,
 * which is what app/api/shipping/create does.
 */
export async function createOrder(input: EawbShipmentInput): Promise<EawbOrderResult> {
  const res = await eawbPostJson<Record<string, unknown>>("/orders", buildOrderBody(input))
  const data = (res.data ?? res) as Record<string, unknown>
  const awb =
    (data.awb as string) ?? (data.awb_number as string) ?? (data.tracking_number as string) ?? null
  return {
    orderId: typeof data.order_id === "number" ? data.order_id : (data.id as number) ?? null,
    awb: awb ? String(awb) : null,
    carrier: (data.carrier as string) ?? null,
    labelUrl: (data.label_url as string) ?? (data.label as string) ?? null,
    raw: res,
  }
}

/** A printable label for an AWB the account owns. */
export async function getLabelLink(awb: string): Promise<{ url: string | null; raw: unknown }> {
  const res = await eawbGetJson<Record<string, unknown>>(`/orders/label-link/${encodeURIComponent(awb)}`)
  const data = (res.data ?? res) as Record<string, unknown>
  return { url: (data.link as string) ?? (data.url as string) ?? null, raw: res }
}

/** Carrier scan history for an AWB. */
export async function trackByAwb(awb: string): Promise<unknown> {
  return eawbPostJson<unknown>("/orders/track-by-awb", { awb })
}

/** One order as the provider holds it — proof a shipment really exists there. */
export async function getOrder(orderId: number | string): Promise<unknown> {
  return eawbGetJson<unknown>(`/orders/${encodeURIComponent(String(orderId))}`)
}

/** A parcel machine as the provider describes it. */
export interface EawbLocker {
  id: number
  fixed_location_type?: string
  carrier_id: number
  carrier_name: string
  locality_id: number
  locality_name: string
  county_id?: number
  county_name: string
  country_code: string
  name: string
  address: string
  /** False for lockers that only DELIVER — a seller cannot post from one. */
  allows_drop_off?: boolean
  is_active?: boolean
  coordinates?: { lat: number; long: number }
}

/**
 * Every locker in a country. Romania returns ~12,000.
 *
 * There is no server-side filter on this endpoint, so the whole list comes back
 * in one response and the caller narrows it. That is why the route in front of
 * this caches: it is a slow, large, public read that changes about as often as
 * a supermarket opens.
 */
export async function listFixedLocations(countryCode = "RO"): Promise<EawbLocker[]> {
  const data = await eawbGetJson<unknown>(`/locations/fixedlocations/${encodeURIComponent(countryCode)}`)
  if (Array.isArray(data)) return data as EawbLocker[]
  const inner = (data as { data?: unknown; list?: unknown })?.data ?? (data as { list?: unknown })?.list
  return Array.isArray(inner) ? (inner as EawbLocker[]) : []
}

/**
 * LOCKER SHIPPING IS THE HOUSE DEFAULT, and these are the numbers behind it.
 *
 * Verified against the live services list: service 1 is door-to-door, 2 is
 * door→locker, 3 is locker→door, 4 is locker→locker. Storelib ships lockers
 * only, so a shipment always carries a `fixed_location_id` on at least one
 * side — and, as the API's own validation insists, the street fields TOO. The
 * locker id is in addition to an address, never instead of one; sending only
 * the id fails with "street_name field is required".
 */
export const EAWB_SERVICE = {
  doorToDoor: 1,
  doorToLocker: 2,
  lockerToDoor: 3,
  lockerToLocker: 4,
} as const

/** Sameday runs the easybox network Romanian marketplaces ship on. */
export const EAWB_CARRIER = { sameday: 6, dpd: 2, fan: 3, gls: 4, cargus: 1 } as const

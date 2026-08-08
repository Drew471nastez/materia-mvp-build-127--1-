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
  | "validation" // OUR OWN check refused the payload; nothing was sent
  | "insufficient_funds" // the prepaid wallet cannot cover this shipment

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
 * Which side of a service needs a locker.
 *
 * The provider validates this and its message is precise:
 *   "Service 4 requires fixed location for pickup address"
 *   "Service 4 requires fixed location for delivery address"
 *
 * Worth stating plainly because it caused a real 400: `fixed_location_id`
 * SUPPLEMENTS the street fields, it never replaces them. Both must be present.
 */
const LOCKER_REQUIREMENTS: Record<number, { from: boolean; to: boolean }> = {
  1: { from: false, to: false }, // door → door
  2: { from: false, to: true }, // door → locker
  3: { from: true, to: false }, // locker → door
  4: { from: true, to: true }, // locker → locker
}

/** A positive integer, or undefined. The UI collects locker ids in text inputs,
 *  so "66725" arrives as a string and the API wants a number — and an empty
 *  string must become absent, not 0, because 0 is a value a validator will
 *  reject rather than ignore. */
function lockerId(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * One address, normalised.
 *
 * THE BUG THIS EXISTS TO PREVENT: any code that copies address fields by
 * listing them will eventually omit one, and omitting `fixed_location_id`
 * produces a payload that PRICES FINE and then fails at creation — because
 * `/orders/prices` does not enforce the locker requirement and `/orders` does.
 * That is the worst possible failure shape: the cheap call that exists to
 * validate the expensive one says yes, and the expensive one says no.
 *
 * So normalisation happens HERE, once, on the way into the shared body builder,
 * and every caller gets it whether they remembered to or not.
 */
function normalizeAddress(a: EawbAddress): EawbAddress {
  const out: EawbAddress = { ...a }
  const id = lockerId(a.fixed_location_id)
  if (id === undefined) delete out.fixed_location_id
  else out.fixed_location_id = id
  return out
}

/**
 * Refuse a locker service that is missing a locker id, BEFORE spending a
 * request on it.
 *
 * The provider would reject it anyway — but its rejection arrives as an opaque
 * HTTP 400 from a call that, for `POST /orders`, we have to assume might have
 * had side effects. Our own check is unambiguous, free, and cannot half-book
 * anything.
 */
export function validateShipment(input: EawbShipmentInput): string[] {
  const problems: string[] = []
  const need = LOCKER_REQUIREMENTS[input.service_id]
  if (!need) return problems

  if (need.from && lockerId(input.address_from.fixed_location_id) === undefined) {
    problems.push(
      `address_from.fixed_location_id is required for service ${input.service_id} (pickup from a locker) but is missing`,
    )
  }
  if (need.to && lockerId(input.address_to.fixed_location_id) === undefined) {
    problems.push(
      `address_to.fixed_location_id is required for service ${input.service_id} (delivery to a locker) but is missing`,
    )
  }
  return problems
}

/**
 * The exact body that goes to eAWB, with nothing that could identify the
 * account or the customer.
 *
 * Exported so a caller can SHOW it. The whole reason the locker bug survived to
 * a 400 is that nobody could see what was actually sent — the payload was built
 * three layers below the button that triggered it. Names, phone numbers and
 * emails are replaced; the ids and the structure, which are what you need in
 * order to debug, are kept.
 */
export function sanitizedPayload(input: EawbShipmentInput): Record<string, unknown> {
  const scrub = (a: EawbAddress) => {
    const n = normalizeAddress(a)
    return {
      ...n,
      contact: n.contact ? "[redacted]" : undefined,
      phone: n.phone ? "[redacted]" : undefined,
      email: n.email ? "[redacted]" : undefined,
    }
  }
  const body = buildOrderBody(input)
  return {
    ...body,
    address_from: scrub(input.address_from),
    address_to: scrub(input.address_to),
  }
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
    // Normalised, not passed through: `fixed_location_id` must reach the API as
    // an integer, and a caller that collected it from a form has a string.
    address_from: normalizeAddress(input.address_from),
    address_to: normalizeAddress(input.address_to),
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
  if (response.status === 402) {
    // Its own code because it is its own fix. A 402 is not a bug in the payload
    // and not an outage — the shipment was accepted and priced, and the prepaid
    // wallet could not cover it. Anything that reports this as a generic
    // "eAWB returned HTTP 402" sends someone to debug a request that was fine.
    throw taggedError(
      "insufficient_funds",
      "eAWB accepted the shipment but the prepaid wallet has insufficient funds. Top up the eAWB account and retry.",
      402,
    )
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
  // Nothing is sent if our own validation fails. A locker service with no
  // locker id is a payload we KNOW the provider rejects, and finding that out
  // from an opaque 400 on the one endpoint with side effects is strictly worse
  // than refusing here.
  const problems = validateShipment(input)
  if (problems.length) {
    throw taggedError("validation", `Shipment is not valid for service ${input.service_id}: ${problems.join("; ")}`)
  }

  // PRE-FLIGHT: an empty wallet cannot book anything, and finding that out from
  // the provider costs a permanent `order_status: "failed"` record in the
  // account (183060 was the first). One cheap GET avoids both the opaque 402
  // and the litter.
  //
  // Deliberately only refuses on a balance of ZERO rather than comparing
  // against the quoted price: the price is not known here without a second
  // round trip, and refusing a shipment because our arithmetic about fees
  // disagreed with theirs would be worse than letting the provider decide. Zero
  // is unambiguous.
  try {
    const { balance, currency } = await getAccountBalance()
    if (balance <= 0) {
      throw taggedError(
        "insufficient_funds",
        `The eAWB wallet balance is ${balance} ${currency}. Top up the account before booking a shipment. Nothing was sent.`,
        402,
      )
    }
  } catch (err) {
    // Only OUR refusal stops the flow. If the balance itself could not be read —
    // a blip on the profile endpoint — that is not a reason to block a shipment
    // the provider might well accept, so it falls through to the real attempt.
    if ((err as { code?: string })?.code === "insufficient_funds") throw err
  }

  const res = await eawbPostJson<Record<string, unknown>>("/orders", buildOrderBody(input))
  const data = (res.data ?? res) as Record<string, unknown>
  const rawAwb =
    (data.awb as string) ?? (data.awb_number as string) ?? (data.tracking_number as string) ?? null
  // "NEGENERAT" is not a tracking number. Letting it through would mark the
  // order as shipped, and — because every idempotency guard keys off
  // `awb_number` being non-null — permanently block a real retry.
  const awb = rawAwb && !NOT_AN_AWB.test(String(rawAwb).trim()) ? String(rawAwb).trim() : null
  return {
    orderId: typeof data.order_id === "number" ? data.order_id : (data.id as number) ?? null,
    awb,
    carrier: (data.carrier as string) ?? null,
    labelUrl: (data.label_url as string) ?? (data.label as string) ?? null,
    raw: res,
  }
}

/**
 * A printable label for an AWB the account owns.
 *
 * The field is `download_url`. Read from the provider's OpenAPI document, not
 * guessed — an earlier version of this looked for `link` / `url`, which do not
 * exist, so it would have returned null for every label ever requested and the
 * failure would have looked like "the courier has not produced one yet". The
 * other two names are kept as fallbacks and cost nothing.
 */
export async function getLabelLink(awb: string): Promise<{ url: string | null; raw: unknown }> {
  const res = await eawbGetJson<Record<string, unknown>>(`/orders/label-link/${encodeURIComponent(awb)}`)
  const data = (res.data ?? res) as Record<string, unknown>
  const url =
    (data.download_url as string) ?? (data.link as string) ?? (data.url as string) ?? null
  return { url: url ? String(url) : null, raw: res }
}

/**
 * The label PDF itself, by ORDER id (not AWB), straight from the provider.
 *
 * `POST /orders/labels` responds with `application/pdf` rather than a link, so
 * there is no second hop and no bearer URL to leak. A6 is the thermal-label
 * size couriers expect; A4 prints four to a page.
 */
export async function getLabelPdf(
  orderIds: Array<number | string>,
  format: "A4" | "A6" = "A6",
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const apiKey = getApiKey()
  const res = await fetch(`${API_BASE_URL}/orders/labels`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/pdf",
    },
    body: JSON.stringify({ order_ids: orderIds.map((id) => Number(id)).filter(Number.isFinite), format }),
    cache: "no-store",
  })
  if (res.status === 401 || res.status === 403) {
    throw taggedError("auth", `eAWB rejected the API key (HTTP ${res.status})`, res.status)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw taggedError("http_error", `eAWB returned HTTP ${res.status}: ${safeSnippet(body, 400)}`, res.status)
  }
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "application/pdf" }
}

/**
 * CANCEL a booked shipment.
 *
 * The provider's own words: "Refunds are automatically processed to the
 * customer's wallet." That is what makes testing affordable — an AWB can be
 * created, its label and barcode inspected, and then cancelled, with the money
 * returning to the balance instead of being spent on a parcel nobody sends.
 *
 * Takes the provider's ORDER id, which is stored on our order as
 * `shipping_provider_order_id`, not the AWB.
 */
export async function cancelOrder(providerOrderId: number | string): Promise<unknown> {
  const apiKey = getApiKey()
  const url = `${API_BASE_URL}/orders/${encodeURIComponent(String(providerOrderId))}`
  let res: Response
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    })
  } catch (err) {
    throw taggedError("network_error", `Could not reach eAWB: ${err instanceof Error ? err.message : "unknown"}`)
  }
  const body = await res.text().catch(() => "")
  if (res.status === 401 || res.status === 403) {
    throw taggedError("auth", `eAWB rejected the request (HTTP ${res.status})`, res.status)
  }
  if (!res.ok) {
    throw taggedError("http_error", `eAWB returned HTTP ${res.status}: ${safeSnippet(body, 400)}`, res.status)
  }
  try {
    return JSON.parse(body)
  } catch {
    return { ok: true }
  }
}

/** Carrier scan history for an AWB. */
export async function trackByAwb(awb: string): Promise<unknown> {
  return eawbPostJson<unknown>("/orders/track-by-awb", { awb })
}

/** One order as the provider holds it — proof a shipment really exists there. */
export async function getOrder(orderId: number | string): Promise<unknown> {
  return eawbGetJson<unknown>(`/orders/${encodeURIComponent(String(orderId))}`)
}

/**
 * The prepaid balance the account books shipments against.
 *
 * WHY THIS EXISTS — a real HTTP 402:
 *   {"message":"Payment failed: Insufficient wallet funds","order_id":183060}
 *
 * Note the `order_id`. The provider had already ACCEPTED and priced the
 * shipment (19.89 RON, exactly the quote) and created order 183060 before
 * trying to charge for it. That order is now permanently `order_status:
 * "failed"` with `awb: "NEGENERAT"`, and every future attempt against an empty
 * wallet leaves another one behind.
 *
 * So the balance is read BEFORE booking. It costs one cheap authenticated GET
 * and it converts an opaque 402 — plus a junk record in the account — into a
 * sentence saying how much to top up.
 *
 * There is no `/account/wallet` endpoint; both that and `/account/balance`
 * return 404. The balance lives on the profile, which is verified.
 */
export async function getAccountBalance(): Promise<{ balance: number; currency: string }> {
  const res = await eawbGetJson<{ data?: { wallet_balance?: number; wallet_currency?: string } }>(
    "/account/profile",
  )
  return {
    balance: Number(res?.data?.wallet_balance ?? 0),
    currency: String(res?.data?.wallet_currency ?? "RON"),
  }
}

/**
 * The provider's placeholder for "no AWB was issued".
 *
 * A trap worth naming: a failed order still carries an `awb` field, and its
 * value is the literal string "NEGENERAT". Storing that would put a fake
 * tracking number on an order, satisfy the unique index, and make a shipment
 * that does not exist look booked — with `awb_number` set, every idempotency
 * guard in `createAwbForOrder` would then refuse to ever try again.
 */
const NOT_AN_AWB = /^(negenerat|n\/a|none|null|-)$/i

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
  /** Opening hours, when the carrier publishes them. `day` is ISO-8601:
   *  1 = Monday … 7 = Sunday. Most easyboxes report 00:00–23:59 every day. */
  schedule?: Array<{ day?: number; openingHour?: string; closingHour?: string }>
  /** How the locker takes payment, when it takes any. */
  payment_type?: string
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

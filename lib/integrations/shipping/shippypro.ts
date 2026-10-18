/**
 * ===========================================================================
 *  SHIPPYPRO (https://api.shippypro.com/docs)
 * ===========================================================================
 * Strong in Italy, Romania and the rest of the EU: the merchant connects
 * their own carriers in ShippyPro and this adapter reads whichever ones
 * they have, so a Romanian Sameday or FAN Courier account arrives the same
 * way a German DHL one does. Nothing here holds a list of carriers.
 *
 * WHERE THE SHAPES BELOW COME FROM. Every field this file reads or writes
 * is from ShippyPro's own OpenAPI document, fetched unauthenticated from
 * https://api.shippypro.com/docs/v1.json (the file its API console loads;
 * api.shippypro.com/docs names it in the page source). Two third party
 * clients agree with it on the envelope and on the GetRates answer:
 * https://github.com/PostCo/shippy_pro_api (Ruby, published as the
 * shippy_pro_api gem) and https://github.com/piwni/laravel-shippypro-client
 * (PHP). Nothing below is a guess; where the document is silent this file
 * says so at the field.
 *
 *   transport   POST only, JSON both ways, one path per method, and the
 *               body repeats the method: POST /v1/GetRates with
 *               {"Method":"GetRates","Params":{...}}. Names are case
 *               sensitive, and the three shipment objects (to_address,
 *               from_address, parcels) are lower case while every other
 *               parameter is CamelCase. The document, the gem and the PHP
 *               client all three agree on that split.
 *   auth        the API key as a Bearer token, which is what the document
 *               and the console say. The help centre instead says to put
 *               the key in the Username field of HTTP Basic with an empty
 *               password, and the live server answers an unauthenticated
 *               call with WWW-Authenticate: Basic realm="ShippyPro API".
 *               Both are documented and neither could be tried against a
 *               real key here, so a call that Bearer is refused for is
 *               retried once as Basic. See `ask`.
 *   failure     a refused key comes back as HTTP 200 with
 *               {"Error":"Authentication Failed"} (measured against the
 *               live server with a made up key, on /v1/Ping, /v1/GetRates
 *               and /v1/GetCarriers, with Bearer and with Basic alike).
 *               The document's own table claims 401 for that case, so the
 *               status code is not trusted: every answer is read for an
 *               Error key before it is believed.
 *   rate limit  20 calls every 10 seconds, documented. A 429 is handled by
 *               ../fulfilment/http as "busy, try again".
 *
 * WHAT THIS FILE DOES NOT DO. It is not a ./types.ts LabelApi and is not in
 * LABEL_APIS, so the order page's Buy a label does not offer it. That
 * contract wants a shipment kept at the provider that a rate can be read
 * back from and bought by its id alone; ShippyPro keeps no shipment at rate
 * time (GetRates answers with rates and no shipment id, and does not echo
 * the TransactionID back), and its Ship call wants the whole shipment again
 * with the chosen carrier. ShippyPro is listed as Coming soon in
 * ../../physical/providers.ts until someone has run these calls against a
 * real key. Until then nothing here is reachable from the product.
 *
 * Anything that arrives in a shape the document does not describe raises
 * "ShippyPro answered in a shape Storelib did not expect", naming the
 * method and the keys it got, rather than being read past.
 */

import { call, ProviderError } from "../fulfilment/http"
import { cleanCurrency, fromMinor, toMinor } from "./money"
import type { LabelAddress, Parcel } from "./types"

const API = "https://api.shippypro.com/v1"
const NAME = "ShippyPro"

/**
 * Partner identification, documented: a lower case name in the Referer
 * header so ShippyPro can tell its own support who is calling.
 */
const PARTNER = "storelib"

/** Methods this adapter uses. One path each, and the same word in the body. */
type Method = "Ping" | "GetCarriers" | "GetRates" | "Ship" | "GetTracking" | "CheckAddress" | "VoidShipments"

/* ── reading an answer defensively ───────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const https = (v: unknown): string | null => (typeof v === "string" && /^https:\/\//.test(v) ? v : null)

/** A Unix seconds stamp, which ShippyPro sends as a string, as an ISO date. */
function unix(v: unknown): string | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** What came back, in a few words and with no buyer's details in it: keys for an object, the type otherwise. */
function describe(got: unknown): string {
  if (got === null || got === undefined) return "nothing"
  if (Array.isArray(got)) return `a list of ${got.length}`
  if (isRecord(got)) {
    const keys = Object.keys(got)
    return keys.length ? `an object with ${keys.slice(0, 8).join(", ")}` : "an empty object"
  }
  return typeof got
}

/** ShippyPro answered something this adapter has no documented reading for. Fails closed, and says which call. */
function unexpected(method: Method, got: unknown): never {
  throw new ProviderError(`${NAME} answered in a shape Storelib did not expect: ${method} returned ${describe(got)}.`, 502, false)
}

/* Error strings the help centre documents for a key ShippyPro will not take. */
const REFUSED_KEY = /authentication failed|unauthorized api key|not authorized|cannot access pii/i

/* ── one way to call it ──────────────────────────────────────────────────── */

type Auth = "bearer" | "basic"

function headers(key: string, auth: Auth): Record<string, string> {
  return {
    Authorization: auth === "bearer" ? `Bearer ${key}` : `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    Referer: PARTNER,
  }
}

/**
 * One POST to one method. The answer is read for ShippyPro's own Error key
 * whatever the status code was, because a refused key arrives as a 200.
 *
 * Bearer is what the API document says. A key Bearer is refused for is
 * tried once more as Basic, which the help centre documents instead and
 * which the live server advertises in WWW-Authenticate. Neither could be
 * confirmed against a real key from here, so both are attempted rather
 * than one being picked and presented as the right one.
 */
async function ask(key: string, method: Method, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const refused = new ProviderError(`${NAME} did not accept that API key.`, 401, false)
  for (const auth of ["bearer", "basic"] as const) {
    let body: unknown
    try {
      body = await call<unknown>(NAME, `${API}/${method}`, { method: "POST", headers: headers(key, auth), body: { Method: method, Params: params } })
    } catch (e) {
      /* A real 401 or 403 for Bearer: the other documented scheme is still to try. Anything else stands. */
      if (auth === "bearer" && e instanceof ProviderError && (e.status === 401 || e.status === 403)) continue
      throw e
    }
    if (!isRecord(body)) unexpected(method, body)
    const said = str(body.Error)
    if (!said) return body
    /* Not the key: ShippyPro read the request and said no ("Invalid Input Data"), so the other scheme would say the same. */
    if (!REFUSED_KEY.test(said)) throw new ProviderError(`${NAME}: ${said.slice(0, 200)}`, 422, false)
  }
  throw refused
}

/* ── what goes out ───────────────────────────────────────────────────────── */

/**
 * An address as ShippyPro wants it. Lower case keys, unlike the rest of the
 * parameters: documented that way, and both third party clients send it so.
 */
function address(a: LabelAddress): Record<string, string> {
  return {
    name: a.name.slice(0, 100),
    company: a.company ?? "",
    street1: a.line1,
    street2: a.line2 ?? "",
    city: a.city,
    state: a.region ?? "",
    zip: a.postalCode ?? "",
    country: a.country,
    phone: a.phone ?? "",
    email: a.email ?? "",
  }
}

/**
 * The parcel. ShippyPro's documented defaults are CM and KG, and both are
 * sent anyway so a change of default cannot quietly reprice a parcel.
 */
function parcels(p: Parcel): Record<string, unknown>[] {
  return [{ length: p.lengthCm, width: p.widthCm, height: p.heightCm, weight: Math.round((p.grams / 1000) * 1000) / 1000, dimension_unit: "CM", weight_unit: "KG" }]
}

/** The declared value as ShippyPro parses it: digits, one dot, then the currency. Required for a shipment leaving the country. */
function totalValue(cents: number | null | undefined, currency: string | null | undefined): string | undefined {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents < 0) return undefined
  return `${fromMinor(cents, currency)} ${cleanCurrency(currency)}`
}

/* ── what comes back ─────────────────────────────────────────────────────── */

/** One carrier connection in the merchant's own ShippyPro account. */
export interface ShippyProCarrier {
  /** ShippyPro's name for the carrier, as Ship and CheckAddress want it ("UPS", "DHLExpress"). */
  name: string
  /** What the merchant called the connection ("UPS Test"), when ShippyPro says. */
  label: string | null
  /** The connection's id, as Ship wants it. */
  carrierId: number | null
  /** The service Ship wants, and every service this connection offers. */
  service: string | null
  services: string[]
}

export interface ShippyProRate {
  carrier: string
  carrierLabel: string | null
  carrierId: number | null
  service: string
  /** Ship takes these three back unchanged to buy this rate. */
  rateId: string | null
  orderId: string | null
  /** What ShippyPro wrote, e.g. "7.60". */
  amount: string
  /** The price in minor units, null when ShippyPro's number could not be read. */
  cents: number | null
  currency: string
  /**
   * True when the currency is the caller's fallback and not ShippyPro's.
   * ShippyPro's document gives a rate no currency field, so unless the live
   * answer carries one this is the shop's currency and is only a guess at
   * what the merchant's ShippyPro account prices in.
   */
  currencyAssumed: boolean
  days: number | null
  zoneName: string | null
  weightRange: string | null
}

export interface ShippyProLabel {
  /** ShippyPro's own order id (NewOrderID), which voiding names. */
  orderId: string
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  /** A PDF at an https address. */
  labelUrl: string
}

export interface ShippyProTracking {
  carrier: string | null
  delivered: boolean
  /** 1 Info Received, 2 In Transit, 3 Out for Delivery, 4 Missed Delivery, 5 Exception, 6 Delivered. */
  statusCode: number | null
  status: string | null
  estimatedDelivery: string | null
  trackingUrl: string | null
  late: boolean
  events: { at: string | null; message: string; city: string | null; statusCode: number | null }[]
}

/** ShippyPro's six tracking states, as its document words them. */
const TRACKING_STATUS: Record<number, string> = { 1: "Info received", 2: "In transit", 3: "Out for delivery", 4: "Missed delivery", 5: "Exception", 6: "Delivered" }

function readCarriers(body: Record<string, unknown>): ShippyProCarrier[] {
  /* { "Carriers": { "<carrier name>": [ { CarrierID, CarrierService, ServicesList, Label } ] } } */
  const carriers = body.Carriers
  if (!isRecord(carriers)) unexpected("GetCarriers", body)
  const out: ShippyProCarrier[] = []
  for (const [name, connections] of Object.entries(carriers)) {
    for (const c of list(connections)) {
      if (!isRecord(c)) continue
      out.push({
        name: name.slice(0, 60),
        label: str(c.Label),
        carrierId: num(c.CarrierID),
        service: str(c.CarrierService),
        services: list(c.ServicesList).map(str).filter((s): s is string => !!s).slice(0, 60),
      })
    }
  }
  return out
}

function readRate(r: unknown, fallbackCurrency: string): ShippyProRate | null {
  if (!isRecord(r)) return null
  const amount = str(r.rate)
  const carrier = str(r.carrier)
  if (!amount || !carrier) return null
  /* Not in ShippyPro's document for a rate; read when it is there all the same. */
  const said = str(r.currency)
  const currency = cleanCurrency(said ?? fallbackCurrency)
  /* delivery_days is documented as a number or a string like "2-5": the first number of it, or nothing. */
  const days = num(r.delivery_days) ?? num(String(r.delivery_days ?? "").split(/[^0-9]+/).filter(Boolean)[0])
  return {
    carrier: carrier.slice(0, 60),
    carrierLabel: str(r.carrier_label),
    carrierId: num(r.carrier_id),
    service: (str(r.service) ?? "Shipping").slice(0, 120),
    rateId: str(r.rate_id),
    orderId: str(r.order_id),
    amount,
    cents: toMinor(amount, currency),
    currency,
    currencyAssumed: !said,
    days: days !== null && days >= 0 ? days : null,
    zoneName: str(r.zone_name),
    weightRange: str(r.weight_range),
  }
}

/* ── the adapter ─────────────────────────────────────────────────────────── */

export const shippypro = {
  id: "shippypro" as const,
  name: NAME,

  /**
   * Is this key real? Ping is the cheapest documented call and creates
   * nothing at ShippyPro, so a check costs the merchant no label and no
   * postage. A refused key throws with status 401.
   */
  async verify(key: string): Promise<{ ok: true }> {
    const body = await ask(key, "Ping", {})
    if (body.Result === true) return { ok: true }
    unexpected("Ping", body)
  },

  /** The carriers this merchant has connected in their own ShippyPro account. Empty when they have none yet. */
  async carriers(key: string, input?: { activeOnly?: boolean }): Promise<ShippyProCarrier[]> {
    const body = await ask(key, "GetCarriers", input?.activeOnly === false ? {} : { Active: 1 })
    return readCarriers(body)
  },

  /**
   * Every rate the merchant's carriers offer for this parcel.
   *
   * `reference` goes out as TransactionID, which ShippyPro documents as the
   * caller's own order number. It is not echoed back in the answer, so a
   * rate cannot be checked against an order by reading it back from
   * ShippyPro the way Shippo's and EasyPost's are.
   *
   * `currency` is the fallback for a rate ShippyPro prices without naming a
   * currency, and each rate says whether it was used.
   */
  async rates(
    key: string,
    input: { from: LabelAddress; to: LabelAddress; parcel: Parcel; reference: string; contents: string; service?: string; currency: string; declaredCents?: number | null; onlyCarriers?: string[] },
  ): Promise<{ rates: ShippyProRate[]; messages: string[] }> {
    const body = await ask(key, "GetRates", {
      to_address: address(input.to),
      from_address: address(input.from),
      parcels: parcels(input.parcel),
      ContentDescription: input.contents.slice(0, 255),
      ShippingService: input.service ?? "Standard",
      TransactionID: input.reference.slice(0, 255),
      ...(totalValue(input.declaredCents, input.currency) ? { TotalValue: totalValue(input.declaredCents, input.currency) } : {}),
      ...(input.onlyCarriers?.length ? { RateCarriers: input.onlyCarriers.slice(0, 40) } : {}),
    })
    /* Documented answer: { "Rates": [...], "RatesErrors": [...] }, either of which may be empty. Neither present is not an answer this adapter knows. */
    if (!Array.isArray(body.Rates) && !Array.isArray(body.RatesErrors)) unexpected("GetRates", body)
    const rates = list(body.Rates)
      .map((r) => readRate(r, input.currency))
      .filter((r): r is ShippyProRate => !!r)
    const messages = list(body.RatesErrors)
      .map((e) => {
        if (!isRecord(e)) return null
        const said = str(e.error_message)
        const who = str(e.carrier_label) ?? str(e.carrier)
        return said ? (who ? `${who}: ${said}` : said) : null
      })
      .filter((m): m is string => !!m)
      .slice(0, 6)
    return { rates, messages }
  },

  /**
   * Buy a label. Ship wants the whole shipment again plus the carrier from
   * the chosen rate, so this takes both. It is a billable call at
   * ShippyPro: it makes a real label and counts against the merchant's
   * plan, and it is never made to check a key.
   */
  async ship(
    key: string,
    input: { from: LabelAddress; to: LabelAddress; parcel: Parcel; reference: string; contents: string; currency: string; declaredCents?: number | null; rate: Pick<ShippyProRate, "carrier" | "carrierId" | "service" | "rateId" | "orderId"> },
  ): Promise<ShippyProLabel> {
    const body = await ask(key, "Ship", {
      to_address: address(input.to),
      from_address: address(input.from),
      parcels: parcels(input.parcel),
      TransactionID: input.reference.slice(0, 255),
      ContentDescription: input.contents.slice(0, 255).replace(/\\/g, " "),
      CarrierName: input.rate.carrier,
      CarrierService: input.rate.service,
      ...(input.rate.carrierId !== null ? { CarrierID: input.rate.carrierId } : {}),
      ...(input.rate.rateId ? { RateID: input.rate.rateId } : {}),
      ...(input.rate.orderId ? { OrderID: input.rate.orderId } : {}),
      ...(totalValue(input.declaredCents, input.currency) ? { TotalValue: totalValue(input.declaredCents, input.currency) } : {}),
      LabelType: "PDF",
      /* Synchronous, so the label is in this answer. Async: true answers "OK" and leaves it to be fetched later. */
      Async: false,
    })
    /* Documented: Status "1" made the label, "2" did not, with ErrorMessage and an ErrorType/ErrorSuggestion beside it. */
    const failed = str(body.Status) === "2" || !!str(body.ErrorMessage)
    if (failed) {
      const said = str(body.ErrorMessage) ?? (isRecord(body.ErrorType) ? str(body.ErrorType.name) : null)
      const fix = isRecord(body.ErrorSuggestion) ? str(body.ErrorSuggestion.solution) : null
      throw new ProviderError(`${NAME}: ${(said ?? "the label could not be made.").slice(0, 200)}${fix ? ` ${fix.slice(0, 160)}` : ""}`, 422, false)
    }
    /* PDF is a list of PDF labels; LabelURL is one string, or a list, or [] when the order is in error, and may be a ZPL. */
    const pdf = list(body.PDF).map(https).find((u): u is string => !!u) ?? null
    const labelled = pdf ?? https(body.LabelURL) ?? list(body.LabelURL).map(https).find((u): u is string => !!u) ?? null
    const orderId = str(body.NewOrderID)
    if (!labelled || !orderId) unexpected("Ship", body)
    return {
      orderId,
      carrier: str(body.TrackingCarrier) ?? str(body.DeliveryCarrier),
      trackingNumber: str(body.TrackingNumber),
      trackingUrl: https(body.TrackingExternalLink),
      labelUrl: labelled,
    }
  },

  /** Where a parcel is, by its tracking number. */
  async tracking(key: string, code: string): Promise<ShippyProTracking> {
    const body = await ask(key, "GetTracking", { Code: code })
    const statusCode = num(body.StatusCode)
    const details = list(body.Details)
    /* An answer with none of these three is not one this adapter can read. */
    if (statusCode === null && details.length === 0 && !str(body.Carrier)) unexpected("GetTracking", body)
    return {
      carrier: str(body.Carrier),
      delivered: body.Completed === true || statusCode === 6,
      statusCode,
      status: statusCode !== null ? (TRACKING_STATUS[statusCode] ?? null) : null,
      estimatedDelivery: unix(body.EstimatedDeliveryDate),
      trackingUrl: https(body.ExternalLink),
      late: body.Late === true,
      events: details
        .map((d) => {
          if (!isRecord(d)) return null
          const message = str(d.message)
          return message ? { at: unix(d.date), message: message.slice(0, 200), city: str(d.city), statusCode: num(d.StatusCode) } : null
        })
        .filter((e): e is ShippyProTracking["events"][number] => !!e)
        .slice(0, 60),
    }
  },

  /**
   * Void labels that have not been used. ShippyPro takes its own order ids
   * and the carrier's name, and answers Result "OK"; its document gives it
   * no other outcome, so anything else fails closed rather than being
   * reported as voided.
   */
  async voidShipments(key: string, input: { orderIds: string[]; carrierName: string }): Promise<"voided"> {
    if (input.orderIds.length === 0) throw new ProviderError(`${NAME}: no order to void.`, 422, false)
    const body = await ask(key, "VoidShipments", { OrderIDS: input.orderIds.slice(0, 50), CarrierName: input.carrierName })
    if ((str(body.Result) ?? "").toUpperCase() === "OK") return "voided"
    unexpected("VoidShipments", body)
  },

  /**
   * Is this address deliverable? ShippyPro requires a carrier here, so one
   * of the merchant's own connections has to be named: there is no
   * carrier free address check. "Generic" is documented as the name that
   * skips the carrier's own validation, and a CarrierID is required
   * whichever name is used.
   */
  async checkAddress(key: string, input: { address: LabelAddress; from: LabelAddress; carrierName: string; carrierId: number }): Promise<{ ok: boolean; messages: string[]; accuracy: number | null }> {
    const body = await ask(key, "CheckAddress", {
      CarrierName: input.carrierName,
      CarrierID: input.carrierId,
      Address: address(input.address),
      FromAddress: address(input.from),
    })
    if (!str(body.Result)) unexpected("CheckAddress", body)
    /* Message is documented as a list of validation errors, or a string; empty means the address was taken. */
    const said = Array.isArray(body.Message) ? body.Message.map(str).filter((m): m is string => !!m) : str(body.Message) ? [str(body.Message)!] : []
    const errors = str(body.ValidationErrors)
    const messages = [...said, ...(errors ? [errors] : [])].slice(0, 4)
    return { ok: messages.length === 0, messages, accuracy: num(body.Accuracy) }
  },
}

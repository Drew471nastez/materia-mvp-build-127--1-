import "server-only"

/**
 * ===========================================================================
 *  THE CARRIERS ON THE SHOP'S OWN PROVIDER ACCOUNTS
 * ===========================================================================
 * What the carrier picker's "Connected" group is made of:
 * each connected shipping app asked which carrier accounts the shop has
 * there, in that app's own words.
 *
 *   Shippo       GET /carrier_accounts/?service_levels=true
 *                results[]: carrier, carrier_name, active, service_levels[]
 *   EasyPost     GET /v2/carrier_accounts
 *                [] of readable (the carrier's name), type
 *   ShipStation  GET /carriers, then GET /carriers/listservices?carrierCode=
 *                for each one (at most MAX_SHIPSTATION_CARRIERS, ShipStation
 *                allows 40 calls a minute per key)
 *
 * A carrier account says which carriers and which services; it never says a
 * price or a delivery time, so every service here has neither. Those come
 * only from a rate request for one parcel (./labels-server.ts quoteLabel).
 *
 * Held per shop for FRESH_MS and served at once from then until STALE_MS
 * while one read refreshes it behind; past that it is read again before
 * answering. A provider that fails says so, in its own sentence, and lists
 * nothing: the last good list is not passed off as current.
 */

import type { Db } from "@/lib/physical/auth"
import { carrierOf } from "@/lib/physical/carriers"
import { call } from "../fulfilment/http"
import { connectedKey } from "./connect-server"
import { carrierFromCode, splitPair, SHIPSTATION_API } from "./shipstation"

export const FRESH_MS = 2 * 60_000
export const STALE_MS = 10 * 60_000
const MAX_SHIPSTATION_CARRIERS = 8
const MAX_SERVICES = 40

export interface ConnectedCarrier {
  /** As we save it on a shipment: our own name where we know the carrier, else the provider's. */
  carrier: string
  provider: { id: "shippo" | "easypost" | "shipstation"; name: string }
  /** Service names the provider listed for this account, no price and no days. */
  services: string[]
}

export interface ConnectedCarriers {
  carriers: ConnectedCarrier[]
  /** One per provider that did not answer, in words to show. */
  errors: { provider: string; error: string }[]
  /** When this list was read from the providers. */
  checkedAt: string
}

const SHIPPO = { id: "shippo" as const, name: "Shippo" }
const EASYPOST = { id: "easypost" as const, name: "EasyPost" }
const SHIPSTATION = { id: "shipstation" as const, name: "ShipStation" }

const text = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const ourName = (raw: string) => carrierOf(raw)?.name ?? raw

/** Shippo's answer, read. Inactive accounts are left out: the shop cannot ship with them. */
export function readShippoAccounts(body: unknown): ConnectedCarrier[] {
  const results = Array.isArray((body as { results?: unknown })?.results) ? ((body as { results: unknown[] }).results) : []
  return results
    .filter((a: any) => a && a.active !== false)
    .map((a: any): ConnectedCarrier | null => {
      const raw = text(a.carrier_name) || text(a.carrier)
      if (!raw) return null
      const services = (Array.isArray(a.service_levels) ? a.service_levels : []).map((s: any) => text(s?.name, 120) || text(s?.token, 120)).filter(Boolean)
      return { carrier: ourName(raw), provider: SHIPPO, services }
    })
    .filter((c): c is ConnectedCarrier => !!c)
}

/** EasyPost's answer, read: `readable` is the carrier as EasyPost writes it. */
export function readEasyPostAccounts(body: unknown): ConnectedCarrier[] {
  const list = Array.isArray(body) ? body : Array.isArray((body as { carrier_accounts?: unknown })?.carrier_accounts) ? (body as { carrier_accounts: unknown[] }).carrier_accounts : []
  return list
    .map((a: any): ConnectedCarrier | null => {
      const raw = text(a?.readable) || text(a?.type).replace(/Account$/, "")
      return raw ? { carrier: ourName(raw), provider: EASYPOST, services: [] } : null
    })
    .filter((c): c is ConnectedCarrier => !!c)
}

/** ShipStation's carriers, each with the services listservices named for it. */
export function readShipStationCarriers(carriers: unknown, servicesByCode: Record<string, unknown>): ConnectedCarrier[] {
  return (Array.isArray(carriers) ? carriers : [])
    .map((c: any): ConnectedCarrier | null => {
      const code = text(c?.code, 60)
      const raw = (code && carrierFromCode(code)) || text(c?.name)
      if (!raw) return null
      const services = (Array.isArray(servicesByCode[code]) ? (servicesByCode[code] as unknown[]) : []).map((s: any) => text(s?.name, 120)).filter(Boolean)
      return { carrier: ourName(raw), provider: SHIPSTATION, services }
    })
    .filter((c): c is ConnectedCarrier => !!c)
}

/** Duplicates (two accounts for one carrier at the same provider) become one, their services together. */
export function mergeConnected(list: ConnectedCarrier[]): ConnectedCarrier[] {
  const out = new Map<string, ConnectedCarrier>()
  for (const c of list) {
    const k = `${c.provider.id}:${c.carrier.toLowerCase()}`
    const had = out.get(k)
    const services = [...new Set([...(had?.services ?? []), ...c.services])].slice(0, MAX_SERVICES)
    out.set(k, { ...c, services })
  }
  return [...out.values()]
}

const said = (e: unknown, name: string) => {
  const m = e instanceof Error ? e.message : ""
  return m && m.length < 240 ? m : `${name} did not answer. Try again in a moment.`
}

async function readAll(db: Db, creatorId: string): Promise<ConnectedCarriers> {
  const [shippoKey, easypostKey, shipstationKey] = await Promise.all([
    connectedKey(db, creatorId, "shippo").catch(() => null),
    connectedKey(db, creatorId, "easypost").catch(() => null),
    connectedKey(db, creatorId, "shipstation").catch(() => null),
  ])
  const errors: ConnectedCarriers["errors"] = []
  const jobs: Promise<ConnectedCarrier[]>[] = []
  if (shippoKey)
    jobs.push(
      call<unknown>("Shippo", "https://api.goshippo.com/carrier_accounts/?service_levels=true&results=100", { headers: { Authorization: `ShippoToken ${shippoKey.key}` } })
        .then(readShippoAccounts)
        .catch((e) => (errors.push({ provider: "Shippo", error: said(e, "Shippo") }), [])),
    )
  if (easypostKey)
    jobs.push(
      call<unknown>("EasyPost", "https://api.easypost.com/v2/carrier_accounts", { headers: { Authorization: `Basic ${Buffer.from(`${easypostKey.key}:`).toString("base64")}` } })
        .then(readEasyPostAccounts)
        .catch((e) => (errors.push({ provider: "EasyPost", error: said(e, "EasyPost") }), [])),
    )
  if (shipstationKey) {
    const pair = splitPair(shipstationKey.key)
    if (!pair) errors.push({ provider: "ShipStation", error: "The saved ShipStation key pair is not complete. Connect ShipStation again." })
    else {
      const headers = { Authorization: `Basic ${Buffer.from(`${pair.key}:${pair.secret}`).toString("base64")}` }
      jobs.push(
        call<unknown>("ShipStation", `${SHIPSTATION_API}/carriers`, { headers })
          .then(async (carriers) => {
            const codes = (Array.isArray(carriers) ? carriers : []).map((c: any) => text(c?.code, 60)).filter((c) => /^[a-z0-9_]+$/i.test(c)).slice(0, MAX_SHIPSTATION_CARRIERS)
            const lists = await Promise.all(codes.map((code) => call<unknown>("ShipStation", `${SHIPSTATION_API}/carriers/listservices?carrierCode=${encodeURIComponent(code)}`, { headers }).catch(() => [])))
            return readShipStationCarriers(carriers, Object.fromEntries(codes.map((c, i) => [c, lists[i]])))
          })
          .catch((e) => (errors.push({ provider: "ShipStation", error: said(e, "ShipStation") }), [])),
      )
    }
  }
  const lists = await Promise.all(jobs)
  return { carriers: mergeConnected(lists.flat()), errors, checkedAt: new Date().toISOString() }
}

const held = new Map<string, { at: number; value: Promise<ConnectedCarriers> }>()

/** The shop's connected carriers: from the hold while fresh, the hold plus a refresh behind it while stale, read again past that. */
export async function connectedCarriers(db: Db, creatorId: string, now = Date.now()): Promise<ConnectedCarriers> {
  const h = held.get(creatorId)
  const age = h ? now - h.at : Infinity
  if (h && age < FRESH_MS) return h.value
  const fresh = { at: now, value: readAll(db, creatorId) }
  /* A list with errors is not held: the next look asks again rather than repeat a failure for two minutes. */
  fresh.value.then((v) => { if (v.errors.length && held.get(creatorId) === fresh) held.delete(creatorId) }, () => held.delete(creatorId))
  if (h && age < STALE_MS) {
    const previous = h.value
    held.set(creatorId, fresh)
    return previous
  }
  held.set(creatorId, fresh)
  return fresh.value
}

/** A connect, a disconnect or a new key: the next look reads the providers again. */
export function forgetConnectedCarriers(creatorId?: string): void {
  if (creatorId) held.delete(creatorId)
  else held.clear()
}

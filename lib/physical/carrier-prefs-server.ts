import "server-only"

/**
 * ===========================================================================
 *  THE SHOP'S CARRIERS, KEPT
 * ===========================================================================
 * `physical_carrier_prefs` (run-now part 233): one row per creator holding
 * the carriers it starred, the one it set as its default, the one it last
 * shipped with, and the carriers it added itself. Written only here, with
 * the server's key, after the caller was checked as the shop's owner or a
 * teammate with the store area (lib/physical/auth).
 *
 * Before part 233 runs there is no table: the picker still opens with
 * every carrier we know, nothing is starred, and saving says which part it
 * needs. Nothing about an existing order changes either way.
 */

import {
  CARRIER_PREFS_SQL_PART,
  EMPTY_CARRIER_PREFS,
  MAX_CUSTOM_CARRIERS,
  MAX_FAVOURITES,
  cleanCarrierName,
  cleanCustomCarrier,
  readCarrierPrefsRow,
  type CarrierPrefs,
} from "./carrier-prefs"
import { carrierKey, carrierOf } from "./carriers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const TABLE = "physical_carrier_prefs"
const COLUMNS = "favourites, default_carrier, last_carrier, custom_carriers"

const missingTable = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "42703")

export interface LoadedCarrierPrefs extends CarrierPrefs {
  /** False while part 233 has not run: the picker works, saving does not. */
  ready: boolean
}

export async function loadCarrierPrefs(db: Db, creatorId: string): Promise<LoadedCarrierPrefs> {
  const { data, error } = await db.from(TABLE).select(COLUMNS).eq("creator_id", creatorId).maybeSingle()
  if (error) return { ...EMPTY_CARRIER_PREFS, ready: !missingTable(error) }
  return { ...readCarrierPrefsRow(data ?? {}), ready: true }
}

export type SavePrefsResult = { ok: true; prefs: CarrierPrefs } | { ok: false; error: string; status: number }

function failure(error: { code?: string } | null | undefined): SavePrefsResult {
  if (missingTable(error)) return { ok: false, error: `Saved carriers need the database update. Run SQL part ${CARRIER_PREFS_SQL_PART}, then try again.`, status: 503 }
  if (error?.code === "23514") return { ok: false, error: "That carrier could not be saved as written.", status: 400 }
  return { ok: false, error: "That could not be saved. Try again in a moment.", status: 500 }
}

/**
 * ONE WRITE, WHATEVER CHANGED. The picker sends what it changed and
 * nothing else: a star, a default, a carrier added or removed, or the
 * carrier an order just shipped with. Each field is cleaned here again,
 * against the shop's own row, so a request cannot leave a default naming a
 * carrier the shop cannot pick.
 */
export async function saveCarrierPrefs(db: Db, creatorId: string, body: unknown): Promise<SavePrefsResult> {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const current = await loadCarrierPrefs(db, creatorId)
  if (!current.ready) return failure({ code: "42P01" })
  const next: CarrierPrefs = { ...current }

  if (Array.isArray(o.favourites)) {
    const favourites: string[] = []
    for (const raw of o.favourites) {
      const name = cleanCarrierName(raw)
      if (!name || favourites.some((f) => carrierKey(f) === carrierKey(name))) continue
      favourites.push(name)
      if (favourites.length >= MAX_FAVOURITES) break
    }
    next.favourites = favourites
  }
  if ("defaultCarrier" in o) next.defaultCarrier = cleanCarrierName(o.defaultCarrier)
  if ("lastCarrier" in o) next.lastCarrier = cleanCarrierName(o.lastCarrier)

  if (o.addCarrier !== undefined) {
    const clean = cleanCustomCarrier(o.addCarrier)
    if (!clean.ok) return { ok: false, error: clean.error, status: 400 }
    if (next.custom.some((c) => c.id === clean.carrier.id)) {
      next.custom = next.custom.map((c) => (c.id === clean.carrier.id ? clean.carrier : c))
    } else {
      if (next.custom.length >= MAX_CUSTOM_CARRIERS) return { ok: false, error: `You can keep up to ${MAX_CUSTOM_CARRIERS} carriers of your own. Delete one first.`, status: 400 }
      next.custom = [...next.custom, clean.carrier]
    }
  }
  if (typeof o.removeCarrier === "string") {
    const k = carrierKey(o.removeCarrier)
    next.custom = next.custom.filter((c) => c.id !== o.removeCarrier && carrierKey(c.name) !== k)
  }

  /* A default or a star left naming a carrier that is gone is dropped, not kept pointing at nothing. */
  const choosable = new Set([...next.custom.map((c) => carrierKey(c.name))])
  const gone = (name: string | null) => !!name && !choosable.has(carrierKey(name)) && !carrierOf(name)
  next.favourites = next.favourites.filter((f) => !gone(f))
  if (gone(next.defaultCarrier)) next.defaultCarrier = null

  const { error } = await db.from(TABLE).upsert(
    {
      creator_id: creatorId,
      favourites: next.favourites,
      default_carrier: next.defaultCarrier,
      last_carrier: next.lastCarrier,
      custom_carriers: next.custom,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "creator_id" },
  )
  if (error) return failure(error)
  return { ok: true, prefs: next }
}

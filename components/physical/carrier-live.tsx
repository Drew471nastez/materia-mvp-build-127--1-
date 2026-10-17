"use client"

/**
 * ===========================================================================
 *  WHAT THE CARRIER PICKER KNOWS ABOUT THIS SHOP, AND WHAT IS LIVE
 * ===========================================================================
 * The carrier picker (./carrier-picker.tsx) draws Storelib's own list of
 * carriers (lib/physical/carriers.ts: names, official names, logos, the
 * countries each is a first pick in, tracking pages). This file adds what
 * belongs to one shop and what only a provider can say:
 *
 *   THE SHOP'S OWN   its starred carriers, its default, the carrier it last
 *                    shipped with and carriers it added itself, kept in
 *                    physical_carrier_prefs (run-now part 233) through
 *                    /api/physical/carriers, read once and shared by every
 *                    picker on the page (useCarrierPrefs)
 *   CONNECTED        the carriers on its own Shippo, EasyPost or ShipStation
 *                    account, as the provider lists them, with their service
 *                    names (useConnected; held 2 minutes on the server, a
 *                    minute here)
 *   LIVE RATES       a delivery estimate and a price only from a provider's
 *                    rate answer for this order's parcel, on request (Show
 *                    rates), kept a minute and never kept on failure
 *
 * NOTHING IS MADE UP. serviceFacts below is the one way a price or a delivery
 * time reaches the screen, and it gives nothing for anything a provider did
 * not answer. The picker opens at once with the static list; none of this
 * waits on the network.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { carrierKey, carrierOf } from "@/lib/physical/carriers"
import {
  EMPTY_CARRIER_PREFS,
  TRACKING_PLACEHOLDER,
  customCarrierOf,
  customTrackingUrl,
  optionOfProviderCarrier,
  preselectCarrier,
  type CarrierOption,
  type CarrierPrefs,
  type CarrierService,
} from "@/lib/physical/carrier-prefs"
import { BTN_PRIMARY, BTN_SECONDARY, Field, Notice, TextInput, api, peekGet } from "./ui"

const PREFS_PATH = "/api/physical/carriers"
const CONNECTED_PATH = "/api/physical/carriers?connected=1"

/* ── what a service may say ─────────────────────────────────────────────── */

/**
 * THE ONLY WAY A PRICE OR AN ESTIMATE REACHES THE SCREEN. A service is drawn
 * with a price or a delivery time only when the option it belongs to came
 * from a provider (`source: "provider"`) and the provider gave that value.
 * Our own list and a shop's own carriers never carry either.
 */
export function serviceFacts(option: Pick<CarrierOption, "source" | "services">): { name: string; days: string | null; price: string | null }[] {
  if (option.source !== "provider") return []
  return (option.services ?? []).map((s) => ({
    name: s.name,
    days: s.days != null && Number.isFinite(s.days) && s.days >= 0 ? tt("{n, plural, one {# day} other {# days}}", { n: s.days }) : null,
    price: s.price || null,
  }))
}

/* ── the shop's stars, default and own carriers ─────────────────────────── */

interface LoadedPrefs extends CarrierPrefs {
  ready: boolean
}
type PrefsState = { prefs: LoadedPrefs; loaded: boolean }

let prefsState: PrefsState = { prefs: { ...EMPTY_CARRIER_PREFS, ready: false }, loaded: false }
const prefsSubs = new Set<() => void>()
const setPrefsState = (next: PrefsState) => {
  prefsState = next
  prefsSubs.forEach((f) => f())
}
let prefsAsked = 0

function askPrefs() {
  if (Date.now() - prefsAsked < 60_000) return
  prefsAsked = Date.now()
  const kept = peekGet<LoadedPrefs>(PREFS_PATH)
  if (kept) setPrefsState({ prefs: kept, loaded: true })
  void api<LoadedPrefs>(PREFS_PATH).then((r) => {
    if (r.ok) setPrefsState({ prefs: r.data, loaded: true })
    else if (!prefsState.loaded) setPrefsState({ prefs: prefsState.prefs, loaded: true })
  })
}

/** The shop's carrier preferences, shared by every selector on the page, and a save that updates them all. */
export function useCarrierPrefs(): PrefsState & { save: (patch: Record<string, unknown>) => Promise<string | null> } {
  const state = React.useSyncExternalStore(
    (f) => {
      prefsSubs.add(f)
      return () => prefsSubs.delete(f)
    },
    () => prefsState,
    () => prefsState,
  )
  React.useEffect(askPrefs, [])
  const save = React.useCallback(async (patch: Record<string, unknown>) => {
    const r = await api<LoadedPrefs>(PREFS_PATH, { method: "PUT", body: patch })
    if (r.ok === false) return r.error
    setPrefsState({ prefs: { ...r.data, ready: true }, loaded: true })
    return null
  }, [])
  return { ...state, save }
}

/** After a shipment is saved: the carrier it went with is the one the next order starts with when no default is set. Quiet either way. */
export function rememberCarrier(save: (patch: Record<string, unknown>) => Promise<string | null>, ready: boolean, carrier: string | null | undefined) {
  const name = (carrier ?? "").trim()
  if (!ready || !name || carrierKey(name) === carrierKey(prefsState.prefs.lastCarrier ?? "")) return
  void save({ lastCarrier: name })
}

/* ── the carriers on the shop's provider accounts ───────────────────────── */

export interface ConnectedAnswer {
  carriers: { carrier: string; provider: { id: string; name: string }; services: string[] }[]
  errors: { provider: string; error: string }[]
}

export function useConnected(): ConnectedAnswer | null {
  const [data, setData] = React.useState<ConnectedAnswer | null>(() => peekGet<ConnectedAnswer>(CONNECTED_PATH))
  React.useEffect(() => {
    let live = true
    void api<ConnectedAnswer>(CONNECTED_PATH).then((r) => {
      if (live && r.ok) setData(r.data)
    })
    return () => {
      live = false
    }
  }, [])
  return data
}

/* ── live rates for one order's parcel ──────────────────────────────────── */

export interface LiveRates {
  provider: string
  /** By carrier, as we save it: the services the provider priced. */
  byCarrier: Record<string, CarrierService[]>
  warnings: string[]
}
export type RatesState = { status: "idle" } | { status: "loading" } | { status: "ready"; rates: LiveRates } | { status: "error"; error: string }

const RATES_MS = 60_000
const ratesKept = new Map<string, { at: number; rates: LiveRates }>()

async function readRates(orderId: string, locationId: string | null): Promise<{ ok: true; rates: LiveRates } | { ok: false; error: string }> {
  const base = `/api/physical/orders/${encodeURIComponent(orderId)}/label`
  const opts = await api<{ apps: { id: string; name: string }[]; defaultPackageId: string | null; to: { complete: boolean; line: string } }>(`${base}${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`)
  if (opts.ok === false) return { ok: false, error: opts.error }
  const app = opts.data.apps[0]
  if (!app) return { ok: false, error: tt("Connect Shippo or EasyPost in Settings › Integrations to see rates.") }
  if (!opts.data.to.complete) return { ok: false, error: opts.data.to.line }
  if (!opts.data.defaultPackageId) return { ok: false, error: tt("Set a default package in Settings › Shipping › Packages to see rates.") }
  const q = await api<{ rates: { carrier: string; service: string; days: number | null; price: string }[]; warnings: string[] }>(base, { body: { action: "rates", provider: app.id, locationId, packageId: opts.data.defaultPackageId } })
  if (q.ok === false) return { ok: false, error: q.error }
  const byCarrier: Record<string, CarrierService[]> = {}
  for (const r of q.data.rates) {
    const name = carrierOf(r.carrier)?.name ?? r.carrier
    ;(byCarrier[name] ||= []).push({ name: r.service, days: r.days, price: r.price })
  }
  return { ok: true, rates: { provider: app.name, byCarrier, warnings: q.data.warnings ?? [] } }
}

/** Rates for this order, on request. Kept a minute per order and place; an answer that failed is never kept. */
export function useLiveRates(orderId: string | null | undefined, locationId: string | null | undefined): [RatesState, () => void] {
  const key = orderId ? `${orderId}|${locationId ?? ""}` : ""
  const kept = key ? ratesKept.get(key) : undefined
  const [state, setState] = React.useState<RatesState>(() => (kept && Date.now() - kept.at < RATES_MS ? { status: "ready", rates: kept.rates } : { status: "idle" }))
  const ask = React.useCallback(() => {
    if (!orderId) return
    setState({ status: "loading" })
    void readRates(orderId, locationId ?? null).then((r) => {
      if (r.ok === true) {
        ratesKept.set(key, { at: Date.now(), rates: r.rates })
        setState({ status: "ready", rates: r.rates })
      } else if (r.ok === false) {
        ratesKept.delete(key)
        setState({ status: "error", error: r.error })
      }
    })
  }, [orderId, locationId, key])
  return [state, ask]
}


export function AddCarrierForm({ initialName, compact, onSave, onCancel }: { initialName: string; compact: boolean; onSave: (c: { name: string; urlTemplate: string }) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = React.useState(initialName)
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <form
      className={cn("space-y-3", compact ? "px-4 pb-4 pt-1" : "p-3")}
      data-carrier-add=""
      onSubmit={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setBusy(true)
        setError(await onSave({ name: name.trim(), urlTemplate: url.trim() }))
        setBusy(false)
      }}
    >
      <p className={cn("font-semibold text-[#1a1a2e]", compact ? "text-[15px]" : "text-[13.5px]")}>{tt("Add a carrier")}</p>
      <Field label={tt("Name")}>
        <TextInput value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} className={compact ? "text-[16px]" : undefined} />
      </Field>
      <Field label={tt("Tracking link")} hint={tt("Optional. Put {tracking} where the number goes.", { tracking: TRACKING_PLACEHOLDER })}>
        <TextInput value={url} maxLength={500} inputMode="url" placeholder="https://" onChange={(e) => setUrl(e.target.value)} className={compact ? "text-[16px]" : undefined} />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={cn(BTN_SECONDARY, "h-9")} onClick={onCancel}>
          {tt("Back")}
        </button>
        <button type="submit" className={cn(BTN_PRIMARY, "h-9")} disabled={busy || !name.trim()}>
          {busy ? tt("Saving…") : tt("Add carrier")}
        </button>
      </div>
    </form>
  )
}


/** The provider's view of one carrier for this order: the connected account's services, or the rates once asked for. */
export function providerOptionFor(carrier: string | null | undefined, connected: ConnectedAnswer | null, rates: RatesState): CarrierOption | null {
  const name = (carrier ?? "").trim()
  if (!name) return null
  const k = carrierKey(carrierOf(name)?.name ?? name)
  if (rates.status === "ready") {
    const hit = Object.entries(rates.rates.byCarrier).find(([c]) => carrierKey(c) === k)
    if (hit) return optionOfProviderCarrier({ carrier: hit[0], provider: { id: "rates", name: rates.rates.provider }, services: hit[1] })
  }
  const account = connected?.carriers.find((c) => carrierKey(c.carrier) === k)
  return account ? optionOfProviderCarrier({ carrier: account.carrier, provider: account.provider, services: account.services.map((s) => ({ name: s, days: null, price: null })) }) : null
}

/**
 * UNDER THE CARRIER FIELD: the services the shop's provider has for the chosen carrier, and on an order Show rates,
 * which asks the shop's label app to price this parcel. Draws nothing when there is nothing a provider said and no
 * label app to ask.
 */
export function CarrierServices({ carrier, orderId, locationId }: { carrier: string | null | undefined; orderId?: string | null; locationId?: string | null }) {
  const connected = useConnected()
  const [rates, askRates] = useLiveRates(orderId, locationId)
  const option = providerOptionFor(carrier, connected, rates)
  const facts = option ? serviceFacts(option) : []
  /* Rates come from a label app (Shippo, EasyPost): Show rates is offered only when one is connected to this shop. */
  const labelApp = !!connected && [...connected.carriers.map((c) => c.provider.name), ...connected.errors.map((e) => e.provider)].some((n) => n === "Shippo" || n === "EasyPost")
  const canRate = !!orderId && labelApp
  if (!canRate && !facts.length && rates.status === "idle") return null
  return <ServicesPanel services={facts} providerName={option?.provider?.name ?? null} rates={rates} onAsk={canRate ? askRates : null} carrier={carrier ? carrierOf(carrier)?.name ?? carrier : null} />
}

/**
 * WHAT THE PROVIDER SAID ABOUT THIS CARRIER, under the field. Service names
 * from its carrier account; delivery estimates and prices only after Show
 * rates, from its rate answer for this parcel. A failure is said in its
 * words, with nothing standing in for the numbers.
 */
function ServicesPanel({ services, providerName, rates, onAsk, carrier }: { services: ReturnType<typeof serviceFacts>; providerName: string | null; rates: RatesState; onAsk: (() => void) | null; carrier: string | null }) {
  const priced = services.some((s) => s.price || s.days)
  const [all, setAll] = React.useState(false)
  const shown = all ? services : services.slice(0, 4)
  return (
    <div className="space-y-1.5" data-carrier-services="">
      {services.length ? (
        <ul className="divide-y divide-[#f1f2f4] rounded-lg border border-[#eceef1] bg-white">
          {shown.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-[13px]" data-carrier-service="">
              <span className="min-w-0 flex-1 break-words leading-[18px] text-[#1a1a2e]">{s.name}</span>
              {s.days ? <span className="shrink-0 text-[#6b7280]">{s.days}</span> : null}
              {s.price ? <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{s.price}</span> : null}
            </li>
          ))}
          {services.length > shown.length ? (
            <li>
              <button type="button" className="w-full px-3 py-2 text-left text-[12.5px] font-medium text-[#4b5563] hover:text-[#1a1a2e]" onClick={() => setAll(true)}>
                {tt("{n} more", { n: services.length - shown.length })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#6b7280]">
        {services.length && providerName ? <span>{priced ? tt("Rates from {provider}", { provider: providerName }) : tt("Services on your {provider} account", { provider: providerName })}</span> : null}
        {onAsk && rates.status !== "loading" ? (
          <button type="button" className="font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e]" onClick={onAsk} data-carrier-rates="">
            {rates.status === "ready" ? tt("Refresh rates") : tt("Show rates")}
          </button>
        ) : null}
        {rates.status === "loading" ? (
          <span className="inline-flex items-center gap-1.5" data-carrier-rates-loading="">
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[#d1d5db] border-t-[#1a1a2e]" aria-hidden />
            {tt("Asking for rates")}
          </span>
        ) : null}
        {rates.status === "ready" && carrier && !services.some((s) => s.price) ? <span>{tt("No rates for {carrier} on this parcel.", { carrier })}</span> : null}
      </div>
      {rates.status === "error" ? (
        <p className="text-[12.5px] text-[#b42318]" data-carrier-rates-error="">
          {rates.error}
        </p>
      ) : null}
    </div>
  )
}

/** The first carrier for a new shipment: the number's shape, the default, the last one used, the country's post. */
export function firstCarrier(prefs: CarrierPrefs, input: { country?: string | null; guessed?: string | null }): string {
  return preselectCarrier(prefs, input)?.carrier ?? ""
}

/** A shop's own carrier's tracking page for this number, from its link template; null when it has none. */
export function ownCarrierLink(carrier: string | null | undefined, number: string | null | undefined): string | null {
  const own = customCarrierOf(prefsState.prefs, carrier)
  return own ? customTrackingUrl(own, number) : null
}

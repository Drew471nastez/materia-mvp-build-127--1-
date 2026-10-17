"use client"

/**
 * ===========================================================================
 *  SETTINGS > SHIPPING: HOW A SHOP SHIPS, FROM WHERE, FOR HOW MUCH
 * ===========================================================================
 * Only while physical commerce is on in /admin (the tabs are filtered out
 * otherwise). Four parts, each its own section of Settings so a person finds
 * each where its name says it is (components/app/settings-form-new.tsx):
 *
 *   delivery      Shipping and delivery: how orders are fulfilled, units,
 *                 the General shipping profile and custom ones, their zones
 *                 (countries or states) and rates (flat, free, by order
 *                 price, by order weight, by item weight), and packages
 *   locations     Locations: where stock is kept, where orders ship from,
 *                 who ships them, local pickup, and low stock emails
 *   taxes         Taxes: none, or the shop's own rates per country and state
 *   returns       Returns and refunds: whether returns are accepted, and for
 *                 how long
 *
 * The first visit asks one question, "How do you fulfil your physical
 * orders?", and sets up a first location of that kind. Then, while the
 * store has no rate a buyer can use, Quick setup proposes a whole first
 * way to ship from what Storelib knows (the store's country, address and
 * currency): a zone for the home country and one for the rest of the EU
 * or the world, each with a price the merchant types and a delivery time
 * to start from (lib/physical/quick-setup.ts). One press makes it
 * (app/api/physical/shipping/quick-setup).
 *
 * Once a store can ship, the page leads with a few lines that say where it
 * ships, for how much and how fast, with Edit. Profiles, zones, rates,
 * units, packages and the fulfilment question sit under "All shipping
 * settings", open from the start for a store set up any further way.
 *
 * Inside the Settings form: every button is type="button" and Enter in a
 * field never submits the account form around it.
 */

import * as React from "react"
import { Check, ChevronDown, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { CountryFlag } from "@/components/app/settings/country-picker"
import { deliveryEstimate } from "@/lib/physical/rates"
import { PICKUP_READY_SHORT } from "@/lib/physical/pickup"
import { partnerPill, partnerSentence } from "@/lib/physical/partner"
import { REGIONS, regionLabel, regionsOf } from "@/lib/physical/regions"
import { addressFormat, postalLooksRight } from "@/lib/address/format"
import { dimensionUnitFor, formatSize, fromGrams, fromMm, smallWeightUnitFor, toGrams, toMm, weightUnitFor, type UnitSystem } from "@/lib/physical/units"
import { PICKUP_READY, type FulfillmentModel, type Location, type LocationKind, type PickupReady, type RateKind, type RateTier, type ShippingProfile, type ShippingRate, type ShippingZone } from "@/lib/physical/types"
import { ReadinessChecklist } from "./readiness-checklist"
import { ReadinessLink } from "./readiness-client"
import { EU_COUNTRIES, hasUsableRate, isSimpleSetup, quickSetupProposal, shippingSummary } from "@/lib/physical/quick-setup"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, CountryPicker, DecimalInput, Empty, FIELD, Field, MoneyInput, MUTED, Notice, NumberInput, Pill, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf, money, peekGet } from "./ui"
import { tt } from "@/lib/i18n/text"

interface Settings {
  fulfillmentModel: FulfillmentModel | null
  defaultLocationId: string | null
  defaultPackageId: string | null
  unitSystem: UnitSystem
  returnsEnabled: boolean
  returnWindowDays: number
  taxMode: "none" | "manual" | "provider"
  pricesIncludeTax: boolean
  taxOnShipping: boolean
  lowStockDefault: number
  lowStockAlerts: boolean
  onboardedAt: string | null
}
interface Pack {
  id: string
  name: string
  kind: "box" | "envelope" | "soft_package"
  lengthMm: number
  widthMm: number
  heightMm: number
  weightGrams: number
  isDefault: boolean
}
interface TaxRow {
  id: string
  country: string
  region: string | null
  name: string
  rateBps: number
}
/** An app that can price a Carrier calculated rate, and whether this store has it connected (GET /api/physical/settings). */
interface CarrierApp {
  id: string
  name: string
  connected: boolean
}
/** Store details' country and business address, what Quick setup starts from. */
interface Origin {
  country: string | null
  address: { addressLine1: string; addressLine2: string; city: string; region: string; postalCode: string; country: string } | null
}
interface ShippingProduct {
  id: string
  title: string
  imageUrl: string | null
  /** Null: the general profile. */
  profileId: string | null
}
interface Data {
  settings: Settings
  locations: Location[]
  profiles: ShippingProfile[]
  packages: Pack[]
  taxRates: TaxRow[]
  carrierApps?: CarrierApp[]
  origin?: Origin
  shippingProducts?: ShippingProduct[]
}

type SetData = React.Dispatch<React.SetStateAction<Data | null>>

const MODELS: { id: FulfillmentModel; title: string; line: string }[] = [
  { id: "self", get title() { return tt("I ship orders myself") }, get line() { return tt("From home, a studio or a shop.") } },
  { id: "warehouse", get title() { return tt("From my own warehouse") }, get line() { return tt("Stock in a place you run.") } },
  { id: "print_on_demand", get title() { return tt("Print on demand") }, get line() { return tt("Each order is printed and shipped for you.") } },
  { id: "dropshipping", get title() { return tt("Dropshipping") }, get line() { return tt("A supplier ships straight to your buyers.") } },
  { id: "supplier", get title() { return tt("A supplier or manufacturer") }, get line() { return tt("They hold the stock and ship it.") } },
  { id: "third_party_logistics", get title() { return tt("A fulfillment center") }, get line() { return tt("A 3PL stores, packs and ships.") } },
  { id: "hybrid", get title() { return tt("A mix of these") }, get line() { return tt("Different products ship from different places.") } },
]


const KIND_LABEL: Record<LocationKind, string> = {
  get home() { return tt("Home or studio") },
  get warehouse() { return tt("Warehouse") },
  get print_on_demand() { return tt("Print on demand") },
  get dropshipper() { return tt("Dropshipping supplier") },
  get supplier() { return tt("Supplier") },
  get third_party_logistics() { return tt("Fulfillment center") },
  get retail() { return tt("Store") },
  get custom() { return tt("Other") },
}

/** A partner's place: they pack and ship, so orders are sent to them and buyers never collect there. */
const PARTNER_KINDS: LocationKind[] = ["print_on_demand", "dropshipper", "supplier", "third_party_logistics"]

/** What each answer to "Who ships the orders?" means, said under the choice. */
const FORWARDING_HELP: Record<string, string> = {
  get none() { return tt("You pack and ship orders from here, and mark them shipped in Orders with the tracking number.") },
  get email() { return tt("Each new order with items from here is emailed to this partner with the items and the address. You add their tracking number in Orders when they ship.") },
  get webhook() { return tt("Each new order is sent to your own system as a signed request. Set the address in Integrations.") },
  get provider() { return tt("Orders from here go to the print partner connected in Settings › Integrations. While it isn't connected, they are flagged for you to send yourself.") },
}

const RATE_KIND_LABEL: Record<RateKind, string> = {
  get flat() { return tt("Flat rate") },
  get free() { return tt("Free shipping") },
  get price() { return tt("Based on order price") },
  get weight() { return tt("Based on order weight") },
  get item_weight() { return tt("Based on item weight") },
  get quantity() { return tt("By number of items") },
  get carrier() { return tt("Carrier calculated") },
}

/** What the seller picks from; quantity stays readable on older rates. Carrier calculated: live rates from Shippo or EasyPost (lib/integrations/shipping/checkout-rates-server.ts). */
const RATE_KINDS_OFFERED: RateKind[] = ["flat", "free", "price", "weight", "item_weight", "carrier"]

const RATE_KIND_LINE: Record<RateKind, string> = {
  get flat() { return tt("One price for the whole order.") },
  get free() { return tt("Nothing to pay, always or above an order value.") },
  get price() { return tt("Bigger orders pay a different price. Set the steps.") },
  get weight() { return tt("Heavier orders pay more. Set the steps by total weight.") },
  get item_weight() { return tt("Each item is priced by its own weight, then added up.") },
  get quantity() { return tt("By how many items are in the order.") },
  get carrier() { return tt("Live rates from your Shippo or EasyPost account for the buyer's address. Left out when they don't answer in time.") },
}

function weightText(grams: number, system: UnitSystem): string {
  const unit = weightUnitFor(system)
  return `${fromGrams(grams, unit)} ${unit}`
}

function rateCondition(r: ShippingRate, system: UnitSystem): string {
  const parts: string[] = []
  const range = (fmt: (n: number) => string) => {
    if (r.minValue !== null && r.maxValue !== null) return tt("{minValue} to {maxValue}", { minValue: fmt(r.minValue), maxValue: fmt(r.maxValue) })
    if (r.minValue !== null) return tt("{minValue} and up", { minValue: fmt(r.minValue) })
    if (r.maxValue !== null) return tt("up to {maxValue}", { maxValue: fmt(r.maxValue) })
    return ""
  }
  const fmtValue = (n: number) => (r.kind === "price" ? money(n) : weightText(n, system))
  if ((r.kind === "price" || r.kind === "weight" || r.kind === "item_weight") && r.tiers.length) {
    parts.push(
      r.tiers
        .map((t, i) => {
          const next = r.tiers[i + 1]
          const span = next ? tt("{from} to {from2}", { from: fmtValue(t.from), from2: fmtValue(next.from) }) : `${fmtValue(t.from)}+`
          return `${span} ${t.priceCents === 0 ? "free" : money(t.priceCents)}${r.kind === "item_weight" ? " each" : ""}`
        })
        .join(", "),
    )
    if (r.maxValue !== null) parts.push(tt("not above {maxValue}", { maxValue: fmtValue(r.maxValue) }))
  } else if (r.kind === "weight") parts.push(range((n) => weightText(n, system)))
  else if (r.kind === "price") parts.push(range((n) => money(n)))
  else if (r.kind === "quantity") parts.push(range((n) => tt("{n, plural, one {# item} other {# items}}", { n })))
  if (r.kind === "free" && r.minValue) parts.push(tt("on orders over {amount}", { amount: money(r.minValue) }))
  if (r.kind === "carrier") parts.push([r.carrier === "easypost" ? "EasyPost" : r.carrier === "shippo" ? tt("Shippo") : null, r.serviceCode || tt("cheapest service")].filter(Boolean).join(", "))
  if (r.freeOverCents) parts.push(tt("free over {amount}", { amount: money(r.freeOverCents) }))
  const est = deliveryEstimate(r)
  if (est) parts.push(est)
  return parts.filter(Boolean).join(" · ")
}

function zonePlaces(z: Pick<ShippingZone, "restOfWorld" | "countries" | "regions">): string {
  if (z.restOfWorld) return tt("Every other country")
  const names = [...z.countries.map(countryName), ...(z.regions ?? []).map(regionLabel)]
  return names.length <= 3 ? names.join(", ") : tt("{value} and {value2} more", { value: names.slice(0, 2).join(", "), value2: names.length - 2 })
}

function stopEnter(e: React.KeyboardEvent) {
  if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
}

export type ShippingPart = "delivery" | "locations" | "returns"

/** What the readiness checklist depends on here, as one string: when it changes, the checklist reads the store again. */
function readinessVersion(d: Data): string {
  return JSON.stringify([d.settings, d.profiles, d.locations, d.packages?.length ?? 0, d.taxRates?.length ?? 0, d.shippingProducts?.map((p) => p.profileId)])
}

export function ShippingSettings({ part = "delivery" }: { part?: ShippingPart }) {
  /* Drawn at once from what Settings fetched while the person was on another tab (prefetchGet). */
  const [data, setData] = React.useState<Data | null>(() => peekGet<Data>("/api/physical/settings"))
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const res = await api<Data>("/api/physical/settings")
    if (res.ok) {
      setData(res.data)
      setError(null)
    } else setError(res.error)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  if (error && !data) return <Notice>{error}</Notice>
  if (!data) {
    /* No outline of itself: the settings fade in when they come (settings-content-in). */
    return <div className="min-h-[360px]" aria-busy="true" />
  }

  return (
    <div className="space-y-4 sm:space-y-6" onKeyDown={stopEnter} data-shipping-settings={part}>
      {/* The first question, wherever the first visit lands: everything after it reads its answer. */}
      {!data.settings.onboardedAt ? <Onboarding onDone={load} /> : null}

      {/* What still stops a sale, read again whenever anything here changes (components/physical/readiness-checklist). */}
      {data.settings.onboardedAt && part !== "returns" ? <ReadinessChecklist version={readinessVersion(data)} /> : null}

      {part === "delivery" && data.settings.onboardedAt ? <Delivery data={data} reload={load} setData={setData} /> : null}
      {part === "locations" ? (
        <>
          <Locations data={data} reload={load} setData={setData} />
          <StockAlerts data={data} reload={load} setData={setData} />
        </>
      ) : null}
      {part === "returns" ? <ReturnsPolicy data={data} reload={load} setData={setData} /> : null}

      <p className="text-[13px] text-[#6b7280]">
        {tt("New to selling physical products? See")}{" "}
        <a href="/help/physical-products/playbook" target="_blank" rel="noreferrer" className="font-medium text-[#1a1a2e] underline underline-offset-2">
          {tt("what happens when someone orders")}
        </a>
        {tt(", or")}{" "}
        <a href="/help/physical-products/zero-to-100" target="_blank" rel="noreferrer" className="font-medium text-[#1a1a2e] underline underline-offset-2">
          {tt("set up step by step")}
        </a>
        .
      </p>
    </div>
  )
}

/* ── The first question ────────────────────────────────────────────────── */

/**
 * Arrow keys move the choice in a radiogroup, as a native radio set does:
 * Up and Left back, Down and Right on, Home and End to the ends, wrapping
 * round. Only the chosen radio (or the first, before any is) is a Tab stop.
 */
export function radioKeys<T extends string>(ids: readonly T[], current: T | "" | null, choose: (id: T) => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
    if (!step && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    /* Before any pick, from the radio that has the focus, as a native radio set moves. */
    const at = current ? ids.indexOf(current as T) : ids.indexOf((e.target as HTMLElement | null)?.getAttribute?.("data-radio") as T)
    const next = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : at < 0 ? (step > 0 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length
    choose(ids[next])
    const group = e.currentTarget
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-radio="${ids[next]}"]`)?.focus())
  }
}

/**
 * HOW ORDERS ARE FULFILLED, asked in one place: the first visit's question
 * and the card under All shipping settings draw this same list. A
 * radiogroup, like the units switch and the rate kinds, so a screen reader
 * hears one question with seven answers and the arrow keys move the pick.
 */
export function FulfilmentChoice({ value, onChange }: { value: FulfillmentModel | "" | null; onChange: (m: FulfillmentModel) => void }) {
  const ids = MODELS.map((m) => m.id)
  return (
    <div role="radiogroup" aria-label={tt("How do you fulfil your physical orders?")} className="grid gap-2 sm:grid-cols-2" onKeyDown={radioKeys(ids, value, onChange)} data-fulfil-choice="">
      {MODELS.map((m, i) => {
        const on = value === m.id
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(m.id)}
            data-radio={m.id}
            data-fulfil-model={m.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]",
              on ? "border-[#1a1a2e] bg-[#fafafa] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#f8f9fa]",
            )}
          >
            <span aria-hidden className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white")}>
              <span className={cn("h-1.5 w-1.5 rounded-full bg-white transition-transform duration-150", on ? "scale-100" : "scale-0")} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-[#1a1a2e]">{m.title}</span>
              <span className="block text-[13px] leading-[18px] text-[#6b7280]">{m.line}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [chosen, setChosen] = React.useState<FulfillmentModel | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const go = async () => {
    if (!chosen) return
    setBusy(true)
    const res = await api("/api/physical/onboarding", { body: { model: chosen } })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onDone()
  }
  return (
    <Card title={tt("How do you fulfil your physical orders?")} description={tt("We'll set up your first location to match. You can change this any time.")} help="fulfilment">
      <FulfilmentChoice value={chosen} onChange={setChosen} />
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      <div className="mt-4 flex justify-end">
        <button type="button" className={BTN_PRIMARY} disabled={!chosen || busy} onClick={go}>
          {busy ? tt("Setting up") : tt("Continue")}
        </button>
      </div>
    </Card>
  )
}

/* ── Delivery: profiles, zones, rates ──────────────────────────────────── */

function Delivery({ data, reload, setData }: { data: Data; reload: () => void; setData: SetData }) {
  const [newProfile, setNewProfile] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /* Zones made in this visit open their first rate at once: a zone without a rate ships nothing. */
  const [freshZones, setFreshZones] = React.useState<string[]>([])
  const profiles = [...data.profiles].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  const products = data.shippingProducts ?? []
  const updateProfiles = (p: ShippingProfile[], extra?: { shippingProducts?: ShippingProduct[] }) => {
    const before = new Set(data.profiles.flatMap((x) => x.zones.map((z) => z.id)))
    const made = p.flatMap((x) => x.zones.map((z) => z.id)).filter((id) => !before.has(id))
    if (made.length) setFreshZones((f) => [...f, ...made])
    setData((d) => (d ? { ...d, profiles: p, ...(extra?.shippingProducts ? { shippingProducts: extra.shippingProducts } : {}) } : d))
  }
  const noRates = data.profiles.every((p) => p.zones.every((z) => z.rates.length === 0))
  const usable = hasUsableRate(data.profiles)
  /*
    WHAT LEADS. No rate at all yet: Quick setup. One that ships: the
    summary. "Set it up myself" puts Quick setup away and opens the full
    settings; a store already set up some other way finds them open.
  */
  const [skipped, setSkipped] = React.useState(false)
  const [open, setOpen] = React.useState(() => !isSimpleSetup(data.profiles) && !noRates)
  const allRef = React.useRef<HTMLDivElement>(null)
  const showAll = () => {
    setOpen(true)
    requestAnimationFrame(() => allRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }

  React.useEffect(() => {
    if (data.profiles.length === 0) void api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/profiles").then((r) => r.ok && updateProfiles(r.data.profiles))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const system = data.settings.unitSystem ?? "metric"
  const setSystem = async (unitSystem: UnitSystem) => {
    if (unitSystem === system) return
    setData((d) => (d ? { ...d, settings: { ...d.settings, unitSystem } } : d))
    const r = await api("/api/physical/settings", { method: "PUT", body: { unitSystem } })
    if (!r.ok) {
      setError(r.error)
      reload()
    }
  }
  const units = [
    { id: "metric", label: tt("Metric (kg, cm)") },
    { id: "imperial", label: tt("Imperial (lb, in)") },
  ] as const

  return (
    <div className="space-y-4">
      {noRates && !skipped ? (
        <QuickSetup
          data={data}
          onMade={(next) => setData((d) => (d ? { ...d, profiles: next.profiles, settings: next.settings, locations: next.locations } : d))}
          onSkip={() => {
            setSkipped(true)
            showAll()
          }}
        />
      ) : null}
      {usable ? <ShippingSummary data={data} onEdit={showAll} /> : null}

      <div ref={allRef} className="scroll-mt-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="shipping-all"
          className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
          data-shipping-all={open ? "open" : "closed"}
        >
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-[#1a1a2e]">{tt("All shipping settings")}</span>
            <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Who ships, units, zones and rates, profiles for some products, packages")}</span>
          </span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <div id="shipping-all" className="shipping-all-in space-y-4">
          <FulfilmentCard data={data} reload={reload} setData={setData} />
          <Card title={tt("Units")} description={tt("How weights and sizes are typed and shown here, on new products and in packages. Rates keep working when you switch.")}>
            <div className="flex w-fit gap-1 rounded-xl bg-[#f1f2f4] p-1" role="radiogroup" aria-label={tt("Units")} data-unit-system={system} onKeyDown={radioKeys(["metric", "imperial"] as const, system, setSystem)}>
              {units.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={system === o.id}
                  tabIndex={system === o.id ? 0 : -1}
                  data-radio={o.id}
                  onClick={() => setSystem(o.id)}
                  className={cn("h-9 rounded-lg px-3 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25", system === o.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Card>
          {noRates ? <Notice tone="amber">{tt("Buyers can't check out a physical product until it has a rate for their address. Add a zone and a rate below.")}</Notice> : null}
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} allProfiles={data.profiles} products={products} system={system} freshZones={freshZones} carrierApps={data.carrierApps ?? []} home={homeCountry(data)} onProfiles={updateProfiles} onError={setError} />
          ))}
          {error ? <Notice>{error}</Notice> : null}
          {newProfile === null ? (
            <button type="button" className={BTN_SECONDARY} onClick={() => setNewProfile("")}>
              <Plus className="h-4 w-4" />
              {tt("Custom shipping profile")}
            </button>
          ) : (
            <Card title={tt("New shipping profile")} description={tt("For products that ship differently, like heavy or fragile items. Next you pick its products, then where it ships and for how much.")}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <TextInput autoFocus placeholder={tt("Heavy items")} value={newProfile} maxLength={80} onChange={(e) => setNewProfile(e.target.value)} className="flex-1" />
                <div className="flex gap-2">
                  <button type="button" className={BTN_SECONDARY} onClick={() => setNewProfile(null)}>
                    {tt("Cancel")}
                  </button>
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={!newProfile.trim()}
                    onClick={async () => {
                      const r = await api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/profiles", { body: { name: newProfile } })
                      if (!r.ok) return setError(r.error)
                      updateProfiles(r.data.profiles)
                      setNewProfile(null)
                    }}
                  >
                    {tt("Create profile")}
                  </button>
                </div>
              </div>
            </Card>
          )}
          {/* Local delivery and pickup are a place's, not a zone's: each location sets its own (Locations). */}
          <p className="text-[13px] leading-[19px] text-[#6b7280]" data-local-hint="">
            {tt("Local delivery and local pickup are set on each location, in Locations:")} {deliveryHint(data.locations)}
          </p>
          <Packages data={data} setData={setData} />
        </div>
      ) : null}
    </div>
  )
}

/** The store's own country: Store details' (read with these settings), else what Settings read ahead, else the default location's. */
function homeCountry(data: Data): string {
  const loc = data.locations.find((l) => l.id === data.settings.defaultLocationId) ?? data.locations[0]
  return data.origin?.country || storeCountry() || loc?.country || ""
}

/* ── Quick setup ───────────────────────────────────────────────────────── */

/** Days typed as text, kept to whole numbers 0 to 365. */
function DaysInputs({ min, max, onMin, onMax, label }: { min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <NumberInput value={min} onChange={onMin} aria-label={tt("{label}, fewest days", { label })} className="w-[72px] text-center" />
      <span className="text-[13px] text-[#6b7280]">{tt("to")}</span>
      <NumberInput value={max} onChange={onMax} aria-label={tt("{label}, most days", { label })} className="w-[72px] text-center" />
      <span className="text-[13px] text-[#6b7280]">{tt("days")}</span>
    </div>
  )
}

const OWN_PLACE: LocationKind[] = ["home", "warehouse", "retail", "custom"]

/**
 * ONE CARD, A WHOLE FIRST WAY TO SHIP. What Storelib knows is filled in:
 * the country, the zone for the rest of the EU (or the world), a delivery
 * time to start from, the address parcels leave from. The prices are
 * empty: the merchant types each one (0 for free), and nothing is saved
 * until Use this setup. lib/physical/quick-setup.ts says why.
 */
function QuickSetup({ data, onMade, onSkip }: { data: Data; onMade: (next: { profiles: ShippingProfile[]; settings: Settings; locations: Location[] }) => void; onSkip: () => void }) {
  const currency = useStoreCurrency()
  const [country, setCountry] = React.useState(() => homeCountry(data))
  const plan = quickSetupProposal({ country, currency })
  const [home, setHome] = React.useState({ price: "", min: "", max: "", freeOver: "" })
  const [abroad, setAbroad] = React.useState({ on: true, price: "", min: "", max: "" })
  /* The delivery times start from the proposal for the country, and follow it when the country changes. */
  React.useEffect(() => {
    if (!plan) return
    setHome((h) => ({ ...h, min: String(plan.home.minDays), max: String(plan.home.maxDays) }))
    setAbroad((a) => ({ ...a, min: String(plan.abroad.minDays), max: String(plan.abroad.maxDays) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.country])

  /* Ships from: the default location when it has an address, else the business address from Store details, for an own place only. */
  const location = data.locations.find((l) => l.id === data.settings.defaultLocationId) ?? data.locations[0] ?? null
  const ownPlace = !!location && OWN_PLACE.includes(location.kind)
  const known = location?.addressLine1 && location.city ? location : null
  const [from, setFrom] = React.useState(() => {
    const a = data.origin?.address
    return { addressLine1: a?.addressLine1 ?? "", addressLine2: a?.addressLine2 ?? "", city: a?.city ?? "", region: a?.region ?? "", postalCode: a?.postalCode ?? "" }
  })
  const [editFrom, setEditFrom] = React.useState(false)
  const [missing, setMissing] = React.useState<{ home?: boolean; abroad?: boolean }>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const homeName = plan ? countryName(plan.country) : ""
  const fromLine = [from.addressLine1, from.city, from.postalCode].filter(Boolean).join(", ")

  const submit = async () => {
    if (!plan) return
    const homeCents = centsOf(home.price)
    const abroadCents = abroad.on ? centsOf(abroad.price) : 0
    const gaps = { home: homeCents === null, abroad: abroad.on && abroadCents === null }
    setMissing(gaps)
    if (gaps.home || gaps.abroad) return
    setBusy(true)
    setError(null)
    const r = await api<{ profiles: ShippingProfile[]; settings: Settings; locations: Location[] }>("/api/physical/shipping/quick-setup", {
      body: {
        country: plan.country,
        home: { priceCents: homeCents, minDays: home.min || null, maxDays: home.max || null, freeOverCents: centsOf(home.freeOver) },
        abroad: abroad.on ? { priceCents: abroadCents, minDays: abroad.min || null, maxDays: abroad.max || null } : null,
        shipFrom: ownPlace && !known && from.addressLine1.trim() && from.city.trim() ? from : null,
      },
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onMade(r.data)
  }

  return (
    <Card title={tt("Set up shipping")} description={plan ? tt("A start for a store in {country}. Type your prices, check the days, then press Use this setup. You can change all of it later.", { country: homeName }) : tt("Choose where you ship from to get a start you can change.")} className="shipping-all-in" id="quick-setup">
      <div data-quick-setup={plan?.country ?? ""}>
        {!data.origin?.country ? (
          <Field label={tt("Where do you ship from?")} className="mb-4 sm:max-w-[320px]">
            <SelectInput value={country} onChange={setCountry}>
              <option value="">{tt("Choose")}</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        {plan ? (
          <div className="divide-y divide-[#eceef1] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
            <section className="space-y-3 px-3.5 py-3.5 sm:px-4" data-setup-part="home">
              <div className="flex items-center gap-2.5">
                <CountryFlag code={plan.country} className="h-[14px] w-[21px] rounded-[2px]" />
                <h3 className="text-[14.5px] font-semibold text-[#1a1a2e]">{plan.home.label}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tt("Price")} hint={tt("What a buyer pays per order. 0 is free.")} error={missing.home ? tt("Type a price, or 0 for free.") : null}>
                  <MoneyInput
                    value={home.price}
                    placeholder=""
                    onChange={(v) => {
                      setHome((h) => ({ ...h, price: v }))
                      setMissing((m) => ({ ...m, home: false }))
                    }}
                    aria-label={tt("Price, {label}", { label: plan.home.label })}
                    aria-invalid={missing.home || undefined}
                    data-setup-price="home"
                  />
                </Field>
                <Field label={tt("Delivery time")} hint={tt("Business days, shown at checkout")}>
                  <DaysInputs label={plan.home.label} min={home.min} max={home.max} onMin={(v) => setHome((h) => ({ ...h, min: v }))} onMax={(v) => setHome((h) => ({ ...h, max: v }))} />
                </Field>
                <Field label={tt("Free shipping on orders over")} hint={tt("Optional. Leave it empty to always charge.")} className="sm:col-span-2 sm:max-w-[calc(50%-6px)]">
                  <MoneyInput value={home.freeOver} placeholder="" onChange={(v) => setHome((h) => ({ ...h, freeOver: v }))} />
                </Field>
              </div>
            </section>
            <section className="space-y-3 px-3.5 py-3.5 sm:px-4" data-setup-part="abroad" data-setup-kind={plan.abroad.kind}>
              <Toggle
                label={<span className="text-[14.5px] font-semibold text-[#1a1a2e]">{plan.abroad.label}</span>}
                description={plan.abroad.kind === "eu" ? tt("{n} EU countries", { n: plan.abroad.countries.length }) : tt("Every country outside {country}", { country: homeName })}
                checked={abroad.on}
                onChange={(on) => {
                  setAbroad((a) => ({ ...a, on }))
                  setMissing((m) => ({ ...m, abroad: false }))
                }}
              />
              {abroad.on ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={tt("Price")} hint={tt("What a buyer pays per order. 0 is free.")} error={missing.abroad ? tt("Type a price, or 0 for free.") : null}>
                    <MoneyInput
                      value={abroad.price}
                      placeholder=""
                      onChange={(v) => {
                        setAbroad((a) => ({ ...a, price: v }))
                        setMissing((m) => ({ ...m, abroad: false }))
                      }}
                      aria-label={tt("Price, {label}", { label: plan.abroad.label })}
                      aria-invalid={missing.abroad || undefined}
                      data-setup-price="abroad"
                    />
                  </Field>
                  <Field label={tt("Delivery time")} hint={tt("Business days, shown at checkout")}>
                    <DaysInputs label={plan.abroad.label} min={abroad.min} max={abroad.max} onMin={(v) => setAbroad((a) => ({ ...a, min: v }))} onMax={(v) => setAbroad((a) => ({ ...a, max: v }))} />
                  </Field>
                </div>
              ) : (
                <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Only buyers in {country} can order. You can add more places later.", { country: homeName })}</p>
              )}
            </section>
            {ownPlace ? (
              <section className="px-3.5 py-3.5 sm:px-4" data-setup-part="from">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-semibold text-[#1a1a2e]">{tt("Ships from")}</h3>
                    <p className="mt-0.5 text-[13px] leading-[19px] text-[#6b7280]">
                      {known
                        ? [known.addressLine1, known.city, known.country ? countryName(known.country) : null].filter(Boolean).join(", ")
                        : fromLine
                          ? tt("{address}, from your business details", { address: fromLine })
                          : tt("Optional. Labels and return emails use it.")}
                    </p>
                  </div>
                  {known ? null : (
                    <button type="button" className={cn(BTN_GHOST, "shrink-0")} onClick={() => setEditFrom((v) => !v)} aria-expanded={editFrom}>
                      {editFrom ? tt("Done") : fromLine ? tt("Change") : tt("Add address")}
                    </button>
                  )}
                </div>
                {editFrom && !known ? (
                  <div className="shipping-all-in mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label={tt("Street and number")} className="sm:col-span-2">
                      <TextInput value={from.addressLine1} maxLength={200} autoComplete="address-line1" onChange={(e) => setFrom((f) => ({ ...f, addressLine1: e.target.value }))} />
                    </Field>
                    <Field label={tt("City")}>
                      <TextInput value={from.city} maxLength={120} autoComplete="address-level2" onChange={(e) => setFrom((f) => ({ ...f, city: e.target.value }))} />
                    </Field>
                    <Field label={addressFormat(plan.country).postal.label}>
                      <TextInput value={from.postalCode} maxLength={20} autoComplete="postal-code" placeholder={addressFormat(plan.country).postal.example} onChange={(e) => setFrom((f) => ({ ...f, postalCode: e.target.value }))} />
                    </Field>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
        {error ? <Notice className="mt-3">{error}</Notice> : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className={cn(BTN_GHOST, "self-center sm:self-auto")} onClick={onSkip} data-setup-skip="">
            {tt("I'll set it up myself")}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-center text-[12.5px] text-[#9ca3af] sm:text-right">{tt("Nothing is saved until you press it")}</p>
            <button type="button" className={cn(BTN_PRIMARY, "h-11 sm:h-10")} disabled={!plan || busy} onClick={submit} data-setup-save="">
              {busy ? tt("Setting up") : tt("Use this setup")}
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ── What the store ships, in a few lines ──────────────────────────────── */

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function ShippingSummary({ data, onEdit }: { data: Data; onEdit: () => void }) {
  const currency = useStoreCurrency()
  const home = homeCountry(data)
  const { sentence, rows } = shippingSummary(data.profiles, { home, money: (c) => shopMoneyIn(c, currency) })
  const custom = data.profiles.filter((p) => !p.isDefault).length
  const location = data.locations.find((l) => l.id === data.settings.defaultLocationId) ?? data.locations.find((l) => l.active) ?? null
  const general = data.profiles.find((p) => p.isDefault) ?? data.profiles[0]
  return (
    <Card title={tt("Shipping")} action={<button type="button" className={BTN_SECONDARY} onClick={onEdit} data-summary-edit="">{tt("Edit")}</button>} className="shipping-all-in">
      <div data-shipping-summary={rows.length}>
        <p className="text-[15px] leading-[22px] text-[#1a1a2e]">{sentence}</p>
        {rows.length ? (
          <ul className="mt-3 divide-y divide-[#f0f1f3] rounded-xl border border-[#eceef1]">
            {rows.map((r) => {
              const zone = general?.zones.find((z) => z.id === r.zoneId)
              const flags = zone && !zone.restOfWorld ? zone.countries.slice(0, 3) : []
              return (
                <li key={r.zoneId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* One width for every row's flags, so the names line up. */}
                    <span className="flex w-[44px] shrink-0 -space-x-2.5" aria-hidden>
                      {flags.length ? flags.map((c) => <CountryFlag key={c} code={c} className="ring-2 ring-white" />) : <span className="h-[15px] w-[22px] rounded-[3px] bg-[#f1f2f4]" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{capital(r.place)}</p>
                      <p className="truncate text-[12.5px] text-[#6b7280]">{[r.days, r.free].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{capital(r.price)}</span>
                </li>
              )
            })}
          </ul>
        ) : null}
        <p className="mt-3 text-[12.5px] leading-[18px] text-[#6b7280]">
          {location?.addressLine1 && location.city ? (
            tt("Ships from {place}.", { place: [location.addressLine1, location.city].join(", ") })
          ) : (
            <>
              {tt("No ship-from address yet.")}{" "}
              <ReadinessLink plain href="/app/settings?tab=locations" className="font-medium text-[#1a1a2e] underline underline-offset-2">
                {tt("Add it in Locations")}
              </ReadinessLink>
            </>
          )}
          {custom ? ` ${tt("{n, plural, one {# product group ships its own way.} other {# product groups ship their own way.}}", { n: custom })}` : ""}
        </p>
      </div>
    </Card>
  )
}

/** What the shop's locations offer besides shipping, in a few words. */
function deliveryHint(locations: Location[]): string {
  const live = locations.filter((l) => l.active)
  const local = live.filter((l) => l.localDelivery?.enabled).map((l) => l.name)
  const pickup = live.filter((l) => l.pickupEnabled).map((l) => l.name)
  const parts = [local.length ? tt("local delivery from {value}", { value: local.join(", ") }) : null, pickup.length ? tt("pickup at {value}", { value: pickup.join(", ") }) : null].filter(Boolean)
  return parts.length ? `${parts.join(", and ")}.` : tt("none yet.")
}

function ProfileCard({
  profile,
  allProfiles,
  products,
  system,
  freshZones,
  carrierApps,
  home: homeProp,
  onProfiles,
  onError,
}: {
  profile: ShippingProfile
  allProfiles: ShippingProfile[]
  products: ShippingProduct[]
  system: UnitSystem
  freshZones: string[]
  carrierApps: CarrierApp[]
  home?: string
  onProfiles: (p: ShippingProfile[], extra?: { shippingProducts?: ShippingProduct[] }) => void
  onError: (e: string | null) => void
}) {
  const [addingZone, setAddingZone] = React.useState(false)
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const taken = profile.zones.flatMap((z) => z.countries)
  const takenRegions = profile.zones.flatMap((z) => z.regions ?? [])
  const hasRow = profile.zones.some((z) => z.restOfWorld)
  const custom = new Set(allProfiles.filter((p) => !p.isDefault).map((p) => p.id))
  /* The general profile ships every product not in a custom one (or in one that was deleted). */
  const mine = profile.isDefault ? products.filter((p) => !p.profileId || !custom.has(p.profileId)) : products.filter((p) => p.profileId === profile.id)
  const home = homeProp || storeCountry()
  const startHome = async () => {
    const r = await api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/zones", { body: { profileId: profile.id, name: countryName(home), countries: [home], regions: [] } })
    if (!r.ok) return onError(r.error)
    onProfiles(r.data.profiles)
  }
  return (
    <Card
      title={
        renaming !== null ? (
          <span className="flex items-center gap-2">
            <TextInput autoFocus value={renaming} maxLength={80} aria-label={tt("Profile name")} onChange={(e) => setRenaming(e.target.value)} className="h-9 max-w-[260px]" />
            <button
              type="button"
              className={cn(BTN_PRIMARY, "h-9")}
              disabled={!renaming.trim()}
              onClick={async () => {
                const r = await api<{ profiles: ShippingProfile[]; shippingProducts: ShippingProduct[] }>(`/api/physical/shipping/profiles/${profile.id}`, { method: "PATCH", body: { name: renaming } })
                if (!r.ok) return onError(r.error)
                onProfiles(r.data.profiles, { shippingProducts: r.data.shippingProducts })
                setRenaming(null)
              }}
            >
              {tt("Save")}
            </button>
            <button type="button" className={cn(BTN_GHOST, "h-9")} onClick={() => setRenaming(null)}>
              {tt("Cancel")}
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {profile.name}
            {profile.isDefault ? <Pill tone="gray">{tt("Default")}</Pill> : null}
          </span>
        )
      }
      description={profile.isDefault ? tt("Every physical product uses these rates, unless it's in a custom profile.") : tt("Only the products below use these rates.")}
      action={
        renaming !== null ? null : (
          <div className="flex gap-1">
            <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("Rename {name}", { name: profile.name })} onClick={() => setRenaming(profile.name)}>
              <Pencil className="h-4 w-4" />
            </button>
            {profile.isDefault ? null : (
              <button
                type="button"
                className={cn(BTN_GHOST, "w-9 px-0")}
                aria-label={tt("Delete {name}", { name: profile.name })}
                onClick={async () => {
                  if (!window.confirm(tt("Delete {name}? Its products will use the default rates.", { name: profile.name }))) return
                  const r = await api<{ profiles: ShippingProfile[]; shippingProducts: ShippingProduct[] }>(`/api/physical/shipping/profiles/${profile.id}`, { method: "DELETE" })
                  if (!r.ok) return onError(r.error)
                  onProfiles(r.data.profiles, { shippingProducts: r.data.shippingProducts })
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-3" data-shipping-profile={profile.isDefault ? "default" : "custom"}>
        <ProfileProducts profile={profile} mine={mine} all={products} profiles={allProfiles} onProfiles={onProfiles} onError={onError} />
        {profile.zones.length === 0 && !addingZone ? (
          <div className="rounded-xl border border-dashed border-[#e5e7eb] px-3 py-3">
            <p className={MUTED}>{tt("No zones yet. A zone is a group of countries or states you ship to at the same rates.")}</p>
            {home ? (
              <button type="button" className={cn(BTN_SECONDARY, "mt-2")} onClick={startHome} data-start-home={home}>
                <CountryFlag code={home} className="h-[12px] w-[18px]" />
                {tt("Start with {count}", { count: countryName(home) })}
              </button>
            ) : null}
          </div>
        ) : null}
        {profile.zones.map((z) => (
          <ZoneBlock key={z.id} zone={z} taken={taken} takenRegions={takenRegions} system={system} fresh={freshZones.includes(z.id)} carrierApps={carrierApps} onProfiles={onProfiles} onError={onError} />
        ))}
        {addingZone ? (
          <ZoneForm
            taken={taken}
            takenRegions={takenRegions}
            canRestOfWorld={!hasRow}
            onCancel={() => setAddingZone(false)}
            onSave={async (zone) => {
              const r = await api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/zones", { body: { profileId: profile.id, ...zone } })
              if (!r.ok) return r.error
              onProfiles(r.data.profiles)
              setAddingZone(false)
              return null
            }}
          />
        ) : (
          <button type="button" className={BTN_SECONDARY} onClick={() => setAddingZone(true)}>
            <Plus className="h-4 w-4" />
            {tt("Add shipping zone")}
          </button>
        )}
      </div>
    </Card>
  )
}

/**
 * WHICH PRODUCTS A PROFILE SHIPS. The general one lists what it covers and
 * points to the custom ones; a custom one picks its products here (or in
 * the product's own Shipping card, which writes the same column). Moving a
 * product out puts it back on the general rates.
 */
function ProfileProducts({
  profile,
  mine,
  all,
  profiles,
  onProfiles,
  onError,
}: {
  profile: ShippingProfile
  mine: ShippingProduct[]
  all: ShippingProduct[]
  profiles: ShippingProfile[]
  onProfiles: (p: ShippingProfile[], extra?: { shippingProducts?: ShippingProduct[] }) => void
  onError: (e: string | null) => void
}) {
  const [picking, setPicking] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id && !p.isDefault)?.name ?? null
  const move = async (add: string[], remove: string[]) => {
    setBusy(true)
    const r = await api<{ profiles: ShippingProfile[]; shippingProducts: ShippingProduct[] }>(`/api/physical/shipping/profiles/${profile.id}`, { method: "PATCH", body: { addProductIds: add, removeProductIds: remove } })
    setBusy(false)
    if (!r.ok) return onError(r.error)
    onProfiles(r.data.profiles, { shippingProducts: r.data.shippingProducts })
  }
  const summary = mine.length === 0 ? tt("No products") : mine.length <= 2 ? mine.map((p) => p.title).join(", ") : tt("{value} and {value2} more", { value: mine.slice(0, 2).map((p) => p.title).join(", "), value2: mine.length - 2 })
  if (profile.isDefault) {
    return (
      <p className="text-[13px] text-[#6b7280]" data-profile-products={mine.length}>
        {all.length === 0 ? tt("No physical products yet.") : tt("{length} of {length2, plural, one {# product} other {# products}}: {summary}.", { length: mine.length, length2: all.length, summary })}
      </p>
    )
  }
  const q = query.trim().toLowerCase()
  const list = all.filter((p) => !q || p.title.toLowerCase().includes(q))
  return (
    <div className="rounded-xl border border-[#eceef1] bg-white" data-profile-products={mine.length}>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">
            {tt("{n, plural, one {# product} other {# products}}", { n: mine.length })}
          </p>
          <p className="truncate text-[12.5px] text-[#6b7280]">{mine.length ? summary : tt("Add the products that ship at these rates.")}</p>
        </div>
        <button type="button" className={cn(BTN_SECONDARY, "shrink-0")} onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          {picking ? tt("Done") : mine.length ? tt("Change") : tt("Add products")}
        </button>
      </div>
      {picking ? (
        <div className="space-y-2 border-t border-[#eceef1] p-3">
          {all.length === 0 ? (
            <p className={MUTED}>{tt("No physical products yet.")}</p>
          ) : (
            <>
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search products")} aria-label={tt("Search products")} />
              <ul className="max-h-[260px] overflow-y-auto rounded-lg border border-[#eceef1]">
                {list.map((p) => {
                  const on = p.profileId === profile.id
                  const other = !on ? nameOf(p.profileId) : null
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-pressed={on}
                        onClick={() => void move(on ? [] : [p.id], on ? [p.id] : [])}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-[#1a1a2e] hover:bg-[#f7f7f8] disabled:opacity-60"
                      >
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white")}>{on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}</span>
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <span className="h-7 w-7 shrink-0 rounded-md bg-[#f1f2f4]" />}
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        {other ? <span className="shrink-0 text-[12px] text-[#9ca3af]">{tt("In {other}", { other })}</span> : null}
                      </button>
                    </li>
                  )
                })}
                {list.length === 0 ? <li className="px-3 py-3 text-[13.5px] text-[#6b7280]">{tt("No product matches.")}</li> : null}
              </ul>
              <p className="text-[12px] text-[#6b7280]">{tt("Picking a product in another profile moves it here.")}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ZoneForm({
  initial,
  taken,
  takenRegions,
  canRestOfWorld,
  onCancel,
  onSave,
}: {
  initial?: ShippingZone
  taken: string[]
  takenRegions: string[]
  canRestOfWorld: boolean
  onCancel: () => void
  onSave: (z: { name: string; countries: string[]; regions: string[]; restOfWorld: boolean }) => Promise<string | null>
}) {
  const [name, setName] = React.useState(initial?.name ?? "")
  const [countries, setCountries] = React.useState<string[]>(initial?.countries ?? [])
  const [regions, setRegions] = React.useState<string[]>(initial?.regions ?? [])
  const [row, setRow] = React.useState(initial?.restOfWorld ?? false)
  const [statesFor, setStatesFor] = React.useState<string | null>(() => (initial?.regions?.[0] ? initial.regions[0].split("-")[0] : null))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const otherRegions = takenRegions.filter((r) => !initial?.regions?.includes(r))
  const otherCountries = taken.filter((c) => !initial?.countries.includes(c))
  const defaultName = () => {
    if (row) return tt("Rest of world")
    if (countries.length === 1 && regions.length === 0) return countryName(countries[0])
    if (regions.length === 0 && countries.length === EU_COUNTRIES.length && EU_COUNTRIES.every((c) => countries.includes(c))) return tt("European Union")
    const of = [...new Set(regions.map((r) => r.split("-")[0]))]
    if (countries.length === 0 && regions.length === 1) return regionLabel(regions[0])
    /* States of one country: "Canada" when all, "Canada, 3 provinces" when some. */
    if (countries.length === 0 && of.length === 1) {
      const total = regionsOf(of[0]).length
      return regions.length >= total
        ? countryName(of[0])
        : of[0] === "CA"
          ? tt("{country}, {n, plural, one {# province} other {# provinces}}", { country: countryName(of[0]), n: regions.length })
          : tt("{country}, {n, plural, one {# state} other {# states}}", { country: countryName(of[0]), n: regions.length })
    }
    return tt("Zone")
  }
  const statesOf = (cc: string) => regionsOf(cc).map((r) => `${cc}-${r.code}`)
  const pickCountries = (next: string[]) => {
    setCountries(next)
    /* A country chosen whole covers its states: their own picks are dropped. */
    setRegions((prev) => prev.filter((r) => !next.includes(r.split("-")[0])))
  }
  /* One tap for the 27 member states (lib/markets/regions.ts), less any already in another zone. */
  const euFree = EU_COUNTRIES.filter((c) => !otherCountries.includes(c))
  const euOn = euFree.length > 0 && euFree.every((c) => countries.includes(c))
  const freeStates = statesFor ? statesOf(statesFor).filter((k) => !otherRegions.includes(k)) : []
  const allStatesOn = freeStates.length > 0 && freeStates.every((k) => regions.includes(k))
  return (
    <div className="space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3" data-zone-form="">
      <Field label={tt("Zone name")} hint={tt("Only you see this")}>
        <TextInput value={name} maxLength={80} placeholder={row ? tt("Rest of world") : defaultName() === tt("Zone") ? tt("Europe") : defaultName()} onChange={(e) => setName(e.target.value)} />
      </Field>
      {canRestOfWorld || initial?.restOfWorld ? <Toggle label={tt("Rest of world")} description={tt("Every country not in another zone of this profile. Countries where you picked only some states stay out.")} checked={row} onChange={setRow} disabled={!!initial} /> : null}
      {!row ? (
        <div className="flex flex-wrap items-center gap-2" data-zone-quick="">
          <span className="text-[12.5px] text-[#6b7280]">{tt("Quick pick")}</span>
          <button
            type="button"
            aria-pressed={euOn}
            disabled={euFree.length === 0}
            onClick={() => pickCountries(euOn ? countries.filter((c) => !EU_COUNTRIES.includes(c)) : [...new Set([...countries, ...euFree])])}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:opacity-40", euOn ? "border-[#1a1a2e] bg-[#fafafa] text-[#1a1a2e]" : "border-[#e5e7eb] text-[#4b5563] hover:bg-[#f7f7f8]")}
            data-quick-eu={euFree.length}
          >
            {euOn ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
            {tt("EU, {n} countries", { n: euFree.length })}
          </button>
        </div>
      ) : null}
      {!row ? <CountryPicker value={countries} onChange={pickCountries} taken={otherCountries} /> : null}
      {!row ? (
        <div className="rounded-xl border border-[#eceef1] bg-white p-3" data-zone-states="">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">{tt("Only some states or provinces")}</p>
          <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{tt("Pick a country here instead of above to ship to part of it, like the lower 48. States you leave out aren't shipped to, unless another zone has them.")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(REGIONS).map((cc) => {
              const count = regions.filter((r) => r.startsWith(`${cc}-`)).length
              return (
                <button
                  key={cc}
                  type="button"
                  onClick={() => setStatesFor(statesFor === cc ? null : cc)}
                  aria-pressed={statesFor === cc}
                  disabled={countries.includes(cc) || otherCountries.includes(cc)}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium disabled:opacity-40", statesFor === cc ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e5e7eb] text-[#4b5563] hover:bg-[#f7f7f8]")}
                >
                  <CountryFlag code={cc} className="h-[12px] w-[18px]" />
                  {countryName(cc)}
                  {count ? ` (${count})` : ""}
                </button>
              )
            })}
          </div>
          {statesFor && !countries.includes(statesFor) ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[12.5px] text-[#6b7280]">{tt("{length} of {length2} chosen", { length: regions.filter((r) => r.startsWith(`${statesFor}-`)).length, length2: regionsOf(statesFor).length })}</p>
                <button
                  type="button"
                  className={cn(BTN_GHOST, "h-8 px-2.5")}
                  onClick={() => setRegions((prev) => (allStatesOn ? prev.filter((r) => !r.startsWith(`${statesFor}-`)) : [...new Set([...prev, ...freeStates])]))}
                >
                  {allStatesOn ? tt("Clear") : tt("Select all")}
                </button>
              </div>
              <div className="mt-1 grid max-h-[220px] grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-3">
                {regionsOf(statesFor).map((r) => {
                  const key = `${statesFor}-${r.code}`
                  const takenHere = otherRegions.includes(key)
                  return (
                    <label key={key} className={cn("flex items-center gap-2 py-1 text-[13px]", takenHere ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>
                      <input
                        type="checkbox"
                        disabled={takenHere}
                        checked={regions.includes(key)}
                        onChange={(e) => setRegions((prev) => (e.target.checked ? [...prev, key] : prev.filter((x) => x !== key)))}
                        className="h-4 w-4 rounded border-[#d1d5db] accent-[#1a1a2e]"
                      />
                      {r.name}
                    </label>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          {tt("Cancel")}
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || (!row && countries.length === 0 && regions.length === 0)}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const problem = await onSave({ name: name.trim() || defaultName(), countries, regions: regions.filter((r) => !countries.includes(r.split("-")[0])), restOfWorld: row })
            setBusy(false)
            if (problem) setError(problem)
          }}
        >
          {busy ? tt("Saving") : initial ? tt("Save zone") : tt("Add zone")}
        </button>
      </div>
    </div>
  )
}

function ZoneBlock({ zone, taken, takenRegions, system, fresh, carrierApps, onProfiles, onError }: { zone: ShippingZone; taken: string[]; takenRegions: string[]; system: UnitSystem; fresh?: boolean; carrierApps: CarrierApp[]; onProfiles: (p: ShippingProfile[]) => void; onError: (e: string | null) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [rateForm, setRateForm] = React.useState<ShippingRate | "new" | null>(() => (fresh && zone.rates.length === 0 ? "new" : null))
  const label = zonePlaces(zone)
  if (editing) {
    return (
      <ZoneForm
        initial={zone}
        taken={taken}
        takenRegions={takenRegions}
        canRestOfWorld={false}
        onCancel={() => setEditing(false)}
        onSave={async (z) => {
          const r = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/zones/${zone.id}`, { method: "PATCH", body: { name: z.name, ...(zone.restOfWorld ? {} : { countries: z.countries, regions: z.regions }) } })
          if (!r.ok) return r.error
          onProfiles(r.data.profiles)
          setEditing(false)
          return null
        }}
      />
    )
  }
  const flags = zone.restOfWorld ? [] : [...new Set([...zone.countries, ...(zone.regions ?? []).map((r) => r.split("-")[0])])].slice(0, 4)
  return (
    <div className="rounded-xl border border-[#eceef1]" data-zone={zone.id}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eceef1] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {flags.length ? (
            <span className="flex shrink-0 -space-x-1.5" aria-hidden>
              {flags.map((c) => (
                <CountryFlag key={c} code={c} className="ring-2 ring-white" />
              ))}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{zone.name}</p>
            <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("Edit {name}", { name: zone.name })} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(BTN_GHOST, "w-9 px-0")}
            aria-label={tt("Delete {name}", { name: zone.name })}
            onClick={async () => {
              if (!window.confirm(tt("Delete the {name} zone and its rates?", { name: zone.name }))) return
              const r = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/zones/${zone.id}`, { method: "DELETE" })
              if (!r.ok) return onError(r.error)
              onProfiles(r.data.profiles)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {zone.rates.length === 0 && rateForm === null ? <p className="px-3 pt-2.5 text-[12.5px] text-[#b45309]">{tt("No rate yet, so nothing ships here.")}</p> : null}
      <ul className="divide-y divide-[#f1f2f4]">
        {zone.rates.map((r) =>
          rateForm !== null && rateForm !== "new" && rateForm.id === r.id ? (
            <li key={r.id} className="p-3">
              <RateForm initial={r} system={system} carrierApps={carrierApps} onCancel={() => setRateForm(null)} onSave={async (body) => {
                const res = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/rates/${r.id}`, { method: "PATCH", body })
                if (!res.ok) return res.error
                onProfiles(res.data.profiles)
                setRateForm(null)
                return null
              }} />
            </li>
          ) : (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[14px] text-[#1a1a2e]">
                  {r.name} {!r.active ? <span className="text-[12px] text-[#9ca3af]">{tt("(off)")}</span> : null}
                </p>
                <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{[RATE_KIND_LABEL[r.kind], rateCondition(r, system)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{r.kind === "free" ? "Free" : r.kind === "carrier" ? tt("Live") : r.tiers.length > 1 ? tt("From {amount}", { amount: money(Math.min(...r.tiers.map((t) => t.priceCents))) }) : money(r.priceCents)}</span>
                <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("Edit {name}", { name: r.name })} onClick={() => setRateForm(r)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(BTN_GHOST, "w-9 px-0")}
                  aria-label={tt("Delete {name}", { name: r.name })}
                  onClick={async () => {
                    const res = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/rates/${r.id}`, { method: "DELETE" })
                    if (!res.ok) return onError(res.error)
                    onProfiles(res.data.profiles)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      <div className="px-3 py-2.5">
        {rateForm === "new" ? (
          <RateForm
            system={system}
            carrierApps={carrierApps}
            first={zone.rates.length === 0}
            onCancel={() => setRateForm(null)}
            onSave={async (body) => {
              const res = await api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/rates", { body: { zoneId: zone.id, ...body } })
              if (!res.ok) return res.error
              onProfiles(res.data.profiles)
              setRateForm(null)
              return null
            }}
          />
        ) : (
          <button type="button" className={BTN_GHOST} onClick={() => setRateForm("new")}>
            <Plus className="h-4 w-4" />
            {tt("Add rate")}
          </button>
        )}
      </div>
    </div>
  )
}

interface TierDraft {
  from: string
  price: string
}

export function RateForm({ initial, system, carrierApps = [], first = false, onCancel, onSave }: { initial?: ShippingRate; system: UnitSystem; carrierApps?: CarrierApp[]; first?: boolean; onCancel: () => void; onSave: (body: Record<string, unknown>) => Promise<string | null> }) {
  const unit = weightUnitFor(system)
  const legacy = initial?.kind === "quantity"
  /*
    CARRIER CALCULATED ONLY WITH A CARRIER APP. Its price comes from a
    connected Shippo or EasyPost account; without one the rate is never
    offered at checkout, so the kind is not offered either, and a line says
    where to connect one. A carrier rate made before stays editable.
  */
  const connected = carrierApps.filter((a) => a.connected)
  const canCarrier = connected.length > 0 || initial?.kind === "carrier"
  const carrierChoices = [...connected, ...(initial?.carrier && !connected.some((a) => a.id === initial.carrier) ? [{ id: initial.carrier, name: carrierApps.find((a) => a.id === initial.carrier)?.name ?? initial.carrier, connected: false }] : [])]
  const offered = RATE_KINDS_OFFERED.filter((k) => k !== "carrier" || canCarrier)
  const [carrierApp, setCarrierApp] = React.useState(initial?.carrier ?? connected[0]?.id ?? "shippo")
  const [service, setService] = React.useState(initial?.serviceCode ?? "")
  const [kind, setKind] = React.useState<RateKind>(initial?.kind ?? "flat")
  /* A zone's first rate is Standard; a second one is usually the faster one. */
  const [name, setName] = React.useState(initial?.name ?? (first ? tt("Standard") : tt("Express")))
  const [price, setPrice] = React.useState(initial ? dollarsOf(initial.priceCents) : "")
  const isWeight = (k: RateKind) => k === "weight" || k === "item_weight"
  const valueText = (k: RateKind, n: number | null | undefined) => (n === null || n === undefined ? "" : k === "price" ? (n / 100).toFixed(2) : isWeight(k) ? String(fromGrams(n, unit) ?? "") : String(n))
  const [tiers, setTiers] = React.useState<TierDraft[]>(() => {
    if (initial && initial.tiers.length) return initial.tiers.map((t) => ({ from: valueText(initial.kind, t.from), price: dollarsOf(t.priceCents) }))
    if (initial && (initial.kind === "price" || initial.kind === "weight")) return [{ from: valueText(initial.kind, 0), price: dollarsOf(initial.priceCents) }]
    return [{ from: "0", price: "" }]
  })
  const [max, setMax] = React.useState(initial && initial.kind !== "free" ? valueText(initial.kind, initial.maxValue) : "")
  const [min, setMin] = React.useState(initial ? (initial.kind === "free" ? (initial.minValue ? dollarsOf(initial.minValue) : "") : valueText(initial.kind, initial.minValue)) : "")
  const [freeOver, setFreeOver] = React.useState(initial?.freeOverCents ? dollarsOf(initial.freeOverCents) : "")
  const [minDays, setMinDays] = React.useState(initial?.minDays?.toString() ?? "")
  const [maxDays, setMaxDays] = React.useState(initial?.maxDays?.toString() ?? "")
  const [active, setActive] = React.useState(initial?.active ?? true)
  const [error, setError] = React.useState<string | null>(null)
  const [priceMissing, setPriceMissing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const tiered = kind === "price" || kind === "weight" || kind === "item_weight"
  /* "Free over" is offered where it adds something: a flat price, or weight steps. Price steps do it with a $0 step. */
  const canFreeOver = kind === "flat" || kind === "weight" || kind === "item_weight" || kind === "carrier"
  const toValue = (k: RateKind, t: string): number | null => {
    if (!t.trim()) return null
    if (k === "price") return centsOf(t)
    if (isWeight(k)) return toGrams(t, unit)
    const n = Number(t)
    return Number.isFinite(n) ? Math.round(n) : null
  }
  const valueSuffix = kind === "price" ? undefined : isWeight(kind) ? unit : "items"
  const fromLabel = kind === "price" ? tt("Order price from") : kind === "weight" ? tt("Order weight from") : tt("Item weight from")
  const changeKind = (k: RateKind) => {
    if (tiered && (k === "price") !== (kind === "price")) {
      setTiers([{ from: k === "price" ? "0.00" : "0", price: tiers[0]?.price ?? "" }])
      setMax("")
    }
    setKind(k)
  }
  return (
    <div className="space-y-3 rounded-xl bg-[#fcfcfd]" data-rate-form="">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tt("Name buyers see")} hint={tt("Like Standard or Express")}>
          <TextInput value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={tt("Standard")} />
        </Field>
        <Field label={tt("Delivery estimate")} hint={tt("Business days, shown at checkout")}>
          <div className="flex items-center gap-2">
            <NumberInput value={minDays} onChange={setMinDays} placeholder="3" aria-label={tt("From days")} />
            <span className="text-[13px] text-[#6b7280]">{tt("to")}</span>
            <NumberInput value={maxDays} onChange={setMaxDays} placeholder="5" aria-label={tt("To days")} />
          </div>
        </Field>
      </div>
      {/*
        HOW IT IS PRICED: one list, a radio dot a row, the picked row on a
        light ground. Five bordered cards, the picked one ringed in ink, read
        as five buttons fighting for the eye; this reads as one question.
      */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("How it's priced")}</p>
        <div role="radiogroup" aria-label={tt("How it's priced")} className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" data-rate-kinds="" onKeyDown={radioKeys(legacy ? [...offered, initial!.kind] : offered, kind, changeKind)}>
          {(legacy ? [...offered, initial!.kind] : offered).map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-radio={k}
                onClick={() => changeKind(k)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-[#f0f1f3] px-3.5 py-2.5 text-left outline-none transition-colors duration-150 last:border-b-0 focus-visible:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]",
                  on ? "bg-[#f8f9fa]" : "hover:bg-[#fafafb]",
                )}
                data-rate-kind={k}
              >
                <span aria-hidden className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#c9ccd2] bg-white")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full bg-white transition-transform duration-150", on ? "scale-100" : "scale-0")} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium leading-5 text-[#1a1a2e]">{RATE_KIND_LABEL[k]}</span>
                  <span className="block text-[12.5px] leading-[17px] text-[#6b7280]">{RATE_KIND_LINE[k]}</span>
                </span>
              </button>
            )
          })}
        </div>
        {canCarrier ? null : (
          <p className="pt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]" data-carrier-hidden="">
            {tt("Live rates from a carrier show up here once {apps} is connected.", { apps: carrierApps.map((a) => a.name).join(tt(" or ")) || tt("a shipping app") })}{" "}
            <ReadinessLink plain href="/app/settings?tab=integrations" className="font-medium text-[#1a1a2e] underline underline-offset-2">
              {tt("Go to Integrations")}
            </ReadinessLink>
          </p>
        )}
      </div>

      {kind === "flat" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tt("Price")} hint={tt("0 makes it free")} error={priceMissing ? tt("Enter the price, or 0 for free.") : null}>
            <MoneyInput
              value={price}
              onChange={(v) => {
                setPrice(v)
                setPriceMissing(false)
              }}
              aria-invalid={priceMissing || undefined}
            />
          </Field>
          <Field label={tt("Free over")} hint={tt("Optional: free once the order reaches this")}>
            <MoneyInput value={freeOver} onChange={setFreeOver} placeholder="" />
          </Field>
        </div>
      ) : null}

      {kind === "carrier" ? (
        <div className="grid gap-3 sm:grid-cols-2" data-rate-carrier="">
          <Field label={tt("Rates from")} hint={carrierChoices.some((a) => a.id === carrierApp && !a.connected) ? tt("Not connected, so this rate isn't offered. Connect it in Settings › Integrations.") : tt("Your connected account prices each order for the buyer's address.")}>
            <SelectInput value={carrierApp} onChange={setCarrierApp}>
              {carrierChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.connected ? a.name : tt("{name} (not connected)", { name: a.name })}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={tt("Service")} hint={tt("Optional, like usps_priority (Shippo) or Priority (EasyPost). Empty: the cheapest.")}>
            <TextInput value={service} maxLength={60} onChange={(e) => setService(e.target.value)} placeholder={tt("Cheapest")} />
          </Field>
          <Field label={tt("Free over")} hint={tt("Optional: free once the order reaches this")}>
            <MoneyInput value={freeOver} onChange={setFreeOver} placeholder="" />
          </Field>
        </div>
      ) : null}

      {kind === "free" ? (
        <Field label={tt("Only on orders over")} hint={tt("Optional. Empty: always free.")} className="sm:max-w-[280px]">
          <MoneyInput value={min} onChange={setMin} placeholder="" />
        </Field>
      ) : null}

      {tiered ? (
        <div className="space-y-2 rounded-xl border border-[#eceef1] bg-white p-3">
          <div className="hidden grid-cols-[1fr_1fr_36px] gap-2 text-[12px] font-medium uppercase tracking-[0.02em] text-[#6b7280] sm:grid">
            <span>{fromLabel}</span>
            <span>{kind === "item_weight" ? tt("Price per item") : tt("Shipping price")}</span>
            <span />
          </div>
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2">
              {kind === "price" ? (
                <MoneyInput aria-label={tt("{fromLabel}, step {value}", { fromLabel, value: i + 1 })} value={t.from} disabled={i === 0} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              ) : (
                <DecimalInput aria-label={tt("{fromLabel}, step {value}", { fromLabel, value: i + 1 })} value={t.from} disabled={i === 0} suffix={valueSuffix} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              )}
              <MoneyInput aria-label={tt("Price, step {value}", { value: i + 1 })} value={t.price} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
              {i > 0 ? (
                <button type="button" aria-label={tt("Remove step {value}", { value: i + 1 })} className={cn(BTN_GHOST, "w-9 px-0")} onClick={() => setTiers((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {tiers.length < 20 ? (
              <button type="button" className={BTN_GHOST} onClick={() => setTiers((p) => [...p, { from: "", price: "" }])}>
                <Plus className="h-4 w-4" />
                {tt("Add a step")}
              </button>
            ) : (
              <span />
            )}
            <label className="flex items-center gap-2 text-[13px] text-[#6b7280]">
              {tt("Not offered above")}
              {kind === "price" ? <MoneyInput aria-label={tt("Not offered above")} value={max} onChange={setMax} placeholder="" className="w-[130px]" /> : <DecimalInput aria-label={tt("Not offered above")} value={max} onChange={setMax} suffix={valueSuffix} className="w-[130px]" />}
            </label>
          </div>
          <p className="text-[12px] text-[#6b7280]">
            {kind === "item_weight"
              ? tt("Each item pays the price of the step its weight reaches. Two 0.5 {unit} items at a 0 {unit2} step of $3 pay $6.", { unit, unit2: unit })
              : kind === "weight"
                ? tt("The order pays the price of the last step its weight reaches, products plus your default package. The first step starts from 0.")
                : tt("The order pays the price of the last step it reaches. The first step starts from 0. A $0 step is free shipping from there.")}
          </p>
        </div>
      ) : null}

      {tiered && canFreeOver ? (
        <Field label={tt("Free over")} hint={tt("Optional: free once the order reaches this price")} className="sm:max-w-[280px]">
          <MoneyInput value={freeOver} onChange={setFreeOver} placeholder="" />
        </Field>
      ) : null}

      {kind === "quantity" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tt("Price")}>
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field label={tt("Items from")}>
            <DecimalInput value={min} onChange={setMin} suffix="items" />
          </Field>
          <Field label={tt("Items up to")}>
            <DecimalInput value={max} onChange={setMax} suffix="items" />
          </Field>
        </div>
      ) : null}

      <Toggle label={tt("Offered at checkout")} checked={active} onChange={setActive} />
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex items-center justify-end gap-2">
        {/* A rate being written is not one buyers can use: said, so a closed tab is not taken for a saved rate. */}
        {!initial ? <p className="mr-auto text-[12.5px] text-[#9ca3af]" data-rate-unsaved="">{tt("Not saved until you press Add rate")}</p> : null}
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          {tt("Cancel")}
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={async () => {
            setError(null)
            let tierBody: RateTier[] = []
            if (tiered) {
              for (const [i, t] of tiers.entries()) {
                const from = i === 0 ? 0 : toValue(kind, t.from)
                const priceCents = centsOf(t.price)
                if (from === null || priceCents === null) return setError(tt("Fill in step {value}, or remove it.", { value: i + 1 }))
                tierBody.push({ from, priceCents })
              }
              tierBody = tierBody.sort((a, b) => a.from - b.from)
            }
            if (kind === "flat" && centsOf(price) === null) return setPriceMissing(true)
            setBusy(true)
            const problem = await onSave({
              kind,
              name,
              priceCents: kind === "free" || kind === "carrier" ? 0 : tiered ? (tierBody[0]?.priceCents ?? 0) : centsOf(price),
              ...(kind === "carrier" ? { carrier: carrierApp, serviceCode: service.trim() || null } : {}),
              tiers: tierBody,
              minValue: kind === "free" ? centsOf(min) : kind === "quantity" ? toValue(kind, min) : null,
              maxValue: tiered || kind === "quantity" ? toValue(kind, max) : null,
              freeOverCents: canFreeOver ? centsOf(freeOver) : null,
              minDays: minDays || null,
              maxDays: maxDays || null,
              active,
            })
            setBusy(false)
            if (problem) setError(problem)
          }}
        >
          {busy ? tt("Saving") : initial ? tt("Save rate") : tt("Add rate")}
        </button>
      </div>
    </div>
  )
}

/* ── Locations ─────────────────────────────────────────────────────────── */

function Locations({ data, reload, setData }: { data: Data; reload: () => void; setData: SetData }) {
  const [editing, setEditing] = React.useState<Location | "new" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [savedId, setSavedId] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  /*
    SAVED, BACK TO THE LIST. The form closes on the location as the server
    kept it, drawn in its place at once (not the old row until a reload
    lands), scrolled into view if the form was long, and marked Saved for a
    moment so the eye finds it.
  */
  const saved = (l: Location, message?: string | null) => {
    setNotice(message ?? null)
    setData((d) => (d ? { ...d, locations: d.locations.some((x) => x.id === l.id) ? d.locations.map((x) => (x.id === l.id ? l : x)) : [...d.locations, l] } : d))
    setEditing(null)
    setSavedId(l.id)
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-location="${l.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    window.setTimeout(() => setSavedId((id) => (id === l.id ? null : id)), 2200)
    reload()
  }
  const makeDefault = async (id: string) => {
    const r = await api("/api/physical/settings", { method: "PUT", body: { defaultLocationId: id } })
    if (!r.ok) return setError(r.error)
    reload()
  }
  return (
    <div className="space-y-4">
      <Card title={tt("Locations")} description={tt("Where you keep stock, where orders ship from, and where buyers can pick up.")} help="locations" action={editing === null ? <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")}><Plus className="h-4 w-4" />{tt("Add location")}</button> : null}>
        {notice ? <Notice tone="gray" className="mb-3">{notice}</Notice> : null}
        {error ? <Notice className="mb-3">{error}</Notice> : null}
        {editing === "new" ? <LocationForm startCountry={data.origin?.country || storeCountry()} onCancel={() => setEditing(null)} onSaved={saved} /> : null}
        {data.locations.length === 0 && editing === null ? <Empty title={tt("No locations yet")}>{tt("Add the place your stock is kept, even if it's your home.")}</Empty> : null}
        <ul className="space-y-2" ref={listRef}>
          {data.locations.map((l) =>
            editing !== null && editing !== "new" && editing.id === l.id ? (
              <li key={l.id}>
                <LocationForm initial={l} onCancel={() => setEditing(null)} onSaved={saved} />
              </li>
            ) : (
              <li key={l.id} data-location={l.id} className={cn("flex items-start justify-between gap-3 rounded-xl border px-3 py-3 transition-colors duration-500", savedId === l.id ? "border-[#1a1a2e]/30 bg-[#f6f7f9]" : "border-[#eceef1]", !l.active && "opacity-60")}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
                    {l.name}
                    {data.settings.defaultLocationId === l.id ? <Pill tone="gray">{tt("Default")}</Pill> : null}
                    {!l.active ? <Pill tone="gray">{tt("Off")}</Pill> : null}
                    {l.forwarding === "email" ? <Pill tone="blue">{tt("Emails orders")}</Pill> : l.forwarding === "webhook" ? <Pill tone="blue">{tt("Webhook")}</Pill> : partnerPill(l) ? <Pill tone={partnerPill(l)!.tone}><span data-location-partner={l.partner?.connected ? "connected" : "off"}>{partnerPill(l)!.label}</span></Pill> : null}
                    {l.pickupEnabled && l.active ? <Pill tone="green">{tt("Local pickup")}</Pill> : null}
                    {l.localDelivery?.enabled && l.active ? <Pill tone="green">{tt("Local delivery")}</Pill> : null}
                    {savedId === l.id ? (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#047857]">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {tt("Saved")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[13px] text-[#6b7280]">{[KIND_LABEL[l.kind], [l.city, l.country ? countryName(l.country) : null].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
                  {l.pickupEnabled && l.active ? <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{tt("Pickup ready in")} {PICKUP_READY_SHORT[l.pickupReady]}{l.pickupHours ? tt(" · Open {pickupHours}", { pickupHours: l.pickupHours }) : ""}</p> : null}
                  {l.localDelivery?.enabled && l.active ? <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{tt("Delivers to {codes}", { codes: codesText(l.localDelivery.codes) })} · {l.localDelivery.priceCents ? money(l.localDelivery.priceCents) : "Free"}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {data.settings.defaultLocationId !== l.id && l.active ? (
                    <button type="button" className={BTN_GHOST} onClick={() => makeDefault(l.id)}>
                      {tt("Make default")}
                    </button>
                  ) : null}
                  <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("Edit {name}", { name: l.name })} onClick={() => setEditing(l)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={cn(BTN_GHOST, "w-9 px-0")}
                    aria-label={tt("Delete {name}", { name: l.name })}
                    onClick={async () => {
                      if (!window.confirm(tt("Remove {name}?", { name: l.name }))) return
                      const r = await api<{ message?: string }>(`/api/physical/locations/${l.id}`, { method: "DELETE" })
                      if (!r.ok) return setError(r.error)
                      if (r.data.message) setNotice(r.data.message)
                      reload()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  )
}

/** "400, 401 and 3 more": a location's local delivery codes in a line. */
function codesText(codes: string[]): string {
  return codes.length <= 3 ? codes.join(", ") : tt("{value} and {value2} more", { value: codes.slice(0, 2).join(", "), value2: codes.length - 2 })
}

/** Settings › Store details' country ("New locations and tax start here"), from what Settings read ahead; empty when none is saved. */
function storeCountry(): string {
  return peekGet<{ settings?: { defaultCountry?: string | null } }>("/api/store/settings")?.settings?.defaultCountry ?? ""
}

function LocationForm({ initial, startCountry = "", onCancel, onSaved }: { initial?: Location; startCountry?: string; onCancel: () => void; onSaved: (l: Location, message?: string | null) => void }) {
  const [f, setF] = React.useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? ("home" as LocationKind),
    addressLine1: initial?.addressLine1 ?? "",
    addressLine2: initial?.addressLine2 ?? "",
    city: initial?.city ?? "",
    region: initial?.region ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? startCountry,
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    active: initial?.active ?? true,
    fulfillsOrders: initial?.fulfillsOrders ?? true,
    forwarding: initial?.forwarding ?? "none",
    pickupEnabled: initial?.pickupEnabled ?? false,
    pickupReady: initial?.pickupReady ?? ("24h" as PickupReady),
    pickupInstructions: initial?.pickupInstructions ?? "",
    pickupHours: initial?.pickupHours ?? "",
  })
  /* Local delivery, typed in the shop's money: dollars here, cents on the wire. */
  const [local, setLocal] = React.useState(() => ({
    enabled: initial?.localDelivery?.enabled ?? false,
    codes: (initial?.localDelivery?.codes ?? []).join(", "),
    price: initial?.localDelivery ? dollarsOf(initial.localDelivery.priceCents) : "",
    min: initial?.localDelivery?.minOrderCents ? dollarsOf(initial.localDelivery.minOrderCents) : "",
    freeOver: initial?.localDelivery?.freeOverCents ? dollarsOf(initial.localDelivery.freeOverCents) : "",
    note: initial?.localDelivery?.note ?? "",
  }))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  /* The type sets sensible answers below it: a partner ships and gets the orders by email, and nobody picks up from them; your own place ships itself. */
  const setKind = (kind: LocationKind) =>
    setF((x) => {
      const partner = PARTNER_KINDS.includes(kind)
      const wasPartner = PARTNER_KINDS.includes(x.kind)
      if (partner && !wasPartner) return { ...x, kind, forwarding: x.forwarding === "none" ? "email" : x.forwarding, pickupEnabled: false }
      if (!partner && wasPartner) return { ...x, kind, forwarding: x.forwarding === "email" || x.forwarding === "provider" ? "none" : x.forwarding }
      return { ...x, kind }
    })
  const partner = PARTNER_KINDS.includes(f.kind)
  const format = addressFormat(f.country)
  const postalOff = !!f.postalCode.trim() && !postalLooksRight(f.country, f.postalCode)
  return (
    <div className="mb-3 space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tt("Name")} hint={f.pickupEnabled ? tt("Buyers see it when they choose pickup") : tt("Only you see this")}>
          <TextInput autoFocus={!initial} value={f.name} maxLength={80} placeholder={partner ? "Printful" : tt("Studio")} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={tt("Type")} hint={partner ? tt("A partner who packs and ships for you") : tt("A place of your own")}>
          <SelectInput value={f.kind} onChange={(v) => setKind(v as LocationKind)}>
            {(Object.keys(KIND_LABEL) as LocationKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </SelectInput>
        </Field>
        {/* COUNTRY FIRST, then the address the way that country writes it (lib/address/format): a State and ZIP code in the US, a Postcode and no state in the UK, a County in Romania. */}
        <Field label={tt("Country")} className="sm:col-span-2">
          <SelectInput value={f.country} onChange={(v) => set({ country: v, region: regionsOf(v).some((r) => r.code === f.region || r.name === f.region) ? f.region : "" })}>
            <option value="">{tt("Choose")}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label={partner ? tt("Address (optional)") : tt("Address")}
          hint={partner ? tt("Where the partner ships from, if you know it. For your own records.") : f.pickupEnabled ? tt("Where buyers collect their orders. For your default location, it's also where return emails tell buyers to send items.") : tt("Where parcels leave from. For your default location, it's also where return emails tell buyers to send items.")}
          className="sm:col-span-2"
        >
          <TextInput value={f.addressLine1} maxLength={200} placeholder={tt("Street and number")} onChange={(e) => set({ addressLine1: e.target.value })} autoComplete="address-line1" />
        </Field>
        <Field label={tt("Apartment, suite, floor (optional)")} className="sm:col-span-2">
          <TextInput value={f.addressLine2} maxLength={200} placeholder={tt("Apartment 4, 2nd floor")} onChange={(e) => set({ addressLine2: e.target.value })} autoComplete="address-line2" />
        </Field>
        <Field label={tt("City")}>
          <TextInput value={f.city} maxLength={120} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" />
        </Field>
        {format.region ? (
          <Field label={format.region.required ? format.region.label : tt("{label} (optional)", { label: format.region.label })}>
            {regionsOf(f.country).length ? (
              <SelectInput value={regionsOf(f.country).find((r) => r.code === f.region || r.name === f.region)?.code ?? ""} onChange={(v) => set({ region: v })}>
                <option value="">{tt("Choose")}</option>
                {regionsOf(f.country).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </SelectInput>
            ) : (
              <TextInput value={f.region} maxLength={120} onChange={(e) => set({ region: e.target.value })} autoComplete="address-level1" />
            )}
          </Field>
        ) : null}
        <Field label={format.postal.required ? format.postal.label : tt("{label} (optional)", { label: format.postal.label })} hint={postalOff ? tt("That doesn't look like a {value}{value2}.", { value: format.postal.label.replace(/ \(.*\)$/, ""), value2: format.postal.example ? tt(", like {example}", { example: format.postal.example }) : "" }) : undefined}>
          <TextInput value={f.postalCode} maxLength={20} onChange={(e) => set({ postalCode: e.target.value })} autoComplete="postal-code" placeholder={format.postal.example} />
        </Field>
        <Field label={tt("Who ships the orders?")} className="sm:col-span-2" hint={f.forwarding === "provider" && initial ? partnerSentence({ ...initial, forwarding: "provider" }) : FORWARDING_HELP[f.forwarding]}>
          <SelectInput value={f.forwarding} onChange={(v) => set({ forwarding: v as typeof f.forwarding })}>
            <option value="none">{tt("I do, from here")}</option>
            <option value="email">{tt("A partner: email each order to them")}</option>
            <option value="webhook">{tt("My own system: send each order to my webhook")}</option>
            {/* Only on the location Printful or Printify made when it was connected (Settings › Integrations); never offered for another. */}
            {initial?.forwarding === "provider" ? <option value="provider">{initial.partner ? `${initial.partner.name}${initial.partner.connected ? "" : tt(" (not connected)")}` : tt("A fulfillment provider (not connected)")}</option> : null}
          </SelectInput>
        </Field>
        {/* The email is only asked for when it's used: orders are emailed there. */}
        {f.forwarding === "email" ? (
          <Field label={tt("Orders email")} hint={tt("Each new order for this location is sent here")}>
            <TextInput value={f.email} maxLength={254} inputMode="email" placeholder="orders@partner.com" onChange={(e) => set({ email: e.target.value })} />
          </Field>
        ) : null}
        <Field label={tt("Phone (optional)")} hint={tt("Kept with the location for you and couriers. Buyers don't see it.")}>
          <TextInput value={f.phone} maxLength={40} inputMode="tel" placeholder="+40 712 345 678" onChange={(e) => set({ phone: e.target.value })} />
        </Field>
      </div>
      {/*
        WHAT HAPPENS HERE, in one list rather than a toggle, a card with a
        toggle in it and another toggle under it. Pickup's details open
        under its own switch. Active is for a location that already exists:
        a new one is active, and turning one off is how it is kept without
        being used.
      */}
      <div className="divide-y divide-[#eceef1] rounded-xl border border-[#eceef1] bg-white px-3" data-location-uses="">
        <div className="py-3">
          <Toggle label={tt("Ships orders from here")} description={tt("Off to keep stock here without shipping from it.")} checked={f.fulfillsOrders} onChange={(v) => set({ fulfillsOrders: v })} />
        </div>
        {partner ? null : <div className="py-3">
          <Toggle
            label={
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[#6b7280]" aria-hidden />
                {tt("Local pickup")}
              </span>
            }
            description={tt("Buyers can collect their order here for free instead of having it shipped.")}
            checked={f.pickupEnabled}
            onChange={(v) => set({ pickupEnabled: v })}
          />
          {f.pickupEnabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Field label={tt("Usually ready in")} hint={tt("Shown at checkout")}>
                <SelectInput value={f.pickupReady} onChange={(v) => set({ pickupReady: v as PickupReady })}>
                  {PICKUP_READY.map((r) => (
                    <option key={r} value={r}>
                      {PICKUP_READY_SHORT[r]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label={tt("Opening hours")} hint={tt("When buyers can come. Shown at checkout and in the pickup email.")}>
                <TextInput value={f.pickupHours} maxLength={300} placeholder={tt("Mon to Fri 9:00 to 17:00, Sat 10:00 to 14:00")} onChange={(e) => set({ pickupHours: e.target.value })} />
              </Field>
              <Field label={tt("Pickup instructions")} hint={tt("Sent with the order confirmation and when it's ready")} className="sm:col-span-2">
                <textarea
                  value={f.pickupInstructions}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => set({ pickupInstructions: e.target.value })}
                  placeholder={tt("Which door, opening hours, what to bring")}
                  className={cn(FIELD, "h-auto min-h-[84px] py-2 leading-5")}
                />
              </Field>
            </div>
          ) : null}
        </div>}
        {partner ? null : (
          <div className="py-3" data-local-delivery-form="">
            <Toggle
              label={tt("Local delivery")}
              description={tt("You bring orders to buyers nearby, by postal code. Offered at checkout next to shipping.")}
              checked={local.enabled}
              onChange={(v) => setLocal((x) => ({ ...x, enabled: v }))}
            />
            {local.enabled ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label={tt("Postal codes")} hint={tt("In {value}. Separate with commas. A code covers every postal code that starts with it, so 400 covers 400001.", { value: f.country ? countryName(f.country) : tt("this location's country") })} className="sm:col-span-3">
                  <textarea
                    value={local.codes}
                    rows={2}
                    maxLength={6000}
                    onChange={(e) => setLocal((x) => ({ ...x, codes: e.target.value }))}
                    placeholder={format.postal.example ? `${format.postal.example}, ${format.postal.example.slice(0, 3)}` : "400, 401"}
                    className={cn(FIELD, "h-auto min-h-[64px] py-2 leading-5")}
                    aria-label={tt("Postal codes")}
                  />
                </Field>
                <Field label={tt("Delivery price")}>
                  <MoneyInput value={local.price} onChange={(v) => setLocal((x) => ({ ...x, price: v }))} />
                </Field>
                <Field label={tt("Minimum order")} hint={tt("Optional")}>
                  <MoneyInput value={local.min} onChange={(v) => setLocal((x) => ({ ...x, min: v }))} placeholder="" />
                </Field>
                <Field label={tt("Free over")} hint={tt("Optional")}>
                  <MoneyInput value={local.freeOver} onChange={(v) => setLocal((x) => ({ ...x, freeOver: v }))} placeholder="" />
                </Field>
                <Field label={tt("Delivery information")} hint={tt("Shown at checkout and in the order confirmation")} className="sm:col-span-3">
                  <TextInput value={local.note} maxLength={500} placeholder={tt("We deliver Tuesdays and Fridays, between 17:00 and 20:00")} onChange={(e) => setLocal((x) => ({ ...x, note: e.target.value }))} />
                </Field>
              </div>
            ) : null}
          </div>
        )}
        {initial ? (
          <div className="py-3">
            <Toggle label={tt("In use")} description={tt("Off to keep this location without shipping from it or offering pickup.")} checked={f.active} onChange={(v) => set({ active: v })} />
          </div>
        ) : null}
      </div>
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          {tt("Cancel")}
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const localDelivery = partner
              ? { enabled: false, codes: [] }
              : { enabled: local.enabled, codes: local.codes, priceCents: centsOf(local.price) ?? 0, minOrderCents: centsOf(local.min), freeOverCents: centsOf(local.freeOver), note: local.note }
            const r = await api<{ location: Location; message?: string }>(initial ? `/api/physical/locations/${initial.id}` : "/api/physical/locations", { method: initial ? "PATCH" : "POST", body: { ...f, localDelivery } })
            setBusy(false)
            if (!r.ok) return setError(r.error)
            onSaved(r.data.location, r.data.message ?? null)
          }}
        >
          {busy ? tt("Saving") : initial ? tt("Save location") : tt("Add location")}
        </button>
      </div>
    </div>
  )
}

/* ── Packages ──────────────────────────────────────────────────────────── */

/**
 * THE BOXES AN ORDER GOES IN. The default one's empty weight is added to
 * every parcel for weight based rates (lib/physical/rates.ts quoteDelivery,
 * once per shipping profile in the cart), so a 300 g book in a 200 g box
 * prices as 500 g. Sizes and weights are typed in the shop's units and kept
 * in millimetres and grams.
 */
function Packages({ data, setData }: { data: Data; setData: SetData }) {
  const system = data.settings.unitSystem ?? "metric"
  const [editing, setEditing] = React.useState<Pack | "new" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const put = (packages: Pack[]) => setData((d) => (d ? { ...d, packages } : d))
  const small = smallWeightUnitFor(system)
  return (
    <Card
      title={tt("Packages")}
      description={tt("The boxes and mailers you ship in. The default one's weight is added to the order for weight based rates.")}
      help="packages"
      action={editing === null ? <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")}><Plus className="h-4 w-4" />{tt("Add package")}</button> : null}
    >
      {error ? <Notice className="mb-3">{error}</Notice> : null}
      {editing === "new" ? <PackageForm system={system} first={data.packages.length === 0} onCancel={() => setEditing(null)} onSaved={(p) => { put(p); setEditing(null) }} /> : null}
      {data.packages.length === 0 && editing === null ? <Empty title={tt("No packages yet")}>{tt("Add the box or mailer you use most. Without one, weight based rates count the products alone.")}</Empty> : null}
      <ul className="space-y-2">
        {data.packages.map((p) =>
          editing !== null && editing !== "new" && editing.id === p.id ? (
            <li key={p.id}>
              <PackageForm system={system} initial={p} onCancel={() => setEditing(null)} onSaved={(list) => { put(list); setEditing(null) }} />
            </li>
          ) : (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-2.5" data-package={p.id}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                  {p.name}
                  {p.isDefault ? <Pill tone="gray">{tt("Default")}</Pill> : null}
                </p>
                <p className="text-[12.5px] text-[#6b7280]">
                  {PACKAGE_KIND[p.kind]} · {formatSize(p.lengthMm, p.widthMm, p.heightMm, system)}
                  {p.weightGrams ? tt(" · {value} {small} empty", { value: fromGrams(p.weightGrams, small), small }) : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!p.isDefault ? (
                  <button type="button" className={BTN_GHOST} onClick={async () => { const r = await api<{ packages: Pack[] }>(`/api/physical/packages/${p.id}`, { method: "PATCH", body: { makeDefault: true } }); if (r.ok) put(r.data.packages); else setError(r.error) }}>
                    {tt("Make default")}
                  </button>
                ) : null}
                <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("Edit {name}", { name: p.name })} onClick={() => setEditing(p)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(BTN_GHOST, "w-9 px-0")}
                  aria-label={tt("Delete {name}", { name: p.name })}
                  onClick={async () => {
                    if (!window.confirm(tt("Delete {name}?", { name: p.name }))) return
                    const r = await api<{ packages: Pack[] }>(`/api/physical/packages/${p.id}`, { method: "DELETE" })
                    if (r.ok) put(r.data.packages)
                    else setError(r.error)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </Card>
  )
}

const PACKAGE_KIND: Record<Pack["kind"], string> = { get box() { return tt("Box") }, get envelope() { return tt("Envelope") }, get soft_package() { return tt("Soft package") } }

/** A common starting size per kind, in the shop's units, so a first package is one tap from done. */
const PACKAGE_START: Record<UnitSystem, Record<Pack["kind"], { l: string; w: string; h: string; weight: string }>> = {
  metric: { box: { l: "30", w: "20", h: "10", weight: "200" }, envelope: { l: "32", w: "23", h: "0", weight: "20" }, soft_package: { l: "35", w: "25", h: "5", weight: "30" } },
  imperial: { box: { l: "12", w: "8", h: "4", weight: "7" }, envelope: { l: "12.5", w: "9.5", h: "0", weight: "1" }, soft_package: { l: "14", w: "10", h: "2", weight: "1" } },
}

function PackageForm({ system, initial, first = false, onCancel, onSaved }: { system: UnitSystem; initial?: Pack; first?: boolean; onCancel: () => void; onSaved: (packages: Pack[]) => void }) {
  const dim = dimensionUnitFor(system)
  const small = smallWeightUnitFor(system)
  const start = PACKAGE_START[system].box
  const [f, setF] = React.useState(() =>
    initial
      ? { name: initial.name, kind: initial.kind as Pack["kind"], l: String(fromMm(initial.lengthMm, dim) ?? ""), w: String(fromMm(initial.widthMm, dim) ?? ""), h: String(fromMm(initial.heightMm, dim) ?? ""), weight: String(fromGrams(initial.weightGrams, small) ?? "") }
      : { name: first ? "Standard box" : "", kind: "box" as Pack["kind"], ...start },
  )
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const setKind = (kind: Pack["kind"]) =>
    setF((x) => {
      /* Untouched sizes follow the kind; typed ones stay. */
      const was = PACKAGE_START[system][x.kind]
      const untouched = x.l === was.l && x.w === was.w && x.h === was.h && x.weight === was.weight
      return untouched && !initial ? { ...x, kind, ...PACKAGE_START[system][kind] } : { ...x, kind }
    })
  return (
    <div className="mb-3 space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3" data-package-form="">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tt("Name")} hint={tt("Only you see this")}>
          <TextInput autoFocus={!initial} value={f.name} maxLength={80} placeholder={tt("Small box")} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={tt("Type")}>
          <SelectInput value={f.kind} onChange={(v) => setKind(v as Pack["kind"])}>
            <option value="box">{tt("Box")}</option>
            <option value="envelope">{tt("Envelope")}</option>
            <option value="soft_package">{tt("Soft package")}</option>
          </SelectInput>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Field label={tt("Length")}>
          <DecimalInput value={f.l} onChange={(v) => setF({ ...f, l: v })} suffix={dim} />
        </Field>
        <Field label={tt("Width")}>
          <DecimalInput value={f.w} onChange={(v) => setF({ ...f, w: v })} suffix={dim} />
        </Field>
        <Field label={tt("Height")}>
          <DecimalInput value={f.h} onChange={(v) => setF({ ...f, h: v })} suffix={dim} />
        </Field>
        <Field label={tt("Empty weight")}>
          <DecimalInput value={f.weight} onChange={(v) => setF({ ...f, weight: v })} suffix={small} />
        </Field>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          {tt("Cancel")}
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={async () => {
            setError(null)
            const body = { name: f.name, kind: f.kind, lengthMm: toMm(f.l, dim), widthMm: toMm(f.w, dim), heightMm: toMm(f.h || "0", dim), weightGrams: toGrams(f.weight || "0", small) ?? 0 }
            setBusy(true)
            const r = await api<{ packages: Pack[] }>(initial ? `/api/physical/packages/${initial.id}` : "/api/physical/packages", { method: initial ? "PATCH" : "POST", body })
            setBusy(false)
            if (!r.ok) return setError(r.error)
            onSaved(r.data.packages)
          }}
        >
          {busy ? tt("Saving") : initial ? tt("Save package") : tt("Add package")}
        </button>
      </div>
    </div>
  )
}

/* ── Taxes ─────────────────────────────────────────────────────────────── */

/**
 * A settings save, drawn from what the PUT sends back (the settings as
 * kept): no second read of the whole page after it. Only a failed save
 * reads the page again, so what shows is what the server has.
 */
function useSettingsSave(setData: SetData, reload: () => void) {
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const save = async (patch: Partial<Settings>) => {
    setState("saving")
    const r = await api<{ settings: Settings }>("/api/physical/settings", { method: "PUT", body: patch })
    if (!r.ok) {
      setError(r.error)
      setState("idle")
      reload()
      return false
    }
    setError(null)
    setState("saved")
    const kept = r.data?.settings
    setData((d) => (d ? { ...d, settings: kept ? { ...d.settings, ...kept } : { ...d.settings, ...patch } } : d))
    setTimeout(() => setState("idle"), 1600)
    return true
  }
  return { state, error, save }
}

function SaveButton({ state, onClick, disabled }: { state: "idle" | "saving" | "saved"; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={BTN_PRIMARY} onClick={onClick} disabled={disabled || state === "saving"}>
      {state === "saved" ? (
        <>
          <Check className="h-4 w-4" />
          {tt("Saved")}
        </>
      ) : state === "saving" ? (
        tt("Saving")
      ) : (
        tt("Save")
      )}
    </button>
  )
}

/* ── How orders are fulfilled ──────────────────────────────────────────── */

function FulfilmentCard({ data, reload, setData }: { data: Data; reload: () => void; setData: SetData }) {
  const [model, setModel] = React.useState<FulfillmentModel | "">(data.settings.fulfillmentModel ?? "")
  const { state, error, save } = useSettingsSave(setData, reload)
  const changed = model !== (data.settings.fulfillmentModel ?? "")
  return (
    <Card title={tt("How you fulfil orders")} description={tt("Who packs and ships what you sell. A mix is fine: each location says who ships from it.")} help="fulfilment">
      <FulfilmentChoice value={model} onChange={setModel} />
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      {changed ? (
        <div className="mt-4 flex justify-end">
          <SaveButton state={state} onClick={() => model && save({ fulfillmentModel: model })} />
        </div>
      ) : null}
    </Card>
  )
}

/* ── Low stock emails ──────────────────────────────────────────────────── */

function StockAlerts({ data, reload, setData }: { data: Data; reload: () => void; setData: SetData }) {
  const [low, setLow] = React.useState(String(data.settings.lowStockDefault))
  const [alerts, setAlerts] = React.useState(data.settings.lowStockAlerts !== false)
  const { state, error, save } = useSettingsSave(setData, reload)
  return (
    <Card title={tt("Low stock")} description={tt("So you reorder before something sells out, and buyers see when few are left.")}>
      <div className="space-y-4">
        <Field label={tt("Low stock line")} hint={tt("At or below it is low, for every product without its own line (set in the product's Inventory card).")}>
          <NumberInput value={low} onChange={setLow} className="max-w-[160px]" />
        </Field>
        <Toggle label={tt("Email me when stock runs low")} description={tt("One email a day at most, listing what sold down to its low stock line.")} checked={alerts} onChange={setAlerts} />
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
          {tt("The same line drives the Low filter in")}{" "}
          <a href="/app/inventory?filter=low" className="font-medium text-[#1a1a2e] underline underline-offset-2">
            {tt("Inventory")}
          </a>{" "}
          {tt("and Only")} {Number(low || 0) > 0 ? Number(low) : "N"} {tt("left on your website's product pages (Website settings, Commerce).")}
        </p>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <SaveButton state={state} onClick={() => save({ lowStockDefault: Number(low || 0), lowStockAlerts: alerts })} />
        </div>
      </div>
    </Card>
  )
}

/* ── Returns ───────────────────────────────────────────────────────────── */

function ReturnsPolicy({ data, reload, setData }: { data: Data; reload: () => void; setData: SetData }) {
  const [days, setDays] = React.useState(String(data.settings.returnWindowDays))
  const [enabled, setEnabled] = React.useState(data.settings.returnsEnabled)
  const { state, error, save } = useSettingsSave(setData, reload)
  return (
    <Card title={tt("Returns")} description={tt("Buyers ask for a return from their order page, and you approve each one.")} help="returns">
      <div className="space-y-4">
        <Toggle label={tt("Accept returns")} description={tt("Off, the order page has no return button.")} checked={enabled} onChange={setEnabled} />
        {enabled ? (
          <Field label={tt("Return window")} hint={tt("Days after the order is delivered, or shipped when there is no tracking")}>
            <NumberInput value={days} onChange={setDays} />
          </Field>
        ) : null}
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Your website's refund policy page ends with this, kept up to date for you. Website settings, Commerce can add it to the cart too.")}</p>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <SaveButton state={state} onClick={() => save({ returnsEnabled: enabled, returnWindowDays: Number(days || 0) })} />
        </div>
      </div>
    </Card>
  )
}

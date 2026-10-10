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
 * orders?", and sets up a first location of that kind.
 *
 * Inside the Settings form: every button is type="button" and Enter in a
 * field never submits the account form around it.
 */

import * as React from "react"
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { deliveryEstimate } from "@/lib/physical/rates"
import { PICKUP_READY_SHORT } from "@/lib/physical/pickup"
import { REGIONS, regionLabel, regionsOf } from "@/lib/physical/regions"
import { fromGrams, toGrams, weightUnitFor, type UnitSystem } from "@/lib/physical/units"
import { PICKUP_READY, type FulfillmentModel, type Location, type LocationKind, type PickupReady, type RateKind, type RateTier, type ShippingProfile, type ShippingRate, type ShippingZone } from "@/lib/physical/types"
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, CountryPicker, DecimalInput, Empty, FIELD, Field, MoneyInput, MUTED, Notice, NumberInput, Pill, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf, money } from "./ui"

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
interface Integration {
  provider: string
  status: "connected" | "disconnected" | "error" | "needs_setup"
  url: string | null
  keyHint: string | null
  secretHint: string | null
  lastSyncAt: string | null
  lastError: string | null
}
interface Data {
  settings: Settings
  locations: Location[]
  profiles: ShippingProfile[]
  packages: Pack[]
  taxRates: TaxRow[]
  integrations: Integration[]
}

const MODELS: { id: FulfillmentModel; title: string; line: string }[] = [
  { id: "self", title: "I ship orders myself", line: "From home, a studio or a shop." },
  { id: "warehouse", title: "From my own warehouse", line: "Stock in a place you run." },
  { id: "print_on_demand", title: "Print on demand", line: "Each order is printed and shipped for you." },
  { id: "dropshipping", title: "Dropshipping", line: "A supplier ships straight to your buyers." },
  { id: "supplier", title: "A supplier or manufacturer", line: "They hold the stock and ship it." },
  { id: "third_party_logistics", title: "A fulfillment center", line: "A 3PL stores, packs and ships." },
  { id: "hybrid", title: "A mix of these", line: "Different products ship from different places." },
]


const KIND_LABEL: Record<LocationKind, string> = {
  home: "Home or studio",
  warehouse: "Warehouse",
  print_on_demand: "Print on demand",
  dropshipper: "Dropshipping supplier",
  supplier: "Supplier",
  third_party_logistics: "Fulfillment center",
  retail: "Store",
  custom: "Other",
}

const RATE_KIND_LABEL: Record<RateKind, string> = {
  flat: "Flat rate",
  free: "Free shipping",
  price: "Based on order price",
  weight: "Based on order weight",
  item_weight: "Based on item weight",
  quantity: "By number of items",
  carrier: "Carrier calculated",
}

/** What the seller picks from; quantity and carrier stay readable on older rates. */
const RATE_KINDS_OFFERED: RateKind[] = ["flat", "free", "price", "weight", "item_weight"]

const RATE_KIND_LINE: Record<RateKind, string> = {
  flat: "One price for the whole order.",
  free: "Nothing to pay, always or above an order value.",
  price: "Bigger orders pay a different price. Set the steps.",
  weight: "Heavier orders pay more. Set the steps by total weight.",
  item_weight: "Each item is priced by its own weight, then added up.",
  quantity: "By how many items are in the order.",
  carrier: "Priced live by a carrier.",
}

function weightText(grams: number, system: UnitSystem): string {
  const unit = weightUnitFor(system)
  return `${fromGrams(grams, unit)} ${unit}`
}

function rateCondition(r: ShippingRate, system: UnitSystem): string {
  const parts: string[] = []
  const range = (fmt: (n: number) => string) => {
    if (r.minValue !== null && r.maxValue !== null) return `${fmt(r.minValue)} to ${fmt(r.maxValue)}`
    if (r.minValue !== null) return `${fmt(r.minValue)} and up`
    if (r.maxValue !== null) return `up to ${fmt(r.maxValue)}`
    return ""
  }
  const fmtValue = (n: number) => (r.kind === "price" ? money(n) : weightText(n, system))
  if ((r.kind === "price" || r.kind === "weight" || r.kind === "item_weight") && r.tiers.length) {
    parts.push(
      r.tiers
        .map((t, i) => {
          const next = r.tiers[i + 1]
          const span = next ? `${fmtValue(t.from)} to ${fmtValue(next.from)}` : `${fmtValue(t.from)}+`
          return `${span} ${t.priceCents === 0 ? "free" : money(t.priceCents)}${r.kind === "item_weight" ? " each" : ""}`
        })
        .join(", "),
    )
    if (r.maxValue !== null) parts.push(`not above ${fmtValue(r.maxValue)}`)
  } else if (r.kind === "weight") parts.push(range((n) => weightText(n, system)))
  else if (r.kind === "price") parts.push(range((n) => money(n)))
  else if (r.kind === "quantity") parts.push(range((n) => `${n} ${n === 1 ? "item" : "items"}`))
  if (r.kind === "free" && r.minValue) parts.push(`on orders over ${money(r.minValue)}`)
  if (r.freeOverCents) parts.push(`free over ${money(r.freeOverCents)}`)
  const est = deliveryEstimate(r)
  if (est) parts.push(est)
  return parts.filter(Boolean).join(" · ")
}

function zonePlaces(z: Pick<ShippingZone, "restOfWorld" | "countries" | "regions">): string {
  if (z.restOfWorld) return "Every other country"
  const names = [...z.countries.map(countryName), ...(z.regions ?? []).map(regionLabel)]
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`
}

function stopEnter(e: React.KeyboardEvent) {
  if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
}

export type ShippingPart = "delivery" | "locations" | "returns"

export function ShippingSettings({ part = "delivery" }: { part?: ShippingPart }) {
  const [data, setData] = React.useState<Data | null>(null)
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
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-[120px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        <div className="h-[220px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6" onKeyDown={stopEnter} data-shipping-settings={part}>
      {/* The first question, wherever the first visit lands: everything after it reads its answer. */}
      {!data.settings.onboardedAt ? <Onboarding onDone={load} /> : null}

      {part === "delivery" ? (
        <>
          <FulfilmentCard data={data} reload={load} />
          <Delivery data={data} reload={load} setData={setData} />
          <Packages data={data} setData={setData} />
        </>
      ) : null}
      {part === "locations" ? (
        <>
          <Locations data={data} reload={load} />
          <StockAlerts data={data} reload={load} />
        </>
      ) : null}
      {part === "returns" ? <ReturnsPolicy data={data} reload={load} /> : null}

      <p className="text-[13px] text-[#6b7280]">
        New to selling physical products?{" "}
        <a href="/help/physical-products/how-physical-products-work" target="_blank" rel="noreferrer" className="font-medium text-[#1a1a2e] underline underline-offset-2">
          Read the step by step guide
        </a>
      </p>
    </div>
  )
}

/* ── The first question ────────────────────────────────────────────────── */

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
    <Card title="How do you fulfil your physical orders?" description="We'll set up your first location to match. You can change this any time." help="fulfilment">
      <div className="grid gap-2 sm:grid-cols-2">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setChosen(m.id)}
            aria-pressed={chosen === m.id}
            className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", chosen === m.id ? "border-[#1a1a2e] bg-[#fafafa] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#f8f9fa]")}
          >
            <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", chosen === m.id ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]")}>{chosen === m.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-[#1a1a2e]">{m.title}</span>
              <span className="block text-[13px] leading-[18px] text-[#6b7280]">{m.line}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      <div className="mt-4 flex justify-end">
        <button type="button" className={BTN_PRIMARY} disabled={!chosen || busy} onClick={go}>
          {busy ? "Setting up" : "Continue"}
        </button>
      </div>
    </Card>
  )
}

/* ── Delivery: profiles, zones, rates ──────────────────────────────────── */

function Delivery({ data, reload, setData }: { data: Data; reload: () => void; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const [newProfile, setNewProfile] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const profiles = [...data.profiles].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  const updateProfiles = (p: ShippingProfile[]) => setData((d) => (d ? { ...d, profiles: p } : d))
  const noRates = data.profiles.every((p) => p.zones.every((z) => z.rates.length === 0))

  React.useEffect(() => {
    if (data.profiles.length === 0) void api<{ profiles: ShippingProfile[] }>("/api/physical/shipping/profiles").then((r) => r.ok && updateProfiles(r.data.profiles))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const system = data.settings.unitSystem ?? "metric"
  const setSystem = async (unitSystem: UnitSystem) => {
    setData((d) => (d ? { ...d, settings: { ...d.settings, unitSystem } } : d))
    const r = await api("/api/physical/settings", { method: "PUT", body: { unitSystem } })
    if (!r.ok) {
      setError(r.error)
      reload()
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Units" description="What new products and weight based rates are typed in.">
        <div className="flex w-fit gap-1 rounded-xl bg-[#f1f2f4] p-1" role="radiogroup" aria-label="Units">
          {(
            [
              { id: "metric", label: "Metric (kg, cm)" },
              { id: "imperial", label: "Imperial (lb, in)" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={system === o.id}
              onClick={() => setSystem(o.id)}
              className={cn("h-9 rounded-lg px-3 text-[13.5px] font-medium transition-colors", system === o.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>
      {noRates ? <Notice tone="amber">Buyers can't check out a physical product until it has a rate for their address. Add a zone and a rate below.</Notice> : null}
      {profiles.map((p) => (
        <ProfileCard key={p.id} profile={p} allProfiles={data.profiles} system={system} onProfiles={updateProfiles} onError={setError} />
      ))}
      {error ? <Notice>{error}</Notice> : null}
      {newProfile === null ? (
        <button type="button" className={BTN_SECONDARY} onClick={() => setNewProfile("")}>
          <Plus className="h-4 w-4" />
          Custom shipping profile
        </button>
      ) : (
        <Card title="New shipping profile" description="For products that ship differently, like heavy or fragile items.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput autoFocus placeholder="Heavy items" value={newProfile} maxLength={80} onChange={(e) => setNewProfile(e.target.value)} className="flex-1" />
            <div className="flex gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setNewProfile(null)}>
                Cancel
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
                Create profile
              </button>
            </div>
          </div>
        </Card>
      )}
      <button type="button" className="sr-only" onClick={reload}>
        Reload
      </button>
    </div>
  )
}

function ProfileCard({ profile, allProfiles, system, onProfiles, onError }: { profile: ShippingProfile; allProfiles: ShippingProfile[]; system: UnitSystem; onProfiles: (p: ShippingProfile[]) => void; onError: (e: string | null) => void }) {
  const [addingZone, setAddingZone] = React.useState(false)
  const taken = allProfiles.find((p) => p.id === profile.id)?.zones.flatMap((z) => z.countries) ?? []
  const takenRegions = allProfiles.find((p) => p.id === profile.id)?.zones.flatMap((z) => z.regions ?? []) ?? []
  const hasRow = profile.zones.some((z) => z.restOfWorld)
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {profile.name}
          {profile.isDefault ? <Pill tone="gray">Default</Pill> : null}
        </span>
      }
      description={profile.isDefault ? "Every physical product uses these rates, unless you give it a custom profile." : "Only products set to this profile use these rates. Pick it in the product's Shipping card."}
      action={
        profile.isDefault ? null : (
          <button
            type="button"
            className={BTN_GHOST}
            aria-label={`Delete ${profile.name}`}
            onClick={async () => {
              if (!window.confirm(`Delete ${profile.name}? Its products will use the default rates.`)) return
              const r = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/profiles/${profile.id}`, { method: "DELETE" })
              if (!r.ok) return onError(r.error)
              onProfiles(r.data.profiles)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )
      }
    >
      <div className="space-y-3">
        {profile.zones.length === 0 && !addingZone ? <p className={MUTED}>No zones yet. A zone is a group of countries or states you ship to with the same rates.</p> : null}
        {profile.zones.map((z) => (
          <ZoneBlock key={z.id} zone={z} taken={taken} takenRegions={takenRegions} system={system} onProfiles={onProfiles} onError={onError} />
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
            Add shipping zone
          </button>
        )}
      </div>
    </Card>
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
  const defaultName = () => (row ? "Rest of world" : countries.length === 1 && regions.length === 0 ? countryName(countries[0]) : regions.length === 1 && countries.length === 0 ? regionLabel(regions[0]) : "Zone")
  return (
    <div className="space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3">
      <Field label="Zone name" hint="Only you see this">
        <TextInput value={name} maxLength={80} placeholder={row ? "Rest of world" : "Europe"} onChange={(e) => setName(e.target.value)} />
      </Field>
      {canRestOfWorld || initial?.restOfWorld ? <Toggle label="Rest of world" description="Every country not in another zone of this profile." checked={row} onChange={setRow} disabled={!!initial} /> : null}
      {!row ? <CountryPicker value={countries} onChange={setCountries} taken={taken.filter((c) => !initial?.countries.includes(c))} /> : null}
      {!row ? (
        <div className="rounded-xl border border-[#eceef1] bg-white p-3">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">Only some states or provinces</p>
          <p className="mt-0.5 text-[12.5px] text-[#6b7280]">For a separate rate to, say, Alaska and Hawaii. A country chosen above is covered whole.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(REGIONS).map((cc) => (
              <button
                key={cc}
                type="button"
                onClick={() => setStatesFor(statesFor === cc ? null : cc)}
                aria-pressed={statesFor === cc}
                disabled={countries.includes(cc)}
                className={cn("h-8 rounded-lg border px-2.5 text-[13px] font-medium disabled:opacity-40", statesFor === cc ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e5e7eb] text-[#4b5563] hover:bg-[#f7f7f8]")}
              >
                {countryName(cc)}
                {regions.filter((r) => r.startsWith(`${cc}-`)).length ? ` (${regions.filter((r) => r.startsWith(`${cc}-`)).length})` : ""}
              </button>
            ))}
          </div>
          {statesFor && !countries.includes(statesFor) ? (
            <div className="mt-3 grid max-h-[220px] grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-3">
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
          ) : null}
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || (!row && countries.length === 0 && regions.length === 0)}
          onClick={async () => {
            setBusy(true)
            const problem = await onSave({ name: name.trim() || defaultName(), countries, regions: regions.filter((r) => !countries.includes(r.split("-")[0])), restOfWorld: row })
            setBusy(false)
            if (problem) setError(problem)
          }}
        >
          {initial ? "Save zone" : "Add zone"}
        </button>
      </div>
    </div>
  )
}

function ZoneBlock({ zone, taken, takenRegions, system, onProfiles, onError }: { zone: ShippingZone; taken: string[]; takenRegions: string[]; system: UnitSystem; onProfiles: (p: ShippingProfile[]) => void; onError: (e: string | null) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [rateForm, setRateForm] = React.useState<ShippingRate | "new" | null>(null)
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
  return (
    <div className="rounded-xl border border-[#eceef1]">
      <div className="flex items-center justify-between gap-3 border-b border-[#eceef1] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{zone.name}</p>
          <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={`Edit ${zone.name}`} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(BTN_GHOST, "w-9 px-0")}
            aria-label={`Delete ${zone.name}`}
            onClick={async () => {
              if (!window.confirm(`Delete the ${zone.name} zone and its rates?`)) return
              const r = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/zones/${zone.id}`, { method: "DELETE" })
              if (!r.ok) return onError(r.error)
              onProfiles(r.data.profiles)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul className="divide-y divide-[#f1f2f4]">
        {zone.rates.map((r) =>
          rateForm !== null && rateForm !== "new" && rateForm.id === r.id ? (
            <li key={r.id} className="p-3">
              <RateForm initial={r} system={system} onCancel={() => setRateForm(null)} onSave={async (body) => {
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
                  {r.name} {!r.active ? <span className="text-[12px] text-[#9ca3af]">(off)</span> : null}
                </p>
                <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{[RATE_KIND_LABEL[r.kind], rateCondition(r, system)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{r.kind === "free" ? "Free" : r.kind === "carrier" ? "Live" : r.tiers.length > 1 ? `From ${money(Math.min(...r.tiers.map((t) => t.priceCents)))}` : money(r.priceCents)}</span>
                <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={`Edit ${r.name}`} onClick={() => setRateForm(r)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(BTN_GHOST, "w-9 px-0")}
                  aria-label={`Delete ${r.name}`}
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
            Add rate
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

function RateForm({ initial, system, onCancel, onSave }: { initial?: ShippingRate; system: UnitSystem; onCancel: () => void; onSave: (body: Record<string, unknown>) => Promise<string | null> }) {
  const unit = weightUnitFor(system)
  const legacy = initial?.kind === "quantity" || initial?.kind === "carrier"
  const [kind, setKind] = React.useState<RateKind>(initial?.kind ?? "flat")
  const [name, setName] = React.useState(initial?.name ?? "Standard")
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
  const [busy, setBusy] = React.useState(false)
  const tiered = kind === "price" || kind === "weight" || kind === "item_weight"
  const toValue = (k: RateKind, t: string): number | null => {
    if (!t.trim()) return null
    if (k === "price") return centsOf(t)
    if (isWeight(k)) return toGrams(t, unit)
    const n = Number(t)
    return Number.isFinite(n) ? Math.round(n) : null
  }
  const valueSuffix = kind === "price" ? undefined : isWeight(kind) ? unit : "items"
  const fromLabel = kind === "price" ? "Order price from" : kind === "weight" ? "Order weight from" : "Item weight from"
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
        <Field label="Name buyers see" hint="Like Standard or Express">
          <TextInput value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
        </Field>
        <Field label="Delivery estimate" hint="Business days, shown at checkout">
          <div className="flex items-center gap-2">
            <NumberInput value={minDays} onChange={setMinDays} placeholder="3" aria-label="From days" />
            <span className="text-[13px] text-[#6b7280]">to</span>
            <NumberInput value={maxDays} onChange={setMaxDays} placeholder="5" aria-label="To days" />
          </div>
        </Field>
      </div>
      <div role="radiogroup" aria-label="Rate type" className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {(legacy ? [...RATE_KINDS_OFFERED, initial!.kind] : RATE_KINDS_OFFERED).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => changeKind(k)}
            className={cn("rounded-xl border px-3 py-2 text-left transition-colors", kind === k ? "border-[#1a1a2e] bg-white shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] bg-white hover:bg-[#f8f9fa]")}
          >
            <span className="block text-[13.5px] font-medium text-[#1a1a2e]">{RATE_KIND_LABEL[k]}</span>
            <span className="block text-[12px] leading-[16px] text-[#6b7280]">{RATE_KIND_LINE[k]}</span>
          </button>
        ))}
      </div>

      {kind === "flat" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field label="Free over" hint="Optional: free once the order reaches this">
            <MoneyInput value={freeOver} onChange={setFreeOver} placeholder="" />
          </Field>
        </div>
      ) : null}

      {kind === "free" ? (
        <Field label="Only on orders over" hint="Optional. Empty: always free." className="sm:max-w-[280px]">
          <MoneyInput value={min} onChange={setMin} placeholder="" />
        </Field>
      ) : null}

      {tiered ? (
        <div className="space-y-2 rounded-xl border border-[#eceef1] bg-white p-3">
          <div className="hidden grid-cols-[1fr_1fr_36px] gap-2 text-[12px] font-medium uppercase tracking-[0.02em] text-[#6b7280] sm:grid">
            <span>{fromLabel}</span>
            <span>{kind === "item_weight" ? "Price per item" : "Shipping price"}</span>
            <span />
          </div>
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2">
              {kind === "price" ? (
                <MoneyInput aria-label={`${fromLabel}, step ${i + 1}`} value={t.from} disabled={i === 0} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              ) : (
                <DecimalInput aria-label={`${fromLabel}, step ${i + 1}`} value={t.from} disabled={i === 0} suffix={valueSuffix} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              )}
              <MoneyInput aria-label={`Price, step ${i + 1}`} value={t.price} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
              {i > 0 ? (
                <button type="button" aria-label={`Remove step ${i + 1}`} className={cn(BTN_GHOST, "w-9 px-0")} onClick={() => setTiers((p) => p.filter((_, j) => j !== i))}>
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
                Add a step
              </button>
            ) : (
              <span />
            )}
            <label className="flex items-center gap-2 text-[13px] text-[#6b7280]">
              Not offered above
              {kind === "price" ? <MoneyInput aria-label="Not offered above" value={max} onChange={setMax} placeholder="" className="w-[130px]" /> : <DecimalInput aria-label="Not offered above" value={max} onChange={setMax} suffix={valueSuffix} className="w-[130px]" />}
            </label>
          </div>
          <p className="text-[12px] text-[#6b7280]">
            {kind === "item_weight"
              ? `Each item pays the price of the step its weight reaches. Two 0.5 ${unit} items at a 0 ${unit} step of $3 pay $6.`
              : "The order pays the price of the last step it reaches. The first step starts from 0."}
          </p>
        </div>
      ) : null}

      {kind === "quantity" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field label="Items from">
            <DecimalInput value={min} onChange={setMin} suffix="items" />
          </Field>
          <Field label="Items up to">
            <DecimalInput value={max} onChange={setMax} suffix="items" />
          </Field>
        </div>
      ) : null}

      <Toggle label="Offered at checkout" checked={active} onChange={setActive} />
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          Cancel
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
                if (from === null || priceCents === null) return setError(`Fill in step ${i + 1}, or remove it.`)
                tierBody.push({ from, priceCents })
              }
              tierBody = tierBody.sort((a, b) => a.from - b.from)
            }
            setBusy(true)
            const problem = await onSave({
              kind,
              name,
              priceCents: kind === "free" ? 0 : tiered ? (tierBody[0]?.priceCents ?? 0) : centsOf(price),
              tiers: tierBody,
              minValue: kind === "free" ? centsOf(min) : kind === "quantity" ? toValue(kind, min) : null,
              maxValue: tiered || kind === "quantity" ? toValue(kind, max) : null,
              freeOverCents: kind === "flat" ? centsOf(freeOver) : null,
              minDays: minDays || null,
              maxDays: maxDays || null,
              active,
            })
            setBusy(false)
            if (problem) setError(problem)
          }}
        >
          {initial ? "Save rate" : "Add rate"}
        </button>
      </div>
    </div>
  )
}

/* ── Locations ─────────────────────────────────────────────────────────── */

function Locations({ data, reload }: { data: Data; reload: () => void }) {
  const [editing, setEditing] = React.useState<Location | "new" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const makeDefault = async (id: string) => {
    const r = await api("/api/physical/settings", { method: "PUT", body: { defaultLocationId: id } })
    if (!r.ok) return setError(r.error)
    reload()
  }
  return (
    <div className="space-y-4">
      <Card title="Locations" description="Where you keep stock, where orders ship from, and where buyers can pick up." help="locations" action={editing === null ? <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add location</button> : null}>
        {notice ? <Notice tone="gray" className="mb-3">{notice}</Notice> : null}
        {error ? <Notice className="mb-3">{error}</Notice> : null}
        {editing === "new" ? <LocationForm onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} /> : null}
        {data.locations.length === 0 && editing === null ? <Empty title="No locations yet">Add the place your stock is kept, even if it's your home.</Empty> : null}
        <ul className="space-y-2">
          {data.locations.map((l) =>
            editing !== null && editing !== "new" && editing.id === l.id ? (
              <li key={l.id}>
                <LocationForm initial={l} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
              </li>
            ) : (
              <li key={l.id} className={cn("flex items-start justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-3", !l.active && "opacity-60")}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
                    {l.name}
                    {data.settings.defaultLocationId === l.id ? <Pill tone="gray">Default</Pill> : null}
                    {!l.active ? <Pill tone="gray">Off</Pill> : null}
                    {l.forwarding === "email" ? <Pill tone="blue">Emails orders</Pill> : l.forwarding === "webhook" ? <Pill tone="blue">Webhook</Pill> : l.forwarding === "provider" ? <Pill tone="amber">Provider not connected</Pill> : null}
                    {l.pickupEnabled && l.active ? <Pill tone="green">Local pickup</Pill> : null}
                  </p>
                  <p className="text-[13px] text-[#6b7280]">{[KIND_LABEL[l.kind], [l.city, l.country ? countryName(l.country) : null].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
                  {l.pickupEnabled && l.active ? <p className="mt-0.5 text-[12.5px] text-[#6b7280]">Pickup ready in {PICKUP_READY_SHORT[l.pickupReady]}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {data.settings.defaultLocationId !== l.id && l.active ? (
                    <button type="button" className={BTN_GHOST} onClick={() => makeDefault(l.id)}>
                      Make default
                    </button>
                  ) : null}
                  <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={cn(BTN_GHOST, "w-9 px-0")}
                    aria-label={`Delete ${l.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${l.name}?`)) return
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

function LocationForm({ initial, onCancel, onSaved }: { initial?: Location; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? ("home" as LocationKind),
    addressLine1: initial?.addressLine1 ?? "",
    addressLine2: initial?.addressLine2 ?? "",
    city: initial?.city ?? "",
    region: initial?.region ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    active: initial?.active ?? true,
    fulfillsOrders: initial?.fulfillsOrders ?? true,
    forwarding: initial?.forwarding ?? "none",
    pickupEnabled: initial?.pickupEnabled ?? false,
    pickupReady: initial?.pickupReady ?? ("24h" as PickupReady),
    pickupInstructions: initial?.pickupInstructions ?? "",
  })
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  return (
    <div className="mb-3 space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <TextInput autoFocus={!initial} value={f.name} maxLength={80} placeholder="Studio" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Type">
          <SelectInput value={f.kind} onChange={(v) => set({ kind: v as LocationKind })}>
            {(Object.keys(KIND_LABEL) as LocationKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <TextInput value={f.addressLine1} maxLength={200} onChange={(e) => set({ addressLine1: e.target.value })} autoComplete="address-line1" />
        </Field>
        <Field label="Apartment, suite" className="sm:col-span-2">
          <TextInput value={f.addressLine2} maxLength={200} onChange={(e) => set({ addressLine2: e.target.value })} autoComplete="address-line2" />
        </Field>
        <Field label="City">
          <TextInput value={f.city} maxLength={120} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Region">
          <TextInput value={f.region} maxLength={120} onChange={(e) => set({ region: e.target.value })} />
        </Field>
        <Field label="Postal code">
          <TextInput value={f.postalCode} maxLength={20} onChange={(e) => set({ postalCode: e.target.value })} />
        </Field>
        <Field label="Country">
          <SelectInput value={f.country} onChange={(v) => set({ country: v })}>
            <option value="">Choose</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Phone">
          <TextInput value={f.phone} maxLength={40} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email" hint={f.forwarding === "email" ? "New orders for this location go here" : undefined}>
          <TextInput value={f.email} maxLength={254} inputMode="email" onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Who ships orders from here" className="sm:col-span-2">
          <SelectInput value={f.forwarding} onChange={(v) => set({ forwarding: v as typeof f.forwarding })}>
            <option value="none">I do: I ship them myself</option>
            <option value="email">A supplier: email each order to them</option>
            <option value="webhook">My own system: send each order to my webhook</option>
            <option value="provider">A fulfillment provider (not connected yet)</option>
          </SelectInput>
        </Field>
      </div>
      {f.forwarding === "webhook" ? <Notice tone="gray">Set your webhook address and secret in Integrations.</Notice> : null}
      {f.forwarding === "provider" ? <Notice tone="amber">Storelib can't send orders to providers yet. Orders from here are flagged for you to send yourself.</Notice> : null}
      <Toggle label="Ships orders" description="Off to keep stock here without shipping from it." checked={f.fulfillsOrders} onChange={(v) => set({ fulfillsOrders: v })} />
      <div className="rounded-xl border border-[#eceef1] bg-white p-3">
        <Toggle
          label={
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-[#6b7280]" />
              Offer local pickup here
            </span>
          }
          description="Buyers can choose to collect their order here instead of having it shipped. Free for them."
          checked={f.pickupEnabled}
          onChange={(v) => set({ pickupEnabled: v })}
        />
        {f.pickupEnabled ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <Field label="Usually ready in" hint="Shown at checkout">
              <SelectInput value={f.pickupReady} onChange={(v) => set({ pickupReady: v as PickupReady })}>
                {PICKUP_READY.map((r) => (
                  <option key={r} value={r}>
                    {PICKUP_READY_SHORT[r]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Pickup instructions" hint="Sent with the order confirmation and when it's ready">
              <textarea
                value={f.pickupInstructions}
                maxLength={1000}
                rows={3}
                onChange={(e) => set({ pickupInstructions: e.target.value })}
                placeholder="Ring the bell at the side door. Open weekdays 10am to 6pm. Bring your order number."
                className={cn(FIELD, "h-auto min-h-[84px] py-2 leading-5")}
              />
            </Field>
          </div>
        ) : null}
      </div>
      <Toggle label="Active" checked={f.active} onChange={(v) => set({ active: v })} />
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const r = await api(initial ? `/api/physical/locations/${initial.id}` : "/api/physical/locations", { method: initial ? "PATCH" : "POST", body: f })
            setBusy(false)
            if (!r.ok) return setError(r.error)
            onSaved()
          }}
        >
          {initial ? "Save location" : "Add location"}
        </button>
      </div>
    </div>
  )
}

/* ── Packages ──────────────────────────────────────────────────────────── */

function Packages({ data, setData }: { data: Data; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const [adding, setAdding] = React.useState(false)
  const [f, setF] = React.useState({ name: "", kind: "box", l: "", w: "", h: "", weight: "" })
  const [error, setError] = React.useState<string | null>(null)
  const put = (packages: Pack[]) => setData((d) => (d ? { ...d, packages } : d))
  return (
    <Card title="Packages" description="The boxes and mailers you ship in. Used for labels and package weight." help="packages" action={!adding ? <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add package</button> : null}>
      {adding ? (
        <div className="mb-3 space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <TextInput autoFocus value={f.name} maxLength={80} placeholder="Small box" onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Type">
              <SelectInput value={f.kind} onChange={(v) => setF({ ...f, kind: v })}>
                <option value="box">Box</option>
                <option value="envelope">Envelope</option>
                <option value="soft_package">Soft package</option>
              </SelectInput>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Field label="Length">
              <DecimalInput value={f.l} onChange={(v) => setF({ ...f, l: v })} suffix="cm" />
            </Field>
            <Field label="Width">
              <DecimalInput value={f.w} onChange={(v) => setF({ ...f, w: v })} suffix="cm" />
            </Field>
            <Field label="Height">
              <DecimalInput value={f.h} onChange={(v) => setF({ ...f, h: v })} suffix="cm" />
            </Field>
            <Field label="Empty weight">
              <DecimalInput value={f.weight} onChange={(v) => setF({ ...f, weight: v })} suffix="g" />
            </Field>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={async () => {
                const r = await api<{ packages: Pack[] }>("/api/physical/packages", {
                  body: { name: f.name, kind: f.kind, lengthMm: Math.round(Number(f.l) * 10), widthMm: Math.round(Number(f.w) * 10), heightMm: Math.round(Number(f.h) * 10), weightGrams: Math.round(Number(f.weight) || 0) },
                })
                if (!r.ok) return setError(r.error)
                put(r.data.packages)
                setAdding(false)
                setF({ name: "", kind: "box", l: "", w: "", h: "", weight: "" })
              }}
            >
              Add package
            </button>
          </div>
        </div>
      ) : null}
      {data.packages.length === 0 && !adding ? <Empty title="No packages yet">Add the box or mailer you use most.</Empty> : null}
      <ul className="space-y-2">
        {data.packages.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                {p.name}
                {p.isDefault ? <Pill tone="gray">Default</Pill> : null}
              </p>
              <p className="text-[12.5px] text-[#6b7280]">
                {p.lengthMm / 10} × {p.widthMm / 10} × {p.heightMm / 10} cm{p.weightGrams ? `, ${p.weightGrams} g` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {!p.isDefault ? (
                <button type="button" className={BTN_GHOST} onClick={async () => { const r = await api<{ packages: Pack[] }>(`/api/physical/packages/${p.id}`, { method: "PATCH", body: { makeDefault: true } }); if (r.ok) put(r.data.packages) }}>
                  Make default
                </button>
              ) : null}
              <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={`Delete ${p.name}`} onClick={async () => { const r = await api<{ packages: Pack[] }>(`/api/physical/packages/${p.id}`, { method: "DELETE" }); if (r.ok) put(r.data.packages) }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ── Taxes ─────────────────────────────────────────────────────────────── */

function SaveButton({ state, onClick, disabled }: { state: "idle" | "saving" | "saved"; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={BTN_PRIMARY} onClick={onClick} disabled={disabled || state === "saving"}>
      {state === "saved" ? (
        <>
          <Check className="h-4 w-4" />
          Saved
        </>
      ) : state === "saving" ? (
        "Saving"
      ) : (
        "Save"
      )}
    </button>
  )
}

/* ── How orders are fulfilled ──────────────────────────────────────────── */

function FulfilmentCard({ data, reload }: { data: Data; reload: () => void }) {
  const [model, setModel] = React.useState<FulfillmentModel | "">(data.settings.fulfillmentModel ?? "")
  const { state, error, save } = useSettingsSave(reload)
  const changed = model !== (data.settings.fulfillmentModel ?? "")
  return (
    <Card title="How you fulfil orders" description="Who packs and ships what you sell. A mix is fine: each location says who ships from it." help="fulfilment">
      <div className="grid gap-2 sm:grid-cols-2">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModel(m.id)}
            aria-pressed={model === m.id}
            data-fulfil-model={m.id}
            className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", model === m.id ? "border-[#1a1a2e] bg-[#fafafa] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#f8f9fa]")}
          >
            <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", model === m.id ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]")}>{model === m.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-[#1a1a2e]">{m.title}</span>
              <span className="block text-[13px] leading-[18px] text-[#6b7280]">{m.line}</span>
            </span>
          </button>
        ))}
      </div>
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

function StockAlerts({ data, reload }: { data: Data; reload: () => void }) {
  const [low, setLow] = React.useState(String(data.settings.lowStockDefault))
  const [alerts, setAlerts] = React.useState(data.settings.lowStockAlerts !== false)
  const { state, error, save } = useSettingsSave(reload)
  return (
    <Card title="Low stock" description="So you reorder before something sells out.">
      <div className="space-y-4">
        <Toggle label="Email me when stock runs low" description="One email a day at most, listing what sold down to its low stock line." checked={alerts} onChange={setAlerts} />
        <Field label="Low stock line" hint="For products without their own. At or below it is low.">
          <NumberInput value={low} onChange={setLow} />
        </Field>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <SaveButton state={state} onClick={() => save({ lowStockDefault: Number(low || 0), lowStockAlerts: alerts })} />
        </div>
      </div>
    </Card>
  )
}

/* ── Returns ───────────────────────────────────────────────────────────── */

function ReturnsPolicy({ data, reload }: { data: Data; reload: () => void }) {
  const [days, setDays] = React.useState(String(data.settings.returnWindowDays))
  const [enabled, setEnabled] = React.useState(data.settings.returnsEnabled)
  const { state, error, save } = useSettingsSave(reload)
  return (
    <Card title="Returns" description="Buyers ask for a return from their order page, and you approve each one." help="returns">
      <div className="space-y-4">
        <Toggle label="Accept returns" description="Off, the order page has no return button." checked={enabled} onChange={setEnabled} />
        {enabled ? (
          <Field label="Return window" hint="Days after the order is delivered, or shipped when there is no tracking">
            <NumberInput value={days} onChange={setDays} />
          </Field>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <SaveButton state={state} onClick={() => save({ returnsEnabled: enabled, returnWindowDays: Number(days || 0) })} />
        </div>
      </div>
    </Card>
  )
}

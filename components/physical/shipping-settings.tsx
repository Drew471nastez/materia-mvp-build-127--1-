"use client"

/**
 * ===========================================================================
 *  SETTINGS > SHIPPING: HOW A SHOP SHIPS, FROM WHERE, FOR HOW MUCH
 * ===========================================================================
 * Only while physical commerce is on in /admin (the tab is filtered out
 * otherwise). One panel, six parts, chosen with ?section=:
 *
 *   delivery      shipping profiles, their zones (countries) and rates
 *   locations     where stock is kept and orders ship from, and who ships
 *                 them (the merchant, or a supplier by email or webhook)
 *   packages      the boxes and envelopes used
 *   taxes         none, or the shop's own rates per country and region
 *   returns       returns on or off, the window, the low stock line
 *   integrations  what can fulfil orders, said honestly: live or not yet
 *
 * The first visit asks one question, "How do you fulfil your physical
 * orders?", and sets up a first location of that kind.
 *
 * Inside the Settings form: every button is type="button" and Enter in a
 * field never submits the account form around it.
 */

import * as React from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { deliveryEstimate } from "@/lib/physical/rates"
import { CATEGORY_LABEL, PROVIDERS, type ProviderCategory } from "@/lib/physical/providers"
import type { FulfillmentModel, Location, LocationKind, RateKind, ShippingProfile, ShippingRate, ShippingZone } from "@/lib/physical/types"
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, CountryPicker, DecimalInput, Empty, Field, MoneyInput, MUTED, Notice, NumberInput, Pill, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf, money } from "./ui"

interface Settings {
  fulfillmentModel: FulfillmentModel | null
  defaultLocationId: string | null
  defaultPackageId: string | null
  returnsEnabled: boolean
  returnWindowDays: number
  taxMode: "none" | "manual" | "provider"
  pricesIncludeTax: boolean
  taxOnShipping: boolean
  lowStockDefault: number
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

const SECTIONS = [
  { id: "delivery", label: "Delivery" },
  { id: "locations", label: "Locations" },
  { id: "packages", label: "Packages" },
  { id: "taxes", label: "Taxes" },
  { id: "returns", label: "Returns and stock" },
  { id: "integrations", label: "Integrations" },
] as const
type Section = (typeof SECTIONS)[number]["id"]

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
  free: "Free",
  weight: "By weight",
  price: "By order value",
  quantity: "By number of items",
  carrier: "Carrier calculated",
}

function rateCondition(r: ShippingRate): string {
  const parts: string[] = []
  const range = (fmt: (n: number) => string) => {
    if (r.minValue !== null && r.maxValue !== null) return `${fmt(r.minValue)} to ${fmt(r.maxValue)}`
    if (r.minValue !== null) return `${fmt(r.minValue)} and up`
    if (r.maxValue !== null) return `up to ${fmt(r.maxValue)}`
    return ""
  }
  if (r.kind === "weight") parts.push(range((n) => `${n >= 1000 ? `${n / 1000} kg` : `${n} g`}`))
  if (r.kind === "price") parts.push(range((n) => money(n)))
  if (r.kind === "quantity") parts.push(range((n) => `${n} ${n === 1 ? "item" : "items"}`))
  if (r.freeOverCents) parts.push(`free over ${money(r.freeOverCents)}`)
  const est = deliveryEstimate(r)
  if (est) parts.push(est)
  return parts.filter(Boolean).join(" · ")
}

function stopEnter(e: React.KeyboardEvent) {
  if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
}

export function ShippingSettings() {
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [section, setSection] = React.useState<Section>(() => {
    if (typeof window === "undefined") return "delivery"
    const s = new URLSearchParams(window.location.search).get("section")
    return s === "rates" ? "delivery" : SECTIONS.some((x) => x.id === s) ? (s as Section) : "delivery"
  })

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

  const pick = (s: Section) => {
    setSection(s)
    const url = new URL(window.location.href)
    url.searchParams.set("section", s)
    window.history.replaceState({}, "", url.pathname + url.search)
  }

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
    <div className="space-y-4 sm:space-y-6" onKeyDown={stopEnter} data-shipping-settings="">
      {!data.settings.onboardedAt ? <Onboarding onDone={load} /> : null}

      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-fit gap-1 rounded-xl bg-[#f1f2f4] p-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={cn(
                "h-8 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors sm:h-9 sm:text-[13.5px]",
                section === s.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === "delivery" ? <Delivery data={data} reload={load} setData={setData} /> : null}
      {section === "locations" ? <Locations data={data} reload={load} /> : null}
      {section === "packages" ? <Packages data={data} setData={setData} /> : null}
      {section === "taxes" ? <Taxes data={data} reload={load} setData={setData} /> : null}
      {section === "returns" ? <Returns data={data} reload={load} /> : null}
      {section === "integrations" ? <Integrations data={data} setData={setData} /> : null}
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
    <Card title="How do you fulfil your physical orders?" description="We'll set up your first location to match. You can change this any time.">
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

  return (
    <div className="space-y-4">
      {noRates ? <Notice tone="amber">Buyers can't check out a physical product until it has a rate for their country. Add a zone and a rate below.</Notice> : null}
      {profiles.map((p) => (
        <ProfileCard key={p.id} profile={p} allProfiles={data.profiles} onProfiles={updateProfiles} onError={setError} />
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

function ProfileCard({ profile, allProfiles, onProfiles, onError }: { profile: ShippingProfile; allProfiles: ShippingProfile[]; onProfiles: (p: ShippingProfile[]) => void; onError: (e: string | null) => void }) {
  const [addingZone, setAddingZone] = React.useState(false)
  const taken = allProfiles.find((p) => p.id === profile.id)?.zones.flatMap((z) => z.countries) ?? []
  const hasRow = profile.zones.some((z) => z.restOfWorld)
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {profile.name}
          {profile.isDefault ? <Pill tone="gray">Default</Pill> : null}
        </span>
      }
      description={profile.isDefault ? "Every product uses these rates unless it has its own profile." : "Products set to this profile use these rates."}
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
        {profile.zones.length === 0 && !addingZone ? <p className={MUTED}>No zones yet. Add the countries you ship to.</p> : null}
        {profile.zones.map((z) => (
          <ZoneBlock key={z.id} zone={z} taken={taken} onProfiles={onProfiles} onError={onError} />
        ))}
        {addingZone ? (
          <ZoneForm
            taken={taken}
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

function ZoneForm({ initial, taken, canRestOfWorld, onCancel, onSave }: { initial?: ShippingZone; taken: string[]; canRestOfWorld: boolean; onCancel: () => void; onSave: (z: { name: string; countries: string[]; restOfWorld: boolean }) => Promise<string | null> }) {
  const [name, setName] = React.useState(initial?.name ?? "")
  const [countries, setCountries] = React.useState<string[]>(initial?.countries ?? [])
  const [row, setRow] = React.useState(initial?.restOfWorld ?? false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3">
      <Field label="Zone name" hint="Buyers don't see this">
        <TextInput value={name} maxLength={80} placeholder={row ? "Rest of world" : "Europe"} onChange={(e) => setName(e.target.value)} />
      </Field>
      {canRestOfWorld || initial?.restOfWorld ? <Toggle label="Rest of world" description="Every country not in another zone of this profile." checked={row} onChange={setRow} disabled={!!initial} /> : null}
      {!row ? <CountryPicker value={countries} onChange={setCountries} taken={taken.filter((c) => !initial?.countries.includes(c))} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || (!row && countries.length === 0)}
          onClick={async () => {
            setBusy(true)
            const problem = await onSave({ name: name.trim() || (row ? "Rest of world" : countries.length === 1 ? countryName(countries[0]) : "Zone"), countries, restOfWorld: row })
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

function ZoneBlock({ zone, taken, onProfiles, onError }: { zone: ShippingZone; taken: string[]; onProfiles: (p: ShippingProfile[]) => void; onError: (e: string | null) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [rateForm, setRateForm] = React.useState<ShippingRate | "new" | null>(null)
  const label = zone.restOfWorld ? "Every other country" : zone.countries.length <= 3 ? zone.countries.map(countryName).join(", ") : `${zone.countries.length} countries`
  if (editing) {
    return (
      <ZoneForm
        initial={zone}
        taken={taken}
        canRestOfWorld={false}
        onCancel={() => setEditing(false)}
        onSave={async (z) => {
          const r = await api<{ profiles: ShippingProfile[] }>(`/api/physical/shipping/zones/${zone.id}`, { method: "PATCH", body: { name: z.name, ...(zone.restOfWorld ? {} : { countries: z.countries }) } })
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
              <RateForm initial={r} onCancel={() => setRateForm(null)} onSave={async (body) => {
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
                <p className="truncate text-[12.5px] text-[#6b7280]">{[RATE_KIND_LABEL[r.kind], rateCondition(r)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{r.kind === "free" ? "Free" : r.kind === "carrier" ? "Live" : money(r.priceCents)}</span>
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

function RateForm({ initial, onCancel, onSave }: { initial?: ShippingRate; onCancel: () => void; onSave: (body: Record<string, unknown>) => Promise<string | null> }) {
  const [kind, setKind] = React.useState<RateKind>(initial?.kind ?? "flat")
  const [name, setName] = React.useState(initial?.name ?? "Standard")
  const [price, setPrice] = React.useState(initial ? dollarsOf(initial.priceCents) : "")
  const scale = kind === "price" ? 100 : 1
  const asText = (n: number | null | undefined) => (n === null || n === undefined ? "" : kind === "price" ? (n / 100).toFixed(2) : kind === "weight" ? String(n / 1000) : String(n))
  const [min, setMin] = React.useState(asText(initial?.minValue))
  const [max, setMax] = React.useState(asText(initial?.maxValue))
  const [freeOver, setFreeOver] = React.useState(initial?.freeOverCents ? dollarsOf(initial.freeOverCents) : "")
  const [minDays, setMinDays] = React.useState(initial?.minDays?.toString() ?? "")
  const [maxDays, setMaxDays] = React.useState(initial?.maxDays?.toString() ?? "")
  const [active, setActive] = React.useState(initial?.active ?? true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const toValue = (t: string) => {
    if (!t.trim()) return null
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    return kind === "weight" ? Math.round(n * 1000) : Math.round(n * scale)
  }
  const ranged = kind === "weight" || kind === "price" || kind === "quantity"
  const unit = kind === "weight" ? "kg" : kind === "quantity" ? "items" : ""
  return (
    <div className="space-y-3 rounded-xl bg-[#fcfcfd]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rate type">
          <SelectInput value={kind} onChange={(v) => setKind(v as RateKind)}>
            {(["flat", "free", "weight", "price", "quantity"] as RateKind[]).map((k) => (
              <option key={k} value={k}>
                {RATE_KIND_LABEL[k]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Name buyers see">
          <TextInput value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
        </Field>
        {kind !== "free" ? (
          <Field label="Price">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
        ) : null}
        {kind !== "free" ? (
          <Field label="Free over" hint="Optional: free when the order reaches this">
            <MoneyInput value={freeOver} onChange={setFreeOver} placeholder="" />
          </Field>
        ) : null}
        {ranged ? (
          <>
            <Field label={kind === "price" ? "Order value from" : kind === "weight" ? "Weight from" : "Items from"}>
              {kind === "price" ? <MoneyInput value={min} onChange={setMin} placeholder="" /> : <DecimalInput value={min} onChange={setMin} suffix={unit} />}
            </Field>
            <Field label={kind === "price" ? "Order value up to" : kind === "weight" ? "Weight up to" : "Items up to"}>
              {kind === "price" ? <MoneyInput value={max} onChange={setMax} placeholder="" /> : <DecimalInput value={max} onChange={setMax} suffix={unit} />}
            </Field>
          </>
        ) : null}
        <Field label="Delivery time" hint="In business days, shown at checkout">
          <div className="flex items-center gap-2">
            <NumberInput value={minDays} onChange={setMinDays} placeholder="3" aria-label="From days" />
            <span className="text-[13px] text-[#6b7280]">to</span>
            <NumberInput value={maxDays} onChange={setMaxDays} placeholder="5" aria-label="To days" />
          </div>
        </Field>
        <div className="flex items-end pb-1">
          <Toggle label="Offered at checkout" checked={active} onChange={setActive} />
        </div>
      </div>
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
            const problem = await onSave({
              kind,
              name,
              priceCents: kind === "free" ? 0 : centsOf(price),
              minValue: ranged ? toValue(min) : null,
              maxValue: ranged ? toValue(max) : null,
              freeOverCents: kind === "free" ? null : centsOf(freeOver),
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
      <Card title="Locations" description="Where you keep stock and where orders ship from." action={editing === null ? <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add location</button> : null}>
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
                  </p>
                  <p className="text-[13px] text-[#6b7280]">{[KIND_LABEL[l.kind], [l.city, l.country ? countryName(l.country) : null].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
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
    <Card title="Packages" description="The boxes and mailers you ship in. Used for labels and package weight." action={!adding ? <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add package</button> : null}>
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

function Taxes({ data, reload, setData }: { data: Data; reload: () => void; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const s = data.settings
  const [error, setError] = React.useState<string | null>(null)
  const [f, setF] = React.useState({ country: "", region: "", percent: "", name: "VAT" })
  const save = async (patch: Partial<Settings>) => {
    setData((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d))
    const r = await api("/api/physical/settings", { method: "PUT", body: patch })
    if (!r.ok) {
      setError(r.error)
      reload()
    }
  }
  return (
    <div className="space-y-4">
      <Card title="Tax" description="Storelib only charges tax you set here. Check what applies to you with an accountant.">
        <div className="space-y-2">
          {[
            { id: "none", title: "Don't charge tax", line: "Prices are what buyers pay, plus delivery." },
            { id: "manual", title: "Charge my own rates", line: "By country, or by region within a country." },
          ].map((o) => (
            <button key={o.id} type="button" onClick={() => save({ taxMode: o.id as Settings["taxMode"] })} aria-pressed={s.taxMode === o.id} className={cn("flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left", s.taxMode === o.id ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#f8f9fa]")}>
              <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", s.taxMode === o.id ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]")}>{s.taxMode === o.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
              <span>
                <span className="block text-[14px] font-medium text-[#1a1a2e]">{o.title}</span>
                <span className="block text-[13px] text-[#6b7280]">{o.line}</span>
              </span>
            </button>
          ))}
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-[#e5e7eb] px-3.5 py-3 opacity-70">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-[#d1d5db]" />
            <span>
              <span className="block text-[14px] font-medium text-[#1a1a2e]">Automatic tax</span>
              <span className="block text-[13px] text-[#6b7280]">Calculated by a tax provider. Not available yet.</span>
            </span>
          </div>
        </div>
        {s.taxMode === "manual" ? (
          <div className="mt-4 space-y-3">
            <Toggle label="Prices include tax" description="Common in Europe. The tax is shown as part of the price." checked={s.pricesIncludeTax} onChange={(v) => save({ pricesIncludeTax: v })} />
            <Toggle label="Charge tax on shipping" checked={s.taxOnShipping} onChange={(v) => save({ taxOnShipping: v })} />
          </div>
        ) : null}
      </Card>
      {s.taxMode === "manual" ? (
        <Card title="Tax rates">
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.7fr_0.8fr_auto] sm:items-end">
            <Field label="Country">
              <SelectInput value={f.country} onChange={(v) => setF({ ...f, country: v })}>
                <option value="">Choose</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Region" hint="Optional">
              <TextInput value={f.region} maxLength={120} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="CA" />
            </Field>
            <Field label="Rate">
              <DecimalInput value={f.percent} onChange={(v) => setF({ ...f, percent: v })} suffix="%" />
            </Field>
            <Field label="Name">
              <TextInput value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!f.country || !f.percent}
              onClick={async () => {
                const r = await api<{ taxRates: TaxRow[] }>("/api/physical/tax-rates", { body: f })
                if (!r.ok) return setError(r.error)
                setData((d) => (d ? { ...d, taxRates: r.data.taxRates } : d))
                setF({ country: "", region: "", percent: "", name: f.name })
                setError(null)
              }}
            >
              Add
            </button>
          </div>
          {error ? <Notice className="mt-3">{error}</Notice> : null}
          <ul className="mt-4 divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
            {data.taxRates.length === 0 ? <li className="px-3 py-3 text-[13.5px] text-[#6b7280]">No rates yet. Buyers are charged no tax until you add one.</li> : null}
            {data.taxRates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[14px] text-[#1a1a2e]">
                  {countryName(t.country)}
                  {t.region ? `, ${t.region}` : ""} <span className="text-[#6b7280]">· {t.name}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[14px] font-medium tabular-nums">{(t.rateBps / 100).toFixed(t.rateBps % 100 ? 2 : 0)}%</span>
                  <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label="Delete rate" onClick={async () => { const r = await api<{ taxRates: TaxRow[] }>(`/api/physical/tax-rates/${t.id}`, { method: "DELETE" }); if (r.ok) setData((d) => (d ? { ...d, taxRates: r.data.taxRates } : d)) }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

/* ── Returns and stock ─────────────────────────────────────────────────── */

function Returns({ data, reload }: { data: Data; reload: () => void }) {
  const [days, setDays] = React.useState(String(data.settings.returnWindowDays))
  const [low, setLow] = React.useState(String(data.settings.lowStockDefault))
  const [enabled, setEnabled] = React.useState(data.settings.returnsEnabled)
  const [model, setModel] = React.useState<FulfillmentModel | "">(data.settings.fulfillmentModel ?? "")
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const save = async () => {
    setState("saving")
    const r = await api("/api/physical/settings", { method: "PUT", body: { returnsEnabled: enabled, returnWindowDays: Number(days || 0), lowStockDefault: Number(low || 0), ...(model ? { fulfillmentModel: model } : {}) } })
    if (!r.ok) {
      setError(r.error)
      setState("idle")
      return
    }
    setError(null)
    setState("saved")
    reload()
    setTimeout(() => setState("idle"), 1600)
  }
  return (
    <Card title="Returns and stock">
      <div className="space-y-4">
        <Toggle label="Accept returns" description="Buyers can ask for a return from their order page. You approve each one." checked={enabled} onChange={setEnabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          {enabled ? (
            <Field label="Return window" hint="Days after it ships">
              <NumberInput value={days} onChange={setDays} />
            </Field>
          ) : null}
          <Field label="Low stock at" hint="Products at or below this show as low on Inventory">
            <NumberInput value={low} onChange={setLow} />
          </Field>
          <Field label="How you fulfil" className="sm:col-span-2">
            <SelectInput value={model} onChange={(v) => setModel(v as FulfillmentModel)}>
              <option value="">Not set</option>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={state === "saving"}>
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
        </div>
      </div>
    </Card>
  )
}

/* ── Integrations ──────────────────────────────────────────────────────── */

function Integrations({ data, setData }: { data: Data; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const groups = (Object.keys(CATEGORY_LABEL) as ProviderCategory[]).map((c) => ({ category: c, list: PROVIDERS.filter((p) => p.category === c) })).filter((g) => g.list.length)
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.category} title={CATEGORY_LABEL[g.category]}>
          <ul className="space-y-2">
            {g.list.map((p) => (
              <IntegrationRow key={p.id} provider={p} state={data.integrations.find((i) => i.provider === p.id) ?? null} onSaved={(integrations) => setData((d) => (d ? { ...d, integrations } : d))} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function IntegrationRow({ provider, state, onSaved }: { provider: (typeof PROVIDERS)[number]; state: Integration | null; onSaved: (i: Integration[]) => void }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState(state?.url ?? "")
  const [secret, setSecret] = React.useState("")
  const [key, setKey] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const connectable = provider.fields.some((f) => f === "api_key" || f === "url")
  const pill =
    provider.id === "manual" || provider.id === "csv" || provider.id === "supplier_email" ? (
      <Pill tone="green">Ready</Pill>
    ) : state?.status === "connected" ? (
      <Pill tone="green">Connected</Pill>
    ) : state?.status === "needs_setup" ? (
      <Pill tone="amber">Key saved, not live yet</Pill>
    ) : state?.status === "error" ? (
      <Pill tone="red">Error</Pill>
    ) : provider.availability === "needs_setup" ? (
      <Pill tone="gray">Not available yet</Pill>
    ) : (
      <Pill tone="gray">Not connected</Pill>
    )
  const save = async (disconnect = false) => {
    setError(null)
    const r = await api<{ integrations: Integration[] }>(`/api/physical/integrations/${provider.id}`, { method: "PUT", body: disconnect ? { disconnect: true } : { url, webhookSecret: secret, apiKey: key } })
    if (!r.ok) return setError(r.error)
    onSaved(r.data.integrations)
    setSecret("")
    setKey("")
    setOpen(false)
  }
  return (
    <li className="rounded-xl border border-[#eceef1] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
            {provider.name}
            {pill}
          </p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{provider.description}</p>
          {state?.lastError ? <p className="mt-1 text-[12.5px] text-[#b42318]">{state.lastError}</p> : null}
        </div>
        {provider.id === "csv" ? (
          <a href="/api/physical/orders/export" className={cn(BTN_SECONDARY, "shrink-0")}>
            Download
          </a>
        ) : connectable ? (
          <button type="button" className={cn(BTN_SECONDARY, "shrink-0")} onClick={() => setOpen((v) => !v)}>
            {state && state.status !== "disconnected" ? "Manage" : "Set up"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-[#eceef1] pt-3">
          {provider.fields.includes("url") ? (
            <Field label="Webhook address" hint="A public https address">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/storelib/orders" inputMode="url" />
            </Field>
          ) : null}
          {provider.fields.includes("webhook_secret") ? (
            <Field label="Signing secret" hint={state?.secretHint ? `Saved, ends in ${state.secretHint}. Leave empty to keep it.` : "16 characters or more. Check X-Storelib-Signature against it."}>
              <TextInput type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
          ) : null}
          {provider.fields.includes("api_key") ? (
            <Field label="API key" hint={state?.keyHint ? `Saved, ends in ${state.keyHint}. Leave empty to keep it.` : "Stored encrypted. Never shown again."}>
              <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            </Field>
          ) : null}
          {provider.availability === "needs_setup" ? <Notice tone="amber">Storelib doesn't send orders to {provider.name} yet. Saving a key gets you ready for when it does.</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {state && state.status !== "disconnected" ? (
              <button type="button" className={BTN_DANGER} onClick={() => save(true)}>
                Disconnect
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} onClick={() => save(false)}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

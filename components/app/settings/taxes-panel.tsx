"use client"

/**
 * ===========================================================================
 *  SETTINGS › TAXES
 * ===========================================================================
 * For every store, in three cards, simplest first (round AH, the owner: "too
 * many options, too complex"). lib/tax/rules.ts says what each part means.
 *
 *   Tax              where things stand in one or two short lines, then:
 *                    charge it or not; prices including it or not; tax on
 *                    shipping (physical commerce on); tax on digital products
 *   Regions          a row each: the country's flag, its name (and state),
 *                    the rate's name and the rate. "Add region" asks for
 *                    the country (the one the person is in suggested), an
 *                    optional state, and the rate. A row opens to change its
 *                    rate, remove it, and give single products their own rate
 *                    there. How regions work is folded under the list.
 *   Tax collected    what orders collected, by country, with the CSV, and
 *                    Who does what, a link that opens a short explanation
 *                    (a dialog on a computer, a sheet on a phone: Modal).
 *
 * Nothing here charges anybody until "Charge tax" is on and the buyer's
 * address is in a region.
 */
import * as React from "react"
import { ChevronRight, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { regionsOf } from "@/lib/physical/regions"
import { TAX_REGION_RULES, percentText } from "@/lib/tax/rules"
import { CountryFlag } from "@/components/app/settings/country-picker"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { STORE_CURRENCY_EVENT, useStoreCurrencyIfSet } from "@/lib/store/currency-context"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, DecimalInput, Field, Modal, Notice, SelectInput, TextInput, Toggle, api, peekGet } from "@/components/physical/ui"
import { tt } from "@/lib/i18n/text"

interface Region {
  id: string
  country: string
  region: string | null
  name: string
  rateBps: number
}
interface Override {
  id: string
  taxRateId: string
  productId: string
  name: string
  rateBps: number
  productTitle: string | null
}
interface Setup {
  enabled: boolean
  included: boolean
  onShipping: boolean
  digital: boolean
  regions: Region[]
  overrides: Override[]
  ready: boolean
  detectedCountry?: string | null
  currency?: string
  products?: { id: string; title: string }[]
}

const regionName = (r: Pick<Region, "country" | "region">) => {
  const state = r.region ? regionsOf(r.country).find((x) => x.code === r.region)?.name ?? r.region : null
  return state ? `${state}, ${countryName(r.country)}` : countryName(r.country)
}

export function TaxesPanel() {
  const physical = usePhysicalCommerceEnabled()
  /* Drawn at once from what Settings fetched while the person was on another tab (prefetchGet). */
  const [setup, setSetup] = React.useState<Setup | null>(() => peekGet<Setup>("/api/store/taxes"))
  const [error, setError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  /* What the overview says, read again whenever the setup changes, so the status line under Tax is never behind a switch. */
  const overview = useTaxOverview(setup ? `${setup.enabled}:${setup.digital}:${setup.regions.length}` : "")

  const load = React.useCallback(async () => {
    const r = await api<Setup>("/api/store/taxes")
    if (r.ok) setSetup(r.data)
    else setError(r.error)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  /* A currency change rewrites prices. Read taxes again so the amounts and the symbol follow. */
  React.useEffect(() => {
    const on = () => void load()
    window.addEventListener(STORE_CURRENCY_EVENT, on)
    return () => window.removeEventListener(STORE_CURRENCY_EVENT, on)
  }, [load])

  /* A server answer is the whole setup again; the person's own extras are kept. The currency follows the store. */
  const take = (next: Setup) => setSetup((s) => ({ ...next, detectedCountry: s?.detectedCountry, currency: next.currency || s?.currency, products: s?.products ?? next.products }))

  const flip = async (patch: Partial<Pick<Setup, "enabled" | "included" | "onShipping" | "digital">>) => {
    setSetup((s) => (s ? { ...s, ...patch } : s))
    const r = await api<Setup>("/api/store/taxes", { method: "PUT", body: patch })
    if (!r.ok) {
      setError(r.error)
      void load()
      return
    }
    setError(null)
    take(r.data)
  }

  if (error && !setup) return <Notice>{error}</Notice>
  if (!setup) {
    /* No outline of itself: the settings fade in when they come (settings-content-in). */
    return <div className="min-h-[360px]" aria-busy="true" />
  }
  const liveCurrency = useStoreCurrencyIfSet()
  const currency = (liveCurrency || setup.currency || "USD").toUpperCase()
  const suggested = setup.detectedCountry && !setup.regions.some((r) => r.country === setup.detectedCountry) ? setup.detectedCountry : null

  return (
    <div className="space-y-4 sm:space-y-6" data-taxes="">
      {!setup.ready ? <Notice tone="amber">{tt("Taxes need their database update (SQL parts 78 and 110). Until they run, nothing here is kept.")}</Notice> : null}

      <Card title={tt("Tax")} description={tt("Storelib adds what you set here at checkout, and nothing more.")} help="taxes">
        <div className="space-y-4">
          <TaxStatus overview={overview.data} />
          <Toggle label={tt("Charge tax")} description={setup.enabled ? tt("Added at checkout for buyers in your regions.") : tt("Off, buyers pay your prices and nothing more.")} checked={setup.enabled} onChange={(v) => void flip({ enabled: v })} />
          {setup.enabled ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-tax-inclusive="">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Your prices")}</p>
                  <p className="text-[13px] text-[#6b7280]">{setup.included ? tt("Already include tax, in {currency}", { currency }) : tt("Tax is added on top, in {currency}", { currency })}</p>
                </div>
                <div role="radiogroup" aria-label={tt("Tax inclusivity")} className="inline-flex shrink-0 gap-1 rounded-xl bg-[#f1f2f4] p-1">
                  {[
                    { id: false, label: tt("Added on top") },
                    { id: true, label: tt("Included") },
                  ].map((o) => (
                    <button
                      key={String(o.id)}
                      type="button"
                      role="radio"
                      aria-checked={setup.included === o.id}
                      onClick={() => void flip({ included: o.id })}
                      className={cn("h-8 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors sm:px-3", setup.included === o.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle label={tt("Charge tax on digital products")} description={tt("Downloads, courses and memberships, by the buyer's country.")} checked={setup.digital} onChange={(v) => void flip({ digital: v })} />
              {physical ? <Toggle label={tt("Charge tax on shipping")} description={tt("Delivery is taxed at the same rate as the items.")} checked={setup.onShipping} onChange={(v) => void flip({ onShipping: v })} /> : null}
            </>
          ) : null}
        </div>
      </Card>

      <Card
        title={tt("Regions")}
        description={tt("The countries or states where you charge tax, and the rate in each.")}
        action={
          <button type="button" className={BTN_SECONDARY} onClick={() => setCreating(setup.detectedCountry ?? "")} data-create-region="">
            <Plus className="h-4 w-4" />
            {tt("Add region")}
          </button>
        }
      >
        {setup.regions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e3e5e8] px-4 py-6 text-center" data-tax-regions-empty="">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("No regions yet")}</p>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Add the countries where you have to charge tax.")}</p>
            {suggested ? (
              <button type="button" onClick={() => setCreating(suggested)} className="mt-3 inline-flex h-8 items-center gap-2 rounded-full bg-[#f1f2f4] px-3 text-[13px] font-medium text-[#374151] hover:bg-[#e8e9ec]" data-suggest-region={suggested}>
                <CountryFlag code={suggested} />
                {tt("Add {count}", { count: countryName(suggested) })}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-tax-regions="">
            {setup.regions.map((r) => {
              const own = setup.overrides.filter((o) => o.taxRateId === r.id)
              const isOpen = open === r.id
              return (
                <li key={r.id} data-tax-region={r.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa]">
                    <CountryFlag code={r.country} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{regionName(r)}</span>
                      <span className="block text-[12.5px] text-[#6b7280]">
                        {r.name}
                        {own.length ? tt(" · {length} product {length, plural, one {rate} other {rates}}", { length: own.length }) : ""}
                      </span>
                    </span>
                    <span className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{percentText(r.rateBps)}</span>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-[#c4c8ce] transition-transform duration-200", isOpen && "rotate-90")} aria-hidden />
                  </button>
                  {isOpen ? <RegionEditor region={r} overrides={own} products={setup.products ?? []} onChange={take} onRemoved={() => setOpen(null)} /> : null}
                </li>
              )
            })}
          </ul>
        )}
        {error ? <Notice className="mt-3">{error}</Notice> : null}
        <RegionsExplained physical={physical} />
      </Card>

      <TaxOverview currency={currency} overview={overview} />

      <CreateRegion
        country={creating}
        onClose={() => setCreating(null)}
        onCreated={(next) => {
          take(next)
          setCreating(null)
        }}
        taken={setup.regions}
      />
    </div>
  )
}

/**
 * HOW TAX REGIONS WORK, in plain words, folded under the regions (open it to read):
 * which address picks the region at each checkout and what a buyer
 * elsewhere pays. It says what lib/tax/rules.ts and lib/physical/totals.ts
 * do, and tests/tax-settings-wiring.test.ts holds the two to each other.
 */
function RegionsExplained({ physical }: { physical: boolean }) {
  const lines = [TAX_REGION_RULES.what, ...(physical ? [TAX_REGION_RULES.physical] : []), TAX_REGION_RULES.digital, TAX_REGION_RULES.elsewhere]
  return (
    <details className="group mt-3 [&_summary::-webkit-details-marker]:hidden" data-tax-regions-explained="">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
        {tt("How tax regions work")}
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-[#9ca3af] transition-[rotate] duration-200 group-open:rotate-90" />
      </summary>
      <ul className="mt-2 space-y-1 rounded-xl bg-[#f8f9fa] px-3.5 py-3 text-[12.5px] leading-[18px] text-[#4b5563]">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      {/* The full guide, with worked examples. It lives in the physical products part of the Help Center, which is only there while physical commerce is on. */}
      {physical ? (
        <a href="/help/physical-products/taxes" target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12.5px] font-medium text-[#1a1a2e] underline underline-offset-2" data-tax-guide="">
          {tt("Read the tax guide")}
        </a>
      ) : null}
    </details>
  )
}

/**
 * What the tax is called where the region is, for receipts: a starting word
 * the merchant can change, never a rate. GST in Australia, New Zealand,
 * India, Singapore and Canada (HST in some provinces, so it says both),
 * Sales tax in the US, Consumption tax in Japan, VAT almost everywhere else.
 */
const TAX_NAME: Record<string, string> = { get US() { return tt("Sales tax") }, CA: "GST/HST", AU: "GST", NZ: "GST", IN: "GST", SG: "GST", MY: "SST", get JP() { return tt("Consumption tax") }, CH: "MWST/TVA", NO: "MVA" }
function taxNameFor(country: string | null | undefined): string {
  return (country && TAX_NAME[country.toUpperCase()]) || "VAT"
}

function CreateRegion({ country, onClose, onCreated, taken }: { country: string | null; onClose: () => void; onCreated: (s: Setup) => void; taken: Region[] }) {
  const [c, setC] = React.useState("")
  const [state, setState] = React.useState("")
  const [rate, setRate] = React.useState("")
  const [name, setName] = React.useState("VAT")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (country === null) return
    setC(country)
    setState("")
    setRate("")
    setName(taxNameFor(country))
    setError(null)
  }, [country])
  const states = c ? regionsOf(c) : []
  const exists = taken.some((t) => t.country === c && (t.region ?? "") === state)
  return (
    <Modal
      open={country !== null}
      onClose={onClose}
      title={tt("Create tax region")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!c || !rate || busy || exists}
            onClick={async () => {
              setBusy(true)
              const r = await api<Setup>("/api/store/taxes/regions", { body: { country: c, region: state || null, rate, name } })
              setBusy(false)
              if (!r.ok) return setError(r.error)
              onCreated(r.data)
            }}
          >
            {busy ? tt("Creating") : tt("Create region")}
          </button>
        </>
      }
    >
      <div className="space-y-3" data-create-region-form="">
        <Field label={tt("Country")} htmlFor="tax-country">
          <SelectInput id="tax-country" value={c} onChange={(v) => { setC(v); setState(""); setName(taxNameFor(v)) }}>
            <option value="">{tt("Select country")}</option>
            {COUNTRIES.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        {states.length ? (
          <Field label={c === "CA" ? tt("Province") : tt("State")} hint={tt("Leave as the whole country unless the rate is different there.")} htmlFor="tax-state">
            <SelectInput id="tax-state" value={state} onChange={setState}>
              <option value="">{tt("Whole country")}</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label={tt("Name")} hint={tt("What receipts call it.")} htmlFor="tax-name">
            <TextInput id="tax-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={tt("Rate")} htmlFor="tax-rate">
            <DecimalInput id="tax-rate" value={rate} onChange={setRate} suffix="%" placeholder="19" />
          </Field>
        </div>
        {exists ? <Notice tone="amber">{state ? tt("That state") : tt("That country")} {tt("already has a region. Open it to change its rate.")}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function RegionEditor({ region, overrides, products, onChange, onRemoved }: { region: Region; overrides: Override[]; products: { id: string; title: string }[]; onChange: (s: Setup) => void; onRemoved: () => void }) {
  const [rate, setRate] = React.useState(String(region.rateBps / 100))
  const [name, setName] = React.useState(region.name)
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [product, setProduct] = React.useState("")
  const [productRate, setProductRate] = React.useState("")
  const changed = rate !== String(region.rateBps / 100) || name !== region.name
  const free = products.filter((p) => !overrides.some((o) => o.productId === p.id))
  return (
    <div className="space-y-3 border-t border-[#f1f2f4] bg-[#fafafa] px-3.5 py-3.5" data-region-editor="">
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <Field label={tt("Name")}>
          <TextInput value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={tt("Rate")}>
          <DecimalInput value={rate} onChange={setRate} suffix="%" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={cn(BTN_GHOST, "text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")}
          onClick={async () => {
            const r = await api<Setup>(`/api/store/taxes/regions/${region.id}`, { method: "DELETE" })
            if (!r.ok) return setError(r.error)
            onChange(r.data)
            onRemoved()
          }}
        >
          <Trash2 className="h-4 w-4" />
          {tt("Remove region")}
        </button>
        {changed ? (
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={async () => {
              const r = await api<Setup>(`/api/store/taxes/regions/${region.id}`, { method: "PATCH", body: { rate, name } })
              if (!r.ok) return setError(r.error)
              setError(null)
              onChange(r.data)
            }}
          >
            {tt("Save")}
          </button>
        ) : null}
      </div>

      <div className="border-t border-[#eceef1] pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">{tt("Product rates")}</p>
          {!adding && free.length ? (
            <button type="button" className={BTN_GHOST} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {tt("Add product rate")}
            </button>
          ) : null}
        </div>
        <p className="text-[12.5px] text-[#6b7280]">{tt("A product taxed differently here, like books or food at a reduced rate.")}</p>
        {overrides.length ? (
          <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-lg border border-[#eceef1] bg-white">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#1a1a2e]">{o.productTitle ?? tt("A product")}</span>
                <span className="text-[13.5px] font-medium tabular-nums">{percentText(o.rateBps)}</span>
                <button
                  type="button"
                  aria-label={tt("Remove this product's rate")}
                  className={cn(BTN_GHOST, "w-9 px-0")}
                  onClick={async () => {
                    const r = await api<Setup>(`/api/store/taxes/overrides/${o.id}`, { method: "DELETE" })
                    if (r.ok) onChange(r.data)
                    else setError(r.error)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {adding ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
            <Field label={tt("Product")}>
              <SelectInput value={product} onChange={setProduct}>
                <option value="">{tt("Choose a product")}</option>
                {free.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={tt("Rate")}>
              <DecimalInput value={productRate} onChange={setProductRate} suffix="%" />
            </Field>
            <div className="flex gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)}>
                {tt("Cancel")}
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={!product || !productRate}
                onClick={async () => {
                  const r = await api<Setup>("/api/store/taxes/overrides", { body: { taxRateId: region.id, productId: product, rate: productRate } })
                  if (!r.ok) return setError(r.error)
                  setError(null)
                  setAdding(false)
                  setProduct("")
                  setProductRate("")
                  onChange(r.data)
                }}
              >
                {tt("Add")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </div>
  )
}

/* ── Round AG: the overview ───────────────────────────────────────────────── */

interface TaxStatusRow {
  key: string
  state?: "charging" | "no_region" | "off" | "auto" | "own_rates" | "none"
  count?: number
  digital?: boolean
  title: string
  detail: string
  tone: "on" | "off" | "auto"
}
interface TaxOverviewData {
  status: TaxStatusRow[]
  summary: {
    totalCents: number
    orders: number
    byCountry: { country: string | null; label: string; taxCents: number; orders: number }[]
    otherCurrencies?: { currency: string; taxCents: number; orders: number }[]
  }
  days: number
  currency: string
}

/** A status line in the dashboard's language (lib/tax/report.ts taxStatus decides which). The server's English when it is an older answer. */
function statusWords(s: TaxStatusRow): { title: string; detail: string } {
  switch (s.state) {
    case "charging":
      return { title: tt("Charging tax in {n, plural, one {# region} other {# regions}}", { n: s.count ?? 0 }), detail: s.digital ? tt("On physical and digital sales, at the rates you set below.") : tt("On physical sales, at the rates you set below. Digital sales are not taxed (switch below).") }
    case "no_region":
      return { title: tt("Tax is on, but no region is set"), detail: tt("Nothing is charged until you add a region below.") }
    case "off":
      return { title: tt("Not charging tax"), detail: tt("Buyers pay your prices and nothing more.") }
    case "auto":
      return { title: tt("Memberships: worked out automatically"), detail: tt("Community plans and memberships are charged through Storelib's Stripe account, and Stripe Tax works out the rate from where the buyer is, on every renewal.") }
    case "own_rates":
      return { title: tt("Memberships: your rates"), detail: tt("Community plans and memberships charge your rate for the buyer's country, on every renewal.") }
    case "none":
      return { title: tt("Memberships: no tax"), detail: tt("Turn on tax on digital products and add a region to charge it on memberships.") }
    default:
      return { title: s.title, detail: s.detail }
  }
}

/** The overview, for the period chosen; read again when `version` (the setup) changes. */
function useTaxOverview(version: string) {
  const [days, setDays] = React.useState(30)
  const [data, setData] = React.useState<TaxOverviewData | null>(() => peekGet<TaxOverviewData>("/api/store/taxes/overview?days=30"))
  React.useEffect(() => {
    let live = true
    void api<TaxOverviewData>(`/api/store/taxes/overview?days=${days}`).then((r) => {
      if (live && r.ok) setData(r.data)
    })
    return () => {
      live = false
    }
  }, [days, version])
  return { days, setDays, data }
}
type TaxOverviewState = ReturnType<typeof useTaxOverview>

/**
 * WHERE THINGS STAND, in a line or two at the top of the Tax card: the store's
 * own tax and its memberships', a dot each. The longer words are the line's
 * title, for whoever wants them; the switches under it say the rest.
 */
function TaxStatus({ overview }: { overview: TaxOverviewData | null }) {
  const rows = overview?.status ?? []
  if (!rows.length) return null
  return (
    <ul className="space-y-1.5 rounded-xl bg-[#f8f9fa] px-3.5 py-2.5" data-tax-status="">
      {rows.map((s) => {
        const words = statusWords(s)
        return (
          <li key={s.key} title={words.detail} className="flex items-center gap-2 text-[13px] text-[#1a1a2e]">
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", s.tone === "on" ? "bg-[#16a34a]" : s.tone === "auto" ? "bg-[#2563eb]" : "bg-[#c4c7cc]")} />
            <span className="min-w-0 truncate">{words.title}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** An amount in a currency, the way the dashboard writes money. */
function moneyIn(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/**
 * TAX COLLECTED, at the foot of the page: what the store's orders collected in
 * a period and where (lib/tax/report-model), the CSV behind it, and Who does
 * what, which opens a short explanation. Nothing here asks for anything.
 */
function TaxOverview({ currency, overview }: { currency: string; overview: TaxOverviewState }) {
  const { days, setDays, data } = overview
  const [explain, setExplain] = React.useState(false)
  const cur = (data?.currency || currency || "USD").toUpperCase()
  const fmt = (cents: number) => moneyIn(cents, cur)
  const membershipsAuto = data?.status.some((s) => s.key === "memberships" && s.tone === "auto") === true
  const top = data?.summary.byCountry.slice(0, 8) ?? []
  return (
    <Card
      title={tt("Tax collected")}
      action={
        <div role="radiogroup" aria-label={tt("Period")} className="inline-flex gap-1 rounded-xl bg-[#f1f2f4] p-1" data-tax-period="">
          {[
            { d: 30, label: tt("30 days") },
            { d: 90, label: tt("90 days") },
            { d: 365, label: tt("12 months") },
          ].map((o) => (
            <button key={o.d} type="button" role="radio" aria-checked={days === o.d} onClick={() => setDays(o.d)} className={cn("h-8 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-medium transition-colors", days === o.d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}>
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-4" data-tax-overview="">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[22px] font-semibold tabular-nums tracking-[-0.01em] text-[#1a1a2e]" data-tax-total="">
              {data ? fmt(data.summary.totalCents) : " "}
            </p>
            <p className="text-[12.5px] text-[#6b7280]">{data ? tt("{n, plural, one {# order} other {# orders}} with tax", { n: data.summary.orders }) : " "}</p>
          </div>
          {data && data.summary.orders > 0 ? (
            <a href={`/api/store/taxes/overview?days=${days}&format=csv`} className={BTN_SECONDARY} data-tax-csv="" download>
              {tt("Download CSV")}
            </a>
          ) : null}
        </div>
        {top.length ? (
          <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-tax-countries="">
            {top.map((l) => (
              <li key={l.country ?? "none"} className="flex items-center gap-3 px-3.5 py-2.5">
                {l.country ? <CountryFlag code={l.country} /> : <span aria-hidden className="h-4 w-5 rounded-[3px] bg-[#eceef1]" />}
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{l.country ? countryName(l.country) : tt("Country not recorded")}</span>
                <span className="hidden text-[12.5px] text-[#6b7280] sm:inline">{tt("{n, plural, one {# order} other {# orders}}", { n: l.orders })}</span>
                <span className="w-24 text-right text-[14px] font-medium tabular-nums text-[#1a1a2e]">{fmt(l.taxCents)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {data?.summary.otherCurrencies?.length ? (
          <p className="text-[12.5px] text-[#6b7280]" data-tax-other-currency="">
            {data.summary.otherCurrencies
              .map((o) => tt("Also {amount} from {n, plural, one {# order} other {# orders}} in {currency}, sold before your store's currency changed.", { amount: moneyIn(o.taxCents, o.currency), n: o.orders, currency: o.currency }))
              .join(" ")}
          </p>
        ) : null}
        <button type="button" onClick={() => setExplain(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg text-[13px] font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 [-webkit-tap-highlight-color:transparent]" data-tax-responsibility="" aria-haspopup="dialog">
          {tt("Who does what")}
          <ChevronRight aria-hidden className="h-3.5 w-3.5 text-[#9ca3af]" />
        </button>
        <WhoDoesWhat open={explain} onClose={() => setExplain(false)} membershipsAuto={membershipsAuto} />
      </div>
    </Card>
  )
}

/**
 * WHO DOES WHAT, opened from Tax collected: a dialog on a computer, a sheet
 * on a phone (Modal). Each part is what the code does, never more:
 *
 *   Storelib     lib/tax/rules.ts at every checkout (single product, basket,
 *                website, shipped goods), the tax on the order, the receipt
 *                and the invoice, and Tax collected (lib/tax/report-model)
 *   You          registering, filing and paying stay with the seller;
 *                nothing in Storelib files or pays tax
 *   Memberships  Storelib's Stripe account: Stripe Tax when it is on for
 *                Storelib (lib/tax/membership.ts), else the store's own rate
 *   Payments     Stripe, or Airwallex, charge the total the checkout worked
 *                out; they do not work out tax for products
 */
function WhoDoesWhat({ open, onClose, membershipsAuto }: { open: boolean; onClose: () => void; membershipsAuto: boolean }) {
  const parts: { who: string; what: string }[] = [
    { who: tt("Storelib"), what: tt("Adds the tax your settings here call for at checkout, shows it to the buyer, and puts it on the order, the receipt and the invoice. Tax collected adds it up for you.") },
    { who: tt("You"), what: tt("You are the seller, so registering for tax where you need to, filing returns and paying the tax stay with you. Storelib does not file or pay tax for you.") },
    {
      who: tt("Memberships and community plans"),
      what: membershipsAuto
        ? tt("Charged through Storelib's Stripe account. Stripe Tax works out the rate from where the buyer is, on every renewal.")
        : tt("Charged through Storelib's Stripe account, at your rate for the buyer's country, on every renewal."),
    },
    { who: tt("Stripe and Airwallex"), what: tt("They take the payment for the total Storelib worked out, tax included. They don't work out tax on your products.") },
  ]
  return (
    <Modal open={open} onClose={onClose} title={tt("Who does what")}>
      <div className="space-y-4 pb-1" data-tax-who="">
        <dl className="divide-y divide-[#f1f2f4]">
          {parts.map((p) => (
            <div key={p.who} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-[14px] font-semibold text-[#1a1a2e]">{p.who}</dt>
              <dd className="mt-1 text-[14px] leading-[21px] text-[#4b5563]">{p.what}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-xl bg-[#f8f9fa] px-3.5 py-3 text-[13px] leading-5 text-[#4b5563]">{tt("Not sure what applies to you? An accountant can tell you in one conversation, and the CSV is what they will ask for.")}</p>
      </div>
    </Modal>
  )
}

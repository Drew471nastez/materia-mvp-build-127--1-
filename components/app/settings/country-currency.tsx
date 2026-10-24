"use client"

/**
 * ===========================================================================
 *  SETTINGS › STORE DETAILS › COUNTRY & CURRENCY
 * ===========================================================================
 * Where the store is based and the currency it sells in, in one line:
 *
 *   Country & Currency                                        Edit
 *   The country and currency your store sells in.
 *   Selling in                                   France · EUR
 *
 * Edit asks for the country, suggests its own currency (lib/store/
 * selling-currency suggestedCurrencyFor) and saves. The currency is what the
 * website's prices are in and what its checkout charges, so a new currency
 * for a store that already has prices asks once how they move, with three of
 * them shown before and after:
 *
 *   Keep the amounts       100 EUR becomes 100 USD
 *   Convert the amounts    at the day's rate, shown with its date
 *
 * Nothing is chosen for the merchant: Save waits until one is picked.
 * app/api/store/currency does the change in one transaction (SQL part 176).
 */
import * as React from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { countryName } from "@/lib/checkout/countries"
import { countryOf } from "@/lib/account/country"
import { suggestedCurrencyFor, unsupportedLocalCurrency } from "@/lib/store/selling-currency"
import { formatStoreMoney } from "@/lib/store/currency"
import { STORE_CURRENCY_EVENT } from "@/lib/store/currency-context"
import { BTN_PRIMARY, BTN_SECONDARY, Card, Field, Notice, SelectInput, api, peekGet } from "@/components/physical/ui"
import { CountryFlag, CountryPicker } from "./country-picker"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

const PATH = "/api/store/currency"

interface CurrencyState {
  ready: boolean
  country: string | null
  currency: string
  chosen: string | null
  suggested: string | null
  unsupportedLocal: string | null
  detectedCountry: string | null
  currencies: { code: string; label: string }[]
  /** Storelib's marketplace shows this store in US dollars (lib/money/marketplace). */
  marketplaceUsd?: boolean
  catalog: { products: number; variants: number; shippingRates: number; coupons: number; total: number }
  /** The change just made, while it can be undone (a day). */
  lastChange: { id: string; from: string; to: string; mode: string; at: string } | null
}

interface Preview {
  from: string
  to: string
  counts: CurrencyState["catalog"]
  rate: number | null
  asOf: string | null
  examples: { title: string; before: number; converted: number | null }[]
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** "14 Oct": the day the exchange rates are from. */
function dayOf(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function CountryCurrency() {
  const [data, setData] = React.useState<CurrencyState | null>(() => peekGet<CurrencyState>(PATH))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  /* Every price field under /app takes its currency from the layout (app/app/layout.tsx LiveStoreCurrency): told at once when it changes. */
  const changed = (next: CurrencyState) => {
    if (next.currency !== data?.currency) window.dispatchEvent(new CustomEvent(STORE_CURRENCY_EVENT, { detail: next.currency }))
    setData(next)
  }

  React.useEffect(() => {
    let live = true
    void api<CurrencyState>(PATH).then((r) => {
      if (!live) return
      if (r.ok) setData(r.data)
      else setLoadError(r.error)
    })
    return () => {
      live = false
    }
  }, [])

  if (!data) {
    if (loadError) return <Notice>{loadError}</Notice>
    /* The card's own shape while it is read (title, its line, How it works, Selling in), so the cards under it barely move when it lands. */
    return (
      <Card title={tt("Store currency")} description={
          /* Line boxes of the line's own height: three on a phone, two from 640px, as the sentence wraps. */
          <span className="block" aria-hidden>
            <span className="flex h-5 items-center"><span className="block h-3 w-full max-w-[420px] rounded bg-[#f1f2f4]" /></span>
            <span className="flex h-5 items-center"><span className="block h-3 w-full max-w-[360px] rounded bg-[#f1f2f4]" /></span>
            <span className="flex h-5 items-center sm:hidden"><span className="block h-3 w-1/2 rounded bg-[#f1f2f4]" /></span>
          </span>
        } help="currency" action={<span className="block h-10 w-[58px] rounded-lg bg-[#f5f6f7]" />}>
        <div className="flex min-h-[28px] items-center justify-between gap-3" aria-busy="true">
          <span className="text-[14px] text-[#6b7280]">{tt("Selling in")}</span>
          <span className="block h-3.5 w-28 rounded bg-[#f1f2f4]" />
        </div>
      </Card>
    )
  }

  return (
    <Card
      title={tt("Store currency")}
      description={
        /* What it means for a visitor, said plainly beside More currencies below (the owner: a store in Romania expected lei in Romania). */
        data.country
          ? tt("What you price in. Visitors in {country}, and anywhere not listed under More currencies, see prices in it and pay in it.", { country: countryName(data.country) })
          : tt("What you price in. Visitors anywhere not listed under More currencies see prices in it and pay in it.")
      }
      help="currency"
      action={
        editing ? null : (
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)} data-currency-edit="">
            {tt("Edit")}
          </button>
        )
      }
    >
      {!data.ready ? <Notice tone="amber" className="mb-3">{tt("Choosing your currency needs its database update (SQL part 176). Until it runs, your store sells in {currency}.", { currency: data.currency })}</Notice> : null}
      {editing ? (
        <Editor
          data={data}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            changed(next)
            setEditing(false)
            setSaved(true)
            window.setTimeout(() => setSaved(false), 1800)
          }}
        />
      ) : (
        <>
          <div className="flex min-h-[28px] items-center justify-between gap-3" data-selling-in="">
            <span className="text-[14px] text-[#6b7280]">{tt("Selling in")}</span>
            <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
              {saved ? <Check className="h-4 w-4 shrink-0 text-[#067647]" aria-label={tt("Saved")} /> : null}
              {data.country ? <CountryFlag code={data.country} near={false} /> : null}
              <span className="truncate">{data.country ? `${countryName(data.country)} · ${data.currency}` : data.currency}</span>
            </span>
          </div>
          {data.lastChange ? <Undo change={data.lastChange} onDone={changed} /> : null}
        </>
      )}
    </Card>
  )
}

/**
 * ONE QUIET LINE, ONLY WHEN TRUE, IN THE EDITOR. Once Storelib's marketplace
 * shows this store in US dollars (lib/money/marketplace), a creator choosing
 * their currency is told where dollars appear and that their own places stay
 * in the one they pick. Never shown for a dollar store, or before the
 * marketplace is switched over, and not on the card at rest.
 */
function MarketplaceNote({ data }: { data: Pick<CurrencyState, "currency" | "marketplaceUsd"> | null }) {
  if (!data?.marketplaceUsd || data.currency.toUpperCase() === "USD") return null
  return (
    <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-marketplace-usd-note="">
      {tt("Explore and the Storelib marketplace show prices in US dollars, so buyers in every country see one currency. Your store, website and dashboard stay in {currency}.", { currency: data.currency })}
    </p>
  )
}

/**
 * STORE DETAILS, ONE LINE. The currency is set in one place, Settings ›
 * Languages & Currency, beside the extra currencies visitors can switch to;
 * Store details says what it is and links there. A read that fails shows
 * the link alone rather than an error badge in the middle of the page.
 */
export function CurrencyLink() {
  const [data, setData] = React.useState<CurrencyState | null>(() => peekGet<CurrencyState>(PATH))
  React.useEffect(() => {
    let live = true
    void api<CurrencyState>(PATH).then((r) => live && r.ok && setData(r.data))
    const on = (e: Event) => {
      const currency = (e as CustomEvent<string>).detail
      if (typeof currency === "string") setData((d) => (d ? { ...d, currency } : d))
    }
    window.addEventListener(STORE_CURRENCY_EVENT, on)
    return () => {
      live = false
      window.removeEventListener(STORE_CURRENCY_EVENT, on)
    }
  }, [])
  return (
    <Card
      title={tt("Country & currency")}
      action={
        <Link href="/app/settings?tab=markets" className={BTN_SECONDARY} data-currency-link="">
          {tt("Change")}
        </Link>
      }
    >
      <div className="flex min-h-[28px] items-center justify-between gap-3" data-selling-in="">
        <span className="text-[14px] text-[#6b7280]">{tt("Selling in")}</span>
        <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
          {data?.country ? <CountryFlag code={data.country} near={false} /> : null}
          <span className="truncate">{data ? (data.country ? `${countryName(data.country)} · ${data.currency}` : data.currency) : ""}</span>
        </span>
      </div>
    </Card>
  )
}

function Editor({ data, onCancel, onSaved }: { data: CurrencyState; onCancel: () => void; onSaved: (next: CurrencyState) => void }) {
  const startCountry = data.country ?? data.detectedCountry ?? ""
  const [country, setCountry] = React.useState(startCountry)
  /* The currency follows the country until the merchant picks one themselves. */
  const [currency, setCurrency] = React.useState(data.chosen ?? (data.country ? data.currency : suggestedCurrencyFor(startCountry)))
  const [picked, setPicked] = React.useState(!!data.chosen)
  const [mode, setMode] = React.useState<"keep" | "convert" | null>(null)
  /* Changing the currency of a store already set up asks for one tick: the merchant reviews their prices. */
  const [understood, setUnderstood] = React.useState(false)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const key = React.useRef(newKey())

  const changesCurrency = currency !== data.currency
  const asks = changesCurrency && data.catalog.total > 0
  const local = country ? unsupportedLocalCurrency(country) : null

  /* What the change would do: read when a new currency is chosen, before anything is saved. */
  React.useEffect(() => {
    setMode(null)
    setPreview(null)
    setUnderstood(false)
    key.current = newKey()
    if (!asks) return
    let live = true
    void api<Preview>(PATH, { method: "POST", body: { currency } }).then((r) => {
      if (!live) return
      if (r.ok) setPreview(r.data)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [currency, asks])

  const save = async () => {
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = { country: country || null, currency, key: key.current }
    if (asks) {
      body.mode = mode
      if (mode === "convert") {
        body.rate = preview?.rate
        body.asOf = preview?.asOf
      }
    }
    const r = await api<CurrencyState & { preview?: Preview }>(PATH, { method: "PUT", body })
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      /* The rate moved since it was shown: the new amounts are shown, and Save asks again. */
      const fresh = r.data?.preview as Preview | undefined
      if (fresh) setPreview(fresh)
      return
    }
    onSaved(r.data)
  }

  const nothingChanged = country === (data.country ?? "") && currency === data.currency && data.chosen === currency
  const example = preview?.examples[0] ?? null

  return (
    <div className="space-y-4" data-currency-editor="">
      <Field label={tt("Country")} htmlFor="store-country">
        <CountryPicker
          id="store-country"
          value={country ? countryName(country) : ""}
          onChange={(name) => {
            const code = countryOf(name) ?? ""
            setCountry(code)
            if (!picked && code) setCurrency(suggestedCurrencyFor(code))
          }}
        />
      </Field>

      <Field
        label={tt("Currency")}
        htmlFor="store-currency"
        hint={local ? tt("Storelib can't take card payments in {local} yet, so your store sells in {currency}.", { local, currency }) : tt("Prices and checkout use it. Payouts arrive in your bank's currency.")}
      >
        <SelectInput
          id="store-currency"
          value={currency}
          onChange={(v) => {
            setCurrency(v)
            setPicked(true)
          }}
        >
          {data.currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </SelectInput>
        {country && suggestedCurrencyFor(country) !== currency && !unsupportedLocalCurrency(country) ? (
          <button
            type="button"
            onClick={() => {
              setCurrency(suggestedCurrencyFor(country))
              setPicked(true)
            }}
            className="mt-1.5 inline-flex h-7 items-center rounded-full bg-[#f1f2f4] px-2.5 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec]"
            data-suggest-currency={suggestedCurrencyFor(country)}
          >
            {tt("Sell in {currency}, {country}'s own currency", { currency: suggestedCurrencyFor(country), country: countryName(country) })}
          </button>
        ) : null}
      </Field>

      {asks ? (
        <div className="space-y-2.5" data-currency-change="">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">{tt("What should happen to your prices?")}</p>
          <div role="radiogroup" aria-label={tt("What should happen to your prices?")} className="grid gap-2.5 sm:grid-cols-2">
            <Choice
              on={mode === "keep"}
              onClick={() => setMode("keep")}
              title={tt("Keep the amounts")}
              text={example ? tt("{title}: {before} becomes {after}.", { title: example.title, before: formatStoreMoney(example.before, data.currency), after: formatStoreMoney(example.before, currency) }) : tt("100 {from} becomes 100 {to}.", { from: data.currency, to: currency })}
              data="keep"
            />
            <Choice
              on={mode === "convert"}
              onClick={() => preview?.rate && setMode("convert")}
              disabled={!preview?.rate}
              title={tt("Convert the amounts")}
              text={
                !preview
                  ? tt("Reading today's exchange rate")
                  : !preview.rate
                    ? tt("Today's exchange rate isn't available yet.")
                    : example && example.converted !== null
                      ? tt("{title}: {before} becomes {after}.", { title: example.title, before: formatStoreMoney(example.before, data.currency), after: formatStoreMoney(example.converted, currency) })
                      : tt("1 {from} becomes {rate} {to}.", { from: data.currency, rate: String(preview.rate), to: currency })
              }
              data="convert"
            />
          </div>
          {preview ? (
            <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-currency-facts="">
              {tt("{count, plural, one {# price changes} other {# prices change}}. Past orders keep their currency.", { count: preview.counts.total })}
              {preview.rate && mode === "convert" ? ` ${tt("Rate: 1 {from} = {rate} {to}, {day}.", { from: preview.from, rate: String(preview.rate), to: preview.to, day: dayOf(preview.asOf) })}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {changesCurrency && data.country ? (
        <label className="group flex cursor-pointer items-start gap-2.5 py-0.5" data-currency-understood="">
          <span className="relative mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[5px] border border-[#c9cdd3] bg-white shadow-[0_1px_0_rgba(26,26,46,0.04)] transition-[background-color,border-color,box-shadow] duration-150 group-hover:border-[#9ca3af] checked:border-[#1a1a2e] checked:bg-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
            />
            <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none relative h-3 w-3 scale-75 text-white opacity-0 transition-[opacity,translate,scale] duration-150 peer-checked:scale-100 peer-checked:opacity-100">
              <path d="M2.5 6.2 4.9 8.5 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium leading-5 text-[#1a1a2e]">{tt("I understand the risk of changing the store currency")}</span>
            <span className="mt-0.5 block text-[12.5px] leading-[18px] text-[#6b7280]" data-currency-notice="">{tt("Review your prices across the store after changing currency, so checkout holds no surprises.")}</span>
          </span>
        </label>
      ) : null}

      {/* Where dollars show, said while the currency is being chosen (Edit), not on the card at rest. Follows the currency picked here. */}
      <MarketplaceNote data={{ currency, marketplaceUsd: data.marketplaceUsd }} />
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={busy}>
          {tt("Cancel")}
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={busy || (asks && !mode) || (changesCurrency && !!data.country && !understood) || (nothingChanged && !!data.country)} data-currency-save="">
          {busy ? tt("Saving") : tt("Save")}
        </button>
      </div>
    </div>
  )
}

function Choice({ on, onClick, title, text, disabled, data }: { on: boolean; onClick: () => void; title: string; text: string; disabled?: boolean; data: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      data-currency-mode={data}
      className={cn(
        "min-h-[64px] rounded-xl border px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-150",
        on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:border-[#c9cdd3]",
        disabled && "cursor-default opacity-60 hover:border-[#e5e7eb]",
      )}
    >
      <span className="block text-[14px] font-medium text-[#1a1a2e]">{title}</span>
      <span className="mt-0.5 block text-[12.5px] leading-[18px] text-[#6b7280]">{text}</span>
    </button>
  )
}

/** "Changed from EUR at 14:05. Undo": the latest change, put back as it was (store_currency_restore), asked once. */
function Undo({ change, onDone }: { change: NonNullable<CurrencyState["lastChange"]>; onDone: (next: CurrencyState) => void }) {
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const time = new Date(change.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const undo = async () => {
    setBusy(true)
    setError(null)
    const r = await api<CurrencyState>(PATH, { method: "PATCH", body: { undo: change.id } })
    setBusy(false)
    if (r.ok) onDone(r.data)
    else setError(r.error)
  }
  return (
    <div className="mt-3 border-t border-[#f1f2f4] pt-3 text-[13px] leading-[19px] text-[#6b7280]" data-currency-undo="">
      {asking ? (
        <>
          <p>
            {change.mode === "convert"
              ? tt("Put back {from} and every price as it was at {time}? Prices you changed since then go back too.", { from: change.from, time })
              : tt("Put back {from} at {time}? The amounts stay as they are.", { from: change.from, time })}
          </p>
          {error ? <Notice className="mt-2">{error}</Notice> : null}
          <div className="mt-2.5 flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setAsking(false)} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void undo()} disabled={busy} data-currency-undo-confirm="">
              {busy ? tt("Undoing") : tt("Undo")}
            </button>
          </div>
        </>
      ) : (
        <p className="flex items-center justify-between gap-3">
          <span>{tt("Changed from {from} at {time}.", { from: change.from, time })}</span>
          <button type="button" onClick={() => setAsking(true)} className="shrink-0 font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
            {tt("Undo")}
          </button>
        </p>
      )}
    </div>
  )
}

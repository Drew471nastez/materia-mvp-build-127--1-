"use client"

/**
 * ===========================================================================
 *  SETTINGS › STORE DETAILS
 * ===========================================================================
 * Who the store is to its buyers, and where it is based:
 *
 *   logo           the picture at the top of receipts, order pages and
 *                  customer emails (store_settings.logo_url, part 118);
 *                  empty, the website's logo, then the person's photo
 *   name           what receipts, order emails and the checkout's header
 *                  say the order is from (store_settings.store_name; empty,
 *                  the person's own name, as before)
 *   contact email  where buyers write; the same address receipts already
 *                  carry (creators.support_email), so changing it here is
 *                  changing it there
 *   phone          a number buyers and couriers can call, with the country's
 *                  calling code in front, suggested from where the person is
 *   country and    where the store is based and the currency it sells in
 *   currency       (./country-currency.tsx): the country new locations and
 *                  tax start in, the currency its prices and checkout use
 *   orders from    (physical commerce on) the default location new orders
 *                  are assigned to and stock is taken from
 *
 * Saved with one button per card. lib/store/settings-server.ts checks
 * everything again.
 */
import * as React from "react"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { callingCode } from "@/lib/account/phone"
import { PhoneField } from "@/components/app/settings/phone-field"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_SECONDARY, Card, Field, Notice, SaveButton, SelectInput, TextInput, api, peekGet, type SaveState } from "@/components/physical/ui"
import { FilesLibraryChooser } from "@/components/files/files-library"
import type { CheckoutConfig } from "@/lib/store/checkout-config"
import { addressWordsFor, needsPostalCode, taxIdFor, type BusinessDetails } from "@/lib/checkout/business"
import { tt } from "@/lib/i18n/text"
import { followSaved } from "@/lib/settings/follow-saved"
import { CurrencyLink } from "./country-currency"

interface Settings {
  storeName: string | null
  phone: string | null
  phoneCountry: string | null
  defaultCountry: string | null
  checkout: CheckoutConfig
  defaultSalesChannelId: string | null
  logoUrl?: string | null
  /** Business details for receipts and invoices (SQL part 153); null until filled in. */
  legal?: BusinessDetails | null
  ready: boolean
}
interface Loaded {
  settings: Settings
  detectedCountry: string | null
  supportEmail: string | null
  /** What the form starts from while nothing is saved: the store's Storelib name and the account's email (app/api/store/settings). */
  suggested?: { storeName: string | null; contactEmail: string | null }
  /** What receipts show while no store logo is set (lib/store/identity-server.ts). */
  logoDefault?: { url: string; from: "website" | "profile" | "store" | null } | null
}
interface Location {
  id: string
  name: string
  active?: boolean
}

const DIAL = COUNTRIES.filter((c) => callingCode(c.code)).map((c) => ({ code: c.code, label: `${c.name} (+${callingCode(c.code)})` }))

function useSave() {
  const [state, setState] = React.useState<SaveState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const save = async (body: Record<string, unknown>) => {
    setState("saving")
    const r = await api<{ settings: Settings }>("/api/store/settings", { method: "PUT", body })
    if (!r.ok) {
      setError(r.error)
      setState("idle")
      return null
    }
    setError(null)
    setState("saved")
    window.setTimeout(() => setState("idle"), 1600)
    return r.data.settings
  }
  return { state, error, save }
}

/** A "Use Romania" chip under a field the person has not set, from where they are. */
function Suggest({ code, onUse }: { code: string | null; onUse: (code: string) => void }) {
  if (!code) return null
  return (
    <button type="button" onClick={() => onUse(code)} className="mt-1.5 inline-flex h-7 items-center rounded-full bg-[#f1f2f4] px-2.5 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec]" data-suggest-country={code}>
      {tt("Use {count}, where you are now", { count: countryName(code) })}
    </button>
  )
}

/** `member`: round 41, a team member with Store settings: the name, contact, phone and logo only (lib/team/settings); the currency, the business details and where orders ship from stay the owner's. */
export function StoreDetailsPanel({ onSupportEmail, member = false }: { onSupportEmail?: (email: string) => void; member?: boolean }) {
  const physical = usePhysicalCommerceEnabled()
  const [data, setData] = React.useState<Loaded | null>(() => peekGet<Loaded>("/api/store/settings"))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const keptPhysical = peekGet<{ settings: { defaultLocationId: string | null }; locations: Location[] }>("/api/physical/settings")
  const [locations, setLocations] = React.useState<Location[] | null>(() => keptPhysical?.locations ?? null)
  const [defaultLocation, setDefaultLocation] = React.useState<string>(() => keptPhysical?.settings.defaultLocationId ?? "")

  React.useEffect(() => {
    void api<Loaded>("/api/store/settings").then((r) => (r.ok ? setData(r.data) : setLoadError(r.error)))
    if (physical && !member) {
      void api<{ settings: { defaultLocationId: string | null }; locations: Location[] }>("/api/physical/settings").then((r) => {
        if (!r.ok) return
        setLocations(r.data.locations)
        setDefaultLocation(r.data.settings.defaultLocationId ?? "")
      })
    }
  }, [physical, member])

  if (loadError && !data) return <Notice>{loadError}</Notice>
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-[260px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        <div className="h-[140px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      </div>
    )
  }
  return (
    <div className="space-y-4 sm:space-y-6" data-store-details="">
      {!data.settings.ready ? <Notice tone="amber">{tt("Store details need their database update (SQL part 109). Until it runs, what you see here is not saved.")}</Notice> : null}
      <Logo data={data} onSaved={(s) => setData((d) => (d ? { ...d, settings: s } : d))} />
      <Identity data={data} onSaved={(s, email) => {
        setData((d) => (d ? { ...d, settings: s, supportEmail: email } : d))
        onSupportEmail?.(email ?? "")
      }} />
      {member ? null : <CurrencyLink />}
      {member ? null : <Business data={data} onSaved={(s) => setData((d) => (d ? { ...d, settings: s } : d))} />}
      {physical && !member ? <OrdersFrom locations={locations} value={defaultLocation} onSaved={setDefaultLocation} /> : null}
    </div>
  )
}

/*
  THE STORE'S LOGO, ON EVERYTHING A BUYER GETS. Receipts, the order page,
  order and shipping emails and a buyer's case all carry it. Until one is
  chosen here they use the website's logo, then the profile photo, and the
  card says which, so nobody wonders where that picture came from.
*/
function Logo({ data, onSaved }: { data: Loaded; onSaved: (s: Settings) => void }) {
  const saved = data.settings.logoUrl ?? null
  const [picking, setPicking] = React.useState(false)
  const { state, error, save } = useSave()
  const shown = saved ?? data.logoDefault?.url ?? null
  const from = saved ? tt("Your store logo.") : data.logoDefault?.from === "website" ? tt("From your website's logo. Choose another for receipts and emails if you like.") : data.logoDefault?.from === "profile" ? tt("Your profile photo, until you choose a logo.") : tt("No logo yet: receipts and emails show your store's name.")
  const set = async (url: string | null) => {
    const s = await save({ logoUrl: url })
    if (s) onSaved(s)
  }
  return (
    <Card title={tt("Logo")} description={tt("On receipts, order pages and every email your buyers get.")}>
      <div className="flex flex-wrap items-center gap-4" data-store-logo="">
        <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f8f9fa]">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="max-h-12 max-w-[96px] object-contain" />
          ) : (
            <span className="px-2 text-center text-[12px] font-semibold text-[#9ca3af]">{data.settings.storeName || data.suggested?.storeName || tt("Your store")}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-[19px] text-[#4b5563]">{from}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setPicking(true)} disabled={state === "saving"}>
              {saved ? tt("Change") : tt("Choose a logo")}
            </button>
            {saved ? (
              <button type="button" className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]" onClick={() => void set(null)} disabled={state === "saving"}>
                {tt("Use the default")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      <FilesLibraryChooser open={picking} onClose={() => setPicking(false)} selectedUrl={saved} onPick={(url) => void set(url)} />
    </Card>
  )
}

function Identity({ data, onSaved }: { data: Loaded; onSaved: (s: Settings, email: string | null) => void }) {
  const s = data.settings
  const [name, setName] = React.useState(s.storeName ?? data.suggested?.storeName ?? "")
  const [email, setEmail] = React.useState(data.supportEmail ?? data.suggested?.contactEmail ?? "")
  /* Filled from the account, not saved yet: said under the field until Save. */
  const nameFromAccount = !s.storeName && !!data.suggested?.storeName && name === data.suggested.storeName
  const emailFromAccount = !data.supportEmail && !!data.suggested?.contactEmail && email === data.suggested.contactEmail
  const [phoneCountry, setPhoneCountry] = React.useState(s.phoneCountry ?? s.defaultCountry ?? data.detectedCountry ?? "")
  const [phone, setPhone] = React.useState(s.phone ?? "")
  /*
    A NEWER READ, FOLLOWED. The form first draws from the answer Settings
    fetched when it opened (peekGet). A contact email changed in Profile since
    then came back in the panel's own read after the fields had their values,
    and Save here wrote the old address back. Each field still showing what
    was saved takes the newer value; one being typed in is left alone.
  */
  const saved = {
    name: s.storeName ?? data.suggested?.storeName ?? "",
    email: data.supportEmail ?? data.suggested?.contactEmail ?? "",
    phone: s.phone ?? "",
    phoneCountry: s.phoneCountry ?? s.defaultCountry ?? data.detectedCountry ?? "",
  }
  const base = React.useRef(saved)
  const savedKey = `${saved.name}\n${saved.email}\n${saved.phone}\n${saved.phoneCountry}`
  React.useEffect(() => {
    const next = { name: saved.name, email: saved.email, phone: saved.phone, phoneCountry: saved.phoneCountry }
    const current = { name, email, phone, phoneCountry }
    const followed = followSaved(base.current, next, current)
    base.current = next
    if (followed.name !== name) setName(followed.name)
    if (followed.email !== email) setEmail(followed.email)
    if (followed.phone !== phone) setPhone(followed.phone)
    if (followed.phoneCountry !== phoneCountry) setPhoneCountry(followed.phoneCountry)
    // Only a new saved answer moves the fields; typing does not run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])
  const { state, error, save } = useSave()
  return (
    <Card title={tt("Store details")} description={tt("How buyers see and reach your store.")} help="store">
      <div className="space-y-4">
        <Field label={tt("Store name")} hint={nameFromAccount ? tt("Your Storelib name. Change it if your store goes by another.") : tt("On receipts, order emails and checkout.")} htmlFor="store-name">
          <TextInput id="store-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        </Field>
        <Field label={tt("Contact email")} hint={emailFromAccount ? tt("The email you sign in with. Use another one if buyers should write somewhere else.") : tt("Buyers write to it about their orders. The same address your receipts show.")} htmlFor="store-email">
          <TextInput id="store-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Phone")}</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <SelectInput value={phoneCountry} onChange={setPhoneCountry} aria-label={tt("Phone country")}>
              <option value="">{tt("Country code")}</option>
              {DIAL.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </SelectInput>
            <PhoneField country={phoneCountry} value={phone} onChange={setPhone} id="store-phone" />
          </div>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("On order emails, so a buyer or a courier can reach you. It also helps your payment provider tell a real shop from a fraudulent one.")}</p>
          {!s.phoneCountry && !s.defaultCountry && data.detectedCountry && phoneCountry !== data.detectedCountry ? <Suggest code={data.detectedCountry} onUse={setPhoneCountry} /> : null}
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end">
          <SaveButton
            state={state}
            onClick={async () => {
              const saved = await save({ storeName: name, supportEmail: email, phone: phone || null, phoneCountry: phone ? phoneCountry || null : null })
              if (saved) onSaved(saved, email.trim().toLowerCase() || null)
            }}
          />
        </div>
      </div>
    </Card>
  )
}

/*
  THE BUSINESS BEHIND THE STORE, for receipts and invoices: its legal name,
  address and tax number, which most countries require on them. Checked as a
  buyer's company is checked at checkout (lib/checkout/business), in the
  country's own words (a VAT number in Romania, an EIN in the US). Empty, a
  receipt carries the store's name and contact alone.
*/
function Business({ data, onSaved }: { data: Loaded; onSaved: (s: Settings) => void }) {
  const saved = data.settings.legal ?? null
  const start = (): BusinessDetails => ({
    company: saved?.company ?? "",
    taxId: saved?.taxId ?? "",
    country: saved?.country ?? data.settings.defaultCountry ?? "",
    line1: saved?.line1 ?? "",
    line2: saved?.line2 ?? "",
    city: saved?.city ?? "",
    postalCode: saved?.postalCode ?? "",
    region: saved?.region ?? "",
  })
  const [open, setOpen] = React.useState(!!saved)
  const [b, setB] = React.useState<BusinessDetails>(start)
  const { state, error, save } = useSave()
  const set = (k: keyof BusinessDetails) => (v: string) => setB((x) => ({ ...x, [k]: v }))
  const words = addressWordsFor(b.country)
  const tax = taxIdFor(b.country)
  return (
    <Card title={tt("Business details")} description={tt("Your legal name, address and tax number, on every receipt and invoice. Most countries require them.")}>
      {!open ? (
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)} data-business-add="">
          {tt("Add business details")}
        </button>
      ) : (
        <div className="space-y-4" data-business-details="">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tt("Legal name")} hint={tt("As registered, like Studio Ana SRL.")} htmlFor="legal-name">
              <TextInput id="legal-name" value={b.company} maxLength={120} onChange={(e) => set("company")(e.target.value)} autoComplete="organization" placeholder={data.settings.storeName ?? ""} />
            </Field>
            <Field label={tt("Country")} htmlFor="legal-country">
              <SelectInput id="legal-country" value={b.country} onChange={set("country")}>
                <option value="">{tt("Choose a country")}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field label={tt("Street address")} htmlFor="legal-line1">
            <TextInput id="legal-line1" value={b.line1} maxLength={120} onChange={(e) => set("line1")(e.target.value)} autoComplete="address-line1" placeholder={words.example.line1} />
          </Field>
          <Field label={tt("Apartment, suite (optional)")} htmlFor="legal-line2">
            <TextInput id="legal-line2" value={b.line2} maxLength={120} onChange={(e) => set("line2")(e.target.value)} autoComplete="address-line2" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tt("City")} htmlFor="legal-city">
              <TextInput id="legal-city" value={b.city} maxLength={80} onChange={(e) => set("city")(e.target.value)} autoComplete="address-level2" placeholder={words.example.city} />
            </Field>
            <Field label={needsPostalCode(b.country) ? words.postal : tt("{postal} (optional)", { postal: words.postal })} htmlFor="legal-postal">
              <TextInput id="legal-postal" value={b.postalCode} maxLength={20} onChange={(e) => set("postalCode")(e.target.value)} autoComplete="postal-code" placeholder={words.example.postal} />
            </Field>
            <Field label={tt("{region} (optional)", { region: words.region })} htmlFor="legal-region">
              <TextInput id="legal-region" value={b.region} maxLength={80} onChange={(e) => set("region")(e.target.value)} autoComplete="address-level1" />
            </Field>
          </div>
          <Field label={tt("{label} (optional)", { label: tax.label })} hint={tt("Printed on receipts and invoices when you have one.")} htmlFor="legal-tax-id">
            <TextInput id="legal-tax-id" value={b.taxId} maxLength={32} onChange={(e) => set("taxId")(e.target.value)} placeholder={tax.example} />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {saved ? (
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]"
                disabled={state === "saving"}
                onClick={async () => {
                  const s = await save({ legal: null })
                  if (s) {
                    onSaved(s)
                    setB({ company: "", taxId: "", country: data.settings.defaultCountry ?? "", line1: "", line2: "", city: "", postalCode: "", region: "" })
                    setOpen(false)
                  }
                }}
              >
                {tt("Remove")}
              </button>
            ) : null}
            <SaveButton
              state={state}
              onClick={async () => {
                const s = await save({ legal: b })
                if (s) {
                  onSaved(s)
                  if (s.legal) setB(s.legal)
                }
              }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function OrdersFrom({ locations, value, onSaved }: { locations: Location[] | null; value: string; onSaved: (id: string) => void }) {
  const [chosen, setChosen] = React.useState(value)
  const [state, setState] = React.useState<SaveState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => setChosen(value), [value])
  if (locations === null) return null
  return (
    <Card title={tt("Where orders ship from")} description={tt("New orders are assigned to this location and their stock is taken from it, unless a product says otherwise.")}>
      {locations.length === 0 ? (
        <a href="/app/settings?tab=locations" className={BTN_SECONDARY}>
          {tt("Add a location")}
        </a>
      ) : locations.length === 1 ? (
        /* One location is the only place orders can ship from: a picker with one choice asks nothing. */
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{locations[0].name}</p>
            <p className="text-[13px] text-[#6b7280]">{tt("Your only location, so every order ships from here.")}</p>
          </div>
          <a href="/app/settings?tab=locations" className="shrink-0 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
            {tt("Add another")}
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={tt("Default location")} htmlFor="store-location">
            <SelectInput id="store-location" value={chosen} onChange={setChosen}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          {chosen && chosen !== value ? (
            <div className="flex justify-end">
              <SaveButton
                state={state}
                onClick={async () => {
                  setState("saving")
                  const r = await api("/api/physical/settings", { method: "PUT", body: { defaultLocationId: chosen } })
                  if (!r.ok) {
                    setError(r.error)
                    setState("idle")
                    return
                  }
                  setError(null)
                  setState("saved")
                  onSaved(chosen)
                  window.setTimeout(() => setState("idle"), 1600)
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

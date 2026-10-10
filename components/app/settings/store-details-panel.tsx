"use client"

/**
 * ===========================================================================
 *  SETTINGS › STORE DETAILS
 * ===========================================================================
 * Who the store is to its buyers, and where it is based:
 *
 *   name           what receipts, order emails and the checkout's header
 *                  say the order is from (store_settings.store_name; empty,
 *                  the person's own name, as before)
 *   contact email  where buyers write; the same address receipts already
 *                  carry (creators.support_email), so changing it here is
 *                  changing it there
 *   phone          a number buyers and couriers can call, with the country's
 *                  calling code in front, suggested from where the person is
 *   based in       the country new locations and tax start in, suggested
 *                  from where the person is when it is not set
 *   orders from    (physical commerce on) the default location new orders
 *                  are assigned to and stock is taken from
 *
 * Saved with one button per card. lib/store/settings-server.ts checks
 * everything again.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { callingCode } from "@/lib/account/phone"
import { PhoneField } from "@/components/app/settings/phone-field"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_PRIMARY, BTN_SECONDARY, Card, Field, Notice, SelectInput, TextInput, api } from "@/components/physical/ui"
import type { CheckoutConfig } from "@/lib/store/checkout-config"

interface Settings {
  storeName: string | null
  phone: string | null
  phoneCountry: string | null
  defaultCountry: string | null
  checkout: CheckoutConfig
  defaultSalesChannelId: string | null
  ready: boolean
}
interface Loaded {
  settings: Settings
  detectedCountry: string | null
  supportEmail: string | null
}
interface Location {
  id: string
  name: string
  active?: boolean
}

const DIAL = COUNTRIES.filter((c) => callingCode(c.code)).map((c) => ({ code: c.code, label: `${c.name} (+${callingCode(c.code)})` }))

function useSave() {
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
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

/** A "Use Romania" chip under a field the person has not set, from where they are. */
function Suggest({ code, onUse }: { code: string | null; onUse: (code: string) => void }) {
  if (!code) return null
  return (
    <button type="button" onClick={() => onUse(code)} className="mt-1.5 inline-flex h-7 items-center rounded-full bg-[#f1f2f4] px-2.5 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec]" data-suggest-country={code}>
      Use {countryName(code)}, where you are now
    </button>
  )
}

export function StoreDetailsPanel({ onSupportEmail }: { onSupportEmail?: (email: string) => void }) {
  const physical = usePhysicalCommerceEnabled()
  const [data, setData] = React.useState<Loaded | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [locations, setLocations] = React.useState<Location[] | null>(null)
  const [defaultLocation, setDefaultLocation] = React.useState<string>("")

  React.useEffect(() => {
    void api<Loaded>("/api/store/settings").then((r) => (r.ok ? setData(r.data) : setLoadError(r.error)))
    if (physical) {
      void api<{ settings: { defaultLocationId: string | null }; locations: Location[] }>("/api/physical/settings").then((r) => {
        if (!r.ok) return
        setLocations(r.data.locations)
        setDefaultLocation(r.data.settings.defaultLocationId ?? "")
      })
    }
  }, [physical])

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
      {!data.settings.ready ? <Notice tone="amber">Store details need their database update (SQL part 109). Until it runs, what you see here is not saved.</Notice> : null}
      <Identity data={data} onSaved={(s, email) => {
        setData((d) => (d ? { ...d, settings: s, supportEmail: email } : d))
        onSupportEmail?.(email ?? "")
      }} />
      <BasedIn data={data} onSaved={(s) => setData((d) => (d ? { ...d, settings: s } : d))} />
      {physical ? <OrdersFrom locations={locations} value={defaultLocation} onSaved={setDefaultLocation} /> : null}
    </div>
  )
}

function Identity({ data, onSaved }: { data: Loaded; onSaved: (s: Settings, email: string | null) => void }) {
  const s = data.settings
  const [name, setName] = React.useState(s.storeName ?? "")
  const [email, setEmail] = React.useState(data.supportEmail ?? "")
  const [phoneCountry, setPhoneCountry] = React.useState(s.phoneCountry ?? s.defaultCountry ?? data.detectedCountry ?? "")
  const [phone, setPhone] = React.useState(s.phone ?? "")
  const { state, error, save } = useSave()
  return (
    <Card title="Store details" description="How buyers see and reach your store." help="store">
      <div className="space-y-4">
        <Field label="Store name" hint="On receipts, order emails and checkout. Empty, your profile name is used." htmlFor="store-name">
          <TextInput id="store-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Angus Farm" autoComplete="organization" />
        </Field>
        <Field label="Contact email" hint="Buyers write to it about their orders. The same address your receipts show." htmlFor="store-email">
          <TextInput id="store-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="hello@yourstore.com" autoComplete="email" />
        </Field>
        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-[#374151] sm:text-[13.5px]">Phone</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <SelectInput value={phoneCountry} onChange={setPhoneCountry} aria-label="Phone country">
              <option value="">Country code</option>
              {DIAL.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </SelectInput>
            <PhoneField country={phoneCountry} value={phone} onChange={setPhone} id="store-phone" />
          </div>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">On order emails, so a buyer or a courier can reach you. It also helps your payment provider tell a real shop from a fraudulent one.</p>
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

function BasedIn({ data, onSaved }: { data: Loaded; onSaved: (s: Settings) => void }) {
  const [country, setCountry] = React.useState(data.settings.defaultCountry ?? "")
  const { state, error, save } = useSave()
  const changed = country !== (data.settings.defaultCountry ?? "")
  return (
    <Card title="Where your store is based" description="New locations and tax start here. Buyers can be anywhere.">
      <div className="space-y-3">
        <Field label="Country" htmlFor="store-country">
          <SelectInput id="store-country" value={country} onChange={setCountry}>
            <option value="">Choose a country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        {!country && data.detectedCountry ? <Suggest code={data.detectedCountry} onUse={setCountry} /> : null}
        {error ? <Notice>{error}</Notice> : null}
        {changed ? (
          <div className="flex justify-end">
            <SaveButton
              state={state}
              onClick={async () => {
                const saved = await save({ defaultCountry: country || null })
                if (saved) onSaved(saved)
              }}
            />
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function OrdersFrom({ locations, value, onSaved }: { locations: Location[] | null; value: string; onSaved: (id: string) => void }) {
  const [chosen, setChosen] = React.useState(value)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => setChosen(value), [value])
  if (locations === null) return null
  return (
    <Card title="Where orders ship from" description="New orders are assigned to this location and their stock is taken from it, unless a product says otherwise.">
      {locations.length === 0 ? (
        <a href="/app/settings?tab=locations" className={BTN_SECONDARY}>
          Add a location
        </a>
      ) : (
        <div className="space-y-3">
          <Field label="Default location" htmlFor="store-location">
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

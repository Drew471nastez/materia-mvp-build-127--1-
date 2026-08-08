"use client"

import { useState } from "react"
import { Check, Home, MapPin, Package } from "lucide-react"

import { LockerScreen } from "@/components/shipping/locker-screen"
import type { LockerOption } from "@/components/shipping/locker-picker"

/**
 * Easybox or your front door — the two ways a parcel can arrive.
 *
 * The seller always drops off at a locker, so this choice decides the second
 * half of the journey and therefore the courier service: locker→locker or
 * locker→door. Measured live, Bucharest→Cluj with DPD, that is 13.23 RON
 * against 15.23 — close enough that the buyer should simply have the choice
 * rather than being steered by us.
 *
 * A presentational component with no state and no fetching of its own: both
 * places a buyer picks a delivery point (before payment, and on the order
 * afterwards) render this same thing, so the two cannot drift apart.
 */

export type DeliveryMode = "locker" | "home"

export interface HomeAddress {
  county: string
  locality: string
  street: string
  streetNo: string
  details: string
  postalCode: string
}

export const EMPTY_HOME_ADDRESS: HomeAddress = {
  county: "",
  locality: "",
  street: "",
  streetNo: "",
  details: "",
  postalCode: "",
}

/** Everything the courier needs before it will accept a door delivery. The
 *  street number is NOT required — an address with none is legitimate and the
 *  server sends "FN" for it. */
export function isHomeAddressComplete(a: HomeAddress): boolean {
  return a.county.trim().length >= 2 && a.locality.trim().length >= 2 && a.street.trim().length >= 3
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  autoComplete,
  optional,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  autoComplete?: string
  optional?: boolean
  inputMode?: "text" | "numeric"
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
        {optional && <span className="ml-1 font-normal normal-case text-neutral-400">(opțional)</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="h-12 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50"
      />
    </label>
  )
}

export function DeliveryChoice({
  mode,
  onModeChange,
  locker,
  onLockerChange,
  carrierId,
  address,
  onAddressChange,
  disabled,
}: {
  mode: DeliveryMode
  onModeChange: (m: DeliveryMode) => void
  locker: LockerOption | null
  onLockerChange: (l: LockerOption) => void
  carrierId: number
  address: HomeAddress
  onAddressChange: (a: HomeAddress) => void
  disabled?: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const set = (k: keyof HomeAddress) => (v: string) => onAddressChange({ ...address, [k]: v })

  return (
    <div>
      {/* Two tabs rather than a dropdown: there are exactly two options, and
          both deserve to be visible without an interaction. */}
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(
          [
            ["locker", "Easybox", Package, "Ridici când vrei"],
            ["home", "La adresă", Home, "Curierul vine la tine"],
          ] as const
        ).map(([value, label, Icon, hint]) => {
          const active = mode === value
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onModeChange(value)}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
                active ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? "text-neutral-900" : "text-neutral-400"}`} />
                <span className={`text-[14px] font-semibold ${active ? "text-neutral-900" : "text-neutral-600"}`}>
                  {label}
                </span>
              </span>
              <span className="text-[12px] text-neutral-500">{hint}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {mode === "locker" ? (
          <>
            {/* One button that opens the full-screen picker, rather than an
                inline search. A map worth using does not fit beside a form,
                and a summary of what was chosen is what a form actually wants
                to show. */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
                locker ? "border-emerald-200 bg-emerald-50/60" : "border-neutral-200 bg-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  locker ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {locker ? <Check className="h-4 w-4" strokeWidth={3} /> : <MapPin className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-neutral-900">
                  {locker ? locker.name : "Alege un easybox"}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">
                  {locker
                    ? [locker.address, locker.locality].filter(Boolean).join(", ")
                    : "Caută pe hartă sau după oraș"}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-[#7c3aed]">
                {locker ? "Schimbă" : "Alege"}
              </span>
            </button>

            <LockerScreen
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={onLockerChange}
              initial={locker}
              carrierId={carrierId}
            />
          </>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Județ" value={address.county} onChange={set("county")} disabled={disabled} autoComplete="address-level1" />
              <Field label="Localitate" value={address.locality} onChange={set("locality")} disabled={disabled} autoComplete="address-level2" />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Stradă" value={address.street} onChange={set("street")} disabled={disabled} autoComplete="address-line1" />
              <Field label="Număr" value={address.streetNo} onChange={set("streetNo")} disabled={disabled} optional />
            </div>
            <Field
              label="Bloc, scară, apartament"
              value={address.details}
              onChange={set("details")}
              disabled={disabled}
              autoComplete="address-line2"
              optional
            />
            <Field
              label="Cod poștal"
              value={address.postalCode}
              onChange={set("postalCode")}
              disabled={disabled}
              autoComplete="postal-code"
              inputMode="numeric"
              optional
            />
          </div>
        )}
      </div>
    </div>
  )
}

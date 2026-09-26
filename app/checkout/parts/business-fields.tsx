"use client"

/**
 * "Buying for a business": the company's legal name, its tax number and its
 * address, which go on the invoice the buyer is emailed and can download.
 * Opens under its checkbox with a height transition, and the fields use the
 * browser's own autofill names so a saved company address fills in one tap.
 */

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BusinessDetails } from "@/lib/checkout/business"
import { COUNTRIES } from "@/lib/checkout/countries"
import { CheckRow, Field, TextInput, inputClass } from "./ui"

export function CountrySelect({
  id,
  value,
  onChange,
  invalid,
  autoComplete = "country",
}: {
  id: string
  value: string
  onChange: (code: string) => void
  invalid?: boolean
  autoComplete?: string
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "cursor-pointer appearance-none pr-10", !value && "text-[#a2a7b0]")}
      >
        <option value="" disabled>
          Country or region
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
    </div>
  )
}

export function BusinessFields({
  on,
  onToggle,
  value,
  onChange,
  errors,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  value: BusinessDetails
  onChange: (next: BusinessDetails) => void
  errors: Partial<Record<keyof BusinessDetails, string>>
}) {
  const set = (key: keyof BusinessDetails) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value })
  return (
    <div>
      <CheckRow id="buying-for-business" checked={on} onChange={onToggle}>
        <span className="font-medium text-[#1a1a2e]">Buying for a business</span>
        <span className="block text-[13px] text-[#6b7280]">Get an invoice with your company&apos;s name, tax number and address.</span>
      </CheckRow>

      {/* Grid rows animate to auto height; a measured pixel height does not
          survive a font loading or a message appearing inside. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!on}
        inert={!on}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-1 gap-3 pb-1 pt-4 sm:grid-cols-2">
            <Field id="business-company" label="Company name" error={errors.company} className="sm:col-span-2">
              <TextInput id="business-company" autoComplete="organization" placeholder="Company name" value={value.company} onChange={set("company")} invalid={!!errors.company} maxLength={120} />
            </Field>
            <Field id="business-tax" label="Tax ID (optional)" error={errors.taxId} hint="VAT, EIN, ABN or your country's equivalent." className="sm:col-span-2">
              <TextInput id="business-tax" autoComplete="off" placeholder="Tax ID" autoCapitalize="characters" spellCheck={false} value={value.taxId} onChange={set("taxId")} invalid={!!errors.taxId} maxLength={32} />
            </Field>
            <Field id="business-country" label="Country or region" error={errors.country} className="sm:col-span-2">
              <CountrySelect id="business-country" value={value.country} onChange={(country) => onChange({ ...value, country })} invalid={!!errors.country} />
            </Field>
            <Field id="business-line1" label="Address" error={errors.line1} className="sm:col-span-2">
              <TextInput id="business-line1" autoComplete="address-line1" placeholder="Street address" value={value.line1} onChange={set("line1")} invalid={!!errors.line1} maxLength={120} />
            </Field>
            <Field id="business-line2" label="Apartment, suite, etc. (optional)" className="sm:col-span-2">
              <TextInput id="business-line2" autoComplete="address-line2" placeholder="Apartment, suite, etc." value={value.line2} onChange={set("line2")} maxLength={120} />
            </Field>
            <Field id="business-city" label="City" error={errors.city}>
              <TextInput id="business-city" autoComplete="address-level2" placeholder="City" value={value.city} onChange={set("city")} invalid={!!errors.city} maxLength={80} />
            </Field>
            <Field id="business-postal" label="Postal code" error={errors.postalCode}>
              <TextInput id="business-postal" autoComplete="postal-code" placeholder="Postal code" value={value.postalCode} onChange={set("postalCode")} invalid={!!errors.postalCode} maxLength={20} />
            </Field>
            <Field id="business-region" label="State, county or region (optional)" className="sm:col-span-2">
              <TextInput id="business-region" autoComplete="address-level1" placeholder="State or region" value={value.region} onChange={set("region")} maxLength={80} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  "BUYING FOR A BUSINESS"
 * ===========================================================================
 * The company's legal name, its country, its tax number and its address,
 * which go on the invoice the buyer is emailed with the receipt and can
 * download from it. What is required is lib/checkout/business.ts's to say,
 * and the page and the server read the same rules.
 *
 * THE REVEAL. The block opens under its checkbox in 220ms: its row grows
 * from 0fr to 1fr, so everything under it moves down with it and nothing
 * above it moves at all, while the fields themselves fade in and settle
 * 4px, on opacity and transform alone. A measured pixel height would not
 * survive a font loading or an error line appearing inside. Under reduced
 * motion it simply opens.
 *
 * TICKING IT puts the cursor in Company name, in the same press, so a phone
 * raises its keyboard. Unticking it keeps what was typed, for a change of
 * mind, but the checkout sends none of it (checkout-client.tsx: `business`
 * is null unless the box is ticked).
 *
 * THE WORDS FOLLOW THE COUNTRY: a VAT number in Germany, an EIN in the US,
 * a postcode and a county in the UK, a ZIP code and a state in the US, and
 * the placeholders are one real looking address there, in the checkout's
 * light grey. The browser's autofill names are on every box, so a saved
 * company address fills in one tap.
 */

import * as React from "react"
import { flushSync } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressWordsFor, needsPostalCode, taxIdFor, type BusinessDetails } from "@/lib/checkout/business"
import { COUNTRIES } from "@/lib/checkout/countries"
import { CheckRow, Field, TextInput, inputClass } from "./ui"

/** The reveal's length, shared by the class below and the wait before scrolling the first box into view. */
export const BUSINESS_REVEAL_MS = 220

/** Postal codes that are digits only, where a phone's number pad is the right keyboard. */
const DIGIT_POSTAL = new Set(["DE", "FR", "ES", "IT", "AU", "AT", "BE", "CH", "DK", "NO", "FI"])

export function CountrySelect({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  autoComplete = "country",
}: {
  id: string
  value: string
  onChange: (code: string) => void
  invalid?: boolean
  describedBy?: string
  autoComplete?: string
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "cursor-pointer appearance-none pr-10 [&>option]:text-[#1a1a2e]", !value && "text-[#a2a7b0]")}
      >
        <option value="" disabled>
          Select a country
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

type Errors = Partial<Record<keyof BusinessDetails, string>>

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
  errors: Errors
}) {
  const companyRef = React.useRef<HTMLInputElement>(null)
  const set = (key: keyof BusinessDetails) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value })
  const words = addressWordsFor(value.country)
  const tax = taxIdFor(value.country)
  const described = (id: string, key: keyof BusinessDetails) => (errors[key] ? `${id}-error` : undefined)

  const toggle = (next: boolean) => {
    if (!next) return onToggle(false)
    /* Open now, in this press, so the box can take the cursor and a phone
       raises its keyboard: focus from a later frame is not a tap's. */
    flushSync(() => onToggle(true))
    const box = companyRef.current
    if (!box) return
    box.focus({ preventScroll: true })
    /* Once it has opened, the first box is brought into view if the fold hides it, and no further. */
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    window.setTimeout(
      () => {
        const r = box.getBoundingClientRect()
        const bottom = window.visualViewport?.height ?? window.innerHeight
        if (r.bottom > bottom - 16 || r.top < 0) box.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" })
      },
      reduced ? 0 : BUSINESS_REVEAL_MS + 20,
    )
  }

  return (
    <div data-business={on ? "open" : "closed"}>
      <CheckRow id="buying-for-business" checked={on} onChange={toggle}>
        <span className="font-medium text-[#1a1a2e]">Buying for a business</span>
        <span className="block text-[13px] text-[#6b7280]">Get an invoice with your company&apos;s name, tax number and address.</span>
      </CheckRow>

      <div
        id="business-details"
        data-business-reveal=""
        className={cn(
          "grid transition-[grid-template-rows] ease-out motion-reduce:transition-none",
          on ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        style={{ transitionDuration: `${BUSINESS_REVEAL_MS}ms` }}
        aria-hidden={!on}
        inert={!on}
      >
        {/* The rows clip what has not opened yet; 4px either side so a focus ring is not clipped with it. */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div
            data-business-fields=""
            className={cn(
              "grid grid-cols-1 gap-x-3 gap-y-3.5 pb-1 pt-4 transition-[opacity,translate] ease-out motion-reduce:transition-none min-[380px]:grid-cols-2",
              on ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
            )}
            style={{ transitionDuration: `${BUSINESS_REVEAL_MS}ms` }}
          >
            <Field id="business-company" label="Company name" error={errors.company} className="min-[380px]:col-span-2">
              <TextInput
                ref={companyRef}
                id="business-company"
                autoComplete="organization"
                autoCapitalize="words"
                placeholder={words.example.company}
                value={value.company}
                onChange={set("company")}
                invalid={!!errors.company}
                aria-describedby={described("business-company", "company")}
                aria-required
                maxLength={120}
              />
            </Field>
            <Field id="business-country" label="Country or region" error={errors.country} className="min-[380px]:col-span-2">
              <CountrySelect
                id="business-country"
                value={value.country}
                onChange={(country) => onChange({ ...value, country })}
                invalid={!!errors.country}
                describedBy={described("business-country", "country")}
              />
            </Field>
            <Field id="business-tax" label={`${tax.label} (optional)`} error={errors.taxId} className="min-[380px]:col-span-2">
              <TextInput
                id="business-tax"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={tax.example}
                value={value.taxId}
                onChange={set("taxId")}
                invalid={!!errors.taxId}
                aria-describedby={described("business-tax", "taxId")}
                maxLength={32}
              />
            </Field>
            <Field id="business-line1" label="Address" error={errors.line1} className="min-[380px]:col-span-2">
              <TextInput
                id="business-line1"
                autoComplete="address-line1"
                placeholder={words.example.line1}
                value={value.line1}
                onChange={set("line1")}
                invalid={!!errors.line1}
                aria-describedby={described("business-line1", "line1")}
                aria-required
                maxLength={120}
              />
            </Field>
            <Field id="business-line2" label="Apartment, suite, etc. (optional)" className="min-[380px]:col-span-2">
              <TextInput id="business-line2" autoComplete="address-line2" placeholder={words.example.line2} value={value.line2} onChange={set("line2")} maxLength={120} />
            </Field>
            <Field id="business-city" label="City" error={errors.city}>
              <TextInput
                id="business-city"
                autoComplete="address-level2"
                placeholder={words.example.city}
                value={value.city}
                onChange={set("city")}
                invalid={!!errors.city}
                aria-describedby={described("business-city", "city")}
                aria-required
                maxLength={80}
              />
            </Field>
            <Field id="business-postal" label={value.country && !needsPostalCode(value.country) ? `${words.postal} (optional)` : words.postal} error={errors.postalCode}>
              <TextInput
                id="business-postal"
                autoComplete="postal-code"
                inputMode={DIGIT_POSTAL.has(value.country) ? "numeric" : "text"}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={words.example.postal}
                value={value.postalCode}
                onChange={set("postalCode")}
                invalid={!!errors.postalCode}
                aria-describedby={described("business-postal", "postalCode")}
                maxLength={20}
              />
            </Field>
            <Field id="business-region" label={`${words.region} (optional)`} className="min-[380px]:col-span-2">
              <TextInput id="business-region" autoComplete="address-level1" placeholder={words.example.region} value={value.region} onChange={set("region")} maxLength={80} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  )
}

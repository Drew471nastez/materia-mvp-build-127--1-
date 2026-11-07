"use client"
/**
 * ===========================================================================
 *  AN INTERNATIONAL NUMBER: THE COUNTRY, THEN THE NUMBER
 * ===========================================================================
 * The owner: "for the international phone number, I might be able to have a
 * selector to select the actual country". One field: the country's flag and
 * calling code at its start, a press away from the list of every country
 * (flag, name and code, searched by name, ISO code or the code's digits:
 * "romania", "ro", "40" and "+40" all find Romania), and the number typed
 * as that country writes it ("712 345 678"). A number pasted or typed with
 * its own code (+44 ..., 0044 ...) moves the country to match.
 *
 * The list is Storelib's country list (components/ui/choice-list, as in
 * Settings): a popover on a computer, the shared sheet on a phone.
 *
 * What is kept is the E.164 number ("+40712345678") and the country's ISO
 * code, through lib/account/phone, as the action model expects
 * (lib/forms/actions e164 and internationalPhone).
 */
import { useMemo, useState } from "react"
import { ChoicePicker } from "@/components/ui/choice-list"
import { CountryFlag } from "@/components/app/settings/country-picker"
import { dialChoices } from "@/lib/forms/dial-codes"
import { callingCode, countryOfInternational, digitsFromKept, examplePhone, formatNational, fullNumber, nationalDigits } from "@/lib/account/phone"
import { e164, internationalPhone } from "@/lib/forms/actions"
import { appLocale } from "@/lib/i18n/format"
import { tt } from "@/lib/i18n/text"

/** The visitor's or creator's country from the browser, for a number with no code yet. */
export function browserCountry(): string {
  if (typeof navigator === "undefined") return "US"
  const region = (navigator.language || "").split("-")[1]
  return region && callingCode(region) ? region.toUpperCase() : "US"
}

export function PhoneNumberField({
  phone,
  country,
  onChange,
  label,
}: {
  /** As kept: "+40712345678", or what is being typed before it is a full number. */
  phone: string
  /** ISO code, when one was chosen. */
  country?: string | null
  onChange: (next: { phone: string; country: string }) => void
  label: string
}) {
  /* The country: the chosen one, else the one the number's code says, else the browser's. */
  const cc = (country && callingCode(country) ? country : null) || (phone ? countryOfInternational(phone, []) : null) || browserCountry()
  const code = callingCode(cc)
  /* A number being typed with its own code, before the code is known. */
  const [typing, setTyping] = useState<string | null>(null)
  const choices = useMemo(() => () => dialChoices(appLocale()), [])
  const invalid = !!phone && !internationalPhone(phone)
  return (
    <div className="space-y-1.5" data-phone-number-field="">
      <span className="block text-xs font-medium text-[#4b5563]">{label}</span>
      <div
        data-phone-field=""
        className="flex h-10 w-full items-stretch rounded-lg border border-[#e3e4e8] bg-white text-sm text-[#1a1a2e] focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]"
      >
        <div className="w-[104px] shrink-0 border-r border-[#eceef1]" data-phone-country={cc}>
          {/* A new country keeps the digits typed and puts its own code in front. */}
          <ChoicePicker
            name="phone-country"
            title={tt("Country")}
            choices={choices}
            value={cc}
            onChange={(next) => {
              setTyping(null)
              onChange({ country: next, phone: e164(fullNumber(digitsFromKept(phone, cc), next)) })
            }}
            placeholder={tt("Search country or code")}
            fieldLabel={code ? `+${code}` : tt("Code")}
            fieldLeading={<CountryFlag code={cc} />}
            leading={(choice, near) => <CountryFlag code={choice.value} near={near} />}
            uniform
            scrollClassName="max-h-[min(400px,min(52dvh,520px))]"
            sheetHeight="min(72dvh, 580px)"
            fieldClassName="h-full rounded-l-lg rounded-r-none border-0 bg-transparent px-2.5 shadow-none tabular-nums hover:bg-[#f7f7f8] focus-visible:border-0 focus-visible:shadow-none data-[state=open]:border-0 data-[state=open]:shadow-none"
          />
        </div>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          aria-label={label}
          aria-invalid={invalid}
          placeholder={examplePhone(cc)}
          className="min-w-0 flex-1 rounded-r-lg bg-transparent px-3 tabular-nums outline-none placeholder:text-[#9ca3af]"
          value={typing ?? formatNational(digitsFromKept(phone, cc), cc)}
          onChange={(e) => {
            const v = e.target.value
            if (/^\s*(\+|00)/.test(v)) {
              const found = countryOfInternational(v, [cc])
              if (!found) return setTyping(v.slice(0, 24))
              setTyping(null)
              onChange({ country: found, phone: e164(fullNumber(nationalDigits(v, found), found)) })
              return
            }
            setTyping(null)
            onChange({ country: cc, phone: e164(fullNumber(nationalDigits(v, cc), cc)) })
          }}
          onBlur={() => setTyping(null)}
        />
      </div>
      {invalid ? <p className="text-xs font-medium text-[#b54708]">{tt("Enter the whole number, without a leading 0.")}</p> : null}
    </div>
  )
}

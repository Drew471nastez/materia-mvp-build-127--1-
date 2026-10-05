"use client"

/**
 * ===========================================================================
 *  WHERE YOU ARE FROM, IN PROFILE SETTINGS
 * ===========================================================================
 * Round 12: "city and country fields (country picker by name, stores the
 * code; city free text)". Two fields on one row from `sm` up, stacked on a
 * phone: the city as typed, and the country picked by its name from the
 * platform's own list (lib/checkout/countries, the checkout's), kept as its
 * two letter code (lib/profile/location.ts). A native select, so a phone
 * opens its own wheel or list and a keyboard can type to jump.
 *
 * The same field look as the rest of the Profile card (components/account/
 * account-settings.tsx FIELD): 16px type on a phone so iOS does not zoom on
 * focus, the violet focus ring. The card decides whether to draw this at
 * all (not before run-now part 98) and saves it with the rest.
 */
import { ChevronDown } from "lucide-react"
import { COUNTRIES } from "@/lib/checkout/countries"
import { CITY_MAX } from "@/lib/profile/location"
import { cn } from "@/lib/utils"

const LABEL = "mb-1.5 block text-[13px] font-medium leading-[1.4] text-[#374151]"
const HELP = "mt-1.5 block text-[12px] leading-[1.45] text-[#6b7280]"
const FIELD =
  "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[16px] sm:text-[14px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"

export function LocationFields({
  city,
  country,
  onCity,
  onCountry,
}: {
  city: string
  /** Two letter code, "" for none. */
  country: string
  onCity: (value: string) => void
  onCountry: (code: string) => void
}) {
  return (
    <div data-account-location="">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="account-city" className={LABEL}>
            City
          </label>
          <input
            id="account-city"
            value={city}
            onChange={(e) => onCity(e.target.value.slice(0, CITY_MAX))}
            autoComplete="address-level2"
            placeholder="Lisbon"
            maxLength={CITY_MAX}
            className={FIELD}
            data-account-city=""
          />
        </div>
        <div>
          <label htmlFor="account-country" className={LABEL}>
            Country
          </label>
          <div className="relative">
            <select
              id="account-country"
              value={country}
              onChange={(e) => onCountry(e.target.value)}
              autoComplete="country"
              className={cn(FIELD, "appearance-none pr-10", !country && "text-[#9ca3af]")}
              data-account-country=""
            >
              <option value="">Choose a country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="text-[#1a1a2e]">
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" aria-hidden />
          </div>
        </div>
      </div>
      <span className={HELP}>Shown under your name on your profile. Leave both empty to show nothing.</span>
    </div>
  )
}

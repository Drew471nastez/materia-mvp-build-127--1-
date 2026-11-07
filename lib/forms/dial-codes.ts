import type { Choice } from "@/lib/ui/choice-match"
import { countryChoices } from "@/lib/account/country"
import { callingCode } from "@/lib/account/phone"

/**
 * Every country with its calling code, for the phone field's country list
 * (components/forms/phone-number-field): the code at the end of the row
 * ("+40"), and found by its digits as well as its name and ISO code, so
 * "romania", "ro", "40" and "+40" all find Romania.
 */
export function dialChoices(locale?: string): Choice[] {
  const out: Choice[] = []
  for (const c of countryChoices(locale)) {
    const code = callingCode(c.value)
    if (code) out.push({ ...c, aside: `+${code}`, keywords: `${c.keywords ?? ""} ${code} +${code}`.trim() })
  }
  return out
}

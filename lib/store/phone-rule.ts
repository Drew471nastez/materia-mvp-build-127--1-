/**
 * A store's phone, as Settings › Store details keeps it: "+40 712 345 678",
 * digits and spaces after a plus, seven to fifteen digits in all (the
 * international limit), the calling code matching the country chosen beside
 * it. Pure, for the server and the tests.
 */
import { callingCode } from "@/lib/account/phone"

/** A phone as kept: "+40 712 345 678". Digits and spaces after a plus, the code matching its country. */
export function cleanPhone(v: unknown, country: string | null): string | null | "bad" {
  if (v === null || v === "") return null
  if (typeof v !== "string") return "bad"
  const t = v.replace(/\s+/g, " ").trim()
  if (!t) return null
  if (!/^\+[0-9][0-9 ]{5,23}$/.test(t)) return "bad"
  const digits = t.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return "bad"
  const code = country ? callingCode(country) : null
  if (code && !digits.startsWith(code)) return "bad"
  return t
}


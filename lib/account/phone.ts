/**
 * ===========================================================================
 *  A PHONE NUMBER IN THE PAYOUTS COUNTRY'S OWN SHAPE
 * ===========================================================================
 * Round 12: "Phone number in set up payouts: the calling code prefix follows
 * the chosen country automatically and the number formats as typed." The
 * field was one box with "+40 712 345 678" as its placeholder for everyone:
 * the code had to be known and typed, and the number stayed a run of digits.
 *
 * Now the country's calling code stands before the field
 * (components/app/settings/phone-field), and what is typed is the number in
 * that country, grouped as it is written there. What is kept and sent is
 * "+<code> <number as shown>", which lib/payments/stripe/own-form cleans to
 * digits for Stripe, as before. Kept apart from React so it can be tested.
 */

const CALLING: Record<string, string> = {}
/* ISO code, calling code. Several share one: +1 is the North American plan, +7 Russia and Kazakhstan, +44 the UK and the Crown Dependencies. */
for (const pair of (
  "AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AQ672 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 " +
  "BA387 BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BL590 BM1 BN673 BO591 BQ599 BR55 BS1 BT975 BV47 BW267 BY375 BZ501 " +
  "CA1 CC61 CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 CO57 CR506 CU53 CV238 CW599 CX61 CY357 CZ420 " +
  "DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 EH212 ER291 ES34 ET251 FI358 FJ679 FK500 FM691 FO298 FR33 " +
  "GA241 GB44 GD1 GE995 GF594 GG44 GH233 GI350 GL299 GM220 GN224 GP590 GQ240 GR30 GS500 GT502 GU1 GW245 GY592 " +
  "HK852 HM672 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IM44 IN91 IO246 IQ964 IR98 IS354 IT39 JE44 JM1 JO962 JP81 " +
  "KE254 KG996 KH855 KI686 KM269 KN1 KP850 KR82 KW965 KY1 KZ7 LA856 LB961 LC1 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 " +
  "MA212 MC377 MD373 ME382 MF590 MG261 MH692 MK389 ML223 MM95 MN976 MO853 MP1 MQ596 MR222 MS1 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 " +
  "NA264 NC687 NE227 NF672 NG234 NI505 NL31 NO47 NP977 NR674 NU683 NZ64 OM968 " +
  "PA507 PE51 PF689 PG675 PH63 PK92 PL48 PM508 PN64 PR1 PS970 PT351 PW680 PY595 QA974 RE262 RO40 RS381 RU7 RW250 " +
  "SA966 SB677 SC248 SD249 SE46 SG65 SH290 SI386 SJ47 SK421 SL232 SM378 SN221 SO252 SR597 SS211 ST239 SV503 SX1 SY963 SZ268 " +
  "TC1 TD235 TF262 TG228 TH66 TJ992 TK690 TL670 TM993 TN216 TO676 TR90 TT1 TV688 TW886 TZ255 " +
  "UA380 UG256 UM1 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 VU678 WF681 WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263"
).split(" ")) CALLING[pair.slice(0, 2)] = pair.slice(2)

/** The country's calling code, digits only ("40" for Romania), or null for a code that is not a country. */
export function callingCode(country: string | null | undefined): string | null {
  return (country && CALLING[country.toUpperCase()]) || null
}

/* Countries where the leading 0 is part of the number itself, not the "dial 0 first" a local number is written with. */
const KEEPS_ZERO = new Set(["IT", "SM", "VA"])

/**
 * How a country writes a number, as group lengths. Where a country is not
 * listed: threes, with a final four for ten digits and two fours for eight,
 * which is how most of the world reads a number back.
 */
const GROUPS: Record<string, number[]> = {
  "1": [3, 3, 4],
  GB: [4, 6],
  FR: [1, 2, 2, 2, 2],
  ES: [3, 2, 2, 2],
  IT: [3, 3, 4],
  NL: [1, 4, 4],
  BE: [3, 2, 2, 2],
  DE: [3, 4, 4],
  IN: [5, 5],
  AU: [3, 3, 3],
  NZ: [2, 3, 4],
  RO: [3, 3, 3],
  PL: [3, 3, 3],
  PT: [3, 3, 3],
  SE: [2, 3, 2, 2],
  IE: [2, 3, 4],
  BR: [2, 5, 4],
  MX: [2, 4, 4],
  JP: [2, 4, 4],
  CH: [2, 3, 2, 2],
  AT: [3, 3, 4],
}

function groupsFor(country: string, length: number): number[] {
  const own = GROUPS[callingCode(country) === "1" ? "1" : country]
  if (own) return own
  if (length <= 4) return [length]
  if (length === 8) return [4, 4]
  if (length === 10) return [3, 3, 4]
  return [3, 3, 3, 3, 3]
}

/** Longest a number may be after its calling code (E.164 allows fifteen digits in all). */
function room(country: string): number {
  return 15 - (callingCode(country)?.length ?? 1)
}

/**
 * What was typed or pasted, as the digits of the number in this country:
 * the country's own code taken off if it was typed (+40..., 0040...), and
 * the 0 a local number starts with, so "0712 345 678" and "+40 712 345 678"
 * are the same number.
 */
export function nationalDigits(typed: string, country: string): string {
  const code = callingCode(country)
  let digits = typed.replace(/\D/g, "")
  const international = /^\s*(\+|00)/.test(typed)
  if (international && digits.startsWith("00")) digits = digits.slice(2)
  if (code && international && digits.startsWith(code)) digits = digits.slice(code.length)
  /* A North American number typed with its 1 in front, the way it is often dialled. */
  if (code === "1" && !international && digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1)
  if (!KEEPS_ZERO.has(country.toUpperCase()) && digits.startsWith("0")) digits = digits.replace(/^0+/, "")
  return digits.slice(0, room(country))
}

/** The number grouped as the country writes it, as far as it has been typed ("712 34" on the way to "712 345 678"). */
export function formatNational(digits: string, country: string): string {
  if (!digits) return ""
  const cc = country.toUpperCase()
  if (callingCode(cc) === "1") {
    /* (415) 555-0123, built up as it is typed. */
    if (digits.length <= 3) return digits.length === 3 ? `(${digits})` : digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  const parts: string[] = []
  let at = 0
  for (const size of groupsFor(cc, digits.length)) {
    if (at >= digits.length) break
    parts.push(digits.slice(at, at + size))
    at += size
  }
  if (at < digits.length) parts.push(digits.slice(at))
  return parts.join(" ")
}

/** What is kept and sent: "+40 712 345 678", or nothing for nothing typed. */
export function fullNumber(digits: string, country: string): string {
  const code = callingCode(country)
  if (!digits) return ""
  return code ? `+${code} ${formatNational(digits, country)}` : formatNational(digits, country)
}

/**
 * A number already kept ("+40 712 345 678", or one typed whole before the
 * field knew the country) read back as this country's digits. A number kept
 * under another country's code keeps its digits after that code, so a
 * person who changes country keeps what they typed and the code follows.
 */
export function digitsFromKept(kept: string, country: string): string {
  const value = kept.trim()
  if (!value) return ""
  const shaped = value.match(/^\+(\d{1,4}) (.+)$/)
  if (shaped && Object.values(CALLING).includes(shaped[1])) return nationalDigits(shaped[2], country)
  return nationalDigits(value, country)
}

/** An example in the country's own shape, for the placeholder. */
export function examplePhone(country: string): string {
  const cc = country.toUpperCase()
  if (callingCode(cc) === "1") return "(415) 555-0123"
  const sample = cc === "IT" ? "3123456789" : cc === "GB" ? "7700900123" : cc === "FR" ? "612345678" : cc === "DE" ? "15123456789" : cc === "IN" ? "9876543210" : "712345678"
  return formatNational(sample, cc)
}

/**
 * A phone number as it is kept with an order (checkout, lib/physical/address):
 * one written with its code ("+40 712 345 678", "0040 712...", what the
 * checkout field sends) becomes E.164, "+40712345678", which a carrier, an
 * SMS or a payment provider reads without guessing. One written without a
 * code (an older page, a paste) is kept as typed, since its country can't be
 * known. Null for something that is not a phone number: fewer than five
 * digits, more than fifteen (E.164's limit), or letters in it.
 *
 * Deliberately loose about lengths inside those limits: country plans change
 * and differ by line type, and refusing a real number costs a sale.
 */
export function phoneForStorage(raw: string | null | undefined): string | null {
  const typed = (raw ?? "").trim()
  if (!typed) return null
  if (!/^[+()0-9 .\-/]+$/.test(typed)) return null
  let digits = typed.replace(/\D/g, "")
  if (/^(\+|00)/.test(typed)) {
    if (typed.startsWith("00")) digits = digits.slice(2)
    /* A code and at least four digits after it; fifteen in all at most. */
    return digits.length >= 6 && digits.length <= 15 && !digits.startsWith("0") ? `+${digits}` : null
  }
  return digits.length >= 5 && digits.length <= 15 ? typed.replace(/\s+/g, " ") : null
}

/* Where several countries share a code, the one a number with it most likely belongs to. */
const MAIN: Record<string, string> = { "1": "US", "7": "RU", "44": "GB", "47": "NO", "61": "AU", "39": "IT", "358": "FI", "212": "MA", "262": "RE", "590": "GP", "599": "CW", "672": "NF", "64": "NZ", "500": "FK" }

/** The country a number written with its code is from ("+44 7700...", "0044..."), the buyer's own countries first (`prefer`); null for one written without a code. */
export function countryOfInternational(typed: string, prefer: string[]): string | null {
  if (!/^\s*(\+|00)/.test(typed)) return null
  let digits = typed.replace(/\D/g, "")
  if (/^\s*00/.test(typed)) digits = digits.slice(2)
  for (const len of [3, 2, 1]) {
    const dial = digits.slice(0, len)
    if (dial.length < len) continue
    const all = Object.keys(CALLING).filter((c) => CALLING[c] === dial)
    if (!all.length) continue
    return prefer.find((p) => all.includes(p.toUpperCase()))?.toUpperCase() ?? MAIN[dial] ?? all.sort()[0]
  }
  return null
}

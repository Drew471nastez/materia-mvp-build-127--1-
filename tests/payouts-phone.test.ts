/**
 * ===========================================================================
 *  SET UP PAYOUTS: THE PHONE NUMBER FOLLOWS THE COUNTRY
 * ===========================================================================
 * Round 12, ask 36: "Phone number in set up payouts: the calling code prefix
 * follows the chosen country automatically and the number formats as typed."
 * The reading and the shaping are lib/account/phone; the field is
 * components/app/settings/phone-field. Measured in a browser by
 * scripts/check-phone-field.mjs.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { COUNTRY_CODES } from "../lib/checkout/countries"
import { callingCode, digitsFromKept, examplePhone, formatNational, fullNumber, nationalDigits } from "../lib/account/phone"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

console.log("\n1. Every country has its calling code")
const missing = [...COUNTRY_CODES].filter((c) => !callingCode(c))
check("every country in the list has one", missing.length === 0, missing)
check("the ones people use most", callingCode("RO") === "40" && callingCode("US") === "1" && callingCode("GB") === "44" && callingCode("DE") === "49" && callingCode("IN") === "91" && callingCode("ro") === "40")
check("shared codes are shared", callingCode("CA") === "1" && callingCode("KZ") === "7" && callingCode("JE") === "44")
check("nothing for something that is not a country", callingCode("ZZ") === null && callingCode("") === null)

console.log("\n2. What is typed is read as the number in that country")
check("a local number loses the 0 it is dialled with", nationalDigits("0712 345 678", "RO") === "712345678")
check("the country's own code typed or pasted in front comes off", nationalDigits("+40 712 345 678", "RO") === "712345678" && nationalDigits("0040712345678", "RO") === "712345678")
check("Italy keeps its 0", nationalDigits("06 1234 5678", "IT") === "0612345678")
check("a North American number typed with its 1 in front", nationalDigits("1 415 555 0123", "US") === "4155550123")
check("never longer than fifteen digits with the code", nationalDigits("1".repeat(30), "RO").length === 13)

console.log("\n3. It is grouped as it is written there, as it is typed")
check("Romania: 712 345 678", formatNational("712345678", "RO") === "712 345 678")
check("part way: 712 34", formatNational("71234", "RO") === "712 34")
check("the US: (415) 555-0123, built up", formatNational("4155550123", "US") === "(415) 555-0123" && formatNational("415", "US") === "(415)" && formatNational("4155", "US") === "(415) 5" && formatNational("41555501", "US") === "(415) 555-01")
check("the UK: 7700 900123", formatNational("7700900123", "GB") === "7700 900123")
check("France: 6 12 34 56 78", formatNational("612345678", "FR") === "6 12 34 56 78")
check("what is kept: +40 712 345 678, and nothing for nothing", fullNumber("712345678", "RO") === "+40 712 345 678" && fullNumber("", "RO") === "")
check("a placeholder in the country's shape", examplePhone("RO") === "712 345 678" && examplePhone("US") === "(415) 555-0123")

console.log("\n4. A kept number, read back")
check("under its own country", digitsFromKept("+40 712 345 678", "RO") === "712345678")
check("after the country changed, the digits stay and the code follows", fullNumber(digitsFromKept("+40 712 345 678", "DE"), "DE") === "+49 712 3456 78", fullNumber(digitsFromKept("+40 712 345 678", "DE"), "DE"))
check("one typed whole in the old field", digitsFromKept("+40712345678", "RO") === "712345678" && digitsFromKept("0712345678", "RO") === "712345678")

console.log("\n5. The field in set up payouts")
const flow = readCode("components/app/settings/payments-setup-flow.tsx")
const field = readCode("components/app/settings/phone-field.tsx")
check("the form's phone is the field that follows the payouts country", /<PhoneField country=\{form\.country\} value=\{phone\} onChange=\{setPhone\} \/>/.test(flow) && !/placeholder="\+40 712 345 678" autoComplete="tel"/.test(flow))
check("the flag and the code stand before the number", /data-phone-prefix=\{`\+\$\{code\}`\}/.test(field) && /<CountryFlag code=\{cc\} \/>/.test(field))
check("when the country changes the kept number takes the new code", /React\.useEffect\(\(\) => \{\s*const next = fullNumber\(digits, cc\)/.test(field) && /\}, \[cc\]\)/.test(field))
check("the caret stays after the digit typed as spaces come and go", /el\.setSelectionRange\(at, at\)/.test(field) && /deleteContentBackward/.test(field))
check("16px on a phone so iOS does not zoom, and the form's own halo on the whole box", /text-\[16px\]/.test(field) && /focus-within:shadow-\[0_0_0_3px_rgba\(17,17,19,0\.06\)\]/.test(field))
check("a client module with no server code in it", /"use client"/.test(field) && !/server-only|next\/headers/.test(field))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

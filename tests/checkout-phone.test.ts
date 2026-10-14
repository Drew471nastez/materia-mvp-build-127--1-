/**
 * ===========================================================================
 *  THE PHONE AT CHECKOUT: ITS COUNTRY, ITS CODE, KEPT AS E.164
 * ===========================================================================
 * The owner: "next to the phone number I want to be able to add my phone
 * number and know where the country I am from is, or change the country",
 * and the placeholders "very simple, clean, one word".
 *
 * The field is app/checkout/parts/phone-input (the website checkout and the
 * shop's own physical checkout); the reading is lib/account/phone, the same
 * one Set up payouts uses; the order keeps E.164 (lib/physical/address,
 * lib/physical/checkout-server) and the page and the server refuse the same
 * things (lib/checkout/site-checkout missingField).
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { phoneForStorage } from "../lib/account/phone"
import { countryOfInternational } from "../lib/account/phone"
import { readAddress } from "../lib/physical/address"
import { fieldPlan, missingField } from "../lib/checkout/site-checkout"
import { DEFAULT_CHECKOUT } from "../lib/store/checkout-config"

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

console.log("\n1. What is kept")
check("a number with its code is kept as E.164", phoneForStorage("+40 712 345 678") === "+40712345678")
check("00 written for + is the same number", phoneForStorage("0040 712 345 678") === "+40712345678")
check("a North American number with brackets and a dash", phoneForStorage("+1 (415) 555-0123") === "+14155550123")
check("a short plan (Niue, +683 and four digits) is not refused", phoneForStorage("+683 4002") === "+6834002")
check("a number written without a code is kept as typed, its country unknown", phoneForStorage(" 0712 345 678 ") === "0712 345 678")
check("not numbers: letters, two digits, a code starting with 0, sixteen digits", [phoneForStorage("call me"), phoneForStorage("12"), phoneForStorage("+0123456"), phoneForStorage("+1234567890123456")].every((v) => v === null))
check("nothing is nothing", phoneForStorage("") === null && phoneForStorage(null) === null)

console.log("\n2. A number filled in or pasted with its own code")
check("+44 goes to the UK", countryOfInternational("+44 7700 900123", ["RO"]) === "GB")
check("+44 stays Jersey when Jersey is the buyer's", countryOfInternational("+44 7700 900123", ["JE", "RO"]) === "JE")
check("+1 is the US unless the buyer is in Canada", countryOfInternational("+1 416 555 0100", ["RO"]) === "US" && countryOfInternational("+1 416 555 0100", ["CA"]) === "CA")
check("+40 is Romania, 0040 too", countryOfInternational("+40712345678", []) === "RO" && countryOfInternational("0040712345678", []) === "RO")
check("a local number is not read as international", countryOfInternational("0712 345 678", ["RO"]) === null)

console.log("\n3. The page and the server refuse the same")
const plan = fieldPlan({ ...DEFAULT_CHECKOUT, phone: "optional" }, { ships: true })
const base = { email: "a@b.co", first: "Jane", last: "Smith" }
check("an optional phone left empty is fine", missingField(plan, { ...base, phone: "" }) === null)
check("an optional phone that is not a number is refused", missingField(plan, { ...base, phone: "12" }) === "phone")
check("a real number passes", missingField(plan, { ...base, phone: "+40 712 345 678" }) === null)
const digital = fieldPlan({ ...DEFAULT_CHECKOUT, phone: "required" }, { ships: false })
check("a download never asks for a phone, whatever the setting", digital.phone === "off" && missingField(digital, { ...base, phone: "" }) === null)
const address = { name: "Jane Smith", line1: "Str. Lunga 1", city: "Brasov", postalCode: "500035", country: "RO", phone: "+40 712 345 678" }
const read = readAddress(address, { ...DEFAULT_CHECKOUT, phone: "optional" })
check("the delivery address keeps the phone as E.164", read.ok === true && read.address.phone === "+40712345678")
const bad = readAddress({ ...address, phone: "abc" }, { ...DEFAULT_CHECKOUT, phone: "optional" })
check("and refuses one that is not a number", bad.ok === false && bad.field === "phone")
const off = readAddress(address, { ...DEFAULT_CHECKOUT, phone: "off" })
check("a phone the store turned off is dropped", off.ok === true && off.address.phone === null)
const server = readCode("lib/physical/checkout-server.ts")
check("a pickup's phone is kept as E.164 and checked", /buyer_phone: phoneForStorage\(ownPhone\) \|\| address\?\.phone \|\| null/.test(server) && /ownPhone && !phoneForStorage\(ownPhone\)/.test(server))

console.log("\n4. The field")
const field = readCode("app/checkout/parts/phone-input.tsx")
const site = readCode("app/checkout/site/site-checkout.tsx")
const physical = readCode("app/checkout/physical/physical-checkout.tsx")
check("the flag and the code are a searchable country list", /<ChoicePicker/.test(field) && /fieldLeading=\{<Flag code=\{cc\} \/>\}/.test(field) && /keywords: `\$\{d\.dial\} \+\$\{d\.dial\}/.test(field))
check("the code follows the address's country until the buyer picks one", /const cc = \(picked \|\| country \|\| "US"\)\.toUpperCase\(\)/.test(field))
check("a country change keeps the digits and moves the code", /React\.useEffect\(\(\) => \{\s*const next = fullNumber\(digits, cc\)/.test(field) && /\}, \[cc\]\)/.test(field))
check("the code typed into the number is not shown twice", /nationalDigits\(raw, cc\)/.test(field) && /countryOfInternational\(raw/.test(field))
check("autofill and the phone keyboard", /autoComplete="tel"/.test(field) && /inputMode="tel"/.test(field) && /type="tel"/.test(field))
check("both checkouts use it, for every phone they ask", (site.match(/phoneField/g) ?? []).length >= 4 && !/addressField\("phone"/.test(site) && (physical.match(/phoneField/g) ?? []).length >= 3 && !/field\("phone"/.test(physical))

console.log("\n5. One word placeholders")
for (const [label, word] of [["Address", "Address"], ["Apartment", "Apartment"], ["City", "City"]] as const) {
  check(`${label}: "${word}"`, new RegExp(`placeholder: "${word}"`).test(site))
}
check("the state and the postal code take a word from their country's own label (ZIP, Postcode, State, Province)", /placeholder: oneWord\(fmt\.region\.label\)/.test(site) && /placeholder: oneWord\(fmt\.postal\.label\)/.test(site))
check("the phone's is Phone", /placeholder = "Phone"/.test(field))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

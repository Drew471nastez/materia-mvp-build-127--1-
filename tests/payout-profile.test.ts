import { isValidIban } from "@/lib/payments/stripe/iban"
import { payoutCountry } from "@/lib/payments/stripe/payout-countries"
import { parsePayoutProfile } from "@/lib/payments/stripe/payout-profile"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}

check("Romania uses IBAN and RON", payoutCountry("RO").format === "iban" && payoutCountry("RO").currency === "ron")
check("United States uses routing and account", payoutCountry("US").format === "us")
check("an unknown country stays in Stripe's step", payoutCountry("JP").format === "stripe")

const base = {
  kind: "individual" as const,
  country: "RO",
  firstName: "Ada",
  lastName: "Lovelace",
  address: "Strada Exemplu 1",
  city: "Bucharest",
  postalCode: "010101",
  phone: "+40722111222",
  dob: "1990-05-02",
  accountHolder: "Ada Lovelace",
}

check("a real Romanian IBAN is accepted", isValidIban("RO49AAAA1B31007593840000"))
const ok = parsePayoutProfile({ ...base, iban: "RO49 AAAA 1B31 0075 9384 0000", ibanConfirm: "RO49AAAA1B31007593840000" })
check("matching IBANs parse", ok.ok === true && ok.ok && ok.value.externalAccount?.currency === "ron")
const mismatch = parsePayoutProfile({ ...base, iban: "RO49AAAA1B31007593840000", ibanConfirm: "RO49AAAA1B31007593840001" })
check("a mismatched IBAN is refused", mismatch.ok === false)
const young = parsePayoutProfile({ ...base, dob: "2015-01-01", iban: "RO49AAAA1B31007593840000", ibanConfirm: "RO49AAAA1B31007593840000" })
check("under 18 is refused", young.ok === false)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

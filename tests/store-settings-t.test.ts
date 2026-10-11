/**
 * Round T: Store details and Checkout, the two sections every store has.
 *
 *   npx tsx tests/store-settings-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_CHECKOUT, checkoutConfig, fieldSatisfied, mergeCheckout } from "@/lib/store/checkout-config"
import { readAddress } from "@/lib/physical/address"
import { cleanPhone } from "@/lib/store/phone-rule"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nCheckout's settings, read whatever is stored\n")
{
  check("nothing stored is exactly what checkout did before", JSON.stringify(checkoutConfig(null)) === JSON.stringify(DEFAULT_CHECKOUT))
  check("  the news box is shown, nobody is made to sign in, one name field", DEFAULT_CHECKOUT.marketingOptIn && !DEFAULT_CHECKOUT.requireAccount && DEFAULT_CHECKOUT.nameFields === "last_only")
  check("  phone and the second line optional, company not asked", DEFAULT_CHECKOUT.phone === "optional" && DEFAULT_CHECKOUT.address2 === "optional" && DEFAULT_CHECKOUT.company === "off")
  const odd = checkoutConfig({ company: "maybe", phone: 3, nameFields: "x", extra: true, requireAccount: "yes" })
  check("an unknown value falls back, an unknown key is dropped", odd.company === "off" && odd.phone === "optional" && odd.nameFields === "last_only" && !("extra" in odd) && odd.requireAccount === false)
  check("a confirmed email needs an account to be confirmed on", checkoutConfig({ requireConfirmedEmail: true, requireAccount: false }).requireAccount === true)
  const merged = mergeCheckout({ phone: "required" }, { company: "optional" })
  check("a change is merged into what is kept, not over it", merged.phone === "required" && merged.company === "optional")
  check("a required field needs something in it; optional and off never do", !fieldSatisfied("required", " ") && fieldSatisfied("required", "x") && fieldSatisfied("optional", "") && fieldSatisfied("off", null))
}

console.log("\nThe delivery address follows them\n")
{
  const base = { name: "Andrei Radu", line1: "Strada Patulului 6", line2: "", city: "Bucuresti", postalCode: "077160", country: "RO", phone: "", company: "" }
  check("with the defaults, the address reads as it always did", readAddress(base).ok)
  check("first and last asked: one word is refused", readAddress({ ...base, name: "Andrei" }, { ...DEFAULT_CHECKOUT, nameFields: "first_and_last" }).ok === false)
  const co = readAddress(base, { ...DEFAULT_CHECKOUT, company: "required" })
  check("company required and empty: refused on the company field", co.ok === false && co.field === "company", co)
  const ph = readAddress(base, { ...DEFAULT_CHECKOUT, phone: "required" })
  check("phone required and empty: refused on the phone field", ph.ok === false && ph.field === "phone", ph)
  const l2 = readAddress(base, { ...DEFAULT_CHECKOUT, address2: "required" })
  check("second line required and empty: refused on it", l2.ok === false && l2.field === "line2", l2)
  const off = readAddress({ ...base, line2: "ap 44", phone: "0751048522", company: "Angus" }, { ...DEFAULT_CHECKOUT, address2: "off", phone: "off", company: "off" })
  check("a field turned off is dropped whatever was sent", off.ok && off.address.line2 === null && off.address.phone === null && !("company" in off.address && off.address.company), off)
  const kept = readAddress({ ...base, company: "Angus Farm" }, { ...DEFAULT_CHECKOUT, company: "optional" })
  check("a company asked for is kept on the address", kept.ok && kept.address.company === "Angus Farm")
}

console.log("\nThe store's phone\n")
{
  check("a Romanian number with its code is kept as typed", cleanPhone("+40 751 048 522", "RO") === "+40 751 048 522")
  check("a number under another country's code is refused", cleanPhone("+44 751 048 522", "RO") === "bad")
  check("too short, letters, no plus: refused", cleanPhone("+40 12", "RO") === "bad" && cleanPhone("+40 7a1 048 522", "RO") === "bad" && cleanPhone("0751048522", "RO") === "bad")
  check("nothing is nothing", cleanPhone("", "RO") === null && cleanPhone(null, "RO") === null)
}

console.log("\nBoth checkouts read the settings, and the routes check them\n")
{
  const phys = read("app/api/physical/checkout/route.ts")
  check("the physical checkout route loads the store's settings and hands them on", /loadCheckoutConfig\(db, shopId\)/.test(phys) && /config,\n\s+buyerEmailConfirmed: !!user\?\.email_confirmed_at,\n\s+emailOptIn: body\.emailOptIn,/.test(phys))
  const server = read("lib/physical/checkout-server.ts")
  check("  an account and a confirmed email are refused there, not only on the page", /config\.requireAccount && !input\.buyerId/.test(server) && /config\.requireConfirmedEmail && !input\.buyerEmailConfirmed/.test(server))
  check("  the address is read under the store's rules", /readAddress\(input\.address, config\)/.test(server))
  check("  a ticked news box becomes a yes on the paid order", /config\.marketingOptIn && input\.emailOptIn === true/.test(server) && /co\.email_opt_in === true \? "ticked" : "none"/.test(server))
  const session = read("app/api/checkout/stripe-session/route.ts")
  check("the digital payment route refuses a signed out buyer when an account is asked for", /checkoutConfig\.requireAccount && !user/.test(session) && /checkoutConfig\.requireConfirmedEmail && !user\?\.email_confirmed_at/.test(session))
  check("  and writes no started checkout when reminders are off", /if \(checkoutConfig\.abandonedRecovery\) await recordCheckoutStart/.test(session))
  const process = read("app/api/checkout/process/route.ts")
  check("the free checkout route asks the same", /config\.requireAccount && !user/.test(process))
  const page = read("app/checkout/checkout-client.tsx")
  check("the digital page hides the news box when the store turns it off and asks for a last name, in a field of its own, when told to", /checkoutConfig\.marketingOptIn \? \(/.test(page) && /const splitName = checkoutConfig\.nameFields === "first_and_last"/.test(page) && /splitName && !lastName\.trim\(\)/.test(page) && /id="checkout-last"/.test(page))
  const physPage = read("app/checkout/physical/physical-checkout.tsx")
  check("the physical page draws first and last apart, company, phone and the second line by the rules", /config\.nameFields === "first_and_last" \? \(/.test(physPage) && /config\.company !== "off"/.test(physPage) && /config\.address2 !== "off"/.test(physPage) && /config\.phone !== "off"/.test(physPage))
  check("  and a sign in card when an account comes first", /data-checkout-account="sign-in"/.test(physPage) && /\/login\?next=\$\{encodeURIComponent\(here\)\}/.test(physPage))
}

console.log("\nThe store's name is what orders are from\n")
{
  check("the sender name prefers Settings › Store details", /from\("store_settings"\)\.select\("store_name"\)/.test(read("lib/email.tsx")))
  check("the physical checkout's header too", /checkoutBrand\(db, shop\)/.test(read("app/checkout/physical/page.tsx")) && /str\(settings\?\.store_name\) \|\| str\(profile\?\.display_name\)/.test(read("lib/checkout/brand-server.ts")))
}

console.log("\nSettings has both sections, for every store\n")
{
  const form = read("components/app/settings-form-new.tsx")
  check("Store details and Checkout are in the Store group", /\{ id: "store", label: "Store details", icon: Store, group: "store"/.test(form) && /\{ id: "checkout", label: "Checkout", icon: ShoppingCart, group: "store"/.test(form))
  check("  and are not behind the physical commerce switch", !/COMMERCE_TABS = new Set<string>\(\[[^\]]*"store"/.test(form) && !/COMMERCE_TABS = new Set<string>\(\[[^\]]*"checkout"/.test(form))
  check("the contact email saved there is the one Profile shows", /initialSupportEmail\.current = email/.test(form))
  const sql = read("supabase/sql/run-now/109_store_settings.sql")
  check("SQL part 109 makes store_settings, reasons and channels, each with an owner read policy", /CREATE TABLE IF NOT EXISTS public\.store_settings/.test(sql) && /CREATE TABLE IF NOT EXISTS public\.commerce_reasons/.test(sql) && /CREATE TABLE IF NOT EXISTS public\.sales_channels/.test(sql) && (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length >= 4)
  check("  every statement on one line, so a cut paste never splits one", sql.split("\n").filter((l) => l.trim()).every((l) => l.startsWith("/*") || l.startsWith("notify") || /;\s*$/.test(l)))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

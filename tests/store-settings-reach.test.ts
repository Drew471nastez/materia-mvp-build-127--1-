/**
 * Settings › Store and Commerce, followed to where each one is used: a
 * value saved there has to change something a buyer or the website sees.
 * The ones that saved and went nowhere, or that dropped a change on the
 * way out, are pinned here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dynamicContext } from "../lib/website-builder/storefront-data"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nStore details' store name is the website's shop.name\n")
{
  const ctx = (theme: Record<string, unknown>, creator: Record<string, string>) => dynamicContext({ theme, creator }).shop?.name
  check("the store's name when the website has no brand name of its own", ctx({}, { name: "Mara Lind", storeName: "Lind Prints" }) === "Lind Prints")
  check("the website's own brand name first", ctx({ brand_name: "Lind & Co" }, { name: "Mara Lind", storeName: "Lind Prints" }) === "Lind & Co")
  check("the person's name when neither is set, as before", ctx({}, { name: "Mara Lind" }) === "Mara Lind")
  const facts = read("lib/website-builder/storefront-data-server.ts")
  check("read with the creator's public facts, failing to none", /db\.from\("store_settings"\)\.select\("store_name"\)\.eq\("creator_id", creatorId\)/.test(facts) && /\.then\(\(r\) => r, \(\) => \(\{ data: null \}\)\)/.test(facts))
  const published = read("lib/website-builder/published-site.ts")
  check("a native site's prerendered shop.name too", (published.match(/shop: \{ name: site\.profile\?\.storeName \|\| site\.displayName \}/g) ?? []).length === 2)
  const compat = read("lib/website-builder/compat-site.ts")
  check("an imported theme's shop.name and shop.email on the live site", /shop: \{ name: brandOf\(settings\) \|\| store\.name \|\| creator\.displayName, email: store\.email \?\? undefined,/.test(compat) && /\["compat-store", creatorId\]/.test(compat))
  check("and in the editor's canvas, where it said My store", /creatorFacts\?\.storeName \|\| creatorFacts\?\.name \|\| "My store"/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  const route = read("app/api/store/settings/route.ts")
  check("saving the name or the contact clears the site's caches", /if \("storeName" in body \|\| "supportEmail" in body\)/.test(route) && /revalidateTag\(creatorShopTag\(c\.creatorId\), "max"\)/.test(route) && /await revalidatePublishedSite\(c\.creatorId\)/.test(route))
  check("the digital checkout names the store, as its hint says", /creator\?\.id \? loadStoreName\(checkoutAdmin\(\), creator\.id\)/.test(read("app/checkout/page.tsx")) && /name: storeName \|\| personName\(/.test(read("app/checkout/page.tsx")))
}

console.log("\nStore details' country: new locations and tax start there\n")
{
  check("Taxes offers the store's country first", /detectedCountry: store\?\.defaultCountry \?\? detectedCountry\(h\)/.test(read("app/api/store/taxes/route.ts")))
  const ship = read("components/physical/shipping-settings.tsx")
  /* Changed on purpose (shipping quick setup): the settings read now carries the store's country itself (origin), with Settings' read-ahead as the fallback. */
  check("a new location starts in it", /<LocationForm startCountry=\{data\.origin\?\.country \|\| storeCountry\(\)\}/.test(ship) && /country: initial\?\.country \?\? startCountry/.test(ship))
}

console.log("\nCheckout\n")
{
  const panel = read("components/app/settings/checkout-panel.tsx")
  check("a change still waiting when the section closes is sent, not dropped", /if \(Object\.keys\(body\)\.length\) void api\("\/api\/store\/settings", \{ method: "PUT", body: \{ checkout: body \} \}\)/.test(panel))
  const phys = read("lib/physical/checkout-server.ts")
  check("the cart checkout puts Settings › Payments' statement name on the charge", /\.\.\.statementParams\(\{\s*account: String\(creator\.stripe_account_id\)/.test(phys) && /charges_enabled, payouts_enabled, statement_descriptor"\)/.test(phys))
  check("  and a refused statement sells on Storelib's line, under a key of its own", /delete params\.payment_intent_data\.statement_descriptor_suffix/.test(phys) && /idempotencyKey: `physical-checkout:\$\{checkoutId\}:plain`/.test(phys))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

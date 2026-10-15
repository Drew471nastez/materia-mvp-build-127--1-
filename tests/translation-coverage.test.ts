/**
 * ===========================================================================
 *  TRANSLATIONS THAT REACH THE PAGE, AND ONES A PERSON WROTE KEPT
 * ===========================================================================
 * The owner: "the whole theme translatable in all places", and AI translation
 * that "preserves manually edited translations". Found by reading every
 * customer facing path:
 *
 *   collections   offered in Translations (collection:<id>:title and
 *                 :description) but laid over nowhere: built-in themes now
 *                 read them through the page's localizer (dressPage, the
 *                 collection page's heading), imported themes in
 *                 localizeCompatSite, whose products in a collection were
 *                 translated only when a currency was also converted
 *   AI drafts     replaced a person's approved translation with a hidden
 *                 draft when its original changed, which put the original
 *                 back on the live site until someone reviewed it
 *   home market   read store_settings.country, a column that does not
 *                 exist (default_country), so it never had a country
 *   order rows    a website cart's orders said "usd" whatever was charged
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

console.log("\n1. Collections, in the visitor's language")
const live = readCode("lib/markets/live.ts")
check("the live localizer lays collection:<id> over a collection's title and description", /* Changed on purpose (merge): the branch's typed form of the same overlay. */ /collection\(c\) \{[\s\S]{0,260}localizeRecord\(record, `collection:\$\{c\.id\}`/.test(live))
const site = readCode("lib/website-builder/published-site.ts")
check("built-in themes: every collection a page reads, and its products as the page's cards", /localizer\.collection\(c as unknown/.test(site) && /products: localizer\.cards\(c\.products as never\)/.test(site) && /opts: \{ cached: boolean; localizer\?: Localizer \| null \}/.test(site))
for (const f of ["app/(site)/w/[username]/search/page.tsx", "app/(site)/w/[username]/cart/page.tsx", "app/(site)/w/[username]/products/page.tsx", "app/(site)/w/[username]/render-account.tsx", "app/(site)/w/[username]/collections/page.tsx", "app/(site)/w/[username]/collections/[handle]/page.tsx", "components/website-builder/theme/render-product.tsx"]) {
  check(`${f.split("/").slice(-2).join("/")} hands its localizer to the page`, /dressPage\([\s\S]*?localizer \}\)/.test(readCode(f)))
}
check("the collection page's heading and title in the language", /* Changed on purpose (merge): collection() keeps its type, no casts. */ /const collection = localizer \? localizer\.collection\(inIt\.collection\)/.test(readCode("app/(site)/w/[username]/collections/[handle]/page.tsx")))
const compat = readCode("lib/markets/compat.ts")
/* Changed on purpose (translation coverage): the overlay is compat-fields.ts compatCollectionIn, shared with the builder's canvas. */
check("imported themes: collection:<id> laid over, and its products translated without a currency change too", /const words = compatCollectionIn\(c, map, opts\)/.test(compat) && /`collection:\$\{c\.id\}`/.test(readCode("lib/markets/compat-fields.ts")) && !/collections: pricing \? site\.collections\.map/.test(compat))

console.log("\n2. A person's translation is kept")
const draft = readCode("app/api/store/translations/draft/route.ts")
check("AI drafts what is missing and its own outdated drafts, never a person's approved one", /* Changed on purpose (merge): one rule for the press and the hourly job, aiMayWrite, which leaves every translation a person wrote. */ /* Changed on purpose (checkout, currency and translation overhaul): in the round the press and the background job share. */ /\.filter\(\(t\) => aiMayWrite\(map\.get\(t\.key\), t\.source\)\)/.test(readCode("lib/markets/translation-press.ts")))
check("and what is left to draft counts the same way", /!written\.has\(t\.key\) && aiMayWrite\(map\.get\(t\.key\), t\.source\)/.test(readCode("lib/markets/translation-press.ts")))
const translate = readCode("lib/markets/translate.ts")
check("an approved value stays live while its original changed (only drafts are hidden)", /if \(opts\.approvedOnly && row\.status !== "approved"\) return null/.test(translate))

console.log("\n3. The home market's country, and what an order was paid in")
check("the home country is read from default_country", /select\("default_country"\)/.test(readCode("lib/markets/server.ts")) && !/select\("country"\)/.test(readCode("lib/markets/server.ts")))
const item = readCode("lib/checkout/fulfil-cart-item.ts")
check("a website cart's order rows keep the payment's own currency", /currency: \(ctx\.currency \|\| "usd"\)\.toLowerCase\(\)/.test(item) && !/currency: "usd",/.test(item))
check("from the PaymentIntent, and a physical checkout's from its row", /* Changed on purpose (merge): the Checkout Session's, else the PaymentIntent's. */ /currency: (session\.currency \|\| )?pi\??\.currency \|\| null,/.test(readCode("lib/checkout/fulfil-cart-session.ts")) && /currency: co\.currency \?\? null,/.test(readCode("lib/physical/checkout-server.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

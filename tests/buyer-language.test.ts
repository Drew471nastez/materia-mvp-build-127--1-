/**
 * The language everything about a placed order is written in
 * (lib/markets/buyer-language.ts): on Storelib English; on the website the
 * language a link names, else the one the order was placed in, else the
 * store's default. Never the browser, the country, the currency or a
 * cookie. The owner's report: "English is set as default, but it uses
 * Romanian."
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buyerLanguage } from "@/lib/markets/buyer-language"
import { pickCheckoutLanguage } from "@/lib/markets/checkout-language"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe store's default language is the default\n")
const english = { defaultLanguage: "en", published: ["ro"] }
check("English default, Romanian published, nothing kept with the order: English", buyerLanguage({ ...english, channel: "website" }).lang === "en" && buyerLanguage(english).reason === "default")
check("English default, an order kept as English: English", buyerLanguage({ ...english, order: "en" }).lang === "en")
check("English default, Romanian not published, an order kept as Romanian: English", buyerLanguage({ defaultLanguage: "en", published: [], order: "ro" }).lang === "en", buyerLanguage({ defaultLanguage: "en", published: [], order: "ro" }))
check("  nor a link naming Romanian", buyerLanguage({ defaultLanguage: "en", published: [], named: "ro" }).lang === "en")
check("a French default with nothing else known: French, never English by omission", buyerLanguage({ defaultLanguage: "fr", published: [] }).lang === "fr")
check("no default saved: English", buyerLanguage({ defaultLanguage: null }).lang === "en" && buyerLanguage({ defaultLanguage: "" }).lang === "en")

console.log("\nOnly a deliberate language moves it\n")
check("the order was placed in a published language: that one", buyerLanguage({ ...english, order: "ro" }).lang === "ro" && buyerLanguage({ ...english, order: "ro" }).reason === "order")
check("  matched whatever its case", buyerLanguage({ defaultLanguage: "en", published: ["pt-BR"], order: "PT-br" }).lang === "pt-BR")
check("a link Storelib wrote names one: it wins over the order's", buyerLanguage({ defaultLanguage: "en", published: ["ro", "fr"], named: "fr", order: "ro" }).lang === "fr")
check("  a link naming the default wins too", buyerLanguage({ ...english, named: "en", order: "ro" }).lang === "en")
check("  a link naming a language the store does not publish is ignored", buyerLanguage({ ...english, named: "de", order: "en" }).lang === "en")
check("bought on Storelib: English, whatever the store's default or the order says", buyerLanguage({ defaultLanguage: "fr", published: ["ro"], channel: "storelib", named: "ro", order: "ro" }).lang === "en")

console.log("\nThe checkout: the page they came from decides\n")
check("an English /cart with a Romanian cookie from another visit: the website's default", pickCheckoutLanguage(["ro"], "/cart", "ro") === null, pickCheckoutLanguage(["ro"], "/cart", "ro"))
check("  a full address of an English page too", pickCheckoutLanguage(["ro"], "https://bread.studio/products/mug", "ro") === null)
check("a Romanian page (/ro/cart): Romanian, whatever the cookie", pickCheckoutLanguage(["ro"], "/ro/cart", "en") === "ro")
check("the page unknown: the visitor's own choice on the website", pickCheckoutLanguage(["ro"], null, "ro") === "ro" && pickCheckoutLanguage(["ro"], null, "de") === null)

console.log("\nEvery surface asks the one rule\n")
const pages = {
  receipt: read("app/(storelib)/receipt/[token]/page.tsx"),
  order: read("app/(storelib)/checkout/physical/order/[token]/page.tsx"),
  help: read("app/(storelib)/order-help/[id]/page.tsx"),
  thanks: read("app/(storelib)/checkout/site/thanks/[token]/page.tsx"),
  review: read("app/(storelib)/review/[token]/page.tsx"),
}
for (const [name, src] of Object.entries(pages)) {
  check(`${name}: reads buyerPageLanguage`, /buyerPageLanguage\(/.test(src))
  check(`  ${name}: never the sl_lang cookie`, !/sl_lang/.test(src))
}
check("the receipt's dates and money are in its language, not the browser's", !/accept-language/i.test(pages.receipt) && /locale=\{formatLocale\(language\?\.lang \?\? "en"\)\}/.test(pages.receipt))
check("the receipt, order page, order help and review know where it was bought", [pages.receipt, pages.order, pages.review].every((s) => /buyerChannel\(/.test(s)) && /channel: out\.order\.channel/.test(pages.help) && /channel: buyerChannel\(/.test(read("lib/support/cases-server.ts")))
const server = read("lib/markets/checkout-language.ts")
check("buyerPageLanguage: English on Storelib, else the rule over the store's default and published languages", /if \(facts\.channel === "storelib"\) return \{ lang: "en"/.test(server) && /buyerLanguage\(\{ \.\.\.facts, defaultLanguage: langs\.defaultLanguage, published: langs\.others \}\)/.test(server))
check("every buyer email picks through the same rule", /buyerLanguage\(\{ defaultLanguage: langs\.defaultLanguage, published: langs\.others, order: asked \}\)/.test(read("lib/emails/words-server.ts")))
check("the order link email is in the store's default when the page named none", /emailLanguageFor\(site\.creatorId, asked \|\| null\)/.test(read("app/api/checkout/site/track/route.ts")) && /const mail = language \? inEmailLanguage/.test(read("app/api/checkout/site/track/route.ts")))
const rule = read("lib/markets/buyer-language.ts")
check("the rule reads no cookie, header, country or currency", !/cookies\(|headers\(|accept-language|country|currency/i.test(rule.split("Pure and browser safe.")[1] ?? ""))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

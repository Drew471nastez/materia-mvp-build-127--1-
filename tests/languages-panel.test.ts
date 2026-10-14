/**
 * ===========================================================================
 *  SETTINGS › LANGUAGES
 * ===========================================================================
 * Markets & Languages became Languages: a list where each language says
 * where it is (Default, Published, Hidden, Translating), adding one starts
 * Storelib AI on it with its progress on the row, and the next step is a
 * button (Review, Publish) with the rest in a menu. The two switches most
 * stores never touch sit under More options. Visitor currencies are an
 * optional card, since the store's own currency is in Store details.
 * The checkout has its own language selector.
 */
import { readFileSync } from "node:fs"
import { pickCheckoutLanguage } from "@/lib/markets/checkout-language"
import { EXPLAINERS } from "@/lib/settings/explainers"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

console.log("\nThe tab")
const form = code("components/app/settings-form-new.tsx")
check("is called Languages, at the same address", /id: "markets", get label\(\) \{ return tt\("Languages"\) \}/.test(form))
check("the website builder links to it by that name", /* Changed on purpose (overhaul): General's Languages and currencies card links each row to it. */ /ctx\.onNavigate\(href\)/.test(code("components/website-builder/website-settings/general.tsx")) && /manage\("\/app\/settings\?tab=markets"\)/.test(code("components/website-builder/website-settings/general.tsx")))

console.log("\nEach language says where it is")
const panel = code("components/app/settings/markets-panel.tsx")
check("Default, Published, Hidden and Translating", /tt\("Default"\)/.test(panel) && /tt\("Published"\)/.test(panel) && /tt\("Hidden"\)/.test(panel) && /tt\("Translating"\)/.test(panel))
check("how many texts are translated and how many wait to be reviewed", /tt\("\{done\} of \{total\} translated"/.test(panel) && /tt\("\{count\} to review"/.test(panel))
check("read for every language in one call", /\/api\/store\/translations\?summary=1/.test(panel))
const route = code("app/api/store/translations/route.ts")
check("which counts done, drafted and still to do, by the same rule as Review", /searchParams\.get\("summary"\) === "1"/.test(route) && /statusOf\(map\.get\(t\.key\), t\.source\)/.test(route))
check("the next step is a button: Review drafts, or Publish a language that has translations", /data-translate-language=\{l\.code\}/.test(panel) && /data-publish-language=\{l\.code\}/.test(panel))
check("the rest is in its menu: review, translate the rest, publish or unpublish, remove", /ResponsiveActionMenu/.test(panel) && /tt\("Review and edit"\)/.test(panel) && /tt\("Translate the rest with AI"\)/.test(panel) && /tt\("Remove"\)/.test(panel))

console.log("\nAdding a language translates it")
check("Add language, then Storelib AI starts once the language is saved", /tt\("Add language"\)/.test(panel) && /void commit\(\{ \.\.\.draft, languages: \[\.\.\.draft\.languages, \{ code, published: false \}\] \}\)\.then\(\(ok\) => \{/.test(panel) && /else void translateWithAi\(code\)/.test(panel))
check("without AI, straight into translating by hand", /data\.autoTranslate\?\.available === false\) setTranslating\(code\)/.test(panel))
check("batch after batch, with the count on the row and a progress bar", /for \(let press = 0; press < 12; press\+\+\)/.test(panel) && /role="progressbar"/.test(panel) && /tt\("\{done\} of \{total\} texts"/.test(panel))
check("a stop says why, with Try again", /state: "error", message: r\.error/.test(panel) && /tt\("Try again"\)/.test(panel))
check("closing Review shows what changed on the row", /void loadProgress\(\)/.test(panel))

console.log("\nLess on screen")
check("the two rarely used switches are under More options", /<details[^>]*data-language-options/.test(panel) && /tt\("More options"\)/.test(panel) && panel.indexOf("data-visitor-language") > panel.indexOf("data-language-options"))
check("visitor currencies are an optional card without the home market", /title=\{tt\("Visitor currencies"\)\}/.test(panel) && /\.filter\(\(m\) => !m\.primary\)/.test(panel) && /* Changed on purpose (overhaul): visitors pay in their currency when Storelib can charge it. */ /tt\("Optional\. Visitors from other countries see your prices in their currency and pay in it\."\)/.test(panel) && /Shown only, paid in \{currency\}/.test(panel))

console.log("\nThe checkout's own selector")
check("a language picked at checkout wins over the page the visitor came from", /p && langs\.others\.find/.test(code("lib/markets/checkout-language.ts")))
check("the page passes the choice and the website's languages", /q\.get\("lang"\)\)/.test(code("app/checkout/site/page.tsx")) && /languages=\{language\.available/.test(code("app/checkout/site/page.tsx")))
const site = code("app/checkout/site/site-checkout.tsx")
check("drawn under the payment, each language in its own words", /<CheckoutLanguageSelect current=\{pageLang\} languages=\{languages\} \/>/.test(site) && /languageName\(c\)/.test(site))
check("a choice is kept as the website's (sl_lang) and the page drawn again in it", /sl_lang=\$\{encodeURIComponent\(code\)\}/.test(site) && /searchParams\.set\("lang", code\)/.test(site))
check("the back address still decides when nothing was picked", pickCheckoutLanguage(["fr", "de"], "/fr/cart", "de") === "fr" && pickCheckoutLanguage(["fr"], null, "fr") === "fr" && pickCheckoutLanguage(["fr"], null, "es") === null)

console.log("\nHow it works, and the guide")
check("Languages and Visitor currencies each link to the guide", EXPLAINERS.languages.guide === "/help/physical-products/languages-and-currencies-for-visitors" && EXPLAINERS.markets.guide === "/help/physical-products/languages-and-currencies-for-visitors")
/* Changed on purpose (overhaul): checkout charges the visitor's currency, the store's only for one it cannot charge. */
check("Visitor currencies says checkout charges the visitor's currency", EXPLAINERS.markets.lines.some((l) => /Checkout charges the visitor's currency/.test(l)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

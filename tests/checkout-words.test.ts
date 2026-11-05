/**
 * The website's checkout in the website's languages (lib/markets/checkout-words.ts):
 * every sentence it shows is listed for Translate › Checkout, a translation is
 * shown in the visitor's language with its blanks filled, the order's titles
 * and option names follow, and a website written in another language than
 * English translates the cart's and the checkout's words into its own.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkoutKey, checkoutSentences, checkoutT, checkoutTranslatables, checkoutWordsFrom, countryNameIn, lowerLabel } from "@/lib/markets/checkout-words"
import { localizeQuote } from "@/lib/markets/checkout-quote"
import { keepsFixedParts } from "@/lib/markets/draft-check"
import { BUILT_IN_GROUPS, isBuiltInWordKey, isEnglish, isTranslationKey, optionKey, sourceHash, translationMap, type TranslationRow } from "@/lib/markets/translate"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "ai", ...extra })
const P1 = "a0000000-0000-4000-8000-0000000000a1"

console.log("\nEvery sentence is listed")
let fresh = true
try {
  execFileSync(process.execPath, ["scripts/i18n/checkout-sentences.mjs", "--check"], { stdio: "pipe" })
} catch {
  fresh = false
}
check("the list is the sentences the checkout code says (scripts/i18n/checkout-sentences.mjs --check)", fresh)
const all = checkoutSentences()
for (const s of ["Pay {amount}", "Enter a valid email address.", "Shipping method", "I agree to the [Terms and Conditions] and the [Refund policy]", "Tick the box to agree to the Terms and Conditions.", "Thank you for your order", "Prices in {display} are for reference. You'll pay in {charge}; your bank converts it.", "That code has expired."]) check(`  "${s}"`, all.includes(s))
check("each country's address fields, by name and in their sentences", all.includes("ZIP code") && all.includes("Enter the ZIP code.") && all.includes("Prefecture") && all.includes("Choose your prefecture."))
check("buying for a business, each country's tax number", all.includes("VAT number") || all.some((s) => /VAT/.test(s)))
check("the connection's own sentences", all.includes("The connection dropped. Try again."))
check("never a code or a merchant's coupon rule", !all.includes("STORELIB100") && !all.some((s) => /^A code is 3 to 32/.test(s)))
check("no sentence still says $0.50 whatever the currency", !all.some((s) => /\$0\.50/.test(s)))
const items = checkoutTranslatables()
check("each is a text of the website with its own key", items.length === all.length && items.every((i) => isTranslationKey(i.key) && i.where === "Checkout"))
check("listed in Translate as the Checkout group", /groups\.push\(\{ id: "checkout", title: "Checkout", items: checkoutTranslatables\(\) \}\)/.test(read("lib/markets/server.ts")))

console.log("\nShown in the visitor's language")
const map = translationMap([
  row(checkoutKey("Pay {amount}"), "Payer {amount}", "Pay {amount}"),
  row(checkoutKey("Shipping method"), "Mode de livraison", "Shipping method"),
  row(checkoutKey("Enter the ZIP code."), "Saisissez le code postal.", "Enter the ZIP code.", { status: "draft" }),
  row(checkoutKey("Only {count} left"), "Plus que {count}", "Only {count} left (old)"),
])
const words = checkoutWordsFrom(map)
const ct = checkoutT("fr", words)
check("a translated sentence, its blank filled", ct("Pay {amount}", { amount: "48,00 €" }) === "Payer 48,00 €")
check("  a plain one", ct("Shipping method") === "Mode de livraison")
check("a draft is not shown: the English is", ct("Enter the ZIP code.") === "Enter the ZIP code.")
check("one written for an older sentence is not shown", ct("Only {count} left", { count: 2 }) === "Only 2 left")
check("a sentence nobody translated reads in English, never a key", ct("Sold out") === "Sold out")
check("countries in the visitor's language", countryNameIn("DE", "fr") === "Allemagne" && countryNameIn("DE", "en") === "Germany")
check("a label inside a sentence: lowered, ZIP kept", lowerLabel("Postal code") === "postal code" && lowerLabel("ZIP code") === "ZIP code")
check("the agreement's two links survive a translation only with both brackets", keepsFixedParts("I agree to the [Terms and Conditions] and the [Refund policy]", "J'accepte les [Conditions] et la [Politique de remboursement]") && !keepsFixedParts("I agree to the [Terms and Conditions] and the [Refund policy]", "J'accepte les Conditions et la Politique"))

console.log("\nThe order in the visitor's language")
const quote = {
  lines: [{ productId: P1, variantId: "v1", title: "Tee", variantName: "Small / Red", imageUrl: null, type: "physical", quantity: 1, unitCents: 2000, discountCents: 0, requiresShipping: true, maxQuantity: 5 }],
  short: [], owned: [], stockIssues: [{ productId: P1, variantId: "v1", title: "Tee", available: 0 }], adjusted: [],
  choices: { [P1]: { options: [{ name: "Size", values: ["Small", "Large"] }], variants: [{ id: "v1", name: "Small / Red", values: ["Small", "Red"], priceCents: 2000, available: true }] } },
} as unknown as SiteQuote
const qmap = translationMap([row(`product:${P1}:title`, "T-shirt", "Tee"), row(optionKey("Small"), "Petit", "Small"), row(optionKey("Red"), "Rouge", "Red"), row(optionKey("Size"), "Taille", "Size")])
const q = localizeQuote(quote, qmap)
check("its title and its option, translated; its price and id untouched", q.lines[0].title === "T-shirt" && q.lines[0].variantName === "Petit / Rouge" && q.lines[0].unitCents === 2000 && q.lines[0].variantId === "v1", q.lines[0])
check("the options it can change to, the same words", q.choices![P1].options[0].name === "Taille" && q.choices![P1].options[0].values.join() === "Petit,Large" && q.choices![P1].variants[0].values.join() === "Petit,Rouge")
check("  and the stock notes", q.stockIssues[0].title === "T-shirt")
check("no map: the order as it was", localizeQuote(quote, null) === quote)

console.log("\nWired through the checkout")
const page = read("app/(storelib)/checkout/site/page.tsx")
/* Changed on purpose (round BC): the page it came from is Back as worked out once (siteCheckoutBack, with the Referer). */
check("the page reads the language from the page the visitor came from, or their choice", /checkoutLanguage\(site\.creatorId, back \?\? q\.get\("return"\)/.test(page) && /const back = siteCheckoutBack\(q, site\.host, h\.get\("referer"\)\)/.test(page) && /jar\.get\("sl_lang"\)/.test(page))
check("  and hands the words to the checkout and its problems", (page.match(/<CheckoutWords lang=\{language\.lang\} words=\{language\.words\}>/g) ?? []).length === 2)
check("  the first frame's order translated", /initialQuote=\{answer\?\.ok \? localizeQuote\(answer\.quote, language\.map\) : null\}/.test(page))
check("the route translates every quote after it", /localizeQuote\(answer\.quote, language\.map\)/.test(read("app/api/checkout/site/route.ts")) && /lang: pageLang \?\? null/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")))
/* Changed on purpose (the buyer language rule, lib/markets/buyer-language.ts): after paying, the thank you page asks the one rule, ?lang the checkout names, else the order's checkout language while still published, else the store's default; never the sl_lang cookie. */
check("the thank you page follows in the same language", /lang=\$\{encodeURIComponent\(pageLang\)\}/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")) && /buyerPageLanguage\(site\.creatorId, \{ channel: "website", named: sp\.lang, order \}\)/.test(read("app/(storelib)/checkout/site/thanks/[token]/page.tsx")) && !/sl_lang/.test(read("app/(storelib)/checkout/site/thanks/[token]/page.tsx")))
check("the card form in it too, where Stripe has it", /locale,\n\s*\}\),/.test(read("app/(storelib)/checkout/parts/stripe-pay.tsx")))
check("the page's lang and direction are set", /html\.dir = isRtl\(lang\) \? "rtl" : "ltr"/.test(read("app/(storelib)/checkout/parts/words.tsx")))
check("no checkout part still says a bare English sentence the scanner cannot see", !/>\s*Shipping method\s*</.test(read("app/(storelib)/checkout/site/site-checkout.tsx")) && !/"The smallest card payment is \$0\.50\."/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")))

console.log("\nA website written in another language")
check("English is told apart", isEnglish("en") && isEnglish("en-GB") && !isEnglish("fr") && !isEnglish("es"))
check("only the words Storelib writes (the shop's, the checkout's, the emails') and the theme's own are translated into its own language", BUILT_IN_GROUPS.has("ui") && BUILT_IN_GROUPS.has("checkout") && BUILT_IN_GROUPS.has("emails") && BUILT_IN_GROUPS.has("theme-words") && BUILT_IN_GROUPS.size === 4 && isBuiltInWordKey("checkout:abcd1234") && isBuiltInWordKey("ui:cart") && !isBuiltInWordKey(`product:${P1}:title`))
const route = read("app/api/store/translations/route.ts")
check("the translations list opens for it, with those groups only when it is written in it", /* Changed on purpose (the owner: the default language is what the website shows; written in another, every text is translated into it). */ /const own = isDefault && \(scope === "all" \|\| !isEnglish\(asked!\)\)/.test(route) && /groups\.filter\(\(g\) => !own \|\| scope === "all" \|\| BUILT_IN_GROUPS\.has\(g\.id\)\)/.test(route))
check("  and refuses any other text in it", /!isBuiltInWordKey\(i\.key\)\)\) return physicalJson\(\{ error: "Your website is already written in this language\." \}, 400\)/.test(route))
check("Storelib AI drafts them from English", /from: "en"/.test(read("lib/markets/translate-ai.ts")))
check("the hourly job does them too", /* Changed on purpose (the owner: the default language is what the website shows; written in another, every text is translated into it). */ /const own = scope === "all" \|\| !isEnglish\(loc\.defaultLanguage\) \? \[loc\.defaultLanguage\] : \[\]/.test(read("lib/markets/auto-translate.ts")))
check("the live pages draw the shop's words in it, and every translation into the default", /* Changed on purpose (the owner: the default language is what the website shows; written in another, every text is translated into it). */ /* Changed on purpose (round V8): one read, for the language asked for or else the default. */ /(: await cachedTranslations\(creatorId, langs\.defaultLanguage\)|cachedTranslations\(creatorId, code \?\? langs\.defaultLanguage\))/.test(read("lib/markets/live.ts")))
check("the checkout too", /if \(isEnglish\(langs\.defaultLanguage\)\) return/.test(read("lib/markets/checkout-language.ts")))
check("Translate on its row in Markets and languages", /* Changed on purpose (the owner: the default language is what the website shows; written in another, every text is translated into it). */ /translateDefault \|\| !isEnglish\(draft\.defaultLanguage\) \?/.test(read("components/app/settings/markets-panel.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

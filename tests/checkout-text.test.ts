/**
 * The checkout's words in every language, and a store's own (round K2).
 *
 * Andrew's Romanian checkout said "Salariul AndrewRullz" (a monthly wage)
 * above the total and "Îndepărtare" on a line: the checkout's words were
 * machine translated per store, sentence by sentence, with no context, and
 * "Pay {shop}" reached a free translation memory as the bare word "Pay".
 * This pins the fix: curated dictionaries (Romanian complete), a store's
 * own words for the texts it may reword, machine translation only with
 * context and only as the last resort, and the order summary's rows adding
 * up to the server's total.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { checkoutKey, checkoutSentences, checkoutT, checkoutWordsIn, emailKey, emailSentences, emailWordsIn } from "@/lib/markets/checkout-words"
import { keepsFixedParts } from "@/lib/markets/draft-check"
import { sourceHash, translationMap, type TranslationRow } from "@/lib/markets/translate"
import ro from "@/lib/checkout-text/dict/ro"
import { CORE_DICTIONARIES, CORE_SENTENCES } from "@/lib/checkout-text/dict/core"
import { curatedWords, defaultFor, layeredWords, noteFor } from "@/lib/checkout-text/words"
import { EDITABLE_TEXTS, PROTECTED_TEXTS, editableById, editableBySource, isProtected, placeholdersOf, validateOverride } from "@/lib/checkout-text/registry"
import { rowsSum, summaryRows } from "@/lib/checkout/summary-rows"
import { convertOrder, marketCharge } from "@/lib/markets/checkout-charge"
import { pricingFor } from "@/lib/markets/pricing"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "ai", ...extra })

async function main() {
  const all = checkoutSentences()
  const mail = emailSentences()

  console.log("\nRomanian reads like a Romanian shop")
  const t = checkoutT("ro", checkoutWordsIn("ro", null))
  check("the heading over the total: Plătește AndrewRullz", t("Pay {shop}", { shop: "AndrewRullz" }) === "Plătește AndrewRullz", t("Pay {shop}", { shop: "AndrewRullz" }))
  check("the button: Cumpără 62.05 lei (the owner's wording)", t("Pay {amount}", { amount: "62.05 lei" }) === "Cumpără 62.05 lei", t("Pay {amount}", { amount: "62.05 lei" }))
  const want: [string, string][] = [
    ["Remove", "Elimină"], ["Edit", "Editează"], ["Subtotal", "Subtotal"], ["Shipping", "Livrare"], ["Delivery", "Livrare"], ["Total due", "Total de plată"],
    ["Add promotion code", "Adaugă cod de reducere"], ["Discount code", "Cod de reducere"], ["Apply", "Aplică"], ["Contact information", "Date de contact"],
    ["Ship", "Livrare"], ["Free", "Gratuit"], ["Email", "E-mail"], ["Place order", "Plasează comanda"], ["Payment method", "Metodă de plată"], ["Cash on delivery", "Plată la livrare (ramburs)"],
  ]
  for (const [en, r] of want) check(`  ${en} → ${r}`, t(en) === r, t(en))
  const words = Object.values(ro).join("\n")
  check("never the wage, the noun Remove, a boat or a squeeze", !/Salari|Îndepărtare|Vapor|Strângeți/i.test(words))
  check("ș and ț with the comma below, never the cedilla look-alikes", !/[şţŞŢ]/.test(words))
  check("informal tu, as Romanian shops write a checkout (no Introduceți / Alegeți)", !/(Introduceți|Alegeți|Încercați|Verificați)/.test(words))
  check("the reproduced live strings are all replaced", t("Discount code") !== "Код за отстъпка" && t("{amount} off", { amount: "5 lei" }) === "5 lei reducere" && t("Including {tax}", { tax: "TVA" }) === "Inclusiv TVA")
  check("plural days read Romanian (1 zi, 3 zile, 20 de zile)", ["1 zi lucrătoare", "3 zile lucrătoare", "20 de zile lucrătoare"].every((s, i) => t("{count, plural, one {# business day} other {# business days}}", { count: [1, 3, 20][i] }) === s), [1, 3, 20].map((n) => t("{count, plural, one {# business day} other {# business days}}", { count: n })))
  const roMissing = [...all, ...mail].filter((s) => !ro[s])
  check(`every checkout and email sentence has a Romanian one (${all.length} + ${mail.length})`, roMissing.length === 0, roMissing.slice(0, 8))

  console.log("\nEvery curated language")
  for (const [lang, dict] of [["ro", ro] as const, ...Object.entries(CORE_DICTIONARIES)]) {
    const broken = Object.entries(dict).filter(([en, v]) => !keepsFixedParts(en, v) || placeholdersOf(en).join() !== placeholdersOf(v).sort((a, b) => placeholdersOf(en).indexOf(a) - placeholdersOf(en).indexOf(b)).join())
    check(`${lang}: every translation keeps its {placeholders} and [links]`, broken.length === 0, broken.slice(0, 4))
    const stray = Object.keys(dict).filter((en) => !all.includes(en) && !mail.includes(en))
    check(`${lang}: no entry for a sentence the checkout doesn't say`, stray.length === 0, stray.slice(0, 4))
  }
  for (const [lang, dict] of Object.entries(CORE_DICTIONARIES)) {
    const missingCore = CORE_SENTENCES.filter((s) => !dict[s])
    check(`${lang}: has every core sentence (${CORE_SENTENCES.length})`, missingCore.length === 0, missingCore)
    /* The rest is drawn from the store's translation, a machine translation with context, then English: logged so the gap stays visible. */
    const rest = all.filter((s) => !dict[s]).length
    console.log(`        ${lang}: ${all.length - rest} of ${all.length} checkout sentences curated, ${rest} left to the store's or a machine translation`)
  }
  check("the core sentences are real checkout sentences", CORE_SENTENCES.every((s) => all.includes(s)), CORE_SENTENCES.filter((s) => !all.includes(s)))
  check("a regional tag reads its language (ro-MD → Romanian, es-MX → Spanish)", curatedWords("ro-MD")["Pay {shop}"] === "Plătește {shop}" && curatedWords("es-MX")["Pay {amount}"] === "Pagar {amount}")
  check("Brazilian and European Portuguese are kept apart", curatedWords("pt-BR")["Shipping"] === "Frete" && curatedWords("pt")["Shipping"] === "Portes")
  check("English has none: the sentence is its own word", Object.keys(curatedWords("en")).length === 0 && Object.keys(curatedWords("en-GB")).length === 0)
  check("a short label carries a note for the translator (Pay is a verb)", /verb/i.test(noteFor("Pay {shop}") ?? "") && /verb/i.test(noteFor("Remove") ?? ""))

  console.log("\nWho wins: the store's words, theirs, curated, machine, English")
  const ai = translationMap([row(checkoutKey("Pay {shop}"), "Salariul {shop}", "Pay {shop}"), row(checkoutKey("Back"), "Înapoi!", "Back"), row(checkoutKey("Ready for pickup"), "Ready for Pickup (Gata)", "Ready for pickup")])
  check("Storelib's curated words beat a machine translation (the live Salariul row loses)", checkoutWordsIn("ro", ai)["Pay {shop}"] === "Plătește {shop}")
  const theirs = translationMap([row(checkoutKey("Pay {shop}"), "Achită la {shop}", "Pay {shop}", { source: "manual" })])
  check("a translation the merchant wrote in Translate beats the curated one", checkoutWordsIn("ro", theirs)["Pay {shop}"] === "Achită la {shop}")
  check("even once the English changed (it is theirs, listed as Needs review)", checkoutWordsIn("ro", translationMap([row(checkoutKey("Pay {shop}"), "Achită la {shop}", "Pay", { source: "manual" })]))["Pay {shop}"] === "Achită la {shop}")
  check("the store's own checkout text beats everything", checkoutWordsIn("ro", theirs, { "Pay {shop}": "Plată către {shop}" })["Pay {shop}"] === "Plată către {shop}")
  const sv = translationMap([row(checkoutKey("Back"), "Tillbaka", "Back"), row(checkoutKey("Remove"), "Ta bort", "Remove", { status: "draft" }), row(checkoutKey("Edit"), "Redigera", "Edit (old)")])
  const svWords = checkoutWordsIn("sv", sv)
  check("no curated words: an approved machine translation shows", svWords["Back"] === "Tillbaka")
  check("a draft never shows, nor a machine translation of an older English", !("Remove" in svWords) && !("Edit" in svWords))
  check("an English store's own words apply too", checkoutWordsIn("en", null, { "Pay {amount}": "Buy now for {amount}" })["Pay {amount}"] === "Buy now for {amount}")
  check("the editor's default is everything but the store's own words", defaultFor("Pay {shop}", "ro", ai, checkoutKey) === "Plătește {shop}" && defaultFor("Back", "sv", sv, checkoutKey) === "Tillbaka" && defaultFor("Pay {shop}", "sv", null, checkoutKey) === "Pay {shop}")
  check("emails: curated Romanian, and the store's words where an email says the same sentence", emailWordsIn("ro", null)["Order {number} confirmed"] === "Comanda {number} a fost confirmată" && emailWordsIn("ro", null, { "Thank you!": "Mersi mult!" })["Thank you!"] === (mail.includes("Thank you!") ? "Mersi mult!" : undefined))
  check("emails take the merchant's translation over curated", emailWordsIn("ro", translationMap([row(emailKey("Track"), "Urmărire", "Track", { source: "manual" })]))["Track"] === "Urmărire")
  const layered = layeredWords({ sentences: ["Pay {shop}"], language: "ro", rows: null, keyOf: checkoutKey, overrides: { "Pay {shop}": "Pay {shop}" } })
  check("words equal to the English are not stored (nothing to lay over)", !("Pay {shop}" in layered))

  console.log("\nWhat a store may reword, and what it may not")
  check("every editable text is a sentence the checkout says", EDITABLE_TEXTS.every((e) => all.includes(e.source)), EDITABLE_TEXTS.filter((e) => !all.includes(e.source)).map((e) => e.source))
  check("ids are unique and stable in shape", new Set(EDITABLE_TEXTS.map((e) => e.id)).size === EDITABLE_TEXTS.length && EDITABLE_TEXTS.every((e) => /^[a-z_]+\.[a-z_]+$/.test(e.id)))
  check("sentences are unique too", new Set(EDITABLE_TEXTS.map((e) => e.source)).size === EDITABLE_TEXTS.length)
  check("every group is used: Header, Contact, Delivery, Payment, Buttons, Order summary, Messages", ["header", "contact", "delivery", "payment", "buttons", "summary", "messages"].every((g) => EDITABLE_TEXTS.some((e) => e.group === g)))
  check("protected texts are never editable", PROTECTED_TEXTS.every((p) => !editableBySource(p.source) && isProtected(p.source)))
  for (const s of ["I agree to the [Terms and Conditions] and the [Refund policy]", "Email me with news and offers", "Includes {amount} tax", "Prices in {display} are for reference. You'll pay in {charge}; your bank converts it.", "The payment did not go through. Nothing was charged.", "Refunds: {policy}.", "Cash on delivery adds a fee of {amount}.", "Powered by", "No refunds", "30-day money back guarantee"]) check(`  locked: ${s.slice(0, 50)}`, isProtected(s))
  check("anything not listed is locked by default", isProtected("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears."))
  const pay = editableById("buttons.pay_amount")!
  const ok = validateOverride(pay, "  Cumpără   acum {amount} ")
  check("a good override is kept, spaces tidied", ok.ok && ok.text === "Cumpără acum {amount}", ok)
  check("dropping {amount} is refused, saying which", (() => { const v = validateOverride(pay, "Cumpără acum"); return !v.ok && /\{amount\}/.test((v as { error: string }).error) })())
  check("adding a placeholder the text doesn't have is refused", !validateOverride(pay, "Pay {amount} to {shop}").ok)
  check("HTML is refused", !validateOverride(pay, "<b>Pay</b> {amount}").ok)
  check("a link is refused", !validateOverride(pay, "Pay {amount} at https://evil.example").ok && !validateOverride(pay, "Pay {amount} www.x.ro").ok)
  check("a typed amount is refused (checkout fills them in)", !validateOverride(pay, "Pay $0.00 now {amount}").ok && !validateOverride(pay, "Pay 10 lei {amount}").ok && !validateOverride(pay, "Pay {amount} 9,99").ok)
  check("too long is refused", !validateOverride(pay, `Pay {amount} ${"x".repeat(40)}`).ok)
  check("two lines are refused", !validateOverride(pay, "Pay\n{amount}").ok)
  check("stray braces are refused", !validateOverride(pay, "Pay { amount }").ok && !validateOverride(pay, "Pay {amount}}").ok)
  check("empty means back to the default", (() => { const v = validateOverride(pay, "   "); return v.ok && v.text === null })())
  check("not text is refused", !validateOverride(pay, 42).ok)

  console.log("\nThe order summary adds up to the server's total")
  /* Andrew's checkout, read from the live page: one Black Sleeve at 4.77 lei (the store's price is in lei), Standard shipping 57.28 lei, total 62.05 lei. */
  const live = { totals: { itemsSubtotalCents: 477, discountCents: 0, shippingCents: 5728, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 6205, codFeeCents: 0 }, offers: [], coupon: null }
  const liveRows = summaryRows(live)
  check("the live case: 4.77 + shipping 57.28 = 62.05 lei, the shipping row carries the difference", liveRows.shipping === 5728 && rowsSum(liveRows) === 6205, liveRows)
  const withOffer = { totals: { itemsSubtotalCents: 10000, discountCents: 1500, shippingCents: 500, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: 9000 }, offers: [{ title: "Bundle", savedCents: 1000 }], coupon: { code: "SAVE5" } }
  const r1 = summaryRows(withOffer)
  check("an offer and a code: the code's row is only its part (5.00, not 15.00 again)", r1.discount === 500 && r1.offers[0]?.cents === 1000 && rowsSum(r1) === 9000, r1)
  const r2 = summaryRows({ ...withOffer, totals: { ...withOffer.totals, discountCents: 1000, totalCents: 9500 }, coupon: null })
  check("an offer alone: no Discount row at all, the offer row is the discount", r2.discount === 0 && r2.offers[0]?.cents === 1000 && rowsSum(r2) === 9500, r2)
  const r3 = summaryRows({ totals: { itemsSubtotalCents: 10000, discountCents: 999, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: 9001 }, offers: [{ title: "Bundle", savedCents: 1000 }], coupon: null })
  check("an offer a cent over after conversion: the rows still add up exactly", rowsSum(r3) === 9001 && r3.offers[0]?.cents === 999, r3)
  const r4 = summaryRows({ totals: { itemsSubtotalCents: 4000, discountCents: 0, shippingCents: 700, shippingDiscountCents: 700, taxCents: 798, taxIncluded: false, totalCents: 4798, codFeeCents: 0 }, offers: [], coupon: { code: "FREESHIP" } })
  check("free shipping and tax added on top add up", r4.shipping === 0 && r4.taxAdded === 798 && rowsSum(r4) === 4798, r4)
  const r5 = summaryRows({ totals: { itemsSubtotalCents: 4000, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 750, taxIncluded: true, totalCents: 4800, codFeeCents: 300 }, offers: [], coupon: null })
  check("tax included is not added again; a cash fee is", r5.taxAdded === 0 && r5.codFee === 300 && rowsSum(r5) === 4800, r5)
  /* A market's currency: the store prices in USD, the visitor pays lei. Converted by the same code the page and the payment use. */
  const fx = { asOf: new Date().toISOString().slice(0, 10), rates: { USD: 1.08, RON: 4.97 } }
  const pricing = pricingFor({ id: "ro", name: "Romania", currency: "RON", rounding: "none", adjustBps: 0 }, "USD", fx)!
  const lines = [{ unitCents: 3500, quantity: 1, discountCents: 350 }, { unitCents: 1299, quantity: 2, discountCents: 0 }]
  const base = { itemsSubtotalCents: 6098, discountCents: 350, shippingCents: 1250, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 6998 }
  const conv = convertOrder(lines, base, marketCharge(pricing))
  check("converted once: a $35 line is about 161 lei, never 4.77", conv.lines[0].unitCents > 15000 && conv.lines[0].unitCents < 17000, conv.lines[0])
  const cRows = summaryRows({ totals: conv.totals, offers: [], coupon: { code: "TEN" } })
  check("converted lines, shipping and discount still add up to the converted total", rowsSum(cRows) === conv.totals.totalCents && conv.totals.itemsSubtotalCents === conv.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0), { cRows, totals: conv.totals })
  const site = read("app/checkout/site/site-checkout.tsx")
  check("the website checkout draws its offer and discount rows from summaryRows", /summaryRows\(quote\)/.test(site) && /rows\?\.offers \?\? \[\]\)\.map/.test(site) && /const discountCents = rows\?\.discount \?\? 0/.test(site))
  check("its shipping row is drawn whenever the order ships", /data-shipping-line=""/.test(site) && /const ships = !!quote\?\.requiresShipping/.test(site))
  check("the physical checkout too", /summaryRows\(quote\)\.offers\.map/.test(read("app/checkout/physical/physical-checkout.tsx")))
  check("the server stays the source of the amounts: the total shown is the quote's", /const total = t\?\.totalCents \?\? 0/.test(site))

  console.log("\nMachine translation only with context, only as a last resort")
  const ai2 = read("lib/markets/translate-ai.ts")
  check("the checkout's words go to translators as their own group, with context", /groups\.push\(\{ items: checkoutWords, from: "en", ui: true \}\)/.test(ai2) && /uiInstructions/.test(ai2))
  check("a curated sentence is written as it is, with no call and no reuse of an older machine answer", /const mine = isCheckoutWordKey\(it\.key\) \? curated\[it\.source\] : undefined/.test(ai2))
  check("no context aware translator: nothing drafted and not a failure", /if \(opts\.ui && !process\.env\.OPENAI_API_KEY\) return \{ drafts, unavailable: false \}/.test(ai2))
  const open = read("lib/markets/open-translate.ts")
  check("only whole sentence translators read checkout words (Gemini, DeepL, your own model)", /const UI_PROVIDERS: ReadonlySet<OpenProvider> = new Set\(\["gemini", "deepl", "llm"\]\)/.test(open))
  check("a checkout word is never cut into bare words", /if \(ui\) return got/.test(open))
  check("the memory is read only for what those translators wrote", /recall\(from, to, unique, ui \? \[\.\.\.UI_PROVIDERS\] : null\)/.test(open) && /query\.in\("provider", onlyFrom\)/.test(open))
  check("DeepL is told it's a checkout", /context: "Buttons, headings and labels of an online store's checkout page/.test(open))
  /* Run for real: with only the free memory and LibreTranslate set up, a checkout word asks nobody. */
  const env = { ...process.env }
  delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_AI_API_KEY; delete process.env.DEEPL_API_KEY; delete process.env.TRANSLATE_LLM_URL; delete process.env.OPENAI_API_KEY; delete process.env.HF_TOKEN
  process.env.LIBRETRANSLATE_URL = "http://127.0.0.1:9"
  process.env.TRANSLATE_FREE_FALLBACK = "on"
  const { canTranslateOpen, uiPromptFor } = await import("@/lib/markets/open-translate")
  check("MyMemory and LibreTranslate never get checkout words", canTranslateOpen() && !canTranslateOpen({ ui: true }))
  process.env.GEMINI_API_KEY = "test"
  check("Gemini does", canTranslateOpen({ ui: true }))
  const prompt = uiPromptFor(["Pay {shop}", "Subtotal"], { notes: new Map([["Pay {shop}", "A verb: pay this store."]]) })
  check("the prompt says Pay is the verb, and carries each string's note by place", /never a salary or a wage/.test(prompt) && /0: A verb: pay this store\./.test(prompt) && !/1:/.test(prompt))
  delete process.env.GEMINI_API_KEY
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  delete process.env.LIBRETRANSLATE_URL
  const { draftReusing } = await import("@/lib/markets/translate-ai")
  const items = [{ key: checkoutKey("Pay {shop}"), source: "Pay {shop}" }, { key: checkoutKey("Remove"), source: "Remove" }]
  const roDraft = await draftReusing(items, [row(checkoutKey("Back"), "Salariul", "Pay {shop}")], "en", "ro", "AndrewRullz")
  check("Romanian: curated words drafted with no translator at all, an older machine answer never reused", roDraft.drafts.get(checkoutKey("Pay {shop}")) === "Plătește {shop}" && roDraft.drafts.get(checkoutKey("Remove")) === "Elimină" && !roDraft.unavailable, [...roDraft.drafts])
  const svDraft = await draftReusing(items, [], "en", "sv", "AndrewRullz")
  check("Swedish with no context aware translator: nothing guessed, not reported as a failure", svDraft.drafts.size === 0 && !svDraft.unavailable, svDraft)
  Object.assign(process.env, env)

  console.log("\nThe store's checkout text is kept server side and applied on the server")
  const sql = read("supabase/sql/run-now/212_checkout_text_overrides.sql")
  check("part 212: one server only table, RLS on, no client grants", /CREATE TABLE IF NOT EXISTS public\.checkout_text_overrides/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.checkout_text_overrides FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.checkout_text_overrides TO service_role/.test(sql))
  check("stored by a stable id with the default it replaced, no markup possible", /text_id text NOT NULL/.test(sql) && /default_text text NOT NULL DEFAULT ''/.test(sql) && /value !~ '\[<>\]'/.test(sql))
  check("one statement per line, safe to run again", sql.split("\n").filter(Boolean).every((l) => l.startsWith("/*") || /;\s*$/.test(l)) && /IF NOT EXISTS/.test(sql))
  check("the migration copy is the same", existsSync("supabase/migrations/20270129_checkout_text_overrides.sql") && read("supabase/migrations/20270129_checkout_text_overrides.sql") === sql)
  check("the check after and the README know it", /as p212_checkout_text_overrides/.test(read("supabase/sql/run-now/99_check_after.sql")) && /`212_checkout_text_overrides\.sql`/.test(read("supabase/sql/run-now/README.md")) && /"212_checkout_text_overrides\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))
  const route = read("app/api/store/checkout-text/route.ts")
  check("the API is the store's (shopCaller) and checks every change before writing any", /const c = await shopCaller\(\)/.test(route) && /validateOverride\(entry, raw\.text\)/.test(route) && /That text can't be changed\./.test(route))
  check("only the store's own languages", /That language isn't on your website\./.test(route))
  check("the checkout and its pages read the store's words on the server", /checkoutOverrides\(creatorId, lang\)/.test(read("lib/markets/checkout-language.ts")) && /checkoutWordsIn\(asked, map, overrides\)/.test(read("lib/markets/checkout-language.ts")))
  check("and a buyer's emails", /emailWordsIn\(other, translationMap/.test(read("lib/emails/words-server.ts")))
  check("a stored override is checked again on the way out", /const checked = validateOverride\(entry, r\.value\)/.test(read("lib/checkout-text/server.ts")))
  const panel = read("components/app/settings/checkout-panel.tsx")
  const editor = read("components/app/settings/checkout-text-editor.tsx")
  check("Settings › Checkout has Checkout text", /<CheckoutTextCard \/>/.test(panel) && /Edit checkout text/.test(panel))
  check("the editor: language selector, defaults, fields, live preview, locked list, default changed", /data-checkout-text-language/.test(editor) && /placeholder=\{item\.default\}/.test(editor) && /<CheckoutPreview/.test(editor) && /data-text-locked/.test(editor) && /Default changed since you edited\./.test(editor))
  check("preview beside on a computer, under it on a phone", /lg:grid-cols-\[minmax\(0,1fr\)_440px\]/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

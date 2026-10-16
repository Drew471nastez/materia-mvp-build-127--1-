/**
 * The shop's and the checkout's words, written by hand (lib/markets/curated-words.ts),
 * a note on what each is for the languages a translator still does
 * (lib/markets/word-notes.ts), and the store's own wording in Settings ›
 * Checkout › Checkout text (lib/markets/checkout-text.ts).
 *
 * The owner: the Romanian checkout said "Salariul AndrewRullz" above the
 * total. "Pay {shop}" is a verb, pay this seller; a translator handed the
 * bare string made it the noun for a wage.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CURATED, CURATED_LANGUAGES, curatedLanguage, curatedRows, curatedValue, withCurated } from "@/lib/markets/curated-words"
import { checkoutKey, checkoutSentences, checkoutT, checkoutWordsFrom } from "@/lib/markets/checkout-words"
import { UI_WORDS, uiKey, type UiWord } from "@/lib/markets/ui-words"
import { keepsFixedParts } from "@/lib/markets/draft-check"
import { aiMayWrite, sourceHash, statusOf, translationMap, valueFor, type TranslationRow } from "@/lib/markets/translate"
import { SITE_LANGUAGE_CODES } from "@/lib/markets/locales"
import { builtInNote, NOTED_CHECKOUT_SENTENCES } from "@/lib/markets/word-notes"
import { CHECKOUT_TEXT_WORDS, checkoutTextWord, checkWording } from "@/lib/markets/checkout-text"
import { fakeDb } from "./_fake-db"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 1200)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "ai", ...extra })

async function main() {
  console.log("\nEvery built-in word, in every hand written language")
  const sentences = checkoutSentences()
  const uiNames = Object.keys(UI_WORDS) as UiWord[]
  check("the common languages have their own words: ro, es, fr, de, it, pt, pt-BR, pl, nl", ["ro", "es", "fr", "de", "it", "pt", "pt-BR", "pl", "nl"].every((l) => CURATED_LANGUAGES.includes(l)), CURATED_LANGUAGES)
  check("  each one a language the settings offer", CURATED_LANGUAGES.every((l) => (SITE_LANGUAGE_CODES as readonly string[]).includes(l)))
  for (const code of CURATED_LANGUAGES) {
    const w = CURATED[code]
    const missing = sentences.filter((s) => !w.checkout[s]?.trim())
    const stale = Object.keys(w.checkout).filter((s) => !sentences.includes(s))
    const uiMissing = uiNames.filter((n) => !w.ui[n]?.trim())
    const broken = Object.entries(w.checkout).filter(([s, t]) => !keepsFixedParts(s, t)).map(([s]) => s)
    const plurals = Object.entries(w.checkout).filter(([s, t]) => /, plural,/.test(s) && !/\{count, plural, one \{[^}]+\}[\s\S]*other \{[^}]+\}\}/.test(t)).map(([s]) => s)
    check(`${code}: all ${sentences.length} checkout sentences`, missing.length === 0, missing.slice(0, 10))
    check(`${code}:   none for a sentence the checkout no longer says (update the file when an English sentence changes)`, stale.length === 0, stale.slice(0, 10))
    check(`${code}: all ${uiNames.length} shop words`, uiMissing.length === 0, uiMissing)
    check(`${code}:   every {placeholder} and [link] kept`, broken.length === 0, broken)
    check(`${code}:   plurals keep their one and other forms`, plurals.length === 0, plurals)
    check(`${code}:   a row for every key, written for the English as it is now`, curatedRows(code).length === sentences.length + uiNames.length && curatedRows(code).every((r) => r.curated && r.status === "approved" && statusOf(r, r.key.startsWith("ui:") ? UI_WORDS[r.key.slice(3) as UiWord] : sentences.find((s) => checkoutKey(s) === r.key)!) === "done"))
  }

  console.log("\nRomanian, as a Romanian shop writes it")
  const ro = CURATED.ro
  check('"Pay {shop}" is a verb: "Plătește către {shop}"', ro.checkout["Pay {shop}"] === "Plătește către {shop}", ro.checkout["Pay {shop}"])
  check("  never the noun for a wage", !/salari/i.test(ro.checkout["Pay {shop}"]))
  check('the pay button: "Plătește {amount}"', ro.checkout["Pay {amount}"] === "Plătește {amount}")
  const ct = checkoutT("ro", checkoutWordsFrom(translationMap(curatedRows("ro"))))
  check("  drawn with the shop's name and the amount", ct("Pay {shop}", { shop: "AndrewRullz" }) === "Plătește către AndrewRullz" && ct("Pay {amount}", { amount: "62,05 lei" }) === "Plătește 62,05 lei", [ct("Pay {shop}", { shop: "AndrewRullz" }), ct("Pay {amount}", { amount: "62,05 lei" })])
  check('Remove is "Elimină", never "Îndepărtare"', ro.checkout.Remove === "Elimină" && ro.ui.remove === "Elimină" && !Object.values(ro.checkout).some((v) => /Îndepărtare/.test(v)))
  check('Edit is an imperative, "Modifică"', ro.checkout.Edit === "Modifică")
  check('Contact information: "Date de contact"', ro.checkout["Contact information"] === "Date de contact")
  check("buttons are imperatives: Aplică, Plasează comanda, Adaugă în coș, Continuă cumpărăturile", ro.checkout.Apply === "Aplică" && ro.checkout["Place order"] === "Plasează comanda" && ro.ui.add_to_cart === "Adaugă în coș" && ro.checkout["Continue shopping"] === "Continuă cumpărăturile")
  const roText = [...Object.values(ro.checkout), ...Object.values(ro.ui)].join(" ")
  check("ș and ț with the comma below, never the cedilla ş ţ", !/[şţŞŢ]/.test(roText) && /ș/.test(roText) && /ț/.test(roText))
  check("  ă, î and â all there", /ă/.test(roText) && /î/.test(roText) && /â/.test(roText))
  check("  business days in Romanian plural forms (1 zi, 3 zile, 20 de zile)", ct("{count, plural, one {# business day} other {# business days}}", { count: 1 }) === "1 zi lucrătoare" && ct("{count, plural, one {# business day} other {# business days}}", { count: 3 }) === "3 zile lucrătoare" && ct("{count, plural, one {# business day} other {# business days}}", { count: 20 }) === "20 de zile lucrătoare")

  console.log("\nThe same word in the other languages")
  const wage = /salari|salaire|gehalt|lohn|stipendio|wynagrodzenie|salaris|loon\b/i
  check('no language makes "Pay {shop}" a wage', CURATED_LANGUAGES.every((l) => !wage.test(CURATED[l].checkout["Pay {shop}"])), CURATED_LANGUAGES.map((l) => CURATED[l].checkout["Pay {shop}"]))
  const pay: Record<string, RegExp> = { es: /^Pagar a /, fr: /^Payer /, de: / zahlen$/, it: /^Paga /, pt: /^Pagar a /, "pt-BR": /^Pagar para /, pl: /^Płatność dla /, nl: /^Betalen aan / }
  check("  each says pay the seller in its own way", Object.entries(pay).every(([l, re]) => re.test(CURATED[l].checkout["Pay {shop}"])))
  check("Polish keeps its four plural forms", ["one {# dzień roboczy}", "few {# dni robocze}", "many {# dni roboczych}"].every((f) => CURATED.pl.checkout["{count, plural, one {# business day} other {# business days}}"].includes(f)))
  check("French puts a no-break space before ? and !", / \?$/.test(CURATED.fr.checkout["Questions?"]) && / !$/.test(CURATED.fr.checkout["Thank you!"]))
  check("European and Brazilian Portuguese are kept apart (encomenda, pedido)", /encomenda/.test(CURATED.pt.checkout["Place order"]) && /pedido/.test(CURATED["pt-BR"].checkout["Place order"]))

  console.log("\nWhich file a language reads")
  check("its own, or its base language's", curatedLanguage("ro") === "ro" && curatedLanguage("fr-CA") === "fr" && curatedLanguage("es-MX") === "es" && curatedLanguage("de-AT") === "de")
  check("  Brazilian and European Portuguese never stand in for each other", curatedLanguage("pt-BR") === "pt-BR" && curatedLanguage("pt-br") === "pt-BR" && curatedLanguage("pt-PT") === "pt" && curatedLanguage("pt") === "pt")
  check("  none for English or a language without a file", curatedLanguage("en") === null && curatedLanguage("cs") === null && curatedRows("ja").length === 0 && curatedValue("cs", uiKey("cart")) === null)

  console.log("\nExisting stores get the corrected words")
  const payShop = checkoutKey("Pay {shop}")
  const saved: TranslationRow[] = [
    /* Machine translated per store before: replaced. */
    row(payShop, "Salariul {shop}", "Pay {shop}"),
    row(uiKey("remove"), "Îndepărtare", "Remove"),
    /* The merchant's own: kept, even written for an older English. */
    row(checkoutKey("Place order"), "Trimite comanda", "Place order (old)", { source: "manual" }),
    row(uiKey("cart"), "Coșulețul meu", "Cart", { source: "manual" }),
    /* A store's own text: untouched. */
    row("product:a0000000-0000-4000-8000-0000000000a1:title", "Cană", "Mug"),
  ]
  const laid = withCurated(saved, "ro")
  const map = translationMap(laid)
  const live = { approvedOnly: true, fresh: true }
  check('the machine "Salariul {shop}" is replaced by the hand written word', valueFor(map, payShop, live, "Pay {shop}") === "Plătește către {shop}" && !laid.some((r) => /Salariul/.test(r.value)))
  check('  and "Îndepărtare" by "Elimină"', valueFor(map, uiKey("remove"), live) === "Elimină")
  check("the merchant's own wording is never replaced", valueFor(map, checkoutKey("Place order"), live, "Place order") === "Trimite comanda" && valueFor(map, uiKey("cart"), live) === "Coșulețul meu")
  check("  a store's own text is untouched", map.get("product:a0000000-0000-4000-8000-0000000000a1:title")?.value === "Cană")
  check("  one row per key", new Set(laid.map((r) => r.key)).size === laid.length)
  check("a language without a file reads its rows as they are", withCurated(saved, "cs") === saved)
  check("the checkout shows them", checkoutWordsFrom(map)["Pay {shop}"] === "Plătește către {shop}" && checkoutWordsFrom(map)["Place order"] === "Trimite comanda")

  console.log("\nBuilt-in words are never machine translated where a hand written one exists")
  check("a hand written word reads as done, so no run sends it", laid.filter((r) => r.curated).every((r) => !aiMayWrite(r, r.key.startsWith("ui:") ? UI_WORDS[r.key.slice(3) as UiWord] : sentences.find((s) => checkoutKey(s) === r.key)!)))
  check("  nor the merchant's own", !aiMayWrite(map.get(checkoutKey("Place order")), "Place order"))
  const server = read("lib/markets/server.ts")
  check("every read of a language lays them in: translationsOf", /export async function translationsOf[\s\S]{0,400}withCurated\(saved\.rows, locale\)/.test(server))
  check("  and the live site's cached read, after the cache, so a deploy shows a corrected word at once", /savedTranslations\(createAdminClient\(\), creatorId, locale\)\)\.rows[\s\S]{0,200}\.then\(\(rows\) => withCurated\(rows, locale\)\)/.test(server))
  check("the press and the automatic run read through translationsOf", /translationsOf\(db, creatorId, locale\)/.test(read("lib/markets/translation-press.ts")) && /translationsOf\(db, creatorId, locale\)/.test(read("lib/markets/auto-translate.ts")))
  check("a translator out of reach is told apart from words reused at no cost", /if \(unavailable && drafts\.size <= reused\) unreachable = true/.test(read("lib/markets/auto-translate.ts")))

  console.log("\nA note on what each built-in word is, for the languages a translator does")
  const note = builtInNote(payShop, "Pay {shop}") ?? ""
  check('"Pay {shop}" goes as a verb, pay the seller, never a noun', /verb/.test(note) && /pay the seller/.test(note) && /Never a noun/.test(note), note)
  check("  the pay button with its amount", /button, a verb/.test(builtInNote(checkoutKey("Pay {amount}"), "Pay {amount}") ?? ""))
  check("  a shop word by its name", /Button, verb: take this item out of the cart/.test(builtInNote(uiKey("remove"), "Remove") ?? ""))
  check("  every built-in word has one, the store's own text none", sentences.every((s) => !!builtInNote(checkoutKey(s), s)) && uiNames.every((n) => !!builtInNote(uiKey(n), UI_WORDS[n])) && builtInNote("product:a0000000-0000-4000-8000-0000000000a1:title", "Mug") === undefined)
  check("  every sentence with its own note is one the checkout says", NOTED_CHECKOUT_SENTENCES.every((s) => sentences.includes(s)), NOTED_CHECKOUT_SENTENCES.filter((s) => !sentences.includes(s)))
  check("the drafts carry it: built-in words go with their note", /builtInNote\(i\.key, i\.source\)/.test(read("lib/markets/translate-ai.ts")) && /\.\.\.\(i\.note \? \{ note: i\.note \} : \{\}\)/.test(read("lib/markets/translate-ai.ts")))

  /* The open translators, against a model and DeepL that say what they were sent. */
  const seen: { path: string; body: Record<string, unknown> }[] = []
  const answer = (req: IncomingMessage, res: ServerResponse) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      seen.push({ path: req.url ?? "", body })
      res.setHeader("content-type", "application/json")
      if (req.url === "/llm/chat/completions") {
        const msgs = body.messages as { content: string }[]
        const list = JSON.parse(msgs[1].content) as (string | { text: string; note: string })[]
        const out = list.map((x) => (typeof x === "string" ? `CS ${x}` : `CS ${x.text}`))
        return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }))
      }
      if (req.url === "/deepl/v2/translate") return res.end(JSON.stringify({ translations: (body.text as string[]).map((t) => ({ text: `DE ${t}` })) }))
      res.statusCode = 404
      res.end("{}")
    })
  }
  const http = createServer(answer)
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  for (const k of ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "DEEPL_API_KEY", "LIBRETRANSLATE_URL", "HF_TOKEN", "HUGGINGFACE_API_KEY", "OPENAI_API_KEY"]) delete process.env[k]
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.TRANSLATE_LLM_URL = `${base}/llm`
  process.env.TRANSLATE_LLM_MODEL = "open-model"
  try {
    const { translateOpen } = await import("@/lib/markets/open-translate")
    const { draftReusing } = await import("@/lib/markets/translate-ai")
    const got = await draftReusing([{ key: payShop, source: "Pay {shop}" }, { key: "product:a0000000-0000-4000-8000-0000000000a1:title", source: "Mug" }], [], "en", "cs", "Green Garden", { deadlineAt: Date.now() + 60_000 })
    const sent = seen.find((s) => s.path === "/llm/chat/completions")
    const messages = (sent?.body.messages ?? []) as { content: string }[]
    const items = messages[1] ? (JSON.parse(messages[1].content) as unknown[]) : []
    check("a chat model gets the built-in word with its note", items.some((x) => typeof x === "object" && (x as { text: string }).text === "Pay {shop}" && /verb/.test((x as { note: string }).note)), items)
    check("  and the store's own text as it always went, with no note", items.includes("Mug"), items)
    check("  told what a note is and never to translate it", /never the note/.test(messages[0]?.content ?? ""))
    check("  the answer is the translation alone", got.drafts.get(payShop) === "CS Pay {shop}", [...got.drafts])
    seen.length = 0
    const plain = await translateOpen(["Hello"], "en", "cs")
    check("without notes a batch goes exactly as before: a list of strings", plain.out.get(0) === "CS Hello" && JSON.parse((seen[0]?.body.messages as { content: string }[])[1].content)[0] === "Hello")

    delete process.env.TRANSLATE_LLM_URL
    process.env.DEEPL_API_KEY = "test:fx"
    process.env.DEEPL_URL = `${base}/deepl`
    seen.length = 0
    const deepl = await translateOpen(["Pay {shop}", "Remove", "Mug"], "en", "cs", { notes: ["Note A", "Note B", undefined] })
    const calls = seen.filter((s) => s.path === "/deepl/v2/translate")
    check("DeepL gets each note as its context, one call per note", calls.length === 3 && calls.some((c) => c.body.context === "Note A" && (c.body.text as string[]).length === 1) && calls.some((c) => c.body.context === "Note B") && calls.some((c) => c.body.context === undefined), calls.map((c) => c.body))
    check("  and every text comes back in its place", deepl.out.size === 3 && /DE/.test(deepl.out.get(0) ?? "") && /Remove/.test(deepl.out.get(1) ?? "") && /Mug/.test(deepl.out.get(2) ?? ""), [...deepl.out])
    check("the same words with another note are another text, remembered apart", /export const unitOf = \(text: string, note\?: string\) => \(note \? `\$\{text\}\$\{NOTE_MARK\}\$\{note\}` : text\)/.test(read("lib/markets/open-translate.ts")))
  } finally {
    http.close()
    delete process.env.DEEPL_API_KEY
    delete process.env.DEEPL_URL
    delete process.env.TRANSLATE_LLM_MODEL
  }

  console.log("\nCheckout text: the store's own wording")
  const roSentences = new Set(sentences)
  check("every word listed is one the cart or checkout says", CHECKOUT_TEXT_WORDS.every((w) => (w.key.startsWith("ui:") ? UI_WORDS[w.key.slice(3) as UiWord] === w.source : roSentences.has(w.source) && w.key === checkoutKey(w.source))), CHECKOUT_TEXT_WORDS.filter((w) => !(w.key.startsWith("ui:") ? UI_WORDS[w.key.slice(3) as UiWord] === w.source : roSentences.has(w.source))))
  check("  grouped as Buttons, Headings, Helper text and Messages", ["buttons", "headings", "helper", "messages"].every((g) => CHECKOUT_TEXT_WORDS.some((w) => w.group === g)))
  check("  the pay button and the heading above the total among them", !!checkoutTextWord(checkoutKey("Pay {amount}")) && !!checkoutTextWord(payShop))
  const fixed = ["I agree to the [Terms and Conditions] and the [Refund policy]", "Secure checkout", "Total", "Total due", "Subtotal", "Tax", "Includes {amount} tax", "Email me with news and offers", "The payment did not go through. Nothing was charged.", "Only {count} left", "Sold out", "Prices in {display} are for reference. You'll pay in {charge}; your bank converts it.", "Powered by", "{amount} off"]
  check("never the terms, an amount, a tax line, the consent box, a payment, security or stock note", fixed.every((s) => !checkoutTextWord(checkoutKey(s))) && !checkoutTextWord(uiKey("taxes_at_checkout")) && !checkoutTextWord(uiKey("total")))
  const payWord = checkoutTextWord(checkoutKey("Pay {amount}"))!
  check("a wording keeps its {placeholder}, so the amount still shows", checkWording(payWord, "Cumpără · {amount}").ok && !checkWording(payWord, "Cumpără acum").ok && !checkWording(payWord, "Cumpără {price}").ok)
  check("  plain text only, and short", !checkWording(payWord, "<b>Pay</b> {amount}").ok && !checkWording(payWord, `${"x".repeat(130)} {amount}`).ok && !checkWording(checkoutTextWord(checkoutKey("Place order"))!, "Order {now}").ok)
  check("  spaces tidied; empty means back to Storelib's", (checkWording(payWord, "  Cumpără   {amount} ") as { value: string }).value === "Cumpără {amount}" && (checkWording(payWord, "   ") as { value: string }).value === "")

  /* The route's writes, through the same saveTranslations, against a database that keeps them. */
  const { saveTranslations, translationsOf } = await import("@/lib/markets/server")
  const tables = { site_translations: [] as Record<string, unknown>[] }
  const db = fakeDb(tables, { unique: { site_translations: [["creator_id", "locale", "key"]] } })
  const own = await saveTranslations(db as never, "c1", "ro", [{ key: payWord.key, value: "Cumpără · {amount}", source: payWord.source, approved: true }], "u1")
  const stored = tables.site_translations.find((r) => r.key === payWord.key)
  check("the editor saves the store's wording as its own translation: manual, approved", own.ok && stored?.source === "manual" && stored?.status === "approved" && stored?.value === "Cumpără · {amount}", stored)
  const ai = await saveTranslations(db as never, "c1", "ro", [{ key: payWord.key, value: "Plătește {amount}", source: payWord.source, approved: true, ai: true }], null, { keepManual: true })
  check("  an automatic write never replaces it", ai.ok && tables.site_translations.filter((r) => r.key === payWord.key).length === 1 && tables.site_translations.find((r) => r.key === payWord.key)?.value === "Cumpără · {amount}")
  const read1 = await translationsOf(db as never, "c1", "ro")
  const m1 = translationMap(read1.rows)
  check("  nor does the hand written word", valueFor(m1, payWord.key, live, payWord.source) === "Cumpără · {amount}" && checkoutT("ro", checkoutWordsFrom(m1))("Pay {amount}", { amount: "62,05 lei" }) === "Cumpără · 62,05 lei")
  check("  and the run sees it as the merchant's", !aiMayWrite(m1.get(payWord.key), payWord.source))
  check("  while every other word reads the hand written one", valueFor(m1, payShop, live, "Pay {shop}") === "Plătește către {shop}")
  await saveTranslations(db as never, "c1", "ro", [{ key: payWord.key, value: "", source: payWord.source, approved: true }], "u1")
  check("Reset takes it away, and the hand written word shows again", !tables.site_translations.some((r) => r.key === payWord.key) && valueFor(translationMap((await translationsOf(db as never, "c1", "ro")).rows), payWord.key, live, payWord.source) === "Plătește {amount}")
  const en = await saveTranslations(db as never, "c1", "en", [{ key: payShop, value: "Checkout with {shop}", source: "Pay {shop}", approved: true }], "u1")
  check("an English store keeps its wording too, in en", en.ok && tables.site_translations.some((r) => r.locale === "en" && r.key === payShop && r.source === "manual"))

  const route = read("app/api/store/checkout-text/route.ts")
  check("the route only takes the words Checkout text lists", /const word = checkoutTextWord\(raw\?\.key\)\s*\n\s*if \(!word\) return physicalJson\(\{ error: "That text can't be changed here\." \}, 400\)/.test(route))
  check("  checks each wording", /const checked = checkWording\(word, raw\.value\)/.test(route))
  check("  and saves it as the store's own: no ai flag", /writes\.push\(\{ key: word\.key, value: checked\.value, source: word\.source, approved: true \}\)/.test(route) && !/ai: true/.test(route))
  check("  in a language of the website, its default included", /languages: \[\.\.\.new Set\(editorLanguages\(loc\.value\)\)\]/.test(route) && /if \(!locale \|\| !languages\.includes\(locale\)\)/.test(route))
  check("an English checkout reads the store's own wording", /\(!english \|\| r\.source === "manual"\)/.test(read("lib/markets/checkout-language.ts")))
  const panel = read("components/app/settings/checkout-panel.tsx")
  const card = read("components/app/settings/checkout-text.tsx")
  check("in Settings › Checkout", /<CheckoutTextCard \/>/.test(panel))
  check("  with a language selector, the default beside each field, Reset and a preview", /data-checkout-text-language=""/.test(card) && /text-\[#4b5563\]">\{i\.fallback\}<\/p>/.test(card) && /data-reset-word=\{i\.key\}/.test(card) && /<Preview items=\{data\.items\}/.test(card))
  check("  the preview follows what is typed", /text=\{\(i\) => shown\(i\)\.trim\(\) \|\| i\.fallback\}/.test(card))
  check("  no AI sounding copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(card.replace(/transition[-\w[\]:,.()]*/g, "")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

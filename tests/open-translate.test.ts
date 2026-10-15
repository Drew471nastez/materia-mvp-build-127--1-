/**
 * Translating with free, open models (lib/markets/open-translate.ts):
 * only the words leave Storelib, everything else comes back exactly as it
 * was; LibreTranslate is asked first, with long texts detected by it and
 * short ones sent from the language they are known to be in; Hugging Face's
 * opus-mt model is used for a pair when it has one, else NLLB 200; a
 * language nobody offers is said plainly; nothing set up is said plainly;
 * and with an open model set up the paid chat model is never called.
 *
 * Against real HTTP servers standing in for LibreTranslate and Hugging Face.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join as joinPath } from "node:path"
import { cut, join, wordsOf } from "../lib/markets/translate-segments"
import { keepsFixedParts } from "../lib/markets/draft-check"
import { defaultLanguageScope, detectLanguage } from "../lib/markets/detect-language"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(joinPath(process.cwd(), p), "utf8")

type Seen = { path: string; body: Record<string, unknown> }
const seen: Seen[] = []
let openAiCalls = 0

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok) => {
    let raw = ""
    req.on("data", (c) => { raw += c })
    req.on("end", () => ok(raw ? JSON.parse(raw) : {}))
  })
}
const send = (res: ServerResponse, status: number, json: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(json))
}

async function answer(req: IncomingMessage, res: ServerResponse) {
  const path = req.url ?? ""
  if (req.method === "GET" && path === "/lt/languages") return send(res, 200, [{ code: "en", targets: ["fr", "es", "de", "pb"] }, { code: "es", targets: ["en", "fr"] }, { code: "fr", targets: ["en", "es"] }])
  const b = await body(req)
  seen.push({ path, body: b })
  if (path.startsWith("/v1/")) {
    openAiCalls++
    return send(res, 500, { error: { message: "should not be called" } })
  }
  if (path === "/lt/translate") {
    const q = b.q as string[]
    return send(res, 200, { translatedText: q.map((t) => `«${b.target}:${t}»`) })
  }
  if (path === "/hf/Helsinki-NLP/opus-mt-en-ro") return send(res, 404, { error: "Model Helsinki-NLP/opus-mt-en-ro does not exist" })
  if (path === "/hf/Helsinki-NLP/opus-mt-en-de") return send(res, 200, (b.inputs as string[]).map((t) => ({ translation_text: `DE ${t}` })))
  if (path === "/hf/facebook/nllb-200-distilled-600M") {
    const p = b.parameters as { tgt_lang: string }
    return send(res, 200, (b.inputs as string[]).map((t) => ({ translation_text: `${p.tgt_lang} ${t}` })))
  }
  if (path === "/gem/chat/completions") {
    const model = b.model as string
    if (model === "gemini-2.5-flash-lite" && process.env.GEMINI_OLD_ONLY) return send(res, 404, { error: { message: `models/${model} is not found` } })
    if (process.env.GEMINI_BUSY) return send(res, 429, { error: { message: "Resource has been exhausted (e.g. check quota)." } })
    const list = JSON.parse((b.messages as { content: string }[])[1].content) as string[]
    /* Drops the placeholder from a whole sentence: the check catches it and the words go again on their own. */
    return send(res, 200, { choices: [{ message: { content: JSON.stringify({ t: list.map((t) => (t.includes("{{") ? "GEM lost it" : `GEM(${model}) ${t}`)) }) } }] })
  }
  if (path === "/deepl/v2/translate") {
    const texts = b.text as string[]
    return send(res, 200, { translations: texts.map((t) => ({ text: `DL(${b.target_lang}) ${t}` })) })
  }
  if (path === "/hfr/chat/completions") {
    const model = b.model as string
    if (model !== "meta-llama/Llama-3.3-70B-Instruct") return send(res, 400, { error: { message: `Model ${model} is not supported by any provider you have enabled.` } })
    const list = JSON.parse((b.messages as { content: string }[])[1].content) as string[]
    return send(res, 200, { choices: [{ message: { content: "Here you go:\n```json\n" + JSON.stringify(list.map((t) => `CHAT ${t}`)) + "\n```" } }] })
  }
  return send(res, 404, { error: "not here" })
}

function answerGet(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "", "http://x")
  if (url.pathname !== "/mm") return false
  const q = url.searchParams.get("q") ?? ""
  seen.push({ path: "/mm", body: { q, langpair: url.searchParams.get("langpair") } })
  if (q === "Over quota") send(res, 200, { responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } })
  else send(res, 200, { responseStatus: 200, responseData: { translatedText: `MM ${q}` } })
  return true
}

async function main() {
  console.log("\nOnly the words are cut out")
  const html = `<p>Hello {{ customer.first_name }}, welcome to <strong>Green Garden</strong>.</p><p>Visit https://shop.example.com or write to hi@shop.example.com {name}</p>`
  const parts = cut(html, ["Green Garden"])
  const words = wordsOf(parts)
  check("tags, Liquid, links, addresses, slots and the shop's name are never sent", words.every((w) => !/[<>{}]|https?:|@|Green Garden/.test(w)), JSON.stringify(words))
  check("the words between them are", words.includes("Hello") && words.includes(", welcome to") && words.includes("Visit") && words.includes("or write to"), JSON.stringify(words))
  const back = join(parts, (w) => `X${w}X`)!
  check("put back together, it keeps every fixed part", keepsFixedParts(html, back), back)
  check("and the spaces around each run", back === "<p>XHelloX {{ customer.first_name }}X, welcome toX <strong>Green Garden</strong>.</p><p>XVisitX https://shop.example.com Xor write toX hi@shop.example.com {name}</p>", back)
  check("a run with no letters is not sent", wordsOf(cut("€ 12.00 — 50%")).length === 0)
  check("a run the translator dropped leaves the text untranslated, not half done", join(cut("Hello <b>world</b>"), (w) => (w === "Hello" ? "Bonjour" : "")) === null)

  const server = createServer((req, res) => void (req.method === "GET" && answerGet(req, res) ? null : answer(req, res)))
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.OPENAI_API_KEY = "test-key"
  process.env.OPENAI_BASE_URL = `${base}/v1`

  const mod = await import("../lib/markets/open-translate")
  const { draftTranslations } = await import("../lib/markets/translate-ai")

  console.log("\nNothing set up")
  delete process.env.LIBRETRANSLATE_URL
  delete process.env.HF_TOKEN
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.MYMEMORY_URL = `${base}/mm`
  let r = await mod.translateOpen(["Hello"], "en", "fr")
  check("with the free fallback turned off, said in the merchant's words", r.out.size === 0 && r.unavailable === mod.OPEN_NOT_SET_UP)

  console.log("\nThe free fallback, with nothing set up")
  delete process.env.TRANSLATE_FREE_FALLBACK
  seen.length = 0
  r = await mod.translateOpen(["Add to cart", "<b>Free</b> shipping"], "en", "fr")
  check("MyMemory translates before any key is set", r.out.get(0) === "MM Add to cart" && r.out.get(1) === "<b>MM Free</b> MM shipping" && seen.some((x) => x.body.langpair === "en|fr"), JSON.stringify([...r.out]))
  r = await mod.translateOpen(["Over quota"], "en", "fr")
  check("its daily allowance used up is said, naming it", r.out.size === 0 && /MyMemory is busy or out of allowance/.test(r.unavailable ?? ""), r.unavailable ?? "")
  process.env.TRANSLATE_FREE_FALLBACK = "off"

  console.log("\nLibreTranslate")
  process.env.LIBRETRANSLATE_URL = `${base}/lt/`
  const long = "Our linen shirts are cut in Lisbon from fabric woven two streets away."
  const texts = ["Add to cart", `<p>${long}</p>`, "Hi {name}", "Add to cart"]
  seen.length = 0
  r = await mod.translateOpen(texts, "en", "fr", { keep: ["Green Garden"] })
  check("every text is translated", r.out.size === 4 && r.unavailable === null, JSON.stringify([...r.out]))
  check("a short label goes from the known language", seen.some((s) => s.body.source === "en" && (s.body.q as string[]).includes("Add to cart")))
  check("a long text is detected (source auto)", seen.some((s) => s.body.source === "auto" && (s.body.q as string[]).includes(long)))
  check("repeated words are sent once", seen.flatMap((s) => (s.body.q as string[]) ?? []).filter((q) => q === "Add to cart").length === 1)
  check("the HTML comes back as it was", r.out.get(1) === `<p>«fr:${long}»</p>`, r.out.get(1))
  check("the placeholder comes back as it was", r.out.get(2) === "«fr:Hi» {name}", r.out.get(2))
  check("format text, so the server never touches markup", seen.every((s) => s.body.format === "text"))

  seen.length = 0
  r = await mod.translateOpen(["Hello"], "en", "pt-BR")
  check("Brazilian Portuguese is asked as LibreTranslate's pb", seen.some((s) => s.body.target === "pb") && r.out.get(0) === "«pb:Hello»")

  r = await mod.translateOpen(["Hello"], "en", "ja")
  check("a language the server does not offer is said plainly", r.out.size === 0 && /can't be translated automatically/.test(r.unavailable ?? ""), r.unavailable ?? "")

  const many = Array.from({ length: 130 }, (_, i) => `Item number ${i}`)
  seen.length = 0
  r = await mod.translateOpen(many, "en", "es")
  /* Changed on purpose (whole texts first): batches of 40 texts. */
  check("130 texts in batches of 40 at most", r.out.size === 130 && seen.filter((s) => s.path === "/lt/translate").every((s) => (s.body.q as string[]).length <= 40) && seen.filter((s) => s.path === "/lt/translate").length === 4)

  console.log("\nHugging Face")
  delete process.env.LIBRETRANSLATE_URL
  process.env.HF_TOKEN = "hf_test"
  process.env.HF_INFERENCE_URL = `${base}/hf`
  process.env.HF_ROUTER_URL = `${base}/hfr`
  seen.length = 0
  r = await mod.translateOpen(["Hello", "Shop <i>now</i>"], "en", "fr")
  check("an open chat model through the router first, whole sentences with their markup, its JSON read even inside a code fence", r.out.get(0) === "CHAT Hello" && r.out.get(1) === "CHAT Shop <i>now</i>" && seen.some((x) => x.path === "/hfr/chat/completions"), JSON.stringify([...r.out]))
  check("the prompt names both languages", seen.some((x) => /from English into French/.test(String((x.body.messages as { content: string }[] | undefined)?.[0]?.content))))
  process.env.HF_CHAT_MODEL = "acme/not-served"
  seen.length = 0
  r = await mod.translateOpen(["Hello"], "en", "de")
  check("the pair's opus-mt model when there is one", r.out.get(0) === "DE Hello" && seen.some((s) => s.path === "/hf/Helsinki-NLP/opus-mt-en-de"))
  seen.length = 0
  r = await mod.translateOpen(["Hello <b>there</b>"], "en", "ro")
  check("NLLB 200 when there is none, with its language codes", r.out.get(0) === "ron_Latn Hello <b>there</b>" && seen.some((s) => s.path === "/hf/facebook/nllb-200-distilled-600M" && (s.body.parameters as { src_lang: string }).src_lang === "eng_Latn"), r.out.get(0))

  delete process.env.HF_INFERENCE_URL
  process.env.HF_INFERENCE_URL = `${base}/nowhere`
  r = await mod.translateOpen(["Something new"], "en", "it")
  check("when nothing answers, the failure names Hugging Face and what it said, not a guess about the language", r.out.size === 0 && /^Couldn't translate\. Hugging Face/.test(r.unavailable ?? "") && /HTTP 4\d\d/.test(r.unavailable ?? "") && !/can't be translated automatically/.test(r.unavailable ?? ""), r.unavailable ?? "")
  delete process.env.HF_TOKEN
  delete process.env.HF_CHAT_MODEL

  console.log("\nGemini, recommended")
  process.env.GEMINI_API_KEY = "gem_test"
  process.env.GEMINI_URL = `${base}/gem`
  delete process.env.LIBRETRANSLATE_URL
  seen.length = 0
  r = await mod.translateOpen(["Free shipping on orders over 200 lei", "<p>Our <b>linen</b> shirts</p>", "Hi {{ customer.first_name }}, welcome"], "en", "fr", { keep: ["Green Garden"] })
  check("first when set up, whole sentences with markup kept", r.out.get(0) === "GEM(gemini-2.5-flash-lite) Free shipping on orders over 200 lei" && r.out.get(1) === "GEM(gemini-2.5-flash-lite) <p>Our <b>linen</b> shirts</p>", JSON.stringify([...r.out]))
  check("one that lost its placeholder goes again as its words, and keeps it", r.out.get(2) === "GEM(gemini-2.5-flash-lite) Hi {{ customer.first_name }}GEM(gemini-2.5-flash-lite) , welcome" || /\{\{ customer\.first_name \}\}/.test(r.out.get(2) ?? ""), r.out.get(2))
  check("the store's name is named in the prompt to keep", seen.some((x) => /"Green Garden"/.test(String((x.body.messages as { content: string }[] | undefined)?.[0]?.content))))
  process.env.GEMINI_OLD_ONLY = "1"
  r = await mod.translateOpen(["Another sentence"], "en", "de")
  check("a model the key cannot use: the next Gemini model", r.out.get(0) === "GEM(gemini-2.0-flash-lite) Another sentence", r.out.get(0))
  delete process.env.GEMINI_OLD_ONLY
  process.env.GEMINI_BUSY = "1"
  r = await mod.translateOpen(["Out of allowance today"], "en", "es")
  check("out of allowance: said as busy, so the job waits instead of failing", r.out.size === 0 && r.busy === true && /Gemini is busy or out of allowance/.test(r.unavailable ?? ""), JSON.stringify(r))
  delete process.env.GEMINI_BUSY
  delete process.env.GEMINI_API_KEY

  console.log("\nDeepL")
  check("its target codes: Brazilian Portuguese, US English, Traditional Chinese", mod.deeplTarget("pt-BR") === "PT-BR" && mod.deeplTarget("en") === "EN-US" && mod.deeplTarget("zh-Hant") === "ZH-HANT" && mod.deeplTarget("fr") === "FR")
  const wrapped = mod.deeplWrap("Hi {name}, see https://a.co & more at Green Garden", ["Green Garden"])
  check("plain text: escaped, and its fixed parts held in an ignored tag", wrapped === "Hi <x>{name}</x>, see <x>https://a.co</x> &amp; more at <x>Green Garden</x>", wrapped)
  check("and back exactly", mod.deeplUnwrap(wrapped, false) === "Hi {name}, see https://a.co & more at Green Garden")
  check("markup stays markup", mod.deeplWrap("<p>Hi {{ x }}</p>", []) === "<p>Hi <x>{{ x }}</x></p>")
  process.env.DEEPL_API_KEY = "dl_test:fx"
  process.env.DEEPL_URL = `${base}/deepl`
  seen.length = 0
  r = await mod.translateOpen(["Add to cart", "Hi {name} & co"], "en", "pt-BR")
  check("translates with tag handling and the right target", r.out.get(0) === "DL(PT-BR) Add to cart" && r.out.get(1) === "DL(PT-BR) Hi {name} & co" && seen.some((x) => x.path === "/deepl/v2/translate" && x.body.tag_handling === "html" && JSON.stringify(x.body.ignore_tags) === '["x"]'), JSON.stringify([...r.out]))
  delete process.env.DEEPL_API_KEY

  console.log("\nThe paid model is not used")
  process.env.LIBRETRANSLATE_URL = `${base}/lt`
  openAiCalls = 0
  const d = await draftTranslations([{ key: "a", source: "Shop now" }, { key: "b", source: "<p>Free shipping over {{ amount }}</p>" }], "en", "es", "Green Garden")
  check("drafts come from the open model", d.drafts.get("a") === "«es:Shop now»" && d.drafts.get("b") === "<p>«es:Free shipping over» {{ amount }}</p>", JSON.stringify([...d.drafts]))
  check("and the chat model is never called", openAiCalls === 0)

  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("the sheet says the work runs on with the tab closed", /You can close this or the tab/.test(sheet))
  check("a just-added language is asked again before saying it's missing", /attempt >= 2/.test(sheet))
  const jobs = read("lib/markets/translation-jobs.ts")
  check("a job whose translators are all out of allowance waits and carries on, not failed", /r\.status === 429 && Date\.now\(\) - Date\.parse\(row\.started_at\) < WAIT_LIMIT_MS/.test(jobs) && /rounds: rounds - 1, lease_until: new Date\(Date\.now\(\) \+ WAIT_MS\)/.test(jobs))
  check("and the press says busy as 429", /status: busy \? 429 : 503/.test(read("lib/markets/translation-press.ts")))
  console.log("\nThe website's own language, and translations that go live")
  const en = ["Shop the new summer collection", "Free shipping on all orders over 200 lei", "Our linen shirts are made by hand in Lisbon", "Join the club and get 10% off your first order", "Add to cart", "About us", "Contact us for more information about our products", "We ship to all of Europe in two days"]
  const fr = ["Découvrez la nouvelle collection d'été", "Livraison gratuite pour toutes les commandes de plus de 200 lei", "Nos chemises en lin sont faites à la main à Lisbonne", "Rejoignez le club et obtenez 10% sur votre première commande", "Ajouter au panier", "À propos de nous", "Contactez-nous pour plus d'informations sur nos produits", "Nous livrons dans toute l'Europe en deux jours"]
  check("an English website reads as English", detectLanguage(en) === "en", String(detectLanguage(en)))
  check("a French one as French", detectLanguage(fr) === "fr", String(detectLanguage(fr)))
  check("a handful of words says nothing", detectLanguage(["Shop", "Home"]) === null)
  /* Changed on purpose (the owner: "if they set the default language to French, everything should be French"): the default is what the website shows, translated from what it is written in. */
  check("a default other than the written language means every text is translated into it", defaultLanguageScope("es", "en") === "all" && defaultLanguageScope("en", "en") === "builtIn" && defaultLanguageScope("pt-BR", "pt") === "builtIn" && defaultLanguageScope("fr", null) === "builtIn")
  check("no notice telling the owner their default is wrong", !/data-fix-default-language/.test(read("components/app/settings/markets-panel.tsx")))
  check("the run translates from the written language, everything when the default differs", /const from = writtenIn \?\?/.test(read("lib/markets/translation-press.ts")) && /where\.own && scope === "builtIn" \? allGroups\.filter/.test(read("lib/markets/translation-press.ts")))
  check("the live site lays every default-language translation over its own address", !/ownWords/.test(read("lib/markets/live.ts")) && !/ownWords/.test(read("lib/markets/compat.ts")))
  check("the editor canvas opens in the default language's translations", /const shown = locale \?\? info\.defaultLanguage/.test(read("components/website-builder/use-preview-language.ts")) && /const shown = locale \?\? \(asked \? null : loc\.defaultLanguage\)/.test(read("app/api/store/translations/route.ts")))
  check("an automatic translation is saved live, not a draft", /approved: true, ai: true/.test(read("lib/markets/translation-press.ts")))
  check("drafts from before are put live by the next run", /const waiting = all\.filter\(\(t\) => map\.get\(t\.key\)\?\.source === "ai"/.test(read("lib/markets/translation-press.ts")))
  check("a write never touches one key twice (Postgres refused the whole save)", /ONE ROW PER KEY/.test(read("lib/markets/server.ts")))
  check("a finished language is published by itself", /if \(finished \|\| stuck\) await publishLanguage\(db, creatorId, locale\)/.test(jobs))
  check("a stalled job is picked up by the next progress read, cron or not", /const idle = await idleJobs\(c\.db, c\.creatorId\)/.test(read("app/api/store/translations/jobs/route.ts")))
  check("the press shows Translating at once, before the server answers", /starting\.add\(locale\)/.test(read("components/app/settings/translation-jobs-store.ts")))
  check("memory is kept for good (part 178)", /translation_memory/.test(read("supabase/sql/run-now/178_translation_memory.sql")))

  server.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()

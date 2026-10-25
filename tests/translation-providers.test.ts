/**
 * TRANSLATION THAT KEEPS WORKING ON FREE ALLOWANCES (round 13)
 *
 *   the Gemini model is read from Google's list, never written down: the
 *   best cheap text model by family (Flash-Lite, then Flash), stable before
 *   preview, newest first; a retired one (404) hands over to the next and
 *   is not asked again; each model's own daily allowance is used before
 *   the next model's; an override naming a retired model still translates
 *
 *   every call is paced under a per-minute budget (a queue, not a burst),
 *   and a "too many" or "no more today" rests that model for exactly as
 *   long as Google said
 *
 *   each text is sent once (duplicates and batches of 40), and a
 *   translation that changed a number, lost a placeholder, renamed the
 *   store or added words is never kept
 *
 *   Cloudflare Workers AI, the free second translator, read the same way
 *
 * Against a real HTTP server standing in for Google and Cloudflare.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { KNOWN_GOOD, familyOf, listModels, modelOrder, rankModels } from "../lib/markets/gemini-models"
import { rankCfModels } from "../lib/markets/cloudflare-models"
import { dayIn, nextMidnight, resetBudgets, restOf, takeSlot } from "../lib/markets/translate-budget"
import { numbersOf, translationProblem } from "../lib/markets/translation-check"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)?.slice(0, 600)}` : ""}`)
  }
}

/* ------------------------------------------------------------ the fakes */

type Call = { path: string; model?: string; texts?: string[] }
const calls: Call[] = []
/** What each model answers: "ok", "gone" (404), "day" (no more today), "minute" (too many, retry in 7s), "zero" (no free tier), or a function. */
const behaviour = new Map<string, string>()
let listed: string[] = []
let listPages = 1

const send = (res: ServerResponse, status: number, json: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(json))
}
const read = (req: IncomingMessage) =>
  new Promise<Record<string, any>>((ok) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => ok(raw ? JSON.parse(raw) : {}))
  })

const quota = (quotaId: string, value: string, delay?: string) => ({
  error: {
    code: 429,
    message: "You exceeded your current quota, please check your plan and billing details.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId, quotaValue: value }] },
      ...(delay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] : []),
    ],
  },
})

/** A pretend translation that keeps every fixed part: "FR[" + text + "]". */
const fake = (lang: string, t: string) => `${lang}«${t}»`

async function answer(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "", "http://x")
  if (req.method === "GET" && url.pathname === "/g/models") {
    calls.push({ path: "list" })
    const page = Number(url.searchParams.get("pageToken") ?? 0)
    const per = Math.ceil(listed.length / listPages)
    const slice = listed.slice(page * per, page * per + per)
    return send(res, 200, { models: slice.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: /embedding/.test(m) ? ["embedContent"] : ["generateContent", "countTokens"] })), ...(page + 1 < listPages ? { nextPageToken: String(page + 1) } : {}) })
  }
  const m = url.pathname.match(/^\/g\/models\/([^:]+):generateContent$/)
  if (m) {
    const model = decodeURIComponent(m[1])
    const body = await read(req)
    const texts = JSON.parse(body.contents[0].parts[0].text) as string[]
    calls.push({ path: "generate", model, texts })
    const b = behaviour.get(model) ?? "gone"
    if (b === "gone") return send(res, 404, { error: { code: 404, message: `This model models/${model} is no longer available. Please update your code to use a newer model.`, status: "NOT_FOUND" } })
    if (b === "day") return send(res, 429, quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "1000"))
    if (b === "minute") return send(res, 429, quota("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "15", "7s"))
    if (b === "zero") return send(res, 429, quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "0"))
    if (b === "badkey") return send(res, 400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } })
    const lang = /into ([A-Za-z ]+?),/.exec(body.systemInstruction.parts[0].text)?.[1] ?? "?"
    const out = texts.map((t) => {
      if (b === "sloppy" && /€/.test(t)) return t.replace(/\d+/, "99")
      if (b === "chatty" && t.length > 20) return `Here is the translation: ${fake(lang, t)}. I kept the tone warm and friendly, as a shop would, and translated every word for you.`
      if (b === "renames" && t.includes("Green Garden")) return t.replace("Green Garden", "Jardin Vert")
      return fake(lang, t)
    })
    return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 120 } })
  }
  if (req.method === "GET" && /\/cf\/accounts\/acc\/ai\/models\/search/.test(url.pathname)) {
    calls.push({ path: "cf-list" })
    return send(res, 200, {
      success: true,
      result: [
        { name: "@cf/meta/llama-3.2-1b-instruct", task: { name: "Text Generation" } },
        { name: "@cf/google/gemma-4-26b-a4b-it", task: { name: "Text Generation" } },
        { name: "@cf/google/gemma-7b-it-lora", task: { name: "Text Generation" } },
        { name: "@cf/meta/llama-guard-3-8b", task: { name: "Text Generation" } },
        { name: "@cf/old/gemma-3-12b-it", task: { name: "Text Generation" }, properties: [{ property_id: "planned_deprecation_date", value: "2026-01-01" }] },
        { name: "@cf/mistralai/mistral-small-3.1-24b-instruct", task: { name: "Text Generation" } },
        { name: "@cf/baai/bge-m3", task: { name: "Text Embeddings" } },
      ],
    })
  }
  if (req.method === "POST" && url.pathname === "/cf/accounts/acc/ai/v1/chat/completions") {
    const body = await read(req)
    const texts = JSON.parse(body.messages[1].content) as string[]
    calls.push({ path: "cf-chat", model: body.model, texts })
    if (behaviour.get("cf") === "neurons") return send(res, 429, { errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan" }], success: false })
    return send(res, 200, { choices: [{ message: { content: JSON.stringify(texts.map((t) => `CF«${t}»`)) } }] })
  }
  send(res, 404, { error: { message: "not here" } })
}

const generates = () => calls.filter((c) => c.path === "generate")

async function main() {
  console.log("\nChoosing a Gemini model from Google's list")
  const today = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.6-flash",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-flash-image",
    "gemini-live-2.5-flash",
    "gemini-embedding-001",
    "gemini-3.8-flash-001",
  ]
  const ranked = rankModels(today.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: /embedding/.test(m) ? ["embedContent"] : ["generateContent"] })))
  check("Flash-Lite before Flash, stable before the -latest alias before preview, newest first", JSON.stringify(ranked.slice(0, 5)) === JSON.stringify(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite-preview"]), ranked)
  check("then Flash, newest first, a pinned snapshot after its family's plain names", JSON.stringify(ranked.slice(5)) === JSON.stringify(["gemini-3.8-flash-001", "gemini-3.6-flash", "gemini-2.5-flash"]), ranked)
  check("never Pro, speech, image, live or embedding models", !ranked.some((m) => /pro|tts|image|live|embedding/.test(m)))
  check("a model Google adds next year is picked with no change here", rankModels([{ name: "models/gemini-2.5-flash-lite" }, { name: "models/gemini-4.2-flash-lite" }])[0] === "gemini-4.2-flash-lite")
  check("families", familyOf("gemini-3.5-flash-lite") === 0 && familyOf("gemini-3.6-flash") === 1 && familyOf("gemini-3.1-pro") === null && familyOf("gemma-3-27b-it") === null)
  check("the override first, then what was discovered, never twice", JSON.stringify(modelOrder(["gemini-2.0-flash", "gemini-3.5-flash-lite"], ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"])) === JSON.stringify(["gemini-2.0-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]))
  check("nothing discovered: the last known good list", JSON.stringify(modelOrder([], null)) === JSON.stringify(KNOWN_GOOD) && !KNOWN_GOOD.some((m) => /2\.0/.test(m)))

  const server = createServer((req, res) => void answer(req, res))
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  listed = today
  listPages = 3
  const pages = await listModels(`${base}/g`, "k")
  check("every page of the list is read (nextPageToken)", pages.length === today.length && calls.filter((c) => c.path === "list").length === 3, pages.length)
  listPages = 1

  console.log("\nTime: Gemini's day ends at midnight Pacific")
  const t = Date.parse("2026-10-25T06:30:00Z") /* 23:30 on the 24th in Los Angeles */
  check("the Pacific day", dayIn(t) === "2026-10-24" && dayIn(t, "UTC") === "2026-10-25")
  check("the next Pacific midnight is 07:00 UTC in summer time", new Date(nextMidnight(t)).toISOString() === "2026-10-25T07:00:00.000Z", new Date(nextMidnight(t)).toISOString())
  check("and 08:00 UTC in winter", new Date(nextMidnight(Date.parse("2026-12-01T12:00:00Z"))).toISOString() === "2026-12-02T08:00:00.000Z")
  check("UTC midnight for Cloudflare", new Date(nextMidnight(t, "UTC")).toISOString() === "2026-10-26T00:00:00.000Z")

  console.log("\nPacing: a queue under a per-minute budget")
  resetBudgets()
  let now = 1_000_000
  const slept: number[] = []
  const clock = () => now
  const sleep = async (ms: number) => {
    slept.push(ms)
    now += ms
  }
  const a = await takeSlot("m", 2, now + 120_000, clock, sleep)
  const b = await takeSlot("m", 2, now + 120_000, clock, sleep)
  const c = await takeSlot("m", 2, now + 120_000, clock, sleep)
  check("two a minute: the third waits its turn (about a minute), it is not refused", a && b && c && slept.length === 1 && slept[0] >= 59_000 && slept[0] <= 60_100, slept)
  const d = await takeSlot("m", 2, now + 5_000, clock, sleep)
  const e2 = await takeSlot("m", 2, now + 5_000, clock, sleep)
  check("a turn that would come after the run's deadline is not waited for", d === true && e2 === false)

  console.log("\nA translation is kept only when it is sound")
  check("numbers compared as digits, grouping free", numbersOf("€1,299.00 for 2") === numbersOf("2 pour 1 299,00 €") && numbersOf("Arabic ١٢٣") === numbersOf("123"))
  check("an entity's code is not a number", numbersOf("Tom&#39;s 2 hats") === numbersOf("Los 2 sombreros de Tom"))
  check("kept: a sound translation", translationProblem("Free shipping over 200 lei, {{ customer.first_name }}!", "Livraison gratuite dès 200 lei, {{ customer.first_name }} !", { to: "fr" }) === null)
  check("refused: a price changed", translationProblem("Only €49.99 today", "Seulement 59,99 € aujourd'hui") === "changed a number")
  check("refused: a placeholder lost", translationProblem("Hi {name}, welcome", "Bonjour, bienvenue") === "lost a placeholder, tag or link")
  check("refused: the store's name translated", translationProblem("Welcome to Green Garden", "Bienvenue chez Jardin Vert", { keep: ["Green Garden"] }) === "changed a protected name")
  check("refused: words added", translationProblem("Our linen shirts are made by hand.", "Here is the translation: Nos chemises en lin sont faites à la main. I hope this helps you with your shop and its customers today!") === "added text")
  check("refused: a link changed", translationProblem('<a href="https://a.co/x">Shop</a>', '<a href="https://a.co/fr/x">Boutique</a>') !== null)
  check("refused: text left out", translationProblem("Our linen shirts are cut in Lisbon from fabric woven two streets away.", "Chemises.") === "left text out")
  check("kept: Chinese is shorter", translationProblem("Free shipping on all orders", "所有订单免运费", { to: "zh-Hans" }) === null)
  check("refused: empty", translationProblem("Hello", "  ") === "empty")

  /* ------------------------------------------------------------- the flow */
  process.env.GEMINI_API_KEY = "test-key"
  process.env.GEMINI_API_BASE = `${base}/g`
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.GEMINI_RPM = "1000"
  const mod = await import("../lib/markets/open-translate")
  const fresh = () => {
    resetBudgets()
    mod.forgetGeminiModels()
    calls.length = 0
    behaviour.clear()
  }

  console.log("\nA retired model hands over to the next, once")
  fresh()
  /* The list still names 3.5 (Google lists a model until the day it goes), but it answers 404. */
  listed = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
  behaviour.set("gemini-3.1-flash-lite", "ok")
  let r = await mod.translateOpen(["Add to cart", "Our story"], "en", "fr")
  check("translated by the next model", r.out.get(0) === "French«Add to cart»" && r.out.get(1) === "French«Our story»", [...r.out])
  check("the retired one was asked once, then the next", generates().map((c) => c.model).join() === "gemini-3.5-flash-lite,gemini-3.1-flash-lite", generates().map((c) => c.model))
  check("and it rests a day", restOf("gemini", "gemini-3.5-flash-lite")?.why === "gone")
  calls.length = 0
  r = await mod.translateOpen(["Contact us"], "en", "de")
  check("the next batch goes straight to the working model, the list not read again", generates().map((c) => c.model).join() === "gemini-3.1-flash-lite" && !calls.some((c) => c.path === "list"), calls)

  console.log("\nAn override naming a shut down model still translates")
  fresh()
  process.env.GEMINI_TRANSLATE_MODEL = "gemini-2.0-flash"
  listed = ["gemini-2.5-flash-lite"]
  behaviour.set("gemini-2.5-flash-lite", "ok")
  r = await mod.translateOpen(["Shop now"], "en", "es")
  check("2.0 is 404, the discovered model answers", r.out.get(0) === "Spanish«Shop now»" && generates().map((c) => c.model).join() === "gemini-2.0-flash,gemini-2.5-flash-lite", generates().map((c) => c.model))
  delete process.env.GEMINI_TRANSLATE_MODEL

  console.log("\nThe list cannot be read: the last known good models")
  fresh()
  process.env.GEMINI_API_BASE = `${base}/g`
  listed = []
  behaviour.set("gemini-3.1-flash-lite", "ok")
  r = await mod.translateOpen(["Sale"], "en", "it")
  check("an empty list falls back to the known good, 3.5 then 3.1", r.out.get(0) === "Italian«Sale»" && generates()[0]?.model === KNOWN_GOOD[0], generates().map((c) => c.model))

  console.log("\nEach model's own daily allowance")
  fresh()
  listed = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "day")
  behaviour.set("gemini-3.1-flash-lite", "zero")
  behaviour.set("gemini-2.5-flash-lite", "ok")
  r = await mod.translateOpen(["Free gift"], "en", "fr")
  check("no more today on one, no free tier on the next: the third translates", r.out.get(0) === "French«Free gift»", [...r.out])
  const dayRest = restOf("gemini", "gemini-3.5-flash-lite")
  check("the first rests until midnight Pacific, said by its quota", dayRest?.why === "day" && Math.abs((dayRest?.until ?? 0) - nextMidnight(Date.now())) < 120_000, dayRest)
  check("a model with no free tier on this key rests a day", restOf("gemini", "gemini-3.1-flash-lite")?.why === "gone")
  calls.length = 0
  await mod.translateOpen(["Free gift wrap"], "en", "fr")
  check("and neither is asked again today", generates().map((c) => c.model).join() === "gemini-2.5-flash-lite")

  console.log("\nToo many this minute")
  fresh()
  listed = ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "minute")
  behaviour.set("gemini-2.5-flash-lite", "minute")
  r = await mod.translateOpen(["Hello there"], "en", "fr")
  const minuteRest = restOf("gemini", "gemini-3.5-flash-lite")
  check("rests for Google's RetryInfo (7s), not a guess", minuteRest?.why === "minute" && (minuteRest?.until ?? 0) - Date.now() <= 7_100 && (minuteRest?.until ?? 0) - Date.now() > 5_000, minuteRest)
  check("every model busy: said as busy, so the job waits and carries on", r.out.size === 0 && r.busy === true, r)
  calls.length = 0
  r = await mod.translateOpen(["Hello again"], "en", "fr")
  check("while they rest, no call is made at all", generates().length === 0 && r.busy === true, calls)

  console.log("\nA key that is refused stops at once")
  fresh()
  listed = ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "badkey")
  behaviour.set("gemini-2.5-flash-lite", "ok")
  r = await mod.translateOpen(["Hello"], "en", "fr")
  check("one call, then the reason in plain words", generates().length === 1 && r.out.size === 0 && /Gemini refused the key/.test(r.unavailable ?? ""), r.unavailable)

  console.log("\nEach text once, in batches")
  fresh()
  listed = ["gemini-3.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "ok")
  const many = Array.from({ length: 130 }, (_, i) => `Product line ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`)
  r = await mod.translateOpen([...many, ...many.slice(0, 30)], "en", "fr")
  const sent = generates().flatMap((c) => c.texts ?? [])
  check("160 texts, 130 different: 130 sent, each once", sent.length === 130 && new Set(sent).size === 130 && r.out.size === 160, { sent: sent.length, out: r.out.size })
  check("in 4 calls of at most 40", generates().length === 4 && generates().every((c) => (c.texts?.length ?? 0) <= 40), generates().map((c) => c.texts?.length))
  const prices = ["€12", "12 €"]
  r = await mod.translateOpen(prices, "en", "fr")
  check("a text with nothing to translate is its own translation, no call", r.out.get(0) === "€12" && generates().length === 4)

  console.log("\nAn unsound answer is not kept")
  fresh()
  listed = ["gemini-3.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "sloppy")
  r = await mod.translateOpen(["Linen shirt, now €49 only"], "en", "fr")
  check("a changed price is refused, whole and as words: the original shows", r.out.size === 0, [...r.out])
  fresh()
  listed = ["gemini-3.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "renames")
  r = await mod.translateOpen(["Welcome to Green Garden today"], "en", "fr", { keep: ["Green Garden"] })
  check("the store's name kept: the words around it are translated, the name is not", r.out.get(0) !== undefined && r.out.get(0)!.includes("Green Garden") && !r.out.get(0)!.includes("Jardin Vert"), r.out.get(0))
  fresh()
  listed = ["gemini-3.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "chatty")
  r = await mod.translateOpen(["Our linen shirts are made by hand"], "en", "fr")
  check("an answer with words added is refused", !(r.out.get(0) ?? "").includes("Here is"), r.out.get(0))

  console.log("\nCloudflare Workers AI, the free second translator")
  check("its models ranked: Gemma, then Mistral Small; LoRA, guards, tiny and deprecated ones left out", JSON.stringify(rankCfModels([{ name: "@cf/meta/llama-3.2-1b-instruct" }, { name: "@cf/google/gemma-4-26b-a4b-it" }, { name: "@cf/google/gemma-7b-it-lora" }, { name: "@cf/mistralai/mistral-small-3.1-24b-instruct" }, { name: "@cf/old/gemma-3-12b-it", properties: [{ property_id: "planned_deprecation_date", value: "2026-01-01" }] }], Date.parse("2026-10-25"))) === JSON.stringify(["@cf/google/gemma-4-26b-a4b-it", "@cf/mistralai/mistral-small-3.1-24b-instruct"]))
  fresh()
  process.env.CLOUDFLARE_ACCOUNT_ID = "acc"
  process.env.CLOUDFLARE_AI_TOKEN = "cf-token"
  process.env.CLOUDFLARE_API_BASE = `${base}/cf`
  listed = ["gemini-3.5-flash-lite"]
  behaviour.set("gemini-3.5-flash-lite", "day")
  r = await mod.translateOpen(["Spring collection", "Add to cart"], "en", "ro")
  check("Gemini out for today: Cloudflare translates, with the model it listed", r.out.get(0) === "CF«Spring collection»" && calls.some((c) => c.path === "cf-chat" && c.model === "@cf/google/gemma-4-26b-a4b-it"), { out: [...r.out], calls: calls.map((c) => `${c.path}:${c.model ?? ""}`) })
  check("and it reads whole sentences, so it may write the checkout's words", mod.uiProviders().includes("cloudflare"))
  calls.length = 0
  behaviour.set("cf", "neurons")
  r = await mod.translateOpen(["Summer sale"], "en", "ro")
  check("its daily neurons used: said as busy, every model rests until 00:00 UTC", r.busy === true && restOf("cloudflare", "@cf/google/gemma-4-26b-a4b-it")?.why === "day", r)
  process.env.TRANSLATE_PROVIDERS = "cloudflare,gemini"
  check("TRANSLATE_PROVIDERS chooses and orders the translators", JSON.stringify(mod.openProviders()) === JSON.stringify(["cloudflare", "gemini"]))
  delete process.env.TRANSLATE_PROVIDERS
  delete process.env.CLOUDFLARE_ACCOUNT_ID

  server.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()

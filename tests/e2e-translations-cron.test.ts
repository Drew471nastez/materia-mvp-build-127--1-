/**
 * A STORE TRANSLATED BY THE CRON, END TO END, ON A FAKE FREE TRANSLATOR
 *
 * The real route (/api/cron/translation-jobs), the real auto-translate run
 * and the real provider chain, over the journey harness (in-memory
 * PostgREST built from the repository's SQL), with Google's Gemini API
 * answered by a fake that behaves like today's: its model list still names
 * a model that answers 404, the next one translates.
 *
 *   a store with "Translate changes automatically" on, two languages and
 *   three products is translated in full by the cron, live
 *   the retired model is asked once, then never again
 *   a translation that changed a price is not saved: the original shows
 *   every call is counted (translation_provider_usage) and the models read
 *   are kept (translation_provider_state), for /admin/translations
 *   a run with nothing changed makes no call; a second store with the same
 *   product text is served from translation memory, no call for those texts
 *
 * And it measures what a typical store costs: calls per language.
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

type Gen = { model: string; texts: string[]; lang: string }
const gens: Gen[] = []
let lists = 0

function fakeGemini(j: Journey) {
  j.net.routes.push({
    match: (u) => u.host === "generativelanguage.googleapis.com",
    answer: async (req) => {
      const u = new URL(req.url)
      const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } })
      if (req.headers.get("x-goog-api-key") !== "journey-gemini") return json({ error: { code: 400, message: "API key not valid.", status: "INVALID_ARGUMENT" } }, 400)
      if (req.method === "GET" && u.pathname === "/v1beta/models") {
        lists++
        return json({ models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-pro"].map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ["generateContent"] })) })
      }
      const m = u.pathname.match(/^\/v1beta\/models\/([^:]+):generateContent$/)
      if (!m) return json({ error: { code: 404, message: "not here" } }, 404)
      const model = decodeURIComponent(m[1])
      const body = (await req.json()) as any
      const texts = JSON.parse(body.contents[0].parts[0].text) as string[]
      const lang = /into ([A-Za-z ]+?),/.exec(body.systemInstruction.parts[0].text)?.[1] ?? "?"
      gens.push({ model, texts, lang })
      if (model === "gemini-3.5-flash-lite") return json({ error: { code: 404, message: `This model models/${model} is no longer available.`, status: "NOT_FOUND" } }, 404)
      /* A careless model: one product's price comes back changed. */
      const out = texts.map((t) => (/€39/.test(t) ? t.replace("39", "93") : `${lang.slice(0, 2).toUpperCase()}: ${t}`))
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 180 } })
    },
  })
}

function newProduct(j: Journey, creatorId: string, title: string, description: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: "digital", title, slug, description, status: "published", price_cents: 3900, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

async function storeWith(j: Journey, email: string, slug: string, languages: string[]) {
  const seller = await j.signUp(email, { name: slug })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: slug } })
  const creator = j.rows("creators").find((c) => c.slug === slug || c.user_id === seller.id)!
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Green Garden", supportEmail: `${slug}@example.com`, defaultCountry: "DE" } })
  const m0 = await j.call("GET /api/store/markets", { as: seller })
  const loc = m0.json?.localization
  const put = await j.call("PUT /api/store/markets", { as: seller, body: { localization: { ...loc, autoTranslate: true, languages: [...loc.languages, ...languages.map((code) => ({ code, published: true }))] } } })
  return { seller, creator, put }
}

/** Marks a store changed a while ago (as a save does, settled), then runs the cron until it has nothing left, at most `max` runs. */
async function cronUntilDone(j: Journey, creatorId: string, max = 25): Promise<number> {
  const auth = { authorization: `Bearer ${process.env.CRON_SECRET}` }
  let runs = 0
  for (; runs < max; runs++) {
    const row = j.rows("store_localization").find((r) => r.creator_id === creatorId)
    if (!row?.translate_dirty_at) break
    /* As if the settle time had passed. */
    row.translate_dirty_at = new Date(Date.now() - 10 * 60_000).toISOString()
    row.translate_lease_until = null
    const res = await j.call("GET /api/cron/translation-jobs", { headers: auth })
    if (res.status !== 200) throw new Error(`cron answered ${res.status}: ${JSON.stringify(res.json)}`)
    if (process.env.DEBUG_E2E) console.log("run", runs, JSON.stringify(res.json), JSON.stringify(j.rows("store_localization").find((r) => r.creator_id === creatorId)?.auto_translate_run))
  }
  return runs
}

async function main() {
  process.env.GEMINI_API_KEY = "journey-gemini"
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.GEMINI_RPM = "1000"
  for (const k of ["GEMINI_API_BASE", "GEMINI_URL", "GEMINI_TRANSLATE_MODEL", "DEEPL_API_KEY", "HF_TOKEN", "LIBRETRANSLATE_URL", "CLOUDFLARE_ACCOUNT_ID", "OPENAI_API_KEY"]) delete process.env[k]
  const j = await Journey.start()
  fakeGemini(j)

  section("1. A store with automatic translation on, French and German")
  const a = await storeWith(j, "ana@example.com", "green-garden", ["fr", "de"])
  check("languages and the switch saved", a.put.status === 200, a.put.json)
  newProduct(j, a.creator.id, "Linen Shirt", "<p>Hand made in Lisbon. Size {size}, see https://green.example/size</p>")
  newProduct(j, a.creator.id, "Garden Hat", "<p>Wide brim, <b>straw</b>, for sunny days.</p>")
  newProduct(j, a.creator.id, "Seed Box", "<p>Only €39 for twelve kinds of seeds.</p>")
  const loc = j.rows("store_localization").find((r) => r.creator_id === a.creator.id)
  check("the store is on the queue", loc?.auto_translate === true, loc)
  if (loc) loc.translate_dirty_at = new Date(Date.now() - 10 * 60_000).toISOString()

  section("2. The cron translates it")
  const runs = await cronUntilDone(j, a.creator.id)
  const rows = j.rows("site_translations").filter((r) => r.creator_id === a.creator.id)
  const fr = rows.filter((r) => r.locale === "fr")
  const de = rows.filter((r) => r.locale === "de")
  const frValue = (re: RegExp) => fr.find((r) => re.test(String(r.value ?? "")))
  check("finished in a few runs, the queue cleared", runs > 0 && !j.rows("store_localization").find((r) => r.creator_id === a.creator.id)?.translate_dirty_at, { runs })
  check("French and German written", fr.length > 0 && de.length > 0, { fr: fr.length, de: de.length, sample: rows.slice(0, 3) })
  check("a product's description in French, live", !!frValue(/^FR: <p>Wide brim, <b>straw<\/b>, for sunny days\.<\/p>$/), fr.map((r) => r.value).slice(0, 12))
  check("product names kept as written by default (the store's rule), never sent", !gens.some((g) => g.texts.includes("Linen Shirt")))
  check("its description with the placeholder and the link kept", !!frValue(/^FR: <p>Hand made in Lisbon\. Size \{size\}, see https:\/\/green\.example\/size<\/p>$/))
  check("the price that came back changed was not saved: the original shows", !fr.some((r) => /€93/.test(String(r.value))) && !fr.some((r) => /Only €39/.test(String(r.value))), fr.filter((r) => /€/.test(String(r.value))))
  const refusal = j.rows("translation_refusals").filter((r) => r.target_lang === "fr")
  check("and it waits an hour before it is asked again, not every run (translation_refusals)", refusal.length === 1 && refusal.every((r) => r.tries === 1 && Date.parse(r.retry_at) - Date.now() > 55 * 60_000), refusal)
  check("written as the machine's, approved (live)", fr.every((r) => r.status === "approved" || r.approved === true || r.source === "ai"), fr[0])

  section("3. The retired model, the list and the counts")
  check("the 404 model was asked once, then only the next", gens.filter((g) => g.model === "gemini-3.5-flash-lite").length === 1 && gens.slice(1).every((g) => g.model === "gemini-3.1-flash-lite"), gens.map((g) => g.model).slice(0, 6))
  check("the model list was read once for the day", lists === 1, lists)
  const state = j.rows("translation_provider_state").find((r) => r.provider === "gemini")
  check("the models read are kept for every run (translation_provider_state)", !!state && Array.isArray(state.models) && state.models[0] === "gemini-3.5-flash-lite" && !state.models.includes("gemini-2.5-pro"), state)
  check("and the retired one rests there, for the other instances", state?.rests?.["gemini-3.5-flash-lite"]?.why === "gone", state?.rests)
  const usage = j.rows("translation_provider_usage").filter((r) => r.provider === "gemini")
  const callsCounted = usage.reduce((n, r) => n + Number(r.calls), 0)
  check("every call counted, by model (translation_provider_usage)", callsCounted === gens.length && usage.some((r) => r.model === "gemini-3.5-flash-lite" && r.failed === 1), { counted: callsCounted, made: gens.length, usage })
  check("tokens counted", usage.some((r) => Number(r.input_tokens) > 0 && Number(r.output_tokens) > 0))
  const sentTexts = gens.filter((g) => g.model !== "gemini-3.5-flash-lite").reduce((n, g) => n + g.texts.length, 0)
  const perLang = { fr: gens.filter((g) => g.lang === "French" && g.model !== "gemini-3.5-flash-lite").length, de: gens.filter((g) => g.lang === "German" && g.model !== "gemini-3.5-flash-lite").length }
  console.log(`\n  MEASURED: a store with 3 products, the built-in shop, checkout and email words: ${rows.length} translations written, ${sentTexts} texts sent in ${gens.length} calls (${perLang.fr} for French, ${perLang.de} for German), ${runs} cron runs\n`)
  check("a typical small store costs a few dozen calls a language at most", perLang.fr > 0 && perLang.fr <= 40 && perLang.de <= 40, perLang)
  const memory = j.rows("translation_memory")
  check("everything translated is kept in translation memory", memory.length > 0 && memory.some((m) => m.translated === "FR: <p>Wide brim, <b>straw</b>, for sunny days.</p>" && m.provider === "gemini"), memory.length)

  section("4. Nothing changed: no call")
  const before = gens.length
  const l2 = j.rows("store_localization").find((r) => r.creator_id === a.creator.id)
  if (l2) l2.translate_dirty_at = new Date(Date.now() - 10 * 60_000).toISOString()
  await cronUntilDone(j, a.creator.id)
  check("a run over an unchanged store asks nothing", gens.length === before, gens.slice(before).map((g) => g.texts.slice(0, 3)))

  section("5. Another store with the same text: from translation memory")
  const b = await storeWith(j, "bo@example.com", "garden-two", ["fr"])
  newProduct(j, b.creator.id, "Straw Hat", "<p>Wide brim, <b>straw</b>, for sunny days.</p>")
  const l3 = j.rows("store_localization").find((r) => r.creator_id === b.creator.id)
  if (l3) l3.translate_dirty_at = new Date(Date.now() - 10 * 60_000).toISOString()
  const mark = gens.length
  await cronUntilDone(j, b.creator.id)
  const frB = j.rows("site_translations").filter((r) => r.creator_id === b.creator.id && r.locale === "fr")
  const askedAgain = gens.slice(mark).flatMap((g) => g.texts)
  check("its product is in French", frB.some((r) => r.value === "FR: <p>Wide brim, <b>straw</b>, for sunny days.</p>"), frB.map((r) => r.value).slice(0, 6))
  check("with no call at all: every text was translated for the first store", gens.slice(mark).length === 0, { calls: gens.slice(mark).length, sample: askedAgain.slice(0, 5) })

  section("6. Every translator out for today: the store waits, quietly")
  const c = await storeWith(j, "cy@example.com", "garden-three", ["it"])
  newProduct(j, c.creator.id, "Clay Pot", "<p>Fired twice.</p>")
  const gemState = j.rows("translation_provider_state").find((r) => r.provider === "gemini")
  /* As another instance would have written: both models used up today. */
  const until = Date.now() + 3_600_000
  if (gemState) gemState.rests = { "gemini-3.5-flash-lite": { until, why: "gone" }, "gemini-3.1-flash-lite": { until, why: "day" } }
  const { resetBudgets } = await import("@/lib/markets/translate-budget")
  resetBudgets()
  const l4 = j.rows("store_localization").find((r) => r.creator_id === c.creator.id)
  if (l4) l4.translate_dirty_at = new Date(Date.now() - 10 * 60_000).toISOString()
  const mark2 = gens.length
  const res = await j.call("GET /api/cron/translation-jobs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  const l4after = j.rows("store_localization").find((r) => r.creator_id === c.creator.id)
  check("no call made: the rests written by another run are honoured", gens.length === mark2, gens.slice(mark2).map((g) => g.model))
  check("the cron answers fine and the store stays queued for a retry", res.status === 200 && !!l4after?.translate_dirty_at, { status: res.status, row: l4after && { dirty: l4after.translate_dirty_at, run: l4after.auto_translate_run } })
  check("nothing written for it, so visitors see the original", j.rows("site_translations").filter((r) => r.creator_id === c.creator.id && r.locale === "it" && /Clay Pot/.test(String(r.value))).length === 0)

  section("7. What the owner sees at /admin/translations")
  const { readTranslationHealth } = await import("@/lib/admin/translation-health")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const health = await readTranslationHealth(createAdminClient())
  const gem = health.providers.find((p) => p.provider === "gemini")
  check("the log is there (part 305) and Gemini is set up", health.ready && gem?.setUp === true, { ready: health.ready, gem })
  check("its models and that every one is resting now", gem?.models[0] === "gemini-3.5-flash-lite" && gem?.status === "resting" && gem.resting.some((r) => r.why === "day"), gem)
  check("today's calls and texts", (health.days[0]?.calls ?? 0) === gens.length && (health.days[0]?.strings ?? 0) > 1000, health.days[0])
  check("the settings by name, never a value", health.settings.some((x) => x.name === "GEMINI_API_KEY" && x.set === true) && !JSON.stringify(health).includes("journey-gemini"))

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * The owner's worry: "if someone changes a word in English or another
 * language, will it translate again automatically and interfere with their
 * work?" No, and this proves it on every path that writes a translation:
 *
 *   the Translate with AI round (lib/markets/translation-press.ts draftRound,
 *   also what the background job runs) and its putting old AI drafts live;
 *   the automatic run (lib/markets/auto-translate.ts autoTranslateStore);
 *   the Translate sheet's own save (app/api/store/translations PUT);
 *   a change to the words not to translate (lib/markets/server.ts saveGlossary).
 *
 * None replaces a translation the merchant wrote or edited, including when
 * they save it while a run is working (read again just before the write,
 * and SQL part 203's trigger in the database), and including the website's
 * default language when the theme is written in another (a Spanish store on
 * an English theme, the Spanish edited by hand). Also: the words not to
 * translate stay as written (or as their fixed translation) in every
 * language, and a text marked Don't translate shows its original and is
 * never written by Storelib AI. Against a real HTTP server standing in for
 * the model and a database that records every write.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { keepsTerms } from "@/lib/markets/draft-check"
import { cut, wordsOf } from "@/lib/markets/translate-segments"
import { changedTerms, hasTerms, keepsGlossary, keysWithTerms, prepareText, readGlossary, validateGlossary } from "@/lib/markets/glossary"
import { STALE_HASH, aiMayWrite, keptOriginal, needsReview, reusableTranslations, sourceHash, statusOf, translationMap, valueFor, type TranslationRow } from "@/lib/markets/translate"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const P1 = "b0000000-0000-4000-8000-0000000000b1"
const P2 = "b0000000-0000-4000-8000-0000000000b2"
const P3 = "b0000000-0000-4000-8000-0000000000b3"
const P4 = "b0000000-0000-4000-8000-0000000000b4"

/* The model: "FR " before every text; `renaming` makes it translate the brand too, as a careless translator would. */
let asked: { key: string; text: string }[] = []
let told: string[] = []
let renaming = false
function answer(req: IncomingMessage, res: ServerResponse) {
  let raw = ""
  req.on("data", (c) => { raw += c })
  req.on("end", () => {
    const body = JSON.parse(raw) as { instructions: string; input: { content: { text: string }[] }[] }
    told.push(body.instructions)
    const items = (JSON.parse(body.input[0].content[0].text) as { items: { key: string; text: string }[] }).items
    asked.push(...items)
    const text = JSON.stringify({ translations: items.map((i) => ({ key: i.key, text: `FR ${renaming ? i.text.replace(/Bloom/g, "Floraison") : i.text}` })) })
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ id: "resp", object: "response", created_at: 0, status: "completed", model: "test", output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }] }))
  })
}

/**
 * A database: rows by table, every write kept with its filters. `savedMeanwhile`:
 * keys the merchant saved while the run was working, so the run's first read
 * did not have them and only the read just before its write does.
 */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, opts: { savedMeanwhile?: string[]; missing?: string } = {}) {
  const writes: { table: string; kind: string; rows: unknown; filters: [string, unknown[]][] }[] = []
  return {
    writes,
    db: {
      from(table: string) {
        let single = false
        let manualOnly = false
        let columns = ""
        let writing: Record<string, unknown> | null = null
        const filters: [string, unknown[]][] = []
        const q: Record<string, unknown> = {}
        for (const m of ["in", "order", "limit", "range", "neq", "is", "not", "or", "ilike", "gte", "lte"]) q[m] = (...a: unknown[]) => { filters.push([m, a]); return q }
        q.delete = () => { writes.push({ table, kind: "delete", rows: null, filters }); return q }
        q.select = (c?: string) => { if (!writing) columns = c ?? ""; return q }
        q.eq = (col: string, v: unknown) => { filters.push(["eq", [col, v]]); if (col === "source" && v === "manual") manualOnly = true; return q }
        q.maybeSingle = () => { single = true; return q }
        q.single = () => { single = true; return q }
        q.upsert = (rows: unknown) => { writes.push({ table, kind: "upsert", rows, filters }); return Promise.resolve({ error: null }) }
        q.update = (rows: Record<string, unknown>) => { writing = rows; writes.push({ table, kind: "update", rows, filters }); return q }
        q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          if (writing) return Promise.resolve({ data: [], error: null }).then(ok, bad)
          const named = (x: unknown) => typeof x === "string" && !!opts.missing && x.includes(opts.missing)
          if (opts.missing && named(columns)) return Promise.resolve({ data: null, error: { code: "42703", message: `column store_localization.${opts.missing} does not exist` } }).then(ok, bad)
          let rows = tables[table] ?? []
          if (manualOnly) {
            rows = rows.filter((r) => r.source === "manual")
            for (const k of opts.savedMeanwhile ?? []) rows = [...rows, { key: k, source: "manual" }]
          }
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(ok, bad)
        }
        return q
      },
    },
  }
}
const upserted = (writes: { table: string; kind: string; rows: unknown }[]) => writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Record<string, unknown>[])

const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "manual", ...extra })
const dbRow = (key: string, value: string, source: string, by: "manual" | "ai", status = "approved") => ({ key, value, source_hash: sourceHash(source), status, source: by })

async function main() {
  console.log("\nWords not to translate: the list")
  const g = readGlossary([{ term: "  Bloom  " }, "bloom", { term: "Gift card", as: { fr: "Carte cadeau", xx_bad: "x", de: "  " } }, { term: "a" }, { term: "<b>" }, 42])
  check("each word once whatever its capitals, trimmed, too short or markup dropped", g.length === 2 && g[0].term === "Bloom" && g[1].term === "Gift card", g)
  check("  a fixed translation only for a real language and only when it says something", JSON.stringify(g[1].as) === JSON.stringify({ fr: "Carte cadeau" }), g[1])
  check("the page is told why a word is refused", validateGlossary([{ term: "x" }]).ok === false && validateGlossary([{ term: "{{ x }}" }]).ok === false && validateGlossary("Bloom").ok === false && validateGlossary([{ term: "Bloom" }]).ok === true)

  console.log("\nWords not to translate: protected before the translator, checked after")
  const bloom = readGlossary([{ term: "Bloom" }])
  const p1 = prepareText("Bloom candles, made by BLOOM in Bloomsbury.", bloom, "fr")
  check("found whatever its capitals, a whole word only (not in Bloomsbury), kept as the text spells it", p1.text === "Bloom candles, made by BLOOM in Bloomsbury." && p1.keep.sort().join() === "BLOOM,Bloom", p1)
  check("  an open model never sees it: it is cut out with the placeholders", wordsOf(cut(p1.text, p1.keep)).join("|") === "candles, made by|in Bloomsbury.", wordsOf(cut(p1.text, p1.keep)))
  const fixed = readGlossary([{ term: "Gift card", as: { fr: "Carte cadeau" } }])
  const p2 = prepareText('<p>A <a href="/gift-card">gift card</a> for you</p>', fixed, "fr")
  check("a fixed translation put in its place before translating, never inside a tag or a link", p2.text === '<p>A <a href="/gift-card">Carte cadeau</a> for you</p>' && p2.keep.join() === "Carte cadeau", p2)
  check("  in another language it stays as written", prepareText("A gift card", fixed, "de").text === "A gift card" && prepareText("A gift card", fixed, "de").keep.join() === "gift card")
  check("rich text holds it escaped: found as it is held", hasTerms("<p>Salt &amp; Pepper mugs</p>", readGlossary([{ term: "Salt & Pepper" }])))
  check("a text with none of the words goes unchanged, with nothing to keep", JSON.stringify(prepareText("Free shipping", bloom, "fr")) === JSON.stringify({ text: "Free shipping", keep: [] }))
  check("kept: as many times as the original has it", keepsGlossary("Bloom by Bloom", "FR Bloom par Bloom", bloom, "fr") && !keepsGlossary("Bloom by Bloom", "FR Bloom par Floraison", bloom, "fr") && !keepsGlossary("Bloom candles", "Bougies Floraison", bloom, "fr"))
  check("  a fixed translation must come back as the fixed word", keepsGlossary("A gift card", "Une Carte cadeau", fixed, "fr") && !keepsGlossary("A gift card", "Une carte-cadeau", fixed, "fr"))
  check("the count check itself, whole words only", keepsTerms("A A", "A A", ["A"]) && !keepsTerms("A A", "A", ["A"]) && keepsTerms("x", "y", ["A"]) && keepsTerms("Bloomsbury mugs", "Tasses Bloomsburry", ["Bloom"]) && !keepsTerms("Bloom, Bloomsbury", "Bloomsbury", ["Bloom"]))

  console.log("\nWords not to translate: a change refreshes only the texts it touches")
  check("added, taken away, a fixed translation changed: changed; the same list: nothing", changedTerms([], bloom).length === 1 && changedTerms(bloom, []).length === 1 && changedTerms(fixed, readGlossary([{ term: "Gift card", as: { fr: "Bon cadeau" } }])).length === 1 && changedTerms(bloom, readGlossary([{ term: "bloom" }])).length === 1 && changedTerms(bloom, bloom).length === 0)
  check("the texts with the word, and only those", keysWithTerms([{ key: "a", source: "Bloom mug" }, { key: "b", source: "Plain mug" }, { key: "c", source: '<a href="/bloom">Shop</a>' }], bloom).join() === "a")

  console.log("\nDon't translate: the original, as it is now")
  const kept = row("section:s1:heading", "Hello", "Hello")
  check("saved as the merchant's own with the original as its value", keptOriginal(kept) && !keptOriginal(row("k", "Bonjour", "Hello")) && !keptOriginal({ ...kept, source: "ai" }))
  check("the website shows the original, and its later edit too, never the old words", valueFor(translationMap([kept]), kept.key, { approvedOnly: true, fresh: true }, "Hello there") === null)
  check("  never outdated, never Needs review, never Storelib AI's to write", statusOf(kept, "Hello there") === "done" && !needsReview(kept, "Hello there") && !aiMayWrite(kept, "Hello there") && !aiMayWrite(kept, "Hello"))
  check("  a choice for that one text: never reused for the same words elsewhere", !reusableTranslations([kept]).has(sourceHash("Hello")))

  console.log("\nThe rule, row by row")
  check("missing: Storelib AI writes it", aiMayWrite(undefined, "Mug"))
  check("Storelib AI's with a changed original: written again", aiMayWrite(row("k", "Tasse", "Mug", { source: "ai" }), "Big mug"))
  check("Storelib AI's marked by a glossary change: written again", aiMayWrite({ ...row("k", "Tasse", "Mug", { source: "ai" }), sourceHash: STALE_HASH }, "Mug") && valueFor(translationMap([{ ...row("menu:m:0", "Tasse", "Mug", { source: "ai" }), sourceHash: STALE_HASH }]), "menu:m:0", { approvedOnly: true, fresh: true }, "Mug") === null)
  check("the merchant's, its original the same or changed: never", !aiMayWrite(row("k", "Tasse", "Mug"), "Mug") && !aiMayWrite(row("k", "Tasse", "Mug"), "Big mug"))
  check("  changed, still on the website as they wrote it, and listed to look at", valueFor(translationMap([row("menu:m:0", "Tasse", "Mug")]), "menu:m:0", { approvedOnly: true, fresh: true }, "Big mug") === "Tasse" && needsReview(row("k", "Tasse", "Mug"), "Big mug"))

  /* ── Against a model and a database ─────────────────────────────────── */
  const http = createServer(answer)
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r))
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.OPENAI_API_KEY = "test-key"
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(http.address() as AddressInfo).port}/v1`
  const { saveTranslations, saveGlossary, GLOSSARY_NEEDS_PART } = await import("@/lib/markets/server")
  const { draftRound } = await import("@/lib/markets/translation-press")
  const { autoTranslateStore } = await import("@/lib/markets/auto-translate")

  const english = "Hand thrown stoneware for the table and the kitchen. Each piece is made by hand in our studio, glazed with care, and fired twice so it is strong enough for the oven and the dishwasher. Shop the new collection now and find a mug, a bowl or a plate you will use every day for years."
  const store = (over: Record<string, unknown> = {}) => ({
    store_localization: [{ creator_id: "c1", default_language: "en", languages: [{ code: "fr", published: true }], markets: [], visitor_language: false, auto_translate: true, auto_translate_run: {}, ...over }],
    products: [
      { id: P1, title: "Bloom mug", description: "", seo_title: "", seo_description: "" },
      { id: P2, title: "Gift card", description: "", seo_title: "", seo_description: "" },
      { id: P3, title: "Plate", description: "", seo_title: "", seo_description: "" },
      { id: P4, title: "Bowl", description: english, seo_title: "", seo_description: "" },
    ],
    site_translations: [] as Record<string, unknown>[],
  })

  console.log("\nTranslate with AI (the press, and the background job), never the merchant's")
  asked = []
  const press = fakeDb({ ...store(), site_translations: [dbRow(`product:${P3}:title`, "Assiette", "Old plate", "manual"), dbRow(`product:${P2}:title`, "Carte", "Gift card", "ai", "draft")] })
  const round = await draftRound(press.db as never, "c1", "fr", "u1", Date.now() + 60_000)
  const pressWrites = upserted(press.writes)
  check("ran and wrote", round.ok && pressWrites.length > 0, round)
  check("the merchant's own (outdated) is neither sent nor written", !asked.some((a) => a.key === `product:${P3}:title`) && !pressWrites.some((w) => w.key === `product:${P3}:title`))
  check("an old AI draft is put live as it is, still Storelib AI's", pressWrites.some((w) => w.key === `product:${P2}:title` && w.status === "approved" && w.source === "ai" && w.value === "Carte"))
  check("every write of the round is labelled Storelib AI's, so the merchant's next edit always wins", pressWrites.every((w) => w.source === "ai"))

  console.log("\nThe merchant saves while a run is working")
  asked = []
  const race = fakeDb(store(), { savedMeanwhile: [`product:${P1}:title`] })
  await autoTranslateStore(race.db as never, "c1", Date.now() + 60_000)
  const raceWrites = upserted(race.writes)
  check("the run had sent it (it was missing when the run read)", asked.some((a) => a.key === `product:${P1}:title`))
  check("  but read again just before the write, it is theirs now: not written", !raceWrites.some((w) => w.key === `product:${P1}:title`) && raceWrites.length > 0, raceWrites.map((w) => w.key))
  asked = []
  const racePress = fakeDb(store(), { savedMeanwhile: [`product:${P1}:title`] })
  await draftRound(racePress.db as never, "c1", "fr", null, Date.now() + 60_000)
  check("  the same in the press and the background job", !upserted(racePress.writes).some((w) => w.key === `product:${P1}:title`))
  /* The database's own line, for a save landing between that read and the write. */
  const p203 = read("supabase/sql/run-now/203_translation_glossary.sql")
  check("  and in the database: an AI write over the merchant's own is skipped (SQL part 203's trigger)", /IF OLD\.source = 'manual' AND NEW\.source = 'ai' THEN RETURN NULL; END IF; RETURN NEW;/.test(p203) && /CREATE TRIGGER site_translations_keep_manual BEFORE UPDATE ON public\.site_translations FOR EACH ROW/.test(p203))

  console.log("\nThe Translate sheet's own save")
  const sheetDb = fakeDb({ site_translations: [dbRow("section:s1:heading", "Mon titre", "Hello", "manual")] })
  await saveTranslations(sheetDb.db as never, "c1", "fr", [{ key: "section:s1:heading", value: "Titre IA", source: "Hello", approved: true, ai: true }, { key: "section:s2:heading", value: "Merci", source: "Thanks", approved: true, ai: true }], "u1")
  const sheetWrites = upserted(sheetDb.writes)
  check("an AI draft approved from a sheet opened before the merchant edited it elsewhere never goes back over their edit", !sheetWrites.some((w) => w.key === "section:s1:heading") && sheetWrites.some((w) => w.key === "section:s2:heading"), sheetWrites)
  const editDb = fakeDb({ site_translations: [dbRow("section:s1:heading", "Titre IA", "Hello", "ai")] })
  await saveTranslations(editDb.db as never, "c1", "fr", [{ key: "section:s1:heading", value: "Mon titre", source: "Hello", approved: true }], "u1")
  check("the merchant's edit always lands, and is theirs from then on", upserted(editDb.writes).some((w) => w.key === "section:s1:heading" && w.value === "Mon titre" && w.source === "manual"))
  const keepDb = fakeDb({ site_translations: [] })
  await saveTranslations(keepDb.db as never, "c1", "fr", [{ key: "section:s1:heading", value: "", source: "Hello <b>there</b>", approved: true, original: true }, { key: "section:s2:text", value: "", source: "<p>Hi <script>x</script>there</p>", approved: true, original: true, rich: true }], "u1")
  const keepWrites = upserted(keepDb.writes)
  const plainKept = keepWrites.find((w) => w.key === "section:s1:heading")
  const richKept = keepWrites.find((w) => w.key === "section:s2:text")
  check("Don't translate saves the original as the merchant's own, approved", plainKept?.value === "Hello there" && plainKept?.source === "manual" && plainKept?.status === "approved", plainKept)
  check("  cleaned as any value is, and still read as kept", !!richKept && !/script/.test(String(richKept.value)) && richKept.source_hash === sourceHash(String(richKept.value)) && keptOriginal({ key: "k", value: String(richKept.value), sourceHash: String(richKept.source_hash), status: "approved", source: "manual" }), richKept)
  let failedRead = false
  const blind = { from: () => { const q: Record<string, unknown> = {}; for (const m of ["select", "eq", "in"]) q[m] = () => q; q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "timeout" } }).then(ok); q.upsert = () => { failedRead = true; return Promise.resolve({ error: null }) }; return q } }
  const blindOut = await saveTranslations(blind as never, "c1", "fr", [{ key: "section:s9:heading", value: "X", source: "Y", approved: true, ai: true }], null, { keepManual: true })
  check("an AI write that cannot read which are the merchant's writes nothing, and is tried again", blindOut.ok === false && !failedRead, blindOut)

  console.log("\nThe default language, when the theme is written in another")
  asked = []
  const spanish = () => ({ ...store({ default_language: "es", languages: [] }), site_translations: [dbRow(`product:${P1}:title`, "Taza Bloom de la casa", "Bloom mug", "manual"), dbRow(`product:${P4}:description`, "Mi propia descripción", english, "manual")] })
  const esRun = fakeDb(spanish())
  const esOut = await autoTranslateStore(esRun.db as never, "c1", Date.now() + 60_000)
  const esWrites = upserted(esRun.writes)
  check("the automatic run translates the theme's English into the Spanish the website shows", !!esOut && esWrites.some((w) => w.key === `product:${P3}:title`), { esOut, keys: esWrites.map((w) => w.key) })
  check("  the Spanish the owner edited in the review sheet sticks: not sent, not written", !asked.some((a) => a.key === `product:${P1}:title` || a.key === `product:${P4}:description`) && !esWrites.some((w) => w.key === `product:${P1}:title` || w.key === `product:${P4}:description`))
  asked = []
  const esPress = fakeDb(spanish())
  const esRound = await draftRound(esPress.db as never, "c1", "es", "u1", Date.now() + 60_000)
  check("  the same through Translate (the press and the background job)", esRound.ok && !upserted(esPress.writes).some((w) => w.key === `product:${P1}:title` || w.key === `product:${P4}:description`) && upserted(esPress.writes).length > 0, esRound)
  check("  the owner may write it there: the route lets every text of the default language be saved when it is written in another", /const own = isDefault && \(scope === "all" \|\| !isEnglish\(locale!\)\)/.test(read("app/api/store/translations/route.ts")))

  console.log("\nWords not to translate, in a run")
  asked = []
  told = []
  const words = [{ term: "Bloom" }, { term: "Gift card", as: { fr: "Carte cadeau" } }]
  const glossRun = fakeDb(store({ translation_glossary: words }))
  await autoTranslateStore(glossRun.db as never, "c1", Date.now() + 60_000)
  const glossWrites = upserted(glossRun.writes)
  check("the translator is told the words to keep", told.some((t) => /never translates these words[^\n]*"Bloom"/.test(t)))
  check("  a text with the brand keeps it", glossWrites.find((w) => w.key === `product:${P1}:title`)?.value === "FR Bloom mug", glossWrites.find((w) => w.key === `product:${P1}:title`))
  check("  a fixed translation goes in as the fixed word, never sent to be translated", glossWrites.find((w) => w.key === `product:${P2}:title`)?.value === "Carte cadeau" && !asked.some((a) => a.key === `product:${P2}:title`), glossWrites.find((w) => w.key === `product:${P2}:title`))
  asked = []
  renaming = true
  const careless = fakeDb(store({ translation_glossary: words }))
  await autoTranslateStore(careless.db as never, "c1", Date.now() + 60_000)
  renaming = false
  check("a translation that translated the brand anyway is not kept: the original shows, and it is tried again", asked.some((a) => a.key === `product:${P1}:title`) && !upserted(careless.writes).some((w) => w.key === `product:${P1}:title`) && upserted(careless.writes).some((w) => w.key === `product:${P3}:title`))
  asked = []
  const reuse = fakeDb({ ...store({ translation_glossary: words }), products: [{ id: P1, title: "Bloom mug", description: "", seo_title: "", seo_description: "" }, { id: P3, title: "Plate", description: "", seo_title: "", seo_description: "" }], site_translations: [dbRow("menu:main:0", "Tasse Floraison", "Bloom mug", "ai")] })
  await autoTranslateStore(reuse.db as never, "c1", Date.now() + 60_000)
  check("one written before the word was listed is not reused for the same text elsewhere", upserted(reuse.writes).find((w) => w.key === `product:${P1}:title`)?.value === "FR Bloom mug")
  check("before part 203 nothing changes: the list reads empty and the run goes on", (await autoTranslateStore(fakeDb(store(), { missing: "translation_glossary" }).db as never, "c1", Date.now() + 60_000)) !== null)

  console.log("\nChanging the list")
  const before = store({ translation_glossary: [{ term: "Plate" }] })
  const change = fakeDb(before)
  const saved = await saveGlossary(change.db as never, "c1", [{ term: "Plate" }, { term: "Bloom" }])
  const stale = change.writes.filter((w) => w.table === "site_translations" && w.kind === "update")
  check("saved", saved.ok && saved.value.length === 2, saved)
  check("Storelib AI's translations of the texts with the new word are marked to write again", stale.length === 1 && (stale[0].rows as Record<string, unknown>).source_hash === STALE_HASH && stale[0].filters.some(([m, a]) => m === "in" && (a[1] as string[]).includes(`product:${P1}:title`) && !(a[1] as string[]).includes(`product:${P3}:title`)), stale.map((w) => w.filters))
  check("  Storelib AI's only: never the merchant's own, never one kept as the original", stale.every((w) => w.filters.some(([m, a]) => m === "eq" && a[0] === "source" && a[1] === "ai")))
  check("  and the store is queued for the next automatic run", change.writes.some((w) => w.table === "store_localization" && typeof (w.rows as Record<string, unknown>).translate_dirty_at === "string"))
  const same = fakeDb(store({ translation_glossary: [{ term: "Plate" }] }))
  await saveGlossary(same.db as never, "c1", [{ term: "Plate" }])
  check("the same list saved again touches no translation", !same.writes.some((w) => w.table === "site_translations"))
  const old = await saveGlossary(fakeDb(store(), { missing: "translation_glossary" }).db as never, "c1", [{ term: "Bloom" }])
  check("before part 203 it says what to run", old.ok === false && old.error === GLOSSARY_NEEDS_PART && /Run SQL part 203 in Supabase/.test(GLOSSARY_NEEDS_PART))
  const none = await saveGlossary(fakeDb({ store_localization: [] }).db as never, "c1", [{ term: "Bloom" }])
  check("a store that never saved its languages is told to add one first", none.ok === false && /Add a language first/.test(none.error))
  http.close()

  console.log("\nWhat the owner sees")
  const panel = read("components/app/settings/markets-panel.tsx")
  check("the rule, in one line, under the languages", /tt\("Your edits are never replaced\. Machine translations update when you change the original\."\)/.test(panel) && /data-translation-rule=""/.test(panel))
  check("Words not to translate in Languages & Currency, under More options", /<TranslationGlossary languages=\{/.test(panel) && panel.indexOf("<TranslationGlossary") > panel.indexOf("data-language-options"))
  const glossary = read("components/app/settings/translation-glossary.tsx")
  check("  a word added, removed, or given a fixed translation per language, saved as it is changed", /tt\("Words not to translate"\)/.test(glossary) && /data-glossary-add=""/.test(glossary) && /data-glossary-remove=/.test(glossary) && /data-glossary-as=\{code\}/.test(glossary) && /method: "PUT", body: \{ glossary: next \}/.test(glossary))
  check("  says how many machine translations a change refreshes", /machine translations will update\./.test(glossary))
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("Don't translate on each text of the Translate sheet, and Translate it to take it back", /tt\("Don't translate"\)/.test(sheet) && /tt\("Translate it"\)/.test(sheet) && /original: true/.test(sheet) && /kept: \{ get label\(\) \{ return tt\("Not translated"\) \}/.test(sheet))
  check("  the route says which are kept and never hands their old words to the field", /const kept = keptOriginal\(row\)/.test(read("app/api/store/translations/route.ts")) && /value: kept \? "" :/.test(read("app/api/store/translations/route.ts")))
  const copy = [panel.split("data-translation-rule")[1]?.slice(0, 300) ?? "", glossary, sheet.split("DON'T TRANSLATE, ONE TEXT")[1]?.slice(0, 1200) ?? ""].join("\n")
  check("no em dash and none of the banned words in the new copy", !/—/.test(copy) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(copy))

  console.log("\nSQL part 203")
  check("one statement a line, guarded, safe to run again, schema reloaded last", p203.trim().split("\n").length === 6 && /ADD COLUMN IF NOT EXISTS translation_glossary jsonb NOT NULL DEFAULT '\[\]'::jsonb/.test(p203) && /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'store_localization_glossary_array'\)/.test(p203) && /DROP TRIGGER IF EXISTS site_translations_keep_manual/.test(p203) && /run part 136 first/.test(p203) && /notify pgrst, 'reload schema';$/.test(p203.trim()))
  check("  the same as its migration, checked after, and in the bundles", p203 === read("supabase/migrations/20270129_translation_glossary.sql") && /as p203_translation_glossary/.test(read("supabase/sql/run-now/99_check_after.sql")) && /203_translation_glossary\.sql/.test(read("scripts/build-currency-cod-languages-sql.py")) && read("supabase/sql/store-currency-cod-languages/1_run.sql").includes(p203.split("\n")[1]) && read("supabase/sql/all-in-two/1_of_2_everything.sql").includes(p203.split("\n")[2]) && /part: "203", file: "203_translation_glossary\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()

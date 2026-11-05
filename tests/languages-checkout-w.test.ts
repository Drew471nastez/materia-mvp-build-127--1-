/**
 * Round W3: Settings › Checkout and Languages & Currency.
 *
 *   1. Checkout text sits above Abandoned checkouts, with anchors
 *   2. a glossary term as the form checks it (checkTerm) and as it is kept
 *      (validateRules): trimmed, 2 to 80 characters, no duplicate, a
 *      translation unless kept, translations for a removed language carried
 *   3. a glossary change reaches what is already translated: the terms that
 *      changed, the texts that use them, Storelib AI's live translations
 *      written again through the existing per-text press with the glossary
 *      applied, never a person's, and the live website showing the result
 *   4. Keep product names as written: on for a store that never chose,
 *      unless Storelib AI already translates its titles; a saved choice
 *      always wins and is never dropped by a save that does not name it
 *   5. nothing moves: the row of actions, the loading cards
 *   6. one name per state, everywhere a translation's state is said
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MAX_TERM,
  MAX_TERM_TRANSLATION,
  applyGlossary,
  changedTerms,
  checkTerm,
  emptyRules,
  isExcluded,
  keepProductNamesDefault,
  productNamesChosen,
  rulesFrom,
  textsWithTerms,
  validateRules,
  type GlossaryTerm,
  type TranslationRules,
} from "@/lib/markets/translation-rules"
import { localizeSections, sourceHash, translationMap, type TranslationRow } from "@/lib/markets/translate"
import { saveTranslationRules, translationRulesOf } from "@/lib/markets/server"
import { planGlossaryRewrite, rewriteForGlossary } from "@/lib/markets/translation-press"
import type { SchemaField, SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A database: rows by table, filtered by eq, in and like, every write kept ── */
type Row = Record<string, unknown>
type Write = { table: string; kind: "upsert" | "update" | "delete" | "insert"; rows: unknown; filters: [string, unknown[]][] }
function fakeDb(tables: Record<string, Row[]>) {
  const writes: Write[] = []
  const reads: { table: string; columns: string; filters: [string, unknown[]][] }[] = []
  return {
    writes,
    reads,
    db: {
      from(table: string) {
        let single = false
        let columns = ""
        let kind: Write["kind"] | null = null
        let payload: unknown = null
        const filters: [string, unknown[]][] = []
        const q: Record<string, unknown> = {}
        for (const m of ["order", "limit", "range", "neq", "is", "not", "or", "ilike", "gte", "lte"]) q[m] = (...a: unknown[]) => { filters.push([m, a]); return q }
        q.select = (c?: string) => { if (!kind) columns = c ?? ""; return q }
        q.eq = (col: string, v: unknown) => { filters.push(["eq", [col, v]]); return q }
        q.in = (col: string, v: unknown[]) => { filters.push(["in", [col, v]]); return q }
        q.like = (col: string, v: string) => { filters.push(["like", [col, v]]); return q }
        q.maybeSingle = () => { single = true; return q }
        q.single = () => { single = true; return q }
        q.upsert = (rows: unknown) => { kind = "upsert"; payload = rows; return q }
        q.insert = (rows: unknown) => { kind = "insert"; payload = rows; return q }
        q.update = (rows: unknown) => { kind = "update"; payload = rows; return q }
        q.delete = () => { kind = "delete"; return q }
        q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          let rows = tables[table] ?? []
          for (const [m, a] of filters) {
            if (m === "eq") rows = rows.filter((r) => !((a[0] as string) in r) || r[a[0] as string] === a[1])
            if (m === "in") rows = rows.filter((r) => !((a[0] as string) in r) || (a[1] as unknown[]).includes(r[a[0] as string]))
            if (m === "like") {
              const re = new RegExp(`^${String(a[1]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`)
              rows = rows.filter((r) => re.test(String(r[a[0] as string] ?? "")))
            }
          }
          if (kind) {
            writes.push({ table, kind, rows: payload, filters })
            /* An update answers the rows it reached, as .select() after it does. */
            return Promise.resolve({ data: kind === "update" ? rows : null, error: null }).then(ok, bad)
          }
          reads.push({ table, columns, filters })
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
        }
        return q
      },
    },
  }
}

const P1 = "10000000-0000-4000-8000-000000000001"

async function main() {
  console.log("\n1. Checkout text above Abandoned checkouts")
  {
    const panel = read("components/app/settings/checkout-panel.tsx")
    const text = panel.indexOf("<CheckoutTextCard />")
    const abandoned = panel.indexOf('title={tt("Abandoned checkouts")}')
    const accounts = panel.indexOf('title={tt("Customer accounts")}')
    check("the Checkout text card is drawn before Abandoned checkouts, once", text > 0 && abandoned > 0 && text < abandoned && panel.split("<CheckoutTextCard />").length === 2)
    check("  after Customer accounts, so the first card stays where it was", accounts > 0 && accounts < text)
    check("  each has an anchor, #checkout-text and #abandoned-checkouts", /<Card id="checkout-text" title=\{tt\("Checkout text"\)\}/.test(panel) && /<Card id="abandoned-checkouts" title=\{tt\("Abandoned checkouts"\)\}/.test(panel))
    check("  a link to either lands on it once the page is drawn", /window\.location\.hash\.slice\(1\)/.test(panel) && /scrollIntoView\(\{ block: "start" \}\)/.test(panel))
    check("  the glossary links to it", /href="\/app\/settings\?tab=checkout#checkout-text"/.test(read("components/app/settings/translation-glossary.tsx")))
    check("  the editor it opens is unchanged", /\{open \? <CheckoutTextEditor onClose=\{\(\) => setOpen\(false\)\} \/> : null\}/.test(panel))
  }

  console.log("\n2. A glossary term, checked")
  {
    const others: GlossaryTerm[] = [{ term: "Storelib Pro", keep: true }]
    const langs = ["fr", "ro"]
    const kept = checkTerm({ term: "  Gift   card ", keep: true, to: {} }, others, langs)
    check("trimmed and spaces tidied, kept as written", kept.ok === true && kept.value.term === "Gift card" && kept.value.keep === true && !kept.value.to)
    const short = checkTerm({ term: " G ", keep: true, to: {} }, others, langs)
    check("one letter is too short", short.ok === false && (short as { problem: string }).problem === "short")
    const long = checkTerm({ term: "x".repeat(MAX_TERM + 1), keep: true, to: {} }, others, langs)
    check(`over ${MAX_TERM} characters is too long, never cut short silently`, long.ok === false && (long as { problem: string }).problem === "long")
    const dup = checkTerm({ term: "storelib PRO", keep: true, to: {} }, others, langs)
    check("a term already there in other letters is a duplicate", dup.ok === false && (dup as { problem: string }).problem === "duplicate")
    const self = checkTerm({ term: "Storelib Pro", keep: true, to: {} }, [], langs, others[0])
    check("  the term being edited is not its own duplicate", self.ok === true)
    const none = checkTerm({ term: "Gift card", keep: false, to: { fr: "  " } }, others, langs)
    check("Translate as with no translation asks for one, under the first language", none.ok === false && (none as { problem: string; field: string }).problem === "noTranslation" && (none as { field: string }).field === "fr")
    const tooLong = checkTerm({ term: "Gift card", keep: false, to: { ro: "y".repeat(MAX_TERM_TRANSLATION + 1) } }, others, langs)
    check("a translation over its limit is said under its own field", tooLong.ok === false && (tooLong as { problem: string; field: string }).problem === "translationLong" && (tooLong as { field: string }).field === "ro")
    const to = checkTerm({ term: "Gift card", keep: false, to: { fr: " Carte  cadeau ", ro: "" } }, others, langs)
    check("translations trimmed, an empty language left out", to.ok === true && JSON.stringify(to.value) === JSON.stringify({ term: "Gift card", to: { fr: "Carte cadeau" } }))
    const carried = checkTerm({ term: "Gift card", keep: false, to: { fr: "Bon cadeau" } }, [], ["fr"], { term: "Gift card", to: { fr: "Carte cadeau", de: "Geschenkkarte" } })
    check("a translation for a language the store removed is carried over, never dropped", carried.ok === true && carried.value.to?.de === "Geschenkkarte" && carried.value.to?.fr === "Bon cadeau")
    const kept2 = validateRules({ glossary: [{ term: " Gift card " , to: { fr: "Carte cadeau" } }, { term: "gift CARD", keep: true }, { term: "x" }] })
    check("the server keeps the same: trimmed, the duplicate and the one letter dropped", kept2.ok === true && kept2.value.glossary.length === 1 && kept2.value.glossary[0].term === "Gift card")
    check("  and refuses more than 200 terms", validateRules({ glossary: Array.from({ length: 201 }, (_, i) => ({ term: `term ${i}` })) }).ok === false)
    const ui = read("components/app/settings/translation-glossary.tsx")
    check("the form uses the same check, and says each problem in words", /const checked = checkTerm\(form, others, languages, was\)/.test(ui) && ["short", "long", "duplicate", "noTranslation", "translationLong"].every((p) => new RegExp(`case "${p}":`).test(ui)))
    check("add, edit and remove each save at once; remove has Undo", /data-add-glossary-term/.test(ui) && /data-edit-glossary-term/.test(ui) && /data-remove-glossary-term/.test(ui) && /data-glossary-undo/.test(ui) && /api<\{ rules: TranslationRules; rewriting\?: number \}>\("\/api\/store\/translations\/rules", \{ method: "PUT"/.test(ui))
    check("an empty list says what a term is in one line, with an example", /No terms yet\. Add your brand, like “Storelib Pro”, to keep it as written in every language\./.test(ui))
  }

  console.log("\n3. A glossary change reaches what is already translated")
  {
    const before: GlossaryTerm[] = [{ term: "Storelib Pro", keep: true }, { term: "Gift card", to: { fr: "Carte cadeau" } }]
    check("nothing changed: no term", changedTerms(before, before, "fr").length === 0)
    check("a term added", changedTerms(before, [...before, { term: "Mug club", keep: true }], "fr").join() === "Mug club")
    check("a translation changed, for that language only", changedTerms(before, [before[0], { term: "Gift card", to: { fr: "Bon cadeau" } }], "fr").join() === "Gift card" && changedTerms(before, [before[0], { term: "Gift card", to: { fr: "Bon cadeau" } }], "ro").length === 0)
    check("a term removed, or kept instead of translated", changedTerms(before, [before[1]], "fr").join() === "Storelib Pro" && changedTerms(before, [before[0], { term: "Gift card", keep: true }], "ro").join() === "Gift card")
    const texts = [{ key: "a", source: "Buy a Gift card" }, { key: "b", source: "Gift cardigan" }, { key: "c", source: "Our story" }]
    check("the texts that use a term, as a whole word or phrase", textsWithTerms(texts, ["Gift card"]).map((t) => t.key).join() === "a")

    const rules = { glossary: [{ term: "Gift card", to: { fr: "Carte cadeau" } }], noTranslate: [], keepProductNames: true }
    const tables = (): Record<string, Row[]> => ({
      store_localization: [{ creator_id: "store-a", default_language: "en", languages: [{ code: "fr", published: true }, { code: "ro", published: false }], markets: [{ id: "primary", name: "Home", primary: true, countries: [] }], translation_rules: rules }],
      products: [{ id: P1, creator_id: "store-a", status: "published", title: "Linen apron", description: "Wrap it with a Gift card.", seo_title: "", seo_description: "" }],
      site_translations: [
        { creator_id: "store-a", locale: "fr", key: `product:${P1}:description`, value: "Emballez-le avec une carte-cadeau.", source_hash: sourceHash("Wrap it with a Gift card."), status: "approved", source: "ai" },
        { creator_id: "store-a", locale: "ro", key: `product:${P1}:description`, value: "Împachetează-l cu un card cadou.", source_hash: sourceHash("Wrap it with a Gift card."), status: "approved", source: "manual" },
        { creator_id: "store-a", locale: "fr", key: `product:${P1}:seo_title`, value: "x", source_hash: sourceHash("y"), status: "approved", source: "ai" },
      ],
    })
    const was: TranslationRules = { glossary: [], noTranslate: [], keepProductNames: true }
    const planned = fakeDb(tables())
    const plan = await planGlossaryRewrite(planned.db, "store-a", was, rules)
    check("planned: Storelib AI's French translation of the text that uses the new term, not the person's Romanian one", plan.length === 1 && plan[0].locale === "fr" && plan[0].items.length === 1 && plan[0].items[0].key === `product:${P1}:description`, plan)
    const quiet = fakeDb(tables())
    check("  a save of the product names switch alone reads no texts at all", (await planGlossaryRewrite(quiet.db, "store-a", rules, { ...rules, keepProductNames: false })).length === 0 && !quiet.reads.some((r) => r.table === "products"))

    const asked: { items: { key: string; source: string }[]; memory: string[]; rules: unknown }[] = []
    const run = fakeDb(tables())
    const written = await rewriteForGlossary(run.db, "store-a", [{ locale: "fr", items: [{ key: `product:${P1}:description`, source: "Wrap it with a Gift card.", rich: false }, { key: `product:${P1}:seo_title`, source: "Gift card shop", rich: false }] }], "u1", Date.now() + 60_000, {
      /* The translator: the words around the term translated, then the glossary put in, as translate-ai.ts does after either model. */
      draft: async (items, memory, _from, to, _shop, opts) => {
        asked.push({ items, memory: memory.map((m) => m.key), rules: opts?.rules })
        return { drafts: new Map(items.map((i) => [i.key, applyGlossary(i.source.replace("Wrap it with a", "Emballez-le avec une").replace(" shop", ""), opts?.rules as TranslationRules, to)])), unavailable: false, reused: 0 }
      },
    })
    check("written again through the per-text press, with the store's glossary handed to the translator", written === 2 && asked.length === 1 && JSON.stringify((asked[0].rules as TranslationRules).glossary) === JSON.stringify(rules.glossary), { written, asked })
    check("  their old words are not reused as memory for each other", asked[0].memory.every((k) => k !== `product:${P1}:description` && k !== `product:${P1}:seo_title`), asked[0]?.memory)
    const up = run.writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Row[])
    const desc = up.find((r) => r.key === `product:${P1}:description`)
    check("  saved as Storelib AI's, live, with the glossary's words", desc?.value === "Emballez-le avec une Carte cadeau." && desc?.source === "ai" && desc?.status === "approved" && desc?.locale === "fr", up)
    check("  the person's Romanian translation is never written", !up.some((r) => r.locale === "ro"))
    const FIELDS = [{ type: "text", id: "heading", label: "Heading" }] as SchemaField[]
    const section = { id: "s1", type: "hero", settings: { heading: "Wrap it with a Gift card." }, blocks: [] } as unknown as SectionInstance
    const row: TranslationRow = { key: "section:s1:heading", value: String(desc?.value ?? ""), sourceHash: String(desc?.source_hash ?? ""), status: "approved", source: "ai" }
    const [live] = localizeSections([section], translationMap([row]), () => FIELDS, () => [], { approvedOnly: true, fresh: true })
    check("  and the live website lays it over the original", (live.settings as Row).heading === "Emballez-le avec une Carte cadeau.")

    const route = read("app/api/store/translations/rules/route.ts")
    check("the route plans it from the rules before and after, answers how many, and writes after the answer", /planGlossaryRewrite\(c\.db, c\.creatorId, r\.before, r\.value\)/.test(route) && /after\(\(\) => rewriteForGlossary\(/.test(route) && /rewriting \}\)/.test(route))
    check("  only when Storelib AI is set up, a limited number of times an hour, the caller's own store", /if \(canDraftWithAi\(\)\)/.test(route) && /bucket: "site-translation-glossary"/.test(route) && /shopCaller\("website"\)/.test(route))
    const press = read("lib/markets/translation-press.ts")
    check("  never a person's translation, never a draft, never more than 200 texts a save", /row\?\.source === "ai" && row\.status === "approved"/.test(press) && /GLOSSARY_REWRITE_MAX = 200/.test(press) && /replaceManual: false, deadlineAt, draft: opts\.draft, fresh/.test(press))
  }

  console.log("\n4. Keep product names as written")
  {
    check("never chosen: on", rulesFrom(undefined).keepProductNames === true && rulesFrom({}).keepProductNames === true && keepProductNamesDefault(false) === true)
    check("never chosen, and Storelib AI already translates the titles: off, as it has worked", rulesFrom({}, { aiTitles: true }).keepProductNames === false && keepProductNamesDefault(true) === false)
    check("a saved choice always wins", rulesFrom({ keepProductNames: false }).keepProductNames === false && rulesFrom({ keepProductNames: true }, { aiTitles: true }).keepProductNames === true)
    check("before the database update nothing changes (off)", emptyRules().keepProductNames === false)
    check("what is saved keeps never chosen as never chosen", validateRules({ glossary: [] }).ok === true && !("keepProductNames" in (validateRules({ glossary: [] }) as { value: object }).value) && productNamesChosen({ keepProductNames: false }) && !productNamesChosen({}))
    check("on, a product title is left to its original; its description still translated", isExcluded(rulesFrom({}), `product:${P1}:title`) && !isExcluded(rulesFrom({}), `product:${P1}:description`))

    const store = (rules: unknown, rows: Row[] = []) => ({ store_localization: [{ creator_id: "store-a", translation_rules: rules }], site_translations: rows })
    const fresh = fakeDb(store({}))
    check("a store that never chose, nothing translated yet: on", (await translationRulesOf(fresh.db, "store-a")).rules.keepProductNames === true)
    const aiTitle = { creator_id: "store-a", locale: "fr", key: `product:${P1}:title`, value: "Tablier", source_hash: sourceHash("Apron"), status: "approved", source: "ai" }
    const translating = fakeDb(store({}, [aiTitle]))
    check("a store whose titles Storelib AI translated: off, nothing it had changes", (await translationRulesOf(translating.db, "store-a")).rules.keepProductNames === false)
    const manualOnly = fakeDb(store({}, [{ ...aiTitle, source: "manual" }]))
    check("  only a person's own title translations: on (theirs still show)", (await translationRulesOf(manualOnly.db, "store-a")).rules.keepProductNames === true)
    const chose = fakeDb(store({ keepProductNames: false }, []))
    const chosen = await translationRulesOf(chose.db, "store-a")
    check("a store that chose off stays off, and nothing more is read for it", chosen.rules.keepProductNames === false && chosen.namesChosen === true && !chose.reads.some((r) => r.table === "site_translations"))

    /* Saves: a save that does not name product names never drops a choice, and never makes one. */
    const save = async (stored: unknown, input: unknown, rows: Row[] = []) => {
      const f = fakeDb(store(stored, rows))
      let r: Awaited<ReturnType<typeof saveTranslationRules>> | null = null
      try {
        r = await saveTranslationRules(f.db, "store-a", input)
      } catch (e) {
        if (!/static generation store|revalidate|incrementalCache/i.test(String(e))) throw e
      }
      const w = f.writes.find((x) => x.table === "store_localization" && x.kind === "update")
      return { r, written: (w?.rows as { translation_rules?: Row } | undefined)?.translation_rules ?? null, deletes: f.writes.filter((x) => x.kind === "delete") }
    }
    const a = await save({ keepProductNames: false }, { glossary: [], noTranslate: ["section:s1:heading"] })
    check("a saved off is kept by a save that does not name it (the theme editor's Don't translate)", a.written?.keepProductNames === false && (a.r === null || (a.r.ok === true && a.r.value.keepProductNames === false)), a.written)
    const b = await save({}, { glossary: [], noTranslate: [] })
    check("never chosen stays never chosen", b.written !== null && !("keepProductNames" in b.written) && b.deletes.length === 0, b.written)
    const c = await save({}, { glossary: [], noTranslate: [], keepProductNames: false })
    check("turned off: saved as a choice, nothing deleted", c.written?.keepProductNames === false && c.deletes.length === 0)
    const d = await save({ keepProductNames: false }, { glossary: [], noTranslate: [], keepProductNames: true })
    check("turned on from off: Storelib AI's title translations go so the original shows, the person's stay", d.written?.keepProductNames === true && d.deletes.some((x) => x.filters.some(([m, v]) => m === "eq" && v[0] === "source" && v[1] === "ai")) && d.deletes.some((x) => x.filters.some(([m, v]) => m === "like" && v[1] === "product:%:title")))
    const e = await save({}, { glossary: [], noTranslate: [], keepProductNames: true }, [aiTitle])
    check("  confirming the default where it was off deletes as turning it on does; where it was already on, nothing", e.deletes.length === 1 && (await save({}, { glossary: [], noTranslate: [], keepProductNames: true })).deletes.length === 0)

    const glossary = read("components/app/settings/translation-glossary.tsx")
    check("the switch says what it does and where a title can still be translated", /Automatic translation leaves product titles as you wrote them\. You can still translate a title yourself on the product's Translations card\./.test(glossary))
    const card = read("app/(storelib)/app/products/new/product-translations-card.tsx")
    const view = read("lib/markets/product-translations.ts")
    check("a product's Translations card knows, says it under Title, and Translate automatically leaves the title", /keepName: rules\.keepProductNames === true/.test(view) && /data-product-keep-name=""/.test(card) && /!\(view\.keepName && f\.field === "title"\)/.test(card))
  }

  console.log("\n5. Nothing moves")
  {
    const panel = read("components/app/settings/markets-panel.tsx")
    const glossary = read("components/app/settings/translation-glossary.tsx")
    check("Add language and Glossary share one flex row with a gap", /<div className="mt-3 flex flex-wrap items-center gap-2" data-language-actions="">\s*<button type="button" className=\{BTN_SECONDARY\} onClick=\{\(\) => setPicking\(true\)\}/.test(panel) && /<GlossaryButton languages=/.test(panel.slice(panel.indexOf("data-language-actions"))))
    check("  the Glossary button carries no margins of its own (it used to: mt-3 ml-2)", /className=\{cn\(BTN_SECONDARY, className\)\}/.test(glossary) && !/mt-3 ml-2/.test(glossary))
    const loading = panel.slice(panel.indexOf('data-languages-loading=""'), panel.indexOf("{/* The default language translated"))
    check("the loading card has the loaded card's lines: the default row as it wraps, the row of actions, More options", /basis-\[calc\(100%-3rem\)\] sm:basis-auto/.test(loading) && /tt\("Add language"\)/.test(loading) && /tt\("More options"\)/.test(loading) && /help="languages"/.test(panel.slice(panel.indexOf("if (!data || !draft)"), panel.indexOf('data-languages-loading=""'))))
    check("the store currency card is the same one before and after the languages load (keyed in both)", (panel.match(/<CountryCurrency key="currency" \/>/g) ?? []).length === 2)
    check("  and its loading card has its shape: title, line, How it works, Selling in", /<Card title=\{tt\("Store currency"\)\} description=\{/.test(read("components/app/settings/country-currency.tsx")) && /aria-busy="true">\s*<span className="text-\[14px\] text-\[#6b7280\]">\{tt\("Selling in"\)\}/.test(read("components/app/settings/country-currency.tsx")))
    check("the glossary's switch sits outside the list, so switching it moves nothing", glossary.indexOf('id="keep-product-names"') < glossary.indexOf("data-glossary-terms"))
    check("a check script measures it in a browser", /Glossary beside Add language/.test(read("scripts/check-languages-settings.mjs")))
  }

  console.log("\n6. One name per state")
  {
    const sheet = read("components/app/settings/translate-sheet.tsx")
    const editor = read("components/website-builder/editor/translation-editing.tsx")
    const card = read("app/(storelib)/app/products/new/product-translations-card.tsx")
    check("Not translated, Outdated, Automatic in the Translate list", /missing: \{ get label\(\) \{ return tt\("Not translated"\) \}/.test(sheet) && /outdated: \{ get label\(\) \{ return tt\("Outdated"\) \}/.test(sheet) && /auto: \{ get label\(\) \{ return tt\("Automatic"\) \}/.test(sheet) && /review: \{ get label\(\) \{ return tt\("Needs review"\) \}/.test(sheet))
    check("  the same in the theme editor's sidebar", /auto: \{ label: \(\) => tt\("Automatic"\)/.test(editor) && /updating: \{ label: \(\) => tt\("Outdated"\)/.test(editor) && /outdated: \{ label: \(\) => tt\("Needs review"\)/.test(editor) && /missing: \{ label: \(\) => tt\("Not translated"\)/.test(editor))
    check("  and on a product's Translations card", /tt\("Outdated"\)/.test(card) && /tt\("Automatic"\)/.test(card))
    const panel = read("components/app/settings/markets-panel.tsx")
    check("a language's row says Drafts and Needs review, no third name (it said “need a look”)", /tt\("\{count\} drafts"/.test(panel) && /tt\("\{count\} need review"/.test(panel) && !/need a look|needs a look/.test(panel))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

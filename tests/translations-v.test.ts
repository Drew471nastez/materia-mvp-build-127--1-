/**
 * ===========================================================================
 *  THE WEBSITE'S WORDS IN EACH LANGUAGE, EDITED WHERE THEY ARE (round V8)
 * ===========================================================================
 * The owner: separate the original from its translations, never overwrite a
 * product's or the merchant's own words, edit a language's real values when
 * the editor is switched to it, keep the editor's own labels apart, and
 * never let a change reach another language or the original.
 *
 *   1. what is words      text, long text, rich text and alt text are; a
 *                         colour, a number, a toggle, an address are not
 *   2. one key, one language
 *                         an edit lays one row into one language; the
 *                         original and every other language are untouched;
 *                         an outdated translation is found by its hash
 *   3. the sidebar        switched to a language, a text control shows and
 *                         writes that language's value; the rest is the same
 *                         in every language (the theme editor's own system)
 *   4. the website        a section, its alt text, a product and a binding
 *                         drawn in the visitor's language with each field
 *                         falling back to the original; a product set to
 *                         its own words keeps them; one read per language
 *   5. products           Translations on the product: a person's field
 *                         saved against the product's real words, Translate
 *                         automatically only when pressed and never over a
 *                         person's, the product row never written, another
 *                         store's product not found
 *   6. SQL part 211, the wiring and the copy
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import {
  TRANSLATABLE_TYPES,
  blockKey,
  isWordsField,
  localizeCards,
  localizeRecord,
  localizeSections,
  productKey,
  sectionKey,
  sourceHash,
  statusOf,
  translatablesOf,
  translationMap,
  type TranslationRow,
} from "@/lib/markets/translate"
import { TranslatedFieldEditor, type TranslationEditing } from "@/components/website-builder/editor/translation-editing"
import { dynamicContext, productFacts, withDynamicSources } from "@/lib/website-builder/storefront-data"
import { originalProductsOf, productTranslationRows, saveTranslations, setProductShowsOriginal, translationsOf, ORIGINALS_NOT_SET_UP } from "@/lib/markets/server"
import { productTranslationsView, saveProductField, setShowOriginal, translateProductAuto } from "@/lib/markets/product-translations"
import { siteLocalizer } from "@/lib/markets/live"
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
const raw = (p: string) => readFileSync(p, "utf8")
/* createElement without its overloads: a component whose props name `children` is given them as the third argument. */
const el = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => ReactElement

/* ── A database: rows by table, filtered as Postgres would by eq and in, every write kept ── */
type Row = Record<string, unknown>
type Write = { table: string; kind: "upsert" | "update" | "delete" | "insert"; rows: unknown; filters: [string, unknown[]][] }
function fakeDb(tables: Record<string, Row[]>, opts: { missing?: string } = {}) {
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
        q.maybeSingle = () => { single = true; return q }
        q.single = () => { single = true; return q }
        q.upsert = (rows: unknown) => { kind = "upsert"; payload = rows; return q }
        q.insert = (rows: unknown) => { kind = "insert"; payload = rows; return q }
        q.update = (rows: unknown) => { kind = "update"; payload = rows; return q }
        q.delete = () => { kind = "delete"; return q }
        q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          if (opts.missing && table === opts.missing) return Promise.resolve({ data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } }).then(ok, bad)
          if (kind) {
            writes.push({ table, kind, rows: payload, filters })
            return Promise.resolve({ data: null, error: null }).then(ok, bad)
          }
          reads.push({ table, columns, filters })
          let rows = tables[table] ?? []
          for (const [m, a] of filters) {
            if (m === "eq") rows = rows.filter((r) => !(a[0] as string in r) || r[a[0] as string] === a[1])
            if (m === "in") rows = rows.filter((r) => !(a[0] as string in r) || (a[1] as unknown[]).includes(r[a[0] as string]))
          }
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
        }
        return q
      },
    },
  }
}

const row = (key: string, value: string, original: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(original), status: "approved", source: "manual", ...extra })

/* A section schema as a theme writes one: words, a picture with its description, a colour, a number, a toggle, an address. */
const FIELDS: SchemaField[] = [
  { type: "text", id: "heading", label: "Heading", default: "Spring sale" },
  { type: "richtext", id: "text", label: "Text", default: "<p>Linen, washed soft.</p>" },
  { type: "image_picker", id: "image", label: "Picture", default: "" },
  { type: "text", id: "image_alt", label: "Describe the picture", default: "" },
  { type: "color", id: "accent", label: "Accent", default: "#8b5cf6" },
  { type: "range", id: "padding", label: "Padding", default: 40 },
  { type: "checkbox", id: "show_button", label: "Show button", default: true },
  { type: "text", id: "contact_email", label: "Email", default: "" },
  { type: "text", id: "button_label", label: "Button label", default: "Shop now" },
] as SchemaField[]
const BLOCK_FIELDS: SchemaField[] = [{ type: "text", id: "title", label: "Title", default: "" }, { type: "text", id: "alt", label: "Description for screen readers", default: "" }] as SchemaField[]
const fieldsOf = () => FIELDS
const blockFieldsOf = () => BLOCK_FIELDS
const section = (): SectionInstance =>
  ({
    id: "s1",
    type: "hero",
    name: "hero",
    settings: { heading: "Spring sale", text: "<p>Linen, washed <strong>soft</strong>.</p>", image: "https://cdn.test/a.jpg", image_alt: "A folded apron", accent: "#ff0000", padding: 32, contact_email: "hi@shop.test", button_label: "Shop now" },
    blocks: [{ id: "b1", type: "slide", settings: { title: "First slide", alt: "A mug on a table" } }],
  }) as unknown as SectionInstance

const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "20000000-0000-4000-8000-000000000002"

async function main() {
  console.log("\n1. What is words")
  {
    check("text, long text, rich text and inline rich text are", ["text", "textarea", "richtext", "inline_richtext"].every((type) => isWordsField({ type: type as never, id: "heading" })))
    check("  a picture's description (alt text) is", isWordsField({ type: "text", id: "image_alt" }) && isWordsField({ type: "text", id: "alt" }) && isWordsField({ type: "text", id: "hero_image_alt" }))
    check("  a button's label and a link's words are", isWordsField({ type: "text", id: "button_label" }) && isWordsField({ type: "text", id: "link_text" }))
    check("a colour, a number, a toggle, a picture and a link are not", ["color", "range", "number", "checkbox", "image_picker", "url", "select", "font_picker"].every((type) => !isWordsField({ type: type as never, id: "x" })))
    check("  nor a text setting that holds an address, a gradient or an embed", ["contact_email", "contact_phone", "embed_url", "bg_gradient", "embed_code", "target_id"].every((id) => !isWordsField({ type: "text", id })))
    check("  every type the old rule took is still offered where it holds words", [...TRANSLATABLE_TYPES].every((type) => isWordsField({ type: type as never, id: "heading" })))
    check("  and a gradient is not words, by its id or its label", !isWordsField({ type: "text", id: "bg", label: "Background gradient" }))
    const listed = translatablesOf([section()], fieldsOf, blockFieldsOf).map((t) => t.key)
    check("listed to translate: the words, the alt text, the block's words", ["section:s1:heading", "section:s1:text", "section:s1:image_alt", "section:s1:button_label", "block:s1:b1:title", "block:s1:b1:alt"].every((k) => listed.includes(k)), listed)
    check("  never the colour, the padding, the picture or the address", !listed.some((k) => /:(accent|padding|image|contact_email|show_button)$/.test(k)), listed)
  }

  console.log("\n2. One key, one language")
  {
    const fr = translationMap([row("section:s1:heading", "Soldes", "Spring sale"), row("section:s1:text", "<p>Lin lavé.</p>", "<p>Linen.</p>")])
    const de = translationMap([row("section:s1:heading", "Ausverkauf", "Spring sale")])
    const [inFr] = localizeSections([section()], fr, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
    const [inDe] = localizeSections([section()], de, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
    check("each language lays over its own rows only", (inFr.settings as Row).heading === "Soldes" && (inDe.settings as Row).heading === "Ausverkauf" && (inDe.settings as Row).text === "<p>Linen, washed <strong>soft</strong>.</p>")
    check("written for this original: done", statusOf(fr.get("section:s1:heading"), "Spring sale") === "done")
    check("the original changed since (by its hash): outdated", statusOf(fr.get("section:s1:heading"), "Summer sale") === "outdated" && statusOf(fr.get("section:s1:text"), "<p>Linen, washed <strong>soft</strong>.</p>") === "outdated")
    check("  the merchant's outdated one is still shown, never hidden for them", (inFr.settings as Row).text === "<p>Lin lavé.</p>")
    check("no row: missing", statusOf(fr.get("section:s1:image_alt"), "A folded apron") === "missing")
    const twice = fakeDb({})
    await saveTranslations(twice.db, "store-a", "fr", [{ key: "section:s1:heading", value: "Soldes", source: "Spring sale", approved: true }, { key: "section:s1:heading", value: "Grandes soldes", source: "Spring sale", approved: true }, { key: "section:s1:text", value: "", source: "<p>Linen.</p>", approved: true }], "u1")
    const up = twice.writes.filter((w) => w.kind === "upsert").flatMap((w) => w.rows as Row[])
    const del = twice.writes.filter((w) => w.kind === "delete")
    check("one row per key, the last edit wins, written by a person for the original it saw", up.length === 1 && up[0].value === "Grandes soldes" && up[0].source === "manual" && up[0].source_hash === sourceHash("Spring sale"))
    check("  an emptied one is taken away in that language only: the original shows again", del.length === 1 && del[0].filters.some(([m, a]) => m === "eq" && a[0] === "locale" && a[1] === "fr"))
  }

  console.log("\n3. The sidebar in another language (components/website-builder/editor/translation-editing.tsx)")
  {
    const writes: [string, string, string, boolean][] = []
    const change: { current: ((v: unknown) => void) | null } = { current: null }
    const raw = {
      "section:s1:heading": { v: "Soldes", h: sourceHash("Spring sale") },
      "section:s1:button_label": { v: "Acheter", h: sourceHash("Buy now") },
      "block:s1:b1:alt": { v: "Une tasse", h: sourceHash("A mug on a table"), s: "ai" as const },
    }
    const tr: TranslationEditing = {
      locale: "fr",
      defaultLanguage: "en",
      name: "French",
      defaultName: "English",
      raw,
      excluded: () => false,
      write: (k, v, src, rich) => void writes.push([k, v, src, rich]),
      keepMine: () => undefined,
      auto: () => undefined,
      exclude: () => undefined,
      busy: {},
      errors: {},
    }
    const sectionKeys = (id: string) => sectionKey("s1", id)
    const draw = (field: SchemaField, value: unknown, keyFor: ((id: string) => string | null) | null = sectionKeys) =>
      renderToStaticMarkup(
        el(TranslatedFieldEditor, {
          tr,
          keyFor,
          field,
          label: field.label,
          value,
          render: (v: unknown, onChange: (x: unknown) => void, f: SchemaField) => {
            change.current = onChange
            return el("input", { value: typeof v === "string" ? v : String(v ?? ""), placeholder: f.placeholder ?? "", readOnly: true, "data-probe": f.id })
          },
        }),
      )
    const heading = draw(FIELDS[0], "Spring sale")
    check("switched to French, the heading's box holds French's value, the English as its placeholder and under it", /value="Soldes"/.test(heading) && /placeholder="Spring sale"/.test(heading) && /English:/.test(heading) && /data-translated-field="section:s1:heading"/.test(heading), heading.slice(0, 300))
    check("  the merchant's own, for the English as it is now: Edited", /data-translation-state="edited"/.test(heading))
    change.current?.("Grandes soldes")
    check("  an edit writes only French's translation of that one setting, with the English it was written for", writes.length === 1 && writes[0][0] === "section:s1:heading" && writes[0][1] === "Grandes soldes" && writes[0][2] === "Spring sale" && writes[0][3] === false, writes)
    check("an English changed after it was translated: Original changed, the translation still shown", /data-translation-state="outdated"/.test(draw(FIELDS[8], "Shop now")) && /value="Acheter"/.test(draw(FIELDS[8], "Shop now")))
    const alt = draw(BLOCK_FIELDS[1], "A mug on a table", (id) => blockKey("s1", "b1", id))
    check("a block's alt text is its own translation, block:<section>:<block>:alt", /data-translated-field="block:s1:b1:alt"/.test(alt) && /value="Une tasse"/.test(alt) && /data-translation-state="auto"/.test(alt))
    draw(FIELDS[1], "<p>Linen</p>")
    change.current?.("<p>Lin</p>")
    check("rich text is written as rich text", writes[writes.length - 1][0] === "section:s1:text" && writes[writes.length - 1][3] === true)
    for (const f of [FIELDS[2], FIELDS[4], FIELDS[5], FIELDS[6], FIELDS[7]]) {
      const html = draw(f, (section().settings as Record<string, unknown>)[f.id])
      check(`  ${f.type} ${f.id}: the same in every language, drawn and out of reach`, /data-shared-setting/.test(html) && /inert/.test(html) && !/data-translated-field/.test(html))
    }
    check("a panel that names no texts writes none", /data-shared-setting/.test(draw(FIELDS[0], "Spring sale", null)))
    const original = section()
    const snapshot = JSON.stringify(original)
    localizeSections([original], translationMap([row("section:s1:image_alt", "Un tablier plié", "A folded apron")]), fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
    check("switching back: the section's own settings were never changed by any of it", JSON.stringify(original) === snapshot)
  }

  console.log("\n4. The website in the visitor's language")
  {
    const map = translationMap([
      row("section:s1:heading", "Soldes de printemps", "Spring sale"),
      row("section:s1:text", "<p>Lin lavé, <strong>doux</strong>.</p>", "<p>Linen, washed <strong>soft</strong>.</p>"),
      row("section:s1:image_alt", "Un tablier plié", "A folded apron"),
      row("block:s1:b1:alt", "Une tasse sur une table", "A mug on a table"),
      /* A row for a colour must never be laid over, whoever wrote it. */
      row("section:s1:accent", "#000000", "#ff0000"),
      row("section:s1:button_label", "Acheter", "Buy now", { source: "ai" }),
    ])
    const [s] = localizeSections([section()], map, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
    const st = s.settings as Record<string, unknown>
    check("words, rich text and alt text in French", st.heading === "Soldes de printemps" && st.text === "<p>Lin lavé, <strong>doux</strong>.</p>" && st.image_alt === "Un tablier plié" && (s.blocks?.[0].settings as Record<string, unknown>).alt === "Une tasse sur une table")
    check("  the picture, the colour, the number and the address the original's", st.image === "https://cdn.test/a.jpg" && st.accent === "#ff0000" && st.padding === 32 && st.contact_email === "hi@shop.test")
    check("  a field with no translation falls back to the original, one by one", (s.blocks?.[0].settings as Record<string, unknown>).title === "First slide")
    check("  Storelib AI's written for another original gives way to the original as it is now", st.button_label === "Shop now")
    const drafts = localizeSections([section()], translationMap([row("section:s1:heading", "Brouillon", "Spring sale", { status: "draft" })]), fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
    check("  a draft is never on the website", (drafts[0].settings as Record<string, unknown>).heading === "Spring sale")

    /* A binding: the section says "Get {{ product.title }}", French says "Obtenez {{ product.title }}", the product's title is translated. */
    const bound = { id: "s2", type: "promo", name: "promo", settings: { heading: "Get {{ product.title }} today" }, blocks: [] } as unknown as SectionInstance
    const pmap = translationMap([row("section:s2:heading", "Obtenez {{ product.title }} aujourd'hui", "Get {{ product.title }} today"), row(productKey(P1, "title"), "Tablier en lin", "Linen apron")])
    const product = { id: P1, title: "Linen apron", slug: "linen-apron", description: "<p>Washed linen.</p>", price_cents: 2900 }
    const shown = localizeRecord(product as Record<string, unknown>, `product:${P1}`, ["title", "description"], pmap, { approvedOnly: true, fresh: true }) as typeof product
    const ctx = dynamicContext({ theme: {}, product: productFacts(shown) })
    const filled = withDynamicSources(localizeSections([bound], pmap, () => [{ type: "text", id: "heading", label: "Heading" } as SchemaField], () => undefined, { approvedOnly: true, fresh: true }), () => ({ name: "promo", fields: [{ type: "text", id: "heading", label: "Heading" }] }) as never, ctx)
    check("a binding resolves to the product's translated title inside the translated words", (filled[0].settings as Record<string, unknown>).heading === "Obtenez Tablier en lin aujourd'hui", filled[0].settings)
    check("  the product row the binding read is a new object: the product itself still says Linen apron", product.title === "Linen apron" && shown.title === "Tablier en lin")
    const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
    check("  the builder's canvas lays a language over before filling bindings, as the website does", /* Changed on purpose (round AI, Add a section draws in the canvas first): the canvas's drawing steps are shared functions (inLanguageStep, filledStep, optionsStep, pricedStep) that a section just added is drawn through too. */ /inLanguageStep\(canvasSections, previewMap/.test(editor) && /localizeSections\(\s*list,\s*previewMap/.test(editor) && /filledStep\(sectionsInLanguage,/.test(editor) && /withDynamicSources\(searchListsTheShop\(list\)/.test(editor))

    const cards = [{ id: P1, type: "product", settings: { title: "Linen apron", description: "Washed linen." } }, { id: P2, type: "product", settings: { title: "Mug", description: "A mug." } }]
    const cmap = translationMap([row(productKey(P1, "title"), "Tablier en lin", "Linen apron"), row(productKey(P2, "title"), "Tasse", "Mug")])
    const out = localizeCards(cards, cmap, { approvedOnly: true, fresh: true }, new Set([P2]))
    check("a product set to show its original keeps its own words in a list; the others are translated", (out[0].settings as Row).title === "Tablier en lin" && (out[1].settings as Row).title === "Mug")

    /* The live localizer, through its real code: the data cache held the way the push tests hold it. */
    const reads: string[][] = []
    const g = globalThis as unknown as { __PUSH_TEST_NEXT_CACHE__?: unknown }
    g.__PUSH_TEST_NEXT_CACHE__ = {
      unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
        reads.push(keys)
        if (keys[0] === "site-languages") return { saved: true, defaultLanguage: "en", others: ["fr"], markets: [], homeCountry: null }
        if (keys[0] === "site-translations" && keys[1] === "store-a" && keys[2] === "fr") return [row(productKey(P1, "title"), "Tablier en lin", "Linen apron"), row(productKey(P2, "title"), "Tasse", "Mug"), row("option:" + sourceHash("Small"), "Petit", "Small")]
        if (keys[0] === "site-translations") return []
        if (keys[0] === "site-translation-originals") return keys[1] === "store-a" ? [P2] : []
        return fn()
      },
      revalidateTag: () => undefined,
      revalidatePath: () => undefined,
    }
    try {
      const loc = await siteLocalizer("store-a", "fr", null, "USD")
      check("the website's localizer for French", !!loc && loc.locale === "fr")
      check("  one read of French's translations for the page, held in the data cache under the store and the language", reads.filter((k) => k[0] === "site-translations").length === 1 && reads.some((k) => k[0] === "site-translations" && k[1] === "store-a" && k[2] === "fr"), reads)
      if (loc) {
        check("  a product: translated", (loc.product({ id: P1, title: "Linen apron" }) as Row).title === "Tablier en lin")
        check("  a product set to show its original: as written, its options too", (loc.product({ id: P2, title: "Mug" }) as Row).title === "Mug" && JSON.stringify(loc.options({ id: P2, options: [{ name: "Size", values: ["Small"] }] })) === JSON.stringify({ id: P2, options: [{ name: "Size", values: ["Small"] }] }))
        check("  another product's options still translated", JSON.stringify(loc.options({ id: P1, options: [{ name: "Size", values: ["Small"] }] })).includes("Petit"))
      }
      const other = await siteLocalizer("store-b", "fr", null, "USD")
      check("another store reads its own rows and its own originals, never store-a's", reads.some((k) => k[0] === "site-translations" && k[1] === "store-b") && (other === null || (other.product({ id: P1, title: "Linen apron" }) as Row).title === "Linen apron"))
    } finally {
      delete g.__PUSH_TEST_NEXT_CACHE__
    }
    const many = Array.from({ length: 30 }, (_, i) => ({ key: `section:s${i}:heading`, value: "x", source_hash: sourceHash("y"), status: "approved", source: "manual", creator_id: "store-a", locale: "fr" }))
    const t = fakeDb({ site_translations: many })
    const got = await translationsOf(t.db, "store-a", "fr")
    check("a language's rows are one query for a page's worth", t.reads.filter((r) => r.table === "site_translations").length === 1 && got.rows.length === 30)
  }

  console.log("\n5. A product's translations")
  {
    const tables = (): Record<string, Row[]> => ({
      products: [
        { id: P1, creator_id: "store-a", title: "Linen apron", description: "<p>Washed <strong>linen</strong>.</p>", seo_title: "", seo_description: "An apron in washed linen" },
        { id: P2, creator_id: "store-b", title: "Their mug", description: "Theirs.", seo_title: "", seo_description: "" },
      ],
      store_localization: [{ creator_id: "store-a", default_language: "en", languages: [{ code: "fr", published: true }, { code: "de", published: false }], markets: [{ id: "primary", name: "Home", primary: true, countries: [] }] }],
      site_translations: [
        { creator_id: "store-a", locale: "fr", key: productKey(P1, "title"), value: "Tablier", source_hash: sourceHash("Linen apron"), status: "approved", source: "manual" },
        { creator_id: "store-a", locale: "de", key: productKey(P1, "title"), value: "Schürze", source_hash: sourceHash("Old apron"), status: "approved", source: "ai" },
        { creator_id: "store-b", locale: "fr", key: productKey(P2, "title"), value: "Leur tasse", source_hash: sourceHash("Their mug"), status: "approved", source: "manual" },
      ],
      product_translation_settings: [],
    })
    const a = fakeDb(tables())
    const view = await productTranslationsView(a.db, "store-a", P1)
    check("the product's fields and every other language, read for the store", view.ok === true && view.value.languages.map((l) => l.code).join() === "fr,de" && view.value.fields.map((f) => f.field).join() === "title,description,seo_description")
    if (view.ok === true) {
      check("  French's title is the merchant's, done; German's was written for another original: outdated", view.value.values.fr.title?.value === "Tablier" && view.value.values.fr.title?.status === "done" && view.value.values.de.title?.status === "outdated")
      check("  the description is rich text", view.value.fields.find((f) => f.field === "description")?.rich === true)
    }
    check("  every language's rows in one query", a.reads.filter((r) => r.table === "site_translations").length === 1)
    const notMine = await productTranslationsView(fakeDb(tables()).db, "store-a", P2)
    check("another store's product is not found", notMine.ok === false && (notMine as { status: number }).status === 404)

    const s = fakeDb(tables())
    const saved = await saveProductField(s.db, "store-a", P1, "fr", "seo_description", "Un tablier en lin lavé", "u1")
    const up = s.writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Row[])
    check("a person's field saved for French only, against the product's own words", saved.ok === true && up.length === 1 && up[0].locale === "fr" && up[0].key === productKey(P1, "seo_description") && up[0].source_hash === sourceHash("An apron in washed linen") && up[0].source === "manual")
    check("  the product row is never written", !s.writes.some((w) => w.table === "products"))
    const bad = await saveProductField(fakeDb(tables()).db, "store-a", P1, "fr", "price_cents", "1", "u1")
    check("  only a field a product translates", bad.ok === false)
    const notAdded = await saveProductField(fakeDb(tables()).db, "store-a", P1, "es", "title", "Delantal", "u1")
    check("  only a language the website has", notAdded.ok === false && /Add this language/.test((notAdded as { error: string }).error))
    const cross = fakeDb(tables())
    const theirs = await saveProductField(cross.db, "store-a", P2, "fr", "title", "Ma tasse", "u1")
    check("  another store's product: not found, nothing written", theirs.ok === false && (theirs as { status: number }).status === 404 && cross.writes.length === 0)

    const asked: { key: string; source: string }[][] = []
    const auto = fakeDb(tables())
    const done = await translateProductAuto(auto.db, "store-a", P1, "fr", "u1", Date.now() + 30_000, {
      draft: async (items) => {
        asked.push(items)
        return { drafts: new Map(items.map((i) => [i.key, `FR ${i.source}`])), unavailable: false, reused: 0 }
      },
    })
    check("Translate automatically, pressed: the empty fields only, never the merchant's own title", done.ok === true && asked.length === 1 && asked[0].map((i) => i.key).sort().join() === [productKey(P1, "description"), productKey(P1, "seo_description")].sort().join(), asked)
    const autoRows = auto.writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Row[])
    check("  saved for French as Storelib AI's, live", autoRows.length === 2 && autoRows.every((r) => r.locale === "fr" && r.source === "ai" && r.status === "approved"))
    check("  read again for a person's write just before saving, and the product never written", auto.reads.some((r) => r.table === "site_translations" && r.filters.some(([m, x]) => m === "eq" && x[0] === "source" && x[1] === "manual")) && !auto.writes.some((w) => w.table === "products"))
    const german = fakeDb(tables())
    const askedDe: string[] = []
    await translateProductAuto(german.db, "store-a", P1, "de", "u1", Date.now() + 30_000, { draft: async (items) => { askedDe.push(...items.map((i) => i.key)); return { drafts: new Map(), unavailable: true, reused: 0 } } })
    check("  Storelib AI's own outdated German title is its to redo", askedDe.includes(productKey(P1, "title")))
    const kept = fakeDb({ ...tables(), product_translation_settings: [{ product_id: P1, creator_id: "store-a", show_original: true }] })
    const refused = await translateProductAuto(kept.db, "store-a", P1, "fr", "u1", Date.now() + 30_000, { draft: async () => { throw new Error("must not be asked") } })
    check("a product set to show its original is never sent to be translated", refused.ok === false && (refused as { status: number }).status === 409)

    const on = fakeDb(tables())
    const set = await setShowOriginal(on.db, "store-a", P1, true, "u1")
    const pref = on.writes.find((w) => w.table === "product_translation_settings")
    check("Always show the original: one row for the product, in the store, the translations kept", set.ok === true && (pref?.rows as Row).product_id === P1 && (pref?.rows as Row).creator_id === "store-a" && (pref?.rows as Row).show_original === true && !on.writes.some((w) => w.table === "site_translations" && w.kind === "delete"))
    const otherStore = await setShowOriginal(fakeDb(tables()).db, "store-a", P2, true, "u1")
    check("  another store's product: not found", otherStore.ok === false && (otherStore as { status: number }).status === 404)
    const before = await originalProductsOf(fakeDb(tables(), { missing: "product_translation_settings" }).db, "store-a")
    check("before part 211: no product is held, and nothing fails", before.ready === false && before.ids.length === 0)
    const needs = await setProductShowsOriginal(fakeDb(tables(), { missing: "product_translation_settings" }).db, "store-a", P1, true, "u1")
    check("  the switch says it needs part 211", needs.ok === false && (needs as { error: string }).error === ORIGINALS_NOT_SET_UP && /part 211/.test(ORIGINALS_NOT_SET_UP))
    const iso = fakeDb({ product_translation_settings: [{ product_id: P1, creator_id: "store-a", show_original: true }, { product_id: P2, creator_id: "store-b", show_original: true }] })
    check("  each store reads only its own", JSON.stringify((await originalProductsOf(iso.db, "store-a")).ids) === JSON.stringify([P1]))
    const rows3 = fakeDb(tables())
    await productTranslationRows(rows3.db, "store-a", P1, ["fr", "de"])
    check("  a product's rows are read inside its store", rows3.reads.every((r) => r.filters.some(([m, x]) => m === "eq" && x[0] === "creator_id" && x[1] === "store-a")))

    const written = fakeDb({})
    await saveTranslations(written.db, "store-a", "fr", [{ key: "section:s1:heading", value: "Soldes", source: "Spring sale", approved: true }], "u1")
    const w = written.writes.filter((x) => x.table === "site_translations")
    check("a saved translation touches its own language's row and nothing else", w.length === 1 && w[0].kind === "upsert" && (w[0].rows as Row[]).every((r) => r.locale === "fr" && r.creator_id === "store-a" && r.key === "section:s1:heading"))
  }

  console.log("\n6. Wiring, SQL part 211 and the copy")
  {
    const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
    check("one sidebar editing system: the theme editor's own (translation-editing.tsx), never a second", /from "@\/components\/website-builder\/editor\/translation-editing"/.test(editor) && !existsSync("components/website-builder/editor/translation-edit.tsx"))
    check("the canvas: a product shown as written keeps its words in every list and on its page", (editor.match(/previewOriginals\)\)/g) ?? []).length >= 3 && /previewMap && !previewOriginals\.has\(found\.id\)/.test(editor))
    const hook = readCode("components/website-builder/use-preview-language.ts")
    check("the editor reads which products are shown as written with the language's values", /originals\?: string\[\]/.test(hook) && /setOriginals\(/.test(hook) && /originals: originals\.ids/.test(readCode("app/api/store/translations/route.ts")))
    const productRoute = readCode("app/api/store/translations/product/route.ts")
    check("the product route: the store's own, through Products, and the translator only on a press", (productRoute.match(/shopCaller\("products"\)/g) ?? []).length === 4 && /export async function POST/.test(productRoute) && /canDraftWithAi\(\)/.test(productRoute) && !/from\("products"\)\.(update|upsert|insert)/.test(readCode("lib/markets/product-translations.ts")))
    check("  its Translate automatically goes through the sidebar's per-text press, so the glossary and Don't translate apply", /translateFieldsNow\(db, creatorId, locale/.test(readCode("lib/markets/product-translations.ts")) && /replaceManual: false/.test(readCode("lib/markets/product-translations.ts")))
    check("the product editor has no translations card (round AR, translated on publish instead)", !/<ProductTranslationsCard/.test(readCode("app/app/products/new/product-editor.tsx")))
    const live = readCode("lib/markets/live.ts")
    check("the website's localizer: one cached read per language, and the products shown as written", /* Changed on purpose (round AD4): languageChoice reads the same cached rows for the selector's note, so the count is taken inside siteLocalizer. */ ((live.split("export function siteLocalizer(")[1] ?? "").split("\nexport ")[0].match(/cachedTranslations\(/g) ?? []).length === 1 && /cachedOriginalProducts\(creatorId\)/.test(live) && /original\.has\(p\.id\)/.test(live))
    check("  an imported theme too", /original\.has\(c\.id\) \? c : compatCardIn/.test(readCode("lib/markets/compat.ts")))
    check("  Storelib AI and the Translate sheet leave a product shown as written alone", /keepOriginal\.has\(String\(p\.id\)\)/.test(readCode("lib/markets/server.ts")))
    check("the product card's own labels are Storelib's, through lib/i18n; the product's words through site_translations", /from "@\/lib\/i18n\/text"/.test(readCode("app/app/products/new/product-translations-card.tsx")))

    const file = "211_product_translation_settings.sql"
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    check("SQL 211: line 1 is the summary, run after 136, safe to run again", /^\/\* .*\(round V8\), run after part 136\..*Safe to run again\. \*\/$/.test(lines[0]))
    check("  one statement a line, the schema reloaded last", lines.length === 3 && lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[2] === "notify pgrst, 'reload schema';")
    check("  only adds", !/DROP |DELETE FROM|^UPDATE |TRUNCATE/im.test(part) && /CREATE TABLE IF NOT EXISTS public\.product_translation_settings/.test(part) && /CREATE INDEX IF NOT EXISTS/.test(part))
    check("  RLS on, an owner policy, no client role granted", /ENABLE ROW LEVEL SECURITY/.test(part) && /CREATE POLICY product_translation_settings_owner/.test(part) && /user_id = \(SELECT auth\.uid\(\)\)/.test(part) && /REVOKE ALL ON public\.product_translation_settings FROM PUBLIC, anon, authenticated/.test(part) && !/TO authenticated;/.test(part.replace(/CREATE POLICY[^;]*;/, "")))
    check("  the migration copy is the part, byte for byte", existsSync("supabase/migrations/20270201_v8_product_translation_settings.sql") && raw("supabase/migrations/20270201_v8_product_translation_settings.sql") === part)
    check("  its README row and its check after column", raw("supabase/sql/run-now/README.md").includes(`| \`${file}\` |`) && /as p211_product_translation_settings[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("  in the built files and the parts record", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "211", file: "${file}"`))

    const mine = [
      "components/website-builder/editor/translation-edit.tsx",
      "components/website-builder/use-preview-language.ts",
      "app/app/products/new/product-translations-card.tsx",
      "app/api/store/translations/product/route.ts",
      "lib/markets/product-translations.ts",
      "supabase/sql/run-now/211_product_translation_settings.sql",
      "scripts/check-translation-switch.mjs",
    ].filter((f) => existsSync(f))
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform(?!:|-)/i
    const hits = mine.filter((f) => banned.test(raw(f)))
    check("no em dash and none of the banned words in what this round wrote", hits.length === 0, hits)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

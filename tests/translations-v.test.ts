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
 *                         writes that language's value; the rest is locked
 *                         with a reason; back in the original, nothing of it
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
import { createElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import {
  TRANSLATABLE_TYPES,
  blockKey,
  isTranslatableField,
  localizeCards,
  localizeRecord,
  localizeSections,
  productKey,
  sectionKey,
  shownText,
  sourceHash,
  themeKeyFor,
  translatablesOf,
  translationMap,
  translationOf,
  withEdit,
  type TranslationMap,
  type TranslationRow,
} from "@/lib/markets/translate"
import { BlockTranslationScope, EditLanguageRow, Locked, SectionTranslationScope, ThemeTranslationScope, TranslatedField, TranslationEditProvider, useFieldTranslation, type FieldTranslationState, type TranslationEditing } from "@/components/website-builder/editor/translation-edit"
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

/* ── Rendering the sidebar's controls the way the editor does ── */
let probed: FieldTranslationState | null = null
function Probe({ field, value }: { field: SchemaField; value: unknown }) {
  probed = useFieldTranslation(field, value)
  return null
}
function probe(edit: TranslationEditing | null, scope: (child: ReactNode) => ReactNode, field: SchemaField, value: unknown): FieldTranslationState | null {
  probed = null
  renderToStaticMarkup(el(TranslationEditProvider, { value: edit }, scope(el(Probe, { field, value }))))
  return probed
}
const sectionScope = (child: ReactNode) => el(SectionTranslationScope, { sectionId: "s1" }, child)
const blockScope = (virtual: boolean) => (child: ReactNode) => el(BlockTranslationScope, { sectionId: "s1", blockId: "b1", virtual }, child)
const themeScope = (child: ReactNode) => el(ThemeTranslationScope, null, child)
const noScope = (child: ReactNode) => child

const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "20000000-0000-4000-8000-000000000002"

async function main() {
  console.log("\n1. What is words")
  {
    check("text, long text, rich text and inline rich text are", ["text", "textarea", "richtext", "inline_richtext"].every((type) => isTranslatableField({ type, id: "heading" })))
    check("  a picture's description (alt text) is", isTranslatableField({ type: "text", id: "image_alt" }) && isTranslatableField({ type: "text", id: "alt" }) && isTranslatableField({ type: "text", id: "hero_image_alt" }))
    check("  a button's label and a link's words are", isTranslatableField({ type: "text", id: "button_label" }) && isTranslatableField({ type: "text", id: "link_text" }))
    check("a colour, a number, a toggle, a picture and a link are not", ["color", "range", "number", "checkbox", "image_picker", "url", "select", "font_picker"].every((type) => !isTranslatableField({ type, id: "x" })))
    check("  nor a text setting that holds an address, a gradient or an embed", ["contact_email", "contact_phone", "embed_url", "bg_gradient", "embed_code", "target_id"].every((id) => !isTranslatableField({ type: "text", id })))
    check("  every type the old rule took is still offered where it holds words", [...TRANSLATABLE_TYPES].every((type) => isTranslatableField({ type, id: "heading" })))
    check("the shop's own name is not a theme word; its tagline is", themeKeyFor("brand_name") === null && themeKeyFor("tagline") === "theme:tagline")
    const listed = translatablesOf([section()], fieldsOf, blockFieldsOf).map((t) => t.key)
    check("listed to translate: the words, the alt text, the block's words", ["section:s1:heading", "section:s1:text", "section:s1:image_alt", "section:s1:button_label", "block:s1:b1:title", "block:s1:b1:alt"].every((k) => listed.includes(k)), listed)
    check("  never the colour, the padding, the picture or the address", !listed.some((k) => /:(accent|padding|image|contact_email|show_button)$/.test(k)), listed)
  }

  console.log("\n2. One key, one language")
  {
    const fr = translationMap([row("section:s1:heading", "Soldes", "Spring sale"), row("section:s1:text", "<p>Lin lavé.</p>", "<p>Linen, washed <strong>soft</strong>.</p>")])
    const de = translationMap([row("section:s1:heading", "Ausverkauf", "Spring sale")])
    const frBefore = JSON.stringify([...fr])
    const deBefore = JSON.stringify([...de])
    const next = withEdit(fr, "section:s1:button_label", "Acheter", "Shop now")
    check("an edit lays one row into the language", next.get("section:s1:button_label")?.value === "Acheter" && next.size === 3)
    check("  the other keys of that language are as they were", next.get("section:s1:heading")?.value === "Soldes" && next.get("section:s1:text")?.value === "<p>Lin lavé.</p>")
    check("  the language's own map is not changed in place, and German is untouched", JSON.stringify([...fr]) === frBefore && JSON.stringify([...de]) === deBefore)
    check("  written by a person, for the original as it is now", next.get("section:s1:button_label")?.source === "manual" && next.get("section:s1:button_label")?.sourceHash === sourceHash("Shop now") && next.get("section:s1:button_label")?.status === "approved")
    const cleared = withEdit(next, "section:s1:heading", "  ", "Spring sale")
    check("an empty value takes the translation away: the original shows again", !cleared.has("section:s1:heading") && next.has("section:s1:heading"))
    check("written for this original: done", translationOf(fr, "section:s1:heading", "Spring sale").status === "done")
    check("the original changed since (by its hash): outdated, the translation kept", translationOf(fr, "section:s1:heading", "Summer sale").status === "outdated" && translationOf(fr, "section:s1:heading", "Summer sale").value === "Soldes")
    check("no row: missing, nothing shown in the control", translationOf(fr, "section:s1:image_alt", "A folded apron").status === "missing" && translationOf(fr, "section:s1:image_alt", "A folded apron").value === "")
    check("Storelib AI's is marked as automatic", translationOf(translationMap([row("section:a:b", "x", "y", { source: "ai" })]), "section:a:b", "y").ai)
  }

  console.log("\n3. The sidebar in another language")
  {
    const writes: [string, string, string, boolean | undefined][] = []
    const frRows = translationMap([row("section:s1:heading", "Soldes", "Spring sale"), row("block:s1:b1:alt", "Une tasse", "A mug on a table"), row("theme:tagline", "Fait main", "Made by hand"), row("section:s1:button_label", "Acheter", "Buy now")])
    const edit: TranslationEditing = { locale: "fr", defaultLanguage: "en", rows: frRows, write: (k, v, o, r) => void writes.push([k, v, o, r]) }
    const heading = FIELDS[0]
    check("in the website's own language every control is drawn as always", probe(null, sectionScope, heading, "Spring sale") === null && probe(null, sectionScope, FIELDS[4], "#ff0000") === null)
    const h = probe(edit, sectionScope, heading, "Spring sale")
    check("switched to French, a heading shows French's value", h?.mode === "edit" && h.translation.value === "Soldes" && h.key === "section:s1:heading" && h.original === "Spring sale", h)
    if (h?.mode === "edit") h.write("Grandes soldes")
    check("  and an edit writes only French's translation of that one setting, with the original it was written for", writes.length === 1 && writes[0][0] === "section:s1:heading" && writes[0][1] === "Grandes soldes" && writes[0][2] === "Spring sale" && writes[0][3] === false, writes)
    const never = probe(edit, sectionScope, heading, undefined)
    check("  a setting never written shows its default as the original", never?.mode === "edit" && never.original === "Spring sale")
    const b = probe(edit, sectionScope, FIELDS[8], "Shop now")
    check("  an original changed after it was translated reads Outdated, its translation still shown", b?.mode === "edit" && b.translation.status === "outdated" && b.translation.value === "Acheter")
    const rich = probe(edit, sectionScope, FIELDS[1], "<p>Linen</p>")
    if (rich?.mode === "edit") rich.write("<p>Lin</p>")
    check("rich text is edited in its own language and saved as rich text", rich?.mode === "edit" && rich.rich && writes[writes.length - 1][3] === true)
    const alt = probe(edit, blockScope(false), BLOCK_FIELDS[1], "A mug on a table")
    check("a block's alt text shows and writes block:<section>:<block>:alt", alt?.mode === "edit" && alt.key === "block:s1:b1:alt" && alt.translation.value === "Une tasse")
    const virtual = probe(edit, blockScope(true), BLOCK_FIELDS[0], "Placed by the section")
    check("  a block the section places that was never changed: locked, with why", virtual?.mode === "locked" && /Change this block once in English/.test(virtual.reason))
    for (const f of [FIELDS[2], FIELDS[4], FIELDS[5], FIELDS[6], FIELDS[7]]) {
      const s = probe(edit, sectionScope, f, (section().settings as Record<string, unknown>)[f.id])
      check(`  ${f.type} ${f.id}: locked, the same in every language`, s?.mode === "locked" && /same in every language/i.test(s.reason))
    }
    check("a control with no scope is locked, so nothing writes an original by mistake", probe(edit, noScope, heading, "Spring sale")?.mode === "locked")
    const bound = probe(edit, sectionScope, heading, "{{ product.title }}")
    check("a setting that is one piece of shop data follows the shop's own translation", bound?.mode === "locked" && /shop/.test((bound as { reason: string }).reason))
    const tagline = probe(edit, themeScope, { type: "text", id: "tagline", label: "Tagline", default: "" } as SchemaField, "Made by hand")
    check("theme settings: the tagline writes theme:tagline", tagline?.mode === "edit" && tagline.key === "theme:tagline" && tagline.translation.value === "Fait main")
    check("  the shop's name is locked", probe(edit, themeScope, { type: "text", id: "brand_name", label: "Store name", default: "" } as SchemaField, "Linen & Co")?.mode === "locked")
    check("a divider is neither", probe(edit, sectionScope, { type: "header", id: "h", label: "Layout" } as SchemaField, undefined) === null)

    const lockedHtml = renderToStaticMarkup(el(TranslationEditProvider, { value: edit }, el(Locked, null, el("input", { defaultValue: "#ff0000" }))))
    check("a locked control is drawn, dimmed and out of reach", /data-translation-locked/.test(lockedHtml) && /inert/.test(lockedHtml) && /opacity-45/.test(lockedHtml) && /#ff0000/.test(lockedHtml))
    check("  and untouched in the website's own language", !/data-translation-locked/.test(renderToStaticMarkup(el(Locked, null, el("input", { defaultValue: "x" })))))
    if (h?.mode === "edit") {
      const html = renderToStaticMarkup(
        el(TranslationEditProvider, { value: edit }, el(TranslatedField, { label: "Heading", field: heading, state: h, render: (f: SchemaField, v: string) => el("input", { value: v, placeholder: f.placeholder, readOnly: true }) })),
      )
      check("the translated control: the language's value in the box, the original as its placeholder and under it", /value="Soldes"/.test(html) && /placeholder="Spring sale"/.test(html) && /English: Spring sale/.test(html), html.slice(0, 400))
    }
    if (b?.mode === "edit") {
      const html = renderToStaticMarkup(el(TranslationEditProvider, { value: edit }, el(TranslatedField, { label: "Button label", field: FIELDS[8], state: b, render: () => null })))
      check("  an outdated one says Outdated", /data-translation-outdated/.test(html) && />Outdated</.test(html))
    }
    const row2 = renderToStaticMarkup(el(EditLanguageRow, { languages: ["en", "fr", "de"], published: ["fr"], defaultLanguage: "en", locale: "fr", onChange: () => undefined, save: { state: "idle", error: null }, onRetry: () => undefined }))
    check("the language row lists each language, the original named, one not live yet said", /English \(original\)/.test(row2) && /French/.test(row2) && /German \(not live yet\)/.test(row2) && /data-wb-edit-language="fr"/.test(row2))
    check("  and says once what changes in French", /Only text changes in French/.test(row2))
    check("  a website in one language has no row", renderToStaticMarkup(el(EditLanguageRow, { languages: [], published: [], defaultLanguage: "en", locale: null, onChange: () => undefined, save: { state: "idle", error: null }, onRetry: () => undefined })) === "")
    const original = section()
    const snapshot = JSON.stringify(original)
    localizeSections([original], withEdit(frRows, "section:s1:image_alt", "Un tablier plié", "A folded apron"), fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
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
    check("  the builder's canvas lays a language over before filling bindings, as the website does", /localizeSections\(\s*canvasSections,\s*previewMap/.test(editor) && /withDynamicSources\(searchListsTheShop\(sectionsInLanguage\)/.test(editor))

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
    check("FieldEditor asks what a setting is in the language being edited, and draws the same control for it", /const translation = useFieldTranslation\(props\.field, props\.value\)/.test(editor) && /<TranslatedField label=\{label\} field=\{props\.field\} state=\{translation\} render=\{\(field, value, onChange\) => <FieldControl/.test(editor))
    check("  a section's, a block's and the theme's settings name where they write", /<SectionTranslationScope sectionId=\{section\.id\}>/.test(editor) && /<BlockTranslationScope sectionId=\{section\.id\} blockId=\{block\.id\} virtual=\{!!virtual\}>/.test(editor) && (editor.match(/<ThemeTranslationScope>/g) ?? []).length === 2)
    check("  colours, the design panel, fonts and social links are locked in another language", (editor.match(/<Locked>\s*<SectionColorSetting/g) ?? []).length === 2 && /<Locked><SectionDesignPanel/.test(editor) && /<Locked>\s*<ColorsPanel/.test(editor) && /<Locked>\s*<TypographyPanel/.test(editor) && (editor.match(/<SettingRow field=\{field\}>/g) ?? []).length === 2)
    check("  menus: each link's label in the language, the menu editor otherwise", /translationEdit \? \(\s*<MenuTranslations menus=\{canvasMenus as never\} \/>/.test(editor))
    check("  the language row under the sidebar's tabs, on a computer and a phone, never in the black bar", (editor.match(/\{editLanguageRow\}/g) ?? []).length === 2 && !/PreviewLanguageSwitch/.test(editor))
    check("  the sidebar is given the language being edited, both of them", (editor.match(/<TranslationEditProvider value=\{translationEdit\}>/g) ?? []).length === 2)
    const hook = readCode("components/website-builder/use-preview-language.ts")
    check("the hook reads the language's drafts too, keeps typing over a read, and saves through the Translate sheet's own PUT", /values=1&all=1/.test(hook) && /for \(const p of pending\.current\.get\(lang\)\?\.values\(\) \?\? \[\]\) rows = withEdit/.test(hook) && /fetch\("\/api\/store\/translations", \{ method: "PUT"/.test(hook))
    check("  the canvas lays over approved ones only", /filter\(\(r\) => r\.status === "approved"\)/.test(hook))
    check("  what is typed is sent when the tab is left", /pagehide/.test(hook) && /keepalive/.test(hook))
    const route = readCode("app/api/store/translations/route.ts")
    check("the preview route gives drafts only when asked, and the products shown as written", /searchParams\.get\("all"\) === "1"/.test(route) && /originals: originals\.ids/.test(route))
    const productRoute = readCode("app/api/store/translations/product/route.ts")
    check("the product route: the store's own, through Products, and the translator only on a press", (productRoute.match(/shopCaller\("products"\)/g) ?? []).length === 4 && /export async function POST/.test(productRoute) && /canDraftWithAi\(\)/.test(productRoute) && !/from\("products"\)\.(update|upsert|insert)/.test(readCode("lib/markets/product-translations.ts")))
    check("the product editor carries the Translations card for a saved product", /editProductId \? <ProductTranslationsCard productId=\{editProductId\}/.test(readCode("app/app/products/new/product-editor.tsx")))
    const live = readCode("lib/markets/live.ts")
    check("the website's localizer: one cached read per language, and the products shown as written", (live.match(/cachedTranslations\(/g) ?? []).length === 1 && /cachedOriginalProducts\(creatorId\)/.test(live) && /original\.has\(p\.id\)/.test(live))
    check("  an imported theme too", /original\.has\(c\.id\) \? c : compatCardIn/.test(readCode("lib/markets/compat.ts")))
    check("  Storelib AI and the Translate sheet leave a product shown as written alone", /keepOriginal\.has\(String\(p\.id\)\)/.test(readCode("lib/markets/server.ts")))
    check("the editor's own labels stay Storelib's: the sidebar's words go through lib/i18n, the website's through site_translations", /from "@\/lib\/i18n\/text"/.test(readCode("components/website-builder/editor/translation-edit.tsx")) && !/lib\/markets\/server/.test(readCode("components/website-builder/editor/translation-edit.tsx")))

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

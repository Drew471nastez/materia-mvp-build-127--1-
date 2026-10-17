/**
 * ===========================================================================
 *  TRANSLATIONS THAT REACH THE PAGE, AND ONES A PERSON WROTE KEPT
 * ===========================================================================
 * The owner: "the whole theme translatable in all places", and AI translation
 * that "preserves manually edited translations". Found by reading every
 * customer facing path:
 *
 *   collections   offered in Translations (collection:<id>:title and
 *                 :description) but laid over nowhere: built-in themes now
 *                 read them through the page's localizer (dressPage, the
 *                 collection page's heading), imported themes in
 *                 localizeCompatSite, whose products in a collection were
 *                 translated only when a currency was also converted
 *   AI drafts     replaced a person's approved translation with a hidden
 *                 draft when its original changed, which put the original
 *                 back on the live site until someone reviewed it
 *   home market   read store_settings.country, a column that does not
 *                 exist (default_country), so it never had a country
 *   order rows    a website cart's orders said "usd" whatever was charged
 *
 * And from 4 on, measured rather than read: every Storelib section and
 * block as a creator adds it (no settings saved, so its defaults show), each
 * .storelib section drawn as a visitor sees it with every text and every
 * shop word translated, the theme's own settings, the shop's lists, and an
 * imported theme drawn in its default language. A text that shows words
 * and has no key, or a key that is not laid over, fails here by name.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { TRANSLATABLE_TYPES, blockKey, isTranslationKey, localizeSections, localizeTheme, optionKey, sectionKey, shownText, sourceHash, themeTextTranslatables, translatablesOf, translationMap, type Translatable, type TranslationRow } from "@/lib/markets/translate"
import { compatCardIn, compatCollectionIn, compatFields, compatThemeWords } from "@/lib/markets/compat-fields"
import { UI_WORDS } from "@/lib/markets/ui-words"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { STORELIB_SECTION_TYPES, themeBlockCatalog } from "@/lib/website-builder/storelib-schemas"
import { textFieldsFrom } from "@/lib/website-builder/custom-schemas"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { dynamicContext, storefrontData } from "@/lib/website-builder/storefront-data"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { catalogPage } from "@/lib/products/catalog-filters"
import { readReviewsApp } from "@/lib/reviews/app-settings"
import { sampleStorefrontReviews } from "@/lib/reviews/storefront"
import { CompatTheme, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "@/lib/storelib-theme/compat/site"
import type { BlockInstance, BlockSchema, SchemaField, SectionInstance, SectionSchema, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

console.log("\n1. Collections, in the visitor's language")
const live = readCode("lib/markets/live.ts")
check("the live localizer lays collection:<id> over a collection's title and description", /* Changed on purpose (merge): the branch's typed form of the same overlay. */ /collection\(c\) \{[\s\S]{0,260}localizeRecord\(record, `collection:\$\{c\.id\}`/.test(live))
const site = readCode("lib/website-builder/published-site.ts")
check("built-in themes: every collection a page reads, and its products as the page's cards", /localizer\.collection\(c as unknown/.test(site) && /products: localizer\.cards\(c\.products as never\)/.test(site) && /opts: \{ cached: boolean; localizer\?: Localizer \| null \}/.test(site))
for (const f of ["app/(site)/w/[username]/search/page.tsx", "app/(site)/w/[username]/cart/page.tsx", "app/(site)/w/[username]/products/page.tsx", "app/(site)/w/[username]/render-account.tsx", "app/(site)/w/[username]/collections/page.tsx", "app/(site)/w/[username]/collections/[handle]/page.tsx", "components/website-builder/theme/render-product.tsx"]) {
  check(`${f.split("/").slice(-2).join("/")} hands its localizer to the page`, /dressPage\([\s\S]*?localizer \}\)/.test(readCode(f)))
}
check("the collection page's heading and title in the language", /* Changed on purpose (merge): collection() keeps its type, no casts. */ /const collection = localizer \? localizer\.collection\(inIt\.collection\)/.test(readCode("app/(site)/w/[username]/collections/[handle]/page.tsx")))
const compat = readCode("lib/markets/compat.ts")
/* Changed on purpose (translation coverage): the overlay is compat-fields.ts compatCollectionIn, shared with the builder's canvas. */
check("imported themes: collection:<id> laid over, and its products translated without a currency change too", /const words = compatCollectionIn\(c, map, opts\)/.test(compat) && /`collection:\$\{c\.id\}`/.test(readCode("lib/markets/compat-fields.ts")) && !/collections: pricing \? site\.collections\.map/.test(compat))

console.log("\n2. A person's translation is kept")
const draft = readCode("app/api/store/translations/draft/route.ts")
check("AI drafts what is missing and its own outdated drafts, never a person's approved one", /* Changed on purpose (merge): one rule for the press and the hourly job, aiMayWrite, which leaves every translation a person wrote. */ /* Changed on purpose (checkout, currency and translation overhaul): in the round the press and the background job share. */ /* Changed on purpose (round K3): a text the store keeps untranslated (Don't translate, product names kept) is skipped too. */ /\.filter\(\(t\) => !isExcluded\(rules, t\.key\) && aiMayWrite\(map\.get\(t\.key\), t\.source\)\)/.test(readCode("lib/markets/translation-press.ts")))
check("and what is left to draft counts the same way", /* Changed on purpose (round K3): excluded texts are not left to draft. */ /!written\.has\(t\.key\) && !isExcluded\(rules, t\.key\) && aiMayWrite\(map\.get\(t\.key\), t\.source\)/.test(readCode("lib/markets/translation-press.ts")))
const translate = readCode("lib/markets/translate.ts")
check("an approved value stays live while its original changed (only drafts are hidden)", /if \(opts\.approvedOnly && row\.status !== "approved"\) return null/.test(translate))

console.log("\n3. The home market's country, and what an order was paid in")
check("the home country is read from default_country", /select\("default_country"\)/.test(readCode("lib/markets/server.ts")) && !/select\("country"\)/.test(readCode("lib/markets/server.ts")))
const item = readCode("lib/checkout/fulfil-cart-item.ts")
check("a website cart's order rows keep the payment's own currency", /currency: \(ctx\.currency \|\| "usd"\)\.toLowerCase\(\)/.test(item) && !/currency: "usd",/.test(item))
check("from the PaymentIntent, and a physical checkout's from its row", /* Changed on purpose (merge): the Checkout Session's, else the PaymentIntent's. */ /currency: (session\.currency \|\| )?pi\??\.currency \|\| null,/.test(readCode("lib/checkout/fulfil-cart-session.ts")) && /currency: co\.currency \?\? null,/.test(readCode("lib/physical/checkout-server.ts")))


/* ── 4 to 8: every text a visitor reads has a key, and the key is laid over ── */

/** A failure with what it was about, so a gap names its section and its words. */
function checkWith(name: string, ok: boolean, detail: unknown) {
  check(name, ok)
  if (!ok) console.log(`        ${JSON.stringify(detail).slice(0, 4000)}`)
}

/** A translation for every key: a marker that names the key, so a page that shows it shows which text was laid over. */
const markerOf = (i: number) => `zq${i}qz`
function everyKeyTranslated(items: Translatable[]): { map: ReturnType<typeof translationMap>; marker: Map<string, string> } {
  const marker = new Map<string, string>()
  const rows: TranslationRow[] = items.map((t, i) => {
    marker.set(t.key, markerOf(i))
    return { key: t.key, value: markerOf(i), sourceHash: sourceHash(t.source), status: "approved", source: "manual" }
  })
  return { map: translationMap(rows), marker }
}

/** Every text setting of these sections and their blocks, at any depth, as `key -> value`. */
function textValues(sections: SectionInstance[], fieldsOf: (t: string) => SchemaField[] | undefined, blockFieldsOf: (st: string, bt: string) => SchemaField[] | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>()
  const take = (fields: SchemaField[] | undefined, settings: Record<string, unknown>, key: (id: string) => string) => {
    for (const f of fields ?? []) if (TRANSLATABLE_TYPES.has(f.type)) out.set(key(f.id), settings?.[f.id])
  }
  const walk = (s: SectionInstance, blocks: BlockInstance[] | undefined) => {
    for (const b of blocks ?? []) {
      take(blockFieldsOf(s.type, b.type), b.settings, (id) => `block:${s.id}:${b.id}:${id}`)
      walk(s, b.blocks)
    }
  }
  for (const s of sections) {
    take(fieldsOf(s.type), s.settings, (id) => `section:${s.id}:${id}`)
    walk(s, s.blocks)
  }
  return out
}

/** A section as a creator adds it and never touches: no settings saved (lib/storelib-theme/resolve.ts draws the defaults), one block of each kind it takes, its own and the theme's. */
function untouched(type: string, schema: SectionSchema, themeBlocks: Record<string, BlockSchema>): SectionInstance {
  const own = (schema.blocks ?? []).map((b) => b.type)
  const theirs = schema.accepts?.length ? Object.values(themeBlocks).filter((b) => !b.private).map((b) => b.type) : []
  /* And the blocks its markup places itself (`content_for "block"`), as a preset puts them on the page. */
  const statics = (schema.statics ?? []).map((st) => ({ id: st.id, type: st.type, settings: {}, static: true }) as BlockInstance)
  const blocks = [...statics, ...[...own, ...theirs].map((bt, i) => ({ id: `b${i}`, type: bt, settings: {} }) as BlockInstance)]
  return { id: `s-${type}`, type, name: type, settings: {}, blocks } as SectionInstance
}

const P_ID = "10000000-0000-4000-8000-000000000001"
const C_ID = "20000000-0000-4000-8000-000000000002"
const shopCard = { id: P_ID, type: "product", settings: { title: "Linen apron", description: "Washed linen.", price: "$29.00", compare_price: "", image: "", url: "/products/linen-apron", tag: "", options: [{ name: "Size", values: ["Small", "Large"] }], variants: [{ id: "v1", name: "Small", options: ["Small"] }, { id: "v2", name: "Large", options: ["Large"] }] } }

async function coverage() {
  const themeBlocks = themeBlockCatalog(undefined)
  const { fieldsOf, blockFieldsOf } = textFieldsFrom(undefined)
  const types = Object.keys(SECTION_SCHEMAS).sort()

  console.log("\n4. Every Storelib section and block: what it shows has a key, and the key is laid over")
  const sections = types.map((t) => untouched(t, SECTION_SCHEMAS[t], themeBlocks))
  const items = translatablesOf(sections, fieldsOf, blockFieldsOf)
  const { map, marker } = everyKeyTranslated(items)
  const before = textValues(sections, fieldsOf, blockFieldsOf)
  const after = textValues(localizeSections(sections, map, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true }), fieldsOf, blockFieldsOf)
  const listed = new Set(items.map((i) => i.key))
  const shown = (field: SchemaField, value: unknown) => {
    const v = shownText(field, value)
    return v !== null && v.trim() !== ""
  }
  /* A text field whose default is words: listed, untouched. */
  const unlisted: string[] = []
  const notLaid: string[] = []
  for (const s of sections) {
    const fieldsWithWords = (fields: SchemaField[] | undefined, settings: Record<string, unknown>, key: (id: string) => string) => {
      for (const f of fields ?? []) {
        if (!TRANSLATABLE_TYPES.has(f.type) || !shown(f, settings[f.id])) continue
        const k = key(f.id)
        if (!listed.has(k)) unlisted.push(k)
        else if (after.get(k) !== marker.get(k)) notLaid.push(`${k}=${JSON.stringify(after.get(k))}`)
      }
    }
    fieldsWithWords(fieldsOf(s.type), s.settings, (id) => sectionKey(s.id, id))
    for (const b of s.blocks ?? []) fieldsWithWords(blockFieldsOf(s.type, b.type), b.settings, (id) => blockKey(s.id, b.id, id))
  }
  check(`${types.length} section types, ${items.length} texts with words before anybody types any`, types.length > 60 && items.length > 300)
  checkWith("every text field that shows words, a section's default included, is listed to translate", unlisted.length === 0, unlisted.slice(0, 20))
  checkWith("  and every one listed is laid over", notLaid.length === 0, notLaid.slice(0, 20))
  checkWith("  nothing that is not text is touched", [...before.keys()].every((k) => listed.has(k) || before.get(k) === after.get(k)), [...before.keys()].filter((k) => !listed.has(k) && before.get(k) !== after.get(k)).slice(0, 10))
  const blocksSection = items.filter((i) => i.key.startsWith("block:s-blocks_section:"))
  checkWith("a heading, text and button block in a Blocks section (theme blocks) are listed too", blocksSection.length >= 3, blocksSection.map((i) => i.key))
  const written = translatablesOf([{ id: "w", type: "hero", name: "hero", settings: { heading: "Spring sale" }, blocks: [] } as SectionInstance], fieldsOf, blockFieldsOf)
  check("a value the creator typed is listed as typed, never the default", written.some((i) => i.key === "section:w:heading" && i.source === "Spring sale"))
  const cleared = translatablesOf([{ id: "c", type: "hero", name: "hero", settings: { heading: "" }, blocks: [] } as SectionInstance], fieldsOf, blockFieldsOf)
  check("  and a text the creator emptied is not listed (it shows nothing)", !cleared.some((i) => i.key === "section:c:heading"))
  /* Changed on purpose: only Storelib AI's outdated translation gives way; the owner's own stays live and is flagged for review (lib/markets/translate needsReview). */
  const stale = translationMap([{ key: "section:w:heading", value: "Soldes", sourceHash: sourceHash("Spring sale"), status: "approved", source: "ai" }])
  const changed = localizeSections([{ id: "w", type: "hero", name: "hero", settings: { heading: "Summer sale" }, blocks: [] } as SectionInstance], stale, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
  check("  a machine translation written for another default is not shown over the words there now", (changed[0].settings as Record<string, unknown>).heading === "Summer sale")
  const owned = translationMap([{ key: "section:w:heading", value: "Soldes", sourceHash: sourceHash("Spring sale"), status: "approved", source: "manual" }])
  const kept = localizeSections([{ id: "w", type: "hero", name: "hero", settings: { heading: "Summer sale" }, blocks: [] } as SectionInstance], owned, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
  check("  the owner's own translation stays until they look at it", (kept[0].settings as Record<string, unknown>).heading === "Soldes")

  console.log("\n5. Each .storelib section drawn: every text it draws is in the page's language, the shop's own words too")
  const words = Object.fromEntries(Object.keys(UI_WORDS).map((w) => [w, `zw${w}wz`]))
  /* The reviews are what buyers wrote, in their words: drawn as names, with no date (a date is written in English: see the report, dates are not words a store translates yet). */
  const sample = sampleStorefrontReviews(readReviewsApp({ enabled: true }), "c", { id: P_ID, title: "Linen apron" }) as unknown as Record<string, unknown>
  const buyerWords = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(buyerWords)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, ["body", "title", "author", "reply", "initial"].includes(k) && typeof x === "string" ? (x ? "Linen apron" : x) : k === "date" ? "" : buyerWords(x)]))
        : v
  const reviews = { ...(buyerWords(sample) as Record<string, unknown>), enabled: true, can_write: true }
  const collections = { [C_ID]: { id: C_ID, title: "Aprons", handle: "aprons", description: "Every apron.", image: "", url: "/collections/aprons", products_count: 1, products: [shopCard] } }
  const dataIn = (w?: Record<string, string>) => storefrontData({ dynamic: dynamicContext({ theme: {} }), catalog: [shopCard as never], collections: collections as never, reviews: reviews as never, words: w })
  const theme = {} as ThemeSettingsValues
  const localized = localizeSections(sections, map, fieldsOf, blockFieldsOf, { approvedOnly: true, fresh: true })
  const visible = (html: string) =>
    html
      .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*\baria-hidden="true"[^>]*>[\s\S]*?<\/[a-z]+>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
  const attrWords = (html: string) => [...html.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((m) => m[1])
  /*
    What a visitor may read that is not the shop's to translate: the
    product's and collection's own words (translated as products, part 9),
    the words a visitor searched for, and the names of review sites a
    testimonial came from. Anything else that is left is a gap.
  */
  const NOT_WORDS = /\b(zq\d+qz|zw[a-z0-9_]+wz|Linen apron|Aprons|Every apron|Washed linen|Small|Large|Size|apron|Google|Trustpilot|Facebook|Instagram|Yelp)\b/g
  const leaks: string[] = []
  const drawn: string[] = []
  for (const type of STORELIB_SECTION_TYPES) {
    const s = localized.find((x) => x.type === type)
    if (!s) continue
    const template = /^reviews_product$|^product/.test(type) ? "product" : type === "search" ? "page.search" : "index"
    const out = renderStorelibSection(s, theme, { template, query: "apron" }, undefined, [shopCard as never], dataIn(words))
    if (out.ok === false) continue
    drawn.push(type)
    const text = [visible(out.html), ...attrWords(out.html)].join(" ").replace(NOT_WORDS, " ")
    const left = [...new Set(text.match(/[A-Za-z][A-Za-z']{2,}(?:\s+[A-Za-z][A-Za-z']+)*/g) ?? [])]
    if (left.length) leaks.push(`${type}: ${left.join(" | ")}`)
  }
  check(`${drawn.length} sections drawn as a visitor sees them`, drawn.length > 40)
  checkWith("every word a section draws is a translated setting or a translated shop word: none left in the theme's language", leaks.length === 0, leaks)

  /* A key the save refuses (a digit in a ui: key) made the whole batch fail: no shop word was ever saved. */
  checkWith("every shop word's key is one a translation can be saved under", Object.keys(UI_WORDS).every((w) => isTranslationKey(`ui:${w}`)), Object.keys(UI_WORDS).filter((w) => !isTranslationKey(`ui:${w}`)))

  console.log("\n6. The theme's own words, set or not")
  const themeFields = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? [])
  const themeItems = themeTextTranslatables({}, themeFields)
  check("the cookie banner's sentence and buttons and the Sale badge are listed before anybody types them", ["theme:cookie_banner_text", "theme:cookie_accept_text", "theme:cookie_decline_text", "theme:badge_sale_text"].every((k) => themeItems.some((i) => i.key === k)))
  const themeMap = everyKeyTranslated(themeItems)
  const themeShown = localizeTheme({} as Record<string, unknown>, themeMap.map, { approvedOnly: true, fresh: true }, themeFields)
  check("  and laid over, live and in the canvas, with the schema handed in", themeItems.every((i) => themeShown[i.key.slice(6)] === themeMap.marker.get(i.key)))
  check("the store's name is never a word to translate", !themeItems.some((i) => i.key === "theme:brand_name"))
  check("the live site and the canvas hand the schema in", /localizeTheme\(settings, map, opts, THEME_TEXT_FIELDS\)/.test(readCode("lib/markets/live.ts")) && (readCode("app/website-builder/editor/[installId]/page.tsx").match(/previewMap, \{ approvedOnly: true, fresh: true \}, THEME_TEXT_FIELDS\)/g) ?? []).length === 2)

  console.log("\n7. Lists, filters and the 404 page")
  const listWords = { sort_featured: "Destacados", in_stock: "En stock", availability: "Disponibilidad", product: "producto", products: "productos", product_type: "Tipo de producto", kind_digital: "Descarga digital", kind_physical: "Producto físico" }
  const cards = [{ id: "a", settings: { title: "A", price_cents: 100, available: true, kind: "digital" } }, { id: "b", settings: { title: "B", price_cents: 200, available: false, kind: "physical" } }]
  const page = catalogPage(cards as never, { available: "1" }, "/products", { words: listWords })
  checkWith("sort, groups, chips and the count in the page's language", page.filters.sort_options[0].label === "Destacados" && page.filters.groups.some((g) => g.label === "Disponibilidad") && page.filters.groups.some((g) => g.label === "Tipo de producto") && page.filters.chips.some((c) => c.label === "En stock") && / productos?$/.test(page.filters.count_label), page.filters)
  check("  the product types too", page.filters.groups.every((g) => g.param !== "type" || g.values.every((v) => /Descarga|Producto/.test(v.label))))
  check("  in English with no words handed over", catalogPage(cards as never, {}, "/products").filters.sort_options[0].label === "Featured")
  for (const f of ["search/page.tsx", "products/page.tsx", "collections/[handle]/page.tsx"]) check(`${f} lists in the page's language`, /words: localizer\?\.words \}/.test(readCode(`app/(site)/w/[username]/${f}`)))
  check("the canvas's lists too", /\{ words: data\?\.words \}/.test(readCode("components/website-builder/sections/storelib-live.tsx")))
  const site = readCode("lib/website-builder/published-site.ts")
  check("the 404 page in the visitor's language, the default's included", /publishedNotFoundPage\(name: string, locale: string \| null = null\)/.test(site) && /const localizer = await siteLocalizer\(found\.site\.creatorId, locale\)/.test(site) && /splitSiteName/.test(readCode("app/(site)/w/[username]/not_found/route.ts")) && /\/\$\{lang\}\/not_found/.test(readCode("components/website-builder/site-not-found.tsx")))
  check("a page's data carries the shop's words into its sections", /words: localizer\?\.words,/.test(site) && /words: previewLang\.words \}\)/.test(readCode("app/website-builder/editor/[installId]/page.tsx")))

  console.log("\n8. The default language, live and in the builder, for both kinds of theme")
  const live = readCode("lib/markets/live.ts")
  check("the localizer reads the default language's translations when no other is asked for", /: await cachedTranslations\(creatorId, langs\.defaultLanguage\)/.test(live))
  check("every live page asks for it, not only /fr", /const localizer = await siteLocalizer\(site\.creatorId, locale, market\)/.test(site) && /const localizer = await siteLocalizer\(creator\.creatorId, locale\)/.test(readCode("app/(site)/w/[username]/render-site.tsx")) && /const localizer = await siteLocalizer\(creator\.creatorId, pageLocale\)/.test(readCode("app/(site)/w/[username]/products/[slug]/page.tsx")) && /const localizer = owner && !previewToken \? await siteLocalizer/.test(readCode("components/website-builder/theme/render-product.tsx")) && /siteLocalizer\(published\.creatorId, extras\.lang\?\.locale \?\? null/.test(readCode("app/(site)/w/[username]/render-account.tsx")))
  check("the product's search result data (JSON-LD) in the page's language", /inLanguage: localizer \? \(p\) => localizer\.product\(p\) : undefined \}\)/.test(readCode("app/(site)/w/[username]/products/[slug]/page.tsx")))
  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  check("the canvas opens in the default language's map, a Storelib theme and an imported one alike", /const shown = locale \?\? info\.defaultLanguage/.test(readCode("components/website-builder/use-preview-language.ts")) && /previewLang\.locale \|\| previewMap \? \{ locale: previewLang\.locale \?\? previewLang\.defaultLanguage/.test(editor))
  check("the canvas lays it over a Storelib theme's collections, its product page's product and its brand text", /const collectionCardsShown = useMemo/.test(editor) && /`product:\$\{found\.id\}`, \["title", "description"\], previewMap/.test(editor) && /theme: previewMap \? localizeTheme\(activeThemeSettings/.test(editor))
  check("the canvas and the website read the same block fields, a theme block's included", /blockCatalog\[bt\]\?\.fields/.test(editor) && /textFieldsFrom\(sources\)/.test(live) && /textFieldsFrom\(sources\)/.test(readCode("lib/markets/server.ts")))

  console.log("\n9. An imported (compat) theme: its sections, blocks, words, products and collections")
  const sec = (type: string, markup: string, settings: unknown[], blocks: unknown[] = []) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings, blocks })}\n</schema>\n`
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`),
    "sections/banner.storelib": sec("banner", `<div class="bn"><h1>{{ section.settings.heading }}</h1><p>{{ section.settings.text }}</p>{% for b in section.blocks %}<a class="btn">{{ b.settings.label }}</a>{% endfor %}<span class="w">{{ 'general.shop_now' | t }}</span></div>`, [{ id: "heading", type: "text", label: "Heading", default: "Made by hand" }, { id: "text", type: "richtext", label: "Text" }, { id: "image", type: "image_picker", label: "Image" }], [{ type: "button", name: "Button", settings: [{ id: "label", type: "text", label: "Label", default: "Shop now" }] }]),
    "locales/en.default.json": JSON.stringify({ general: { shop_now: "Browse the shop" } }),
  }
  const compat = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const cf = compatFields(compat)
  const compatSections = [{ id: "h", type: "banner", settings: { text: "<p>Small batch mugs</p>" }, blocks: [{ id: "k", type: "button", settings: {} }] }] as unknown as SectionInstance[]
  const compatItems = translatablesOf(compatSections, cf.fieldsOf, cf.blockFieldsOf)
  check("its section's typed text, its default heading and its block's default label are listed", ["section:h:heading", "section:h:text", "block:h:k:label"].every((k) => compatItems.some((i) => i.key === k)))
  const cm = everyKeyTranslated(compatItems)
  const wordRows = compat.defaultWords().map((w, i) => ({ key: `tw:${w.key}`, value: `zt${i}tz`, sourceHash: sourceHash(w.value), status: "approved" as const, source: "manual" as const }))
  const fullMap = translationMap([...[...cm.map.values()], ...wordRows])
  const twords = compatThemeWords(compat.defaultWords(), fullMap)
  check("its own words (`| t`) are read from the map by the function the live site and the canvas share", twords["general.shop_now"] === "zt0tz")
  const pages = { home: localizeSections(compatSections, fullMap, cf.fieldsOf, cf.blockFieldsOf, { approvedOnly: true, fresh: true }) as never }
  const compatSite: SiteData = { creatorId: "c", theme: compat, pages, products: [], collections: [], menus: {}, shop: { name: "Mugs", currency: "RON", moneyFormat: "{{amount}} lei" }, host: "mugs.storelib.com", i18n: { locale: "es", defaultLanguage: "es", languages: ["es"], words: twords } }
  const html = String((await answer(compatSite, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body)
  const main = html.match(/<div class="bn">[\s\S]*?<\/div>/)?.[0] ?? ""
  checkWith("drawn in the default language: the heading, the text, the button and the theme's word, all translated", ["section:h:heading", "section:h:text", "block:h:k:label"].every((k) => main.includes(cm.marker.get(k)!)) && main.includes("zt0tz") && !/Made by hand|Small batch|Shop now|Browse the shop/.test(main), main)
  const card = compatCardIn({ id: P_ID, settings: { ...shopCard.settings, seo_title: "Linen apron | Mugs" }, descriptionHtml: "<p>Washed linen.</p>" }, translationMap([
    { key: `product:${P_ID}:title`, value: "Delantal", sourceHash: sourceHash("Linen apron"), status: "approved", source: "manual" },
    { key: `product:${P_ID}:description`, value: "<p>Lino lavado.</p>", sourceHash: sourceHash("<p>Washed linen.</p>"), status: "approved", source: "manual" },
    { key: `product:${P_ID}:seo_title`, value: "Delantal | Mugs", sourceHash: sourceHash("Linen apron | Mugs"), status: "approved", source: "manual" },
    { key: optionKey("Size"), value: "Talla", sourceHash: sourceHash("Size"), status: "approved", source: "manual" },
    { key: optionKey("Small"), value: "Pequeña", sourceHash: sourceHash("Small"), status: "approved", source: "manual" },
  ]))
  const cs = card.settings as Record<string, unknown>
  checkWith("a product: title, plain description, search engine title, options and variants, and the page's rich description", cs.title === "Delantal" && cs.description === "Lino lavado." && cs.seo_title === "Delantal | Mugs" && (cs.options as { name: string }[])[0].name === "Talla" && (cs.variants as { name: string }[])[0].name === "Pequeña" && card.descriptionHtml === "<p>Lino lavado.</p>", cs)
  const col = compatCollectionIn({ id: C_ID, title: "Aprons", description: "Every apron." }, translationMap([{ key: `collection:${C_ID}:title`, value: "Delantales", sourceHash: sourceHash("Aprons"), status: "approved", source: "manual" }]))
  check("a collection's name", col.title === "Delantales" && col.description === "Every apron.")
  const canvas = readCode("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas uses the same three functions, collections translated with no currency change too", /compatCardIn\(/.test(canvas) && /compatCollectionIn\(c, map\)/.test(canvas) && /compatThemeWords\(compatTheme\.defaultWords\(\), map\)/.test(canvas) && !/pricing && inPreview \? props\.collections/.test(canvas))
  check("  and a product page's variant facts are put back in the language", /localizeOptions\(facted\.settings, map/.test(canvas))
  const compatLive = readCode("lib/markets/compat.ts")
  check("live: page and site search engine text (page:<key>:seo_title, seo_description) laid over", /valueFor\(map, `page:\$\{key\}:seo_title`, opts, s\.title\)/.test(compatLive) && /\n    seo,\n/.test(compatLive))
}

coverage().then(
  () => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) {
      console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
      process.exit(1)
    }
  },
  (e) => {
    console.error(e)
    process.exit(1)
  },
)

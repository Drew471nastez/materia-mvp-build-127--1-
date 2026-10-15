/**
 * What a page knows about its own shop, built once per draw: menus (with the
 * header's links as main-menu), the catalogue a picker names, the dynamic
 * source pass over both kinds of section, the product a product page shows,
 * and the sanitiser reading a creator's own section schemas.
 *
 *   npx esbuild tests/storefront-data.test.ts --bundle --platform=node --format=cjs \
 *     --alias:@=. --alias:server-only=/tmp/claude-0/empty.js --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  MAIN_MENU,
  dynamicContext,
  menuFromHeader,
  mergeCatalog,
  missingReferences,
  productFacts,
  productReferences,
  siteMenus,
  withDynamicSources,
} from "@/lib/website-builder/storefront-data"
import { creatorFacts, pickedProducts } from "@/lib/website-builder/storefront-data-server"
import { isUntouchedPlaceholder, withMainProduct } from "@/lib/website-builder/product-page"
import { customSchemaLookup, schemaLookupFrom } from "@/lib/website-builder/custom-schemas"
import { htmlFieldsOf } from "@/lib/website-builder/sanitize"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { schemaFor } from "@/lib/website-builder/storelib-schemas"
import { toCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else { failed++; failures.push(name) }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const header: SectionInstance = {
  id: "h",
  type: "header",
  name: "Header",
  settings: { logo_text: "{{ shop.name }}" },
  blocks: [
    { id: "n1", type: "nav_link", settings: { label: "Shop", url: "/products", link_type: "custom" } },
    { id: "n2", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "n1" } },
    { id: "n3", type: "nav_link", settings: { label: "About", link_type: "page", target_id: "about" } },
    { id: "n4", type: "nav_link", settings: { label: "", url: "/nothing" } },
  ],
}
const schemaOf = (type: string) => schemaFor(type, {}, SECTION_SCHEMAS)

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Menus: the header's links are main-menu, and a creator's menus are theirs")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const m = menuFromHeader(header)
    check("root links in order, children under their parent", JSON.stringify(m?.links.map((l) => l.title)) === JSON.stringify(["Shop", "About"]) && m?.links[0].links?.[0].title === "Ebooks")
    check("a page link goes to its page", m?.links[1].url === "/about")
    check("a link with no label is not a link", !m?.links.some((l) => l.url === "/nothing"))
    const own = siteMenus({ menus: { footer: { title: "Footer", links: [{ title: "Terms", url: "/terms-of-service" }] } } }, [header])
    check("main-menu is there alongside the creator's own", !!own[MAIN_MENU] && own.footer?.links[0].title === "Terms")
    const replaced = siteMenus({ menus: { [MAIN_MENU]: { title: "Mine", links: [{ title: "Only", url: "/" }] } } }, [header])
    check("a creator's own main-menu wins over the header's", replaced[MAIN_MENU].title === "Mine" && replaced[MAIN_MENU].links.length === 1)
    check("no header and no menus is no menus", Object.keys(siteMenus({}, [])).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Picked products: found by the settings that are pickers, fetched only when missing")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const hero: SectionInstance = { id: "hp", type: "hero_product", name: "Hero", settings: { button_url: "/products/linen-apron", heading: "/products/not-a-picker" }, blocks: [] }
    const refs = productReferences([hero], schemaOf)
    check("a product_picker's address is a reference", refs.slugs.includes("linen-apron"))
    check("a text setting that looks like one is not", !refs.slugs.includes("not-a-picker"))
    const cards = [toCard({ id: "p1", title: "Linen apron", slug: "linen-apron", price_cents: 6400, compare_at_cents: null, thumbnail_url: null, status: "published" })]
    check("a reference the catalogue answers is not fetched again", missingReferences(refs, cards).slugs.length === 0)
    check("merging keeps one of each", mergeCatalog(cards, cards, [cards[0]]).length === 1)

    const calls: string[][] = []
    const fake = {
      from: (table: string) => ({
        select: (cols: string) => {
          const filters: string[] = [table, cols]
          const q = {
            eq: (c: string, v: string) => { filters.push(`${c}=${v}`); return q },
            in: (c: string, v: string[]) => { filters.push(`${c} in ${v.join(",")}`); return q },
            limit: () => { calls.push(filters); return Promise.resolve({ data: [{ id: "p9", title: "Old one", slug: "old-one", price_cents: 100, compare_at_cents: null, thumbnail_url: null, status: "published" }] }) },
            maybeSingle: () => Promise.resolve({ data: null }),
          }
          return q
        },
      }),
    }
    const got = await pickedProducts(fake as never, "creator-1", { ids: ["3f2a9c1e-0000-4000-8000-000000000001"], slugs: ["old-one", "bad slug; drop"] })
    /* Changed on purpose (round T): the products taken off the Online store are read beside them (lib/store/channel-filter), for the same creator. */
    check("picked products are read for this creator, published only", calls.filter((f) => f[0] === "products").every((f) => f.includes("creator_id=creator-1") && f.includes("status=published")) && calls.filter((f) => f[0] !== "products").every((f) => f[0] === "product_channel_listings" && f.includes("creator_id=creator-1")))
    check("a slug that is not a slug is never sent", !calls.some((f) => f.some((x) => x.includes("bad slug"))))
    check("and come back as cards", got.length === 2 && got[0].settings.url === "/products/old-one")
    check("no creator id reads nothing", (await pickedProducts(fake as never, "", { ids: ["3f2a9c1e-0000-4000-8000-000000000001"], slugs: [] })).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The dynamic pass fills both kinds of section and never touches what is stored")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const dyn = dynamicContext({ theme: { brand_name: "Drew & Co", social_instagram: "https://instagram.com/drew" }, creator: { name: "Drew" }, siteUrl: "https://drew.storelib.com", productCount: 3, pageTitle: "About", now: new Date("2026-09-25T00:00:00Z") })
    check("the shop's name is the brand, the year is this year", dyn.shop?.name === "Drew & Co" && dyn.date?.year === 2026)
    const text: SectionInstance = { id: "t", type: "text_rich", name: "Text", settings: { heading: "About {{ shop.name }}", body: "<p>Made by {{ creator.name }} in {{ date.year }}</p>" }, blocks: [] }
    const plain: SectionInstance = { id: "p", type: "text_rich", name: "Text", settings: { heading: "Nothing to fill" }, blocks: [] }
    const before = JSON.stringify([header, text, plain])
    const out = withDynamicSources([header, text, plain], schemaOf, dyn)
    check("a React section (the header) is filled", out[0].settings.logo_text === "Drew & Co")
    check("a .storelib section's text is filled", out[1].settings.heading === "About Drew & Co")
    check("its rich text is filled escaped", out[1].settings.body === "<p>Made by Drew in 2026</p>")
    check("a section with no placeholder is the same object", out[2] === plain)
    check("what was stored is exactly as it was", JSON.stringify([header, text, plain]) === before)
    const none = [plain]
    check("a page with no placeholder is the same array", withDynamicSources(none, schemaOf, dyn) === none)
    const rich: SectionInstance = { id: "r", type: "text_rich", name: "Text", settings: { body: "<p>{{ shop.name }}</p>" }, blocks: [] }
    const hostile = dynamicContext({ theme: { brand_name: "<img src=x onerror=alert(1)>" } })
    check("a hostile shop name lands in rich text as words", !/<img/.test(String(withDynamicSources([rich], schemaOf, hostile)[0].settings.body)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A product page's product, cleaned")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const facts = productFacts({
      id: "p1", title: "Tee", slug: "tee", price_cents: 2000, compare_at_cents: 2500,
      description: `<p>Soft <strong>cotton</strong></p><script>alert(1)</script><img src=x onerror=alert(2)>`,
      thumbnail_url: "https://cdn.example/a.webp", gallery_urls: ["https://cdn.example/a.webp", "javascript:alert(3)", "https://cdn.example/b.webp"],
      whats_included: ["PDF", " ", "Workbook"],
    })!
    check("the price and the price before sale are formatted", facts.price === "$20.00" && facts.compare_price === "$25.00")
    check("the description's markup is cleaned against the rich text list", !/script|onerror/i.test(facts.description_html ?? "") && /<strong>cotton<\/strong>/.test(facts.description_html ?? ""))
    check("and its words are there on their own", facts.description === "Soft cotton")
    check("pictures are web addresses, once each, in order", JSON.stringify(facts.images) === JSON.stringify(["https://cdn.example/a.webp", "https://cdn.example/b.webp"]))
    check("what's included drops the empty lines", JSON.stringify(facts.includes) === JSON.stringify(["PDF", "Workbook"]))
    check("its address is on this site", facts.url === "/products/tee")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every product page shows the product")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const placeholder: SectionInstance = { id: "product-hero", type: "split_content", name: "Product", settings: { heading: "Product Name" }, blocks: [] }
    const footer: SectionInstance = { id: "f", type: "footer", name: "Footer", settings: {}, blocks: [] }
    const page = withMainProduct([header, placeholder, footer])
    check("the untouched placeholder is replaced by the product section", page[1].type === "product" && page.length === 3)
    const edited = { ...placeholder, settings: { heading: "My handmade tees" } }
    const kept = withMainProduct([header, edited, footer])
    check("a placeholder somebody rewrote is kept, and the product goes under the header", kept[1].type === "product" && kept[2] === edited)
    const already = [header, { id: "x", type: "product", name: "P", settings: {}, blocks: [] }, footer]
    check("a page that has one is the same array", withMainProduct(already) === already)
    const hidden = [header, { id: "x", type: "product", name: "P", settings: {}, blocks: [], hidden: true }]
    check("a product section hidden on purpose stays hidden", withMainProduct(hidden) === hidden)
    check("only the preset's own id counts as the placeholder", !isUntouchedPlaceholder({ ...placeholder, id: "mine" }))
    const presets = read("lib/website-builder/theme-registry.ts")
    check("new themes start with the product section, not the placeholder", /section\("main-product", "product"/.test(presets) && !/section\("product-hero", "split_content"/.test(presets))
    check("and so does a first website", !/id: "product-hero",\s*\n\s*type: "split_content"/.test(read("app/api/website-builder/initialize/route.ts")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A creator's own section is cleaned by its own schema")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("html settings are cleaned as custom HTML, inline rich text as one line", JSON.stringify(htmlFieldsOf([{ id: "a", type: "html" }, { id: "b", type: "inline_richtext" }])) === JSON.stringify({ a: "custom", b: "inline" }))
    const file = `<template><div>{{ settings.intro | raw }}</div></template>
<schema>{"type":"mine","name":"Mine","settings":[{"type":"richtext","id":"intro","label":"Intro"},{"type":"inline_richtext","id":"line","label":"Line"}],"presets":[{"name":"Mine"}]}</schema>`
    const mine: SectionInstance = { id: "m", type: "mine", name: "Mine", settings: { intro: `<p>Hi</p><img src=x onerror=alert(1)>`, line: `<b>ok</b><script>x</script>` }, blocks: [] }
    const builtInOnly = sanitizeSections([mine])[0]
    check("without its schema, a custom id is not known to hold markup", builtInOnly.settings.intro === mine.settings.intro)
    const cleaned = sanitizeSections([mine], schemaLookupFrom({ "sections/mine.storelib": file }))[0]
    check("with it, its richtext is cleaned", !/onerror/.test(String(cleaned.settings.intro)) && /<p>Hi<\/p>/.test(String(cleaned.settings.intro)))
    check("and its inline rich text too", cleaned.settings.line === "<b>ok</b>")

    const asked: string[] = []
    const db = {
      from: () => ({
        select: (cols: string) => ({
          eq: () => ({
            in: (_c: string, paths: string[]) => {
              asked.push(`${cols}|${paths.join(",")}`)
              return Promise.resolve({ data: [{ path: "sections/mine.storelib", content: "", draft_content: file }], error: null })
            },
          }),
        }),
      }),
    }
    const lookup = await customSchemaLookup(db as never, "install-1", [mine, header], { draft: true })
    check("only the files this page's types have are asked for", asked.length === 1 && asked[0].endsWith("sections/mine.storelib,sections/header.storelib"))
    check("the editor reads the draft of a file", !!lookup && lookup("mine")?.fields.some((f) => f.id === "intro") === true)
    const none = await customSchemaLookup(db as never, "install-1", [], { draft: true })
    check("a page with no sections asks nothing", none === undefined && asked.length === 1)
    const route = read("app/api/website-builder/themes/[installId]/sections/route.ts")
    /* A save reads the page's own section files into field maps (main's readOwnSectionFields); the sanitiser takes either form. */
    check("a save is cleaned by the page's own section files", /const own = await readOwnSectionFields\(supabase, installId, raw\.map\(\(s\) => s\.type\)\)/.test(route) && /sanitizeSections\(raw, own\)/.test(route))
    check("and no database error text reaches the browser from that route", !/error: (fetchErr|updateErr|insertErr|deleteErr)\.message/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The creator's facts are the public ones")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const asked: string[] = []
    const db = {
      from: (table: string) => ({
        select: (cols: string) => {
          asked.push(`${table}:${cols}`)
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: table === "creators"
                  ? { user_id: "u1", display_name: "Drew", headline: "Makes things", bio: "Bio" }
                  : { display_name: "Drew R", avatar_url: "javascript:alert(1)" },
              }),
            }),
          }
        },
      }),
    }
    const facts = await creatorFacts(db as never, "c1")
    check("name, headline and bio come through", facts.name === "Drew R" && facts.headline === "Makes things" && facts.bio === "Bio")
    check("a photo that is not a web address is none", facts.avatar === "")
    check("nothing private is asked for", asked.every((a) => !/email|stripe|payout|phone/i.test(a)), asked)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()

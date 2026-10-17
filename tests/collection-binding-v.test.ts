/**
 * ===========================================================================
 *  A PICKED COLLECTION BRINGS ITS OWN PICTURE, TITLE AND COUNT
 * ===========================================================================
 * The owner: "when a collection is picked in any section/block,
 * automatically bind and display its featured image, title and relevant
 * data without manual uploads; optional custom image and title overrides
 * with clear Reset to collection controls; fallback to the first product's
 * image when the collection has none; automatic bindings stay synchronised
 * when the collection changes."
 *
 * What was there: `settings.collection` carried the collection's fields to a
 * template that read them, but a picture or a title of the section's own
 * could not follow the collection: it was typed and uploaded beside it, and
 * went stale. Now a setting may say `"from": "collection.image"`
 * (lib/storelib-theme/collection-binding.ts): the collection's while it is
 * empty, its own once set, the collection's again once cleared.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/collection-binding-v.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { COLLECTION_BINDINGS, boundState, fromProblem, parseFrom, withCollectionBindings } from "@/lib/storelib-theme/collection-binding"
import { resolveSettings } from "@/lib/storelib-theme/resolve"
import { compileSection, compileThemeFile } from "@/lib/storelib-theme/storelib/compile"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { schemaFor, themeBlockCatalog } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { CONTROLS } from "@/lib/storelib-theme/controls/registry"
import type { StorefrontCollection } from "@/lib/storelib-theme/types"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const KITCHEN = "c1c1c1c1-0000-4000-8000-000000000001"
const BARE = "c1c1c1c1-0000-4000-8000-000000000002"
const THEIRS = "c1c1c1c1-0000-4000-8000-000000000003"
/* Storelib's own address for an upload (lib/storage/media-url.ts), the one the image optimizer serves. */
const FULL = "https://storelib.com/media/kitchen-4000x3000.jpg"

function collection(id: string, title: string, extra: Partial<StorefrontCollection> = {}): StorefrontCollection {
  const handle = title.toLowerCase().replace(/\s+/g, "-")
  return { id, title, handle, description: `${title}, chosen by hand`, image: FULL, url: `/collections/${handle}`, products_count: 3, products: [], ...extra }
}

/* The shape PostgREST answers in, enough for siteCollections (as tests/shopify-parity-u.test.ts reads it). */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    product_collections: [
      { id: KITCHEN, creator_id: A, title: "Kitchen", slug: "kitchen", description: "For the kitchen", image_url: FULL, kind: "manual", rules: [], match: "all", sort: "manual", published: true, created_at: "2026-01-01" },
      { id: BARE, creator_id: A, title: "No picture", slug: "no-picture", description: "", image_url: null, kind: "manual", rules: [], match: "all", sort: "manual", published: true, created_at: "2026-01-02" },
      { id: THEIRS, creator_id: B, title: "Somebody else's", slug: "else", description: "", image_url: "https://cdn.test/else.jpg", kind: "manual", rules: [], match: "all", sort: "manual", published: true, created_at: "2026-01-01" },
    ],
    product_collection_items: [
      { collection_id: BARE, product_id: "pa1", position: 0 },
      { collection_id: KITCHEN, product_id: "pa1", position: 0 },
    ],
    products: [{ id: "pa1", creator_id: A, title: "Oak board", slug: "oak-board", price_cents: 3000, thumbnail_url: "https://cdn.test/oak.jpg", status: "published", type: "physical", tags: [] }],
  }
  const asked: { table: string; eq: [string, unknown][] }[] = []
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    const record = { table, eq: [] as [string, unknown][] }
    asked.push(record)
    let limitN = Infinity
    const q: Record<string, unknown> = {}
    const run = () => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limitN), error: null })
    Object.assign(q, {
      select: () => q,
      eq: (col: string, val: unknown) => { record.eq.push([col, val]); filters.push((r) => r[col] === val); return q },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q },
      order: () => q,
      limit: (n: number) => { limitN = n; return q },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    })
    return q
  }
  return { db: { from }, asked, tables }
}

async function main() {
  console.log("\nWhat a setting may follow, and the check that holds it")
  {
    check("\"collection.image\" is the picker and the field", JSON.stringify(parseFrom("collection.image")) === JSON.stringify({ picker: "collection", field: "image" }))
    check("  image, title, description and url, nothing else", Object.keys(COLLECTION_BINDINGS).join() === "image,title,description,url" && parseFrom("collection.products") === null && parseFrom("collection") === null)
    const siblings = [{ id: "collection", type: "collection_picker" }, { id: "words", type: "text" }]
    check("a picture setting may follow a picker beside it", fromProblem({ id: "image", type: "image_picker", from: "collection.image" }, siblings) === null)
    check("  Shopify's names for the types too", fromProblem({ id: "image", type: "image", from: "collection.image" }, [{ id: "collection", type: "collection" }]) === null)
    check("refused: a picker that is not there", /is not a collection_picker setting/.test(fromProblem({ id: "image", type: "image_picker", from: "kollection.image" }, siblings) ?? ""))
    check("refused: a setting beside it that is not a collection picker", /is not a collection_picker setting/.test(fromProblem({ id: "image", type: "image_picker", from: "words.image" }, siblings) ?? ""))
    check("refused: a text box holding a picture", /cannot hold the collection's image/.test(fromProblem({ id: "t", type: "text", from: "collection.image" }, siblings) ?? ""))
    check("the registry says which controls take it", ["text", "textarea", "image_picker", "url"].every((t) => CONTROLS[t as keyof typeof CONTROLS].accepts.includes("from")) && !CONTROLS.range.accepts.includes("from"))
    const block = compileThemeFile(DEFAULT_THEME_SOURCES["blocks/collection_card.storelib"], { file: "blocks/collection_card.storelib" })
    check("the Collection card block compiles", block.ok === true, block.ok === false ? (block as { errors: unknown }).errors : undefined)
    const broken = compileThemeFile(DEFAULT_THEME_SOURCES["blocks/collection_card.storelib"].replace('"from": "collection.image"', '"from": "colection.image"'), { file: "blocks/collection_card.storelib" })
    const be = broken.ok === false ? (broken as { errors: { message: string; line?: number }[] }).errors[0] : null
    check("  and a mistyped one is refused with its line, as any schema is", !!be && /"colection" is not a collection_picker setting/.test(be.message) && typeof be.line === "number")
  }

  console.log("\nBound, overridden, reset: read when the page is drawn")
  {
    const block = compileThemeFile(DEFAULT_THEME_SOURCES["blocks/collection_card.storelib"], { file: "blocks/collection_card.storelib" })
    const defs = block.ok === true ? ((block as { value: { schema: { settings: never[] } } }).value.schema.settings) : []
    const collections = { [KITCHEN]: collection(KITCHEN, "Kitchen") }
    const bound = resolveSettings(defs, { collection: KITCHEN }, { collections })
    check("picked, nothing else set: the card is the collection's picture, title and words", bound.image === FULL && bound.title === "Kitchen" && bound.description === "Kitchen, chosen by hand", { image: bound.image, title: bound.title })
    check("  and settings.collection still carries the whole collection", String(bound.collection) === "/collections/kitchen" && (bound.collection as { fields: { products_count: number } }).fields.products_count === 3)
    const own = resolveSettings(defs, { collection: KITCHEN, title: "Pans and pots", image: "https://cdn.test/mine.jpg" }, { collections })
    check("a title and a picture of its own are drawn instead", own.title === "Pans and pots" && own.image === "https://cdn.test/mine.jpg")
    check("  the rest still follows the collection", own.description === "Kitchen, chosen by hand")
    const reset = resolveSettings(defs, { collection: KITCHEN, title: "", image: "" }, { collections })
    check("Reset to collection empties it, and the collection's is drawn again", reset.title === "Kitchen" && reset.image === FULL)
    const renamed = resolveSettings(defs, { collection: KITCHEN }, { collections: { [KITCHEN]: collection(KITCHEN, "Cookware", { image: "https://cdn.test/new.jpg" }) } })
    check("the collection renamed and given a new picture: the card has both, nothing was copied", renamed.title === "Cookware" && renamed.image === "https://cdn.test/new.jpg")
    const overriddenRenamed = resolveSettings(defs, { collection: KITCHEN, title: "Pans and pots" }, { collections: { [KITCHEN]: collection(KITCHEN, "Cookware") } })
    check("  while a title of its own stays its own", overriddenRenamed.title === "Pans and pots")
    const other = resolveSettings(defs, { collection: THEIRS }, { collections })
    check("an id that is not one of this creator's collections binds nothing", other.collection === "" && other.title === "" && other.image === "")
    const none = resolveSettings(defs, {}, { collections })
    check("no collection picked: an ordinary empty setting", none.title === "" && none.image === "")
    check("a setting with no from is left alone", withCollectionBindings([{ id: "x" }], { x: "", collection: "c" }).x === "")
  }

  console.log("\nThe creator's own collections, a picture for each")
  {
    const { siteCollections } = await import("@/lib/website-builder/storefront-collections-server")
    const { db, asked } = fakeDb()
    const visitor = await siteCollections(db, A)
    check("a collection with no picture of its own takes its first product's", visitor.collections[BARE.toLowerCase()]?.image === "https://cdn.test/oak.jpg", visitor.collections[BARE.toLowerCase()])
    check("a collection's own picture is the address it was uploaded at, at full size: no resize, no new copy", visitor.collections[KITCHEN.toLowerCase()]?.image === FULL)
    check("never another creator's collection", !(THEIRS.toLowerCase() in visitor.collections))
    check("every collection read is filtered by the creator", asked.filter((q) => q.table === "product_collections").every((q) => q.eq.some(([c, v]) => c === "creator_id" && v === A)))
    const block = compileThemeFile(DEFAULT_THEME_SOURCES["blocks/collection_card.storelib"], { file: "blocks/collection_card.storelib" })
    const defs = block.ok === true ? ((block as { value: { schema: { settings: never[] } } }).value.schema.settings) : []
    const bare = resolveSettings(defs, { collection: BARE }, { collections: visitor.collections })
    check("so a card for it shows the product's picture, with nothing uploaded", bare.image === "https://cdn.test/oak.jpg" && bare.title === "No picture")
  }

  console.log("\nDrawn on the page, in the canvas and on the live site alike")
  {
    const collections = { [KITCHEN]: collection(KITCHEN, "Kitchen") }
    const section = {
      id: "s1",
      type: "blocks_section",
      settings: { direction: "row" },
      blocks: [
        { id: "b1", type: "collection_card", settings: { collection: KITCHEN } },
        { id: "b2", type: "collection_card", settings: { collection: KITCHEN, title: "Pans and pots" } },
      ],
    }
    const r = renderStorelibSection(section as never, {} as never, { template: "index" }, undefined, undefined, { collections } as never)
    const html = r.ok === true ? (r as { html: string }).html : ""
    check("a Collection card in a section draws the collection's picture, name and count", /<img[^>]+src="https:\/\/storelib\.com\/media\/kitchen-4000x3000\.jpg"/.test(html) && />Kitchen</.test(html) && /3 products/.test(html), html.slice(0, 600))
    check("  linking to it", /href="\/collections\/kitchen"/.test(html))
    check("  and the second card its own title over the same collection", />Pans and pots</.test(html))
    const img = html.match(/<img[^>]*>/)?.[0] ?? ""
    const widths = [...(img.match(/srcset="([^"]*)"/)?.[1] ?? "").matchAll(/ (\d+)w/g)].map((m) => Number(m[1]))
    check("  the picture is offered at the widths a screen needs, up to 2048, each made from the original upload", widths.length >= 5 && Math.max(...widths) >= 2048 && /kitchen-4000x3000\.jpg/.test(img.match(/srcset="([^"]*)"/)?.[1] ?? "") && /sizes="\(min-width: 900px\) 33vw, 100vw"/.test(img), img)
    const featured = { id: "f1", type: "collection_featured", settings: { collection: KITCHEN } }
    const f = renderStorelibSection(featured as never, {} as never, { template: "index" }, undefined, undefined, { collections } as never)
    const fh = f.ok === true ? (f as { html: string }).html : ""
    check("Featured collection's heading follows the collection until one is typed", /<h2 class="s__h[^"]*">Kitchen<\/h2>/.test(fh), fh.slice(0, 300))
    const typed = renderStorelibSection({ ...featured, settings: { collection: KITCHEN, heading: "Our kitchen" } } as never, {} as never, { template: "index" }, undefined, undefined, { collections } as never)
    check("  and keeps the one typed", /Our kitchen<\/h2>/.test(typed.ok === true ? (typed as { html: string }).html : ""))
    const featuredSchema = schemaFor("collection_featured", {}, SECTION_SCHEMAS)
    check("  its heading setting says where it comes from, so the sidebar can show it", featuredSchema?.fields.find((x) => x.id === "heading")?.from === "collection.title")
    const catalog = themeBlockCatalog({}, { builtIn: true })
    check("the Collection card is in Add block for a section that takes theme blocks", !!catalog.collection_card && catalog.collection_card.fields.find((x) => x.id === "image")?.from === "collection.image")
    check("the built-in sections still compile", ["collection_featured", "collections_grid", "product_grid", "product_featured"].every((t) => compileSection(DEFAULT_THEME_SOURCES[`sections/${t}.storelib`], { file: `sections/${t}.storelib` }).ok === true))
  }

  console.log("\nIn the sidebar: the collection's, then Reset to collection")
  {
    const choices = [{ id: KITCHEN, title: "Kitchen", image: FULL, published: true, products_count: 3, description: "Kitchen things", url: "/collections/kitchen" }]
    const following = boundState({ from: "collection.image" }, "", { collection: KITCHEN }, choices)
    check("following: the collection it follows and the picture the page draws", following?.collection?.title === "Kitchen" && following.fromCollection === FULL && following.overridden === false)
    const ownTitle = boundState({ from: "collection.title" }, "Pans", { collection: KITCHEN }, choices)
    check("its own value: overridden, so Reset to collection is offered", ownTitle?.overridden === true && ownTitle.fromCollection === "Kitchen")
    check("no collection picked, or one that is gone: an ordinary field", boundState({ from: "collection.title" }, "", {}, choices)?.collection === null && boundState({ from: "collection.title" }, "", { collection: THEIRS }, choices)?.collection === null)
    check("a field without from is not bound", boundState({}, "", { collection: KITCHEN }, choices) === null)
    const control = read("components/website-builder/editor/controls/collection-bound-field.tsx")
    check("the control: the picture in the picker and the title as the placeholder while it follows", /kind === "image_picker"\s*\? \{ field, value: state\.fromCollection \}/.test(control) && /placeholder: state\.fromCollection \|\| field\.placeholder/.test(control))
    check("  Reset to collection empties the setting, nothing else", /onClick=\{\(\) => onChange\(""\)\}>[\s\S]{0,40}Reset to collection/.test(control))
    check("  in plain words, no em dash", !/—/.test(control.replace(/\/\*[\s\S]*?\*\//g, "")))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("every setting the sidebar draws goes through it", /<CollectionBoundField field=\{props\.field\} value=\{props\.value\} onChange=\{props\.onChange\}>/.test(editor))
    check("  with each collection's words and address beside its picture", /collections: builderCollections \? builderCollections\.choices\.map\(\(c\) => \(\{ \.\.\.c, description: builderCollections\.cards\[c\.id\]\?\.description/.test(editor))
  }

  console.log("\nAgents are told the fields")
  {
    const schema = read("content/developers/schema.md")
    check("the schema docs name the fields and from", /`collection\.image`/.test(schema) && /`collection\.products_count`/.test(schema) && /"from": "collection\.image"/.test(schema) && /Reset to collection/.test(schema))
    check("  and the generated docs carry it", /"from": \\"collection\.image\\"|\\"from\\": \\"collection\.image\\"/.test(read("lib/developers/content.generated.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Round H4: a photo for each variant that is quick to set and follows the
 * buyer's choice on every storefront, and the product's FAQ shown on every
 * product page.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/product-variants-faq-h.test.ts
 *
 * The browser half (render cost with 30 variants, the picker at 390 and
 * 1280, the FAQ in Dawn, Horizon and an imported store theme) is in the H4
 * report; this holds the rules without a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { emptyRow, photoScopes, variantThumbSrc, type VariantRow } from "@/components/physical/variant-rows"
import { combinationKey } from "@/lib/physical/variants"
import { productObject } from "@/lib/storelib-theme/compat/objects"
import { productJson, productFeedJson } from "@/lib/storelib-theme/compat/site"
import { faqBlockHtml, faqTabHtml, faqsOf, themeReadsFaqs, withFaqTab, withFaqUnderDescription } from "@/lib/storelib-theme/compat/product-faq"
import { toCard, toVariant } from "@/lib/website-builder/shop-products"
import { productFaqs, productFaqsHtml } from "@/lib/products/product-faqs"
import { productFacts, dynamicContext } from "@/lib/website-builder/storefront-data"
import { fillSources, DYNAMIC_SOURCES } from "@/lib/storelib-theme/dynamic"
import { FAQ_SEEDED, withProductBlocks, withProductFaq, mainProductSection } from "@/lib/website-builder/product-page"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

console.log("\nA photo for each variant: smooth in the editor")
{
  const table = read("components/physical/variant-table.tsx")
  const cards = read("components/physical/product-cards.tsx")
  check("a row is memoised and handed only its own row, not the whole table", /const VariantLine = React\.memo\(/.test(table) && !/<VariantLine[\s\S]{0,40}\{\.\.\.props\}/.test(table))
  check("  a group line redraws only for its own rows", /const GroupLine = React\.memo\([\s\S]*?, sameGroup\)/.test(table))
  check("  a row's details are built on first open, not for every row", /if \(open && !built\) setBuilt\(true\)/.test(table) && /\{built \? \(/.test(table))
  check("the callbacks rows get keep their identity", /const setRow = React\.useCallback\(/.test(cards) && /const patchRows = React\.useCallback\(/.test(cards) && /const pickImage = React\.useCallback\(/.test(cards) && /pickImage=\{pickImage\}/.test(cards))
  check("  and the options editor is not redrawn by a price typed in a row", /const MemoOptionsEditor = React\.memo\(OptionsEditor\)/.test(cards) && /const renameValue = React\.useCallback\(/.test(cards))
  const own = "https://abc.supabase.co/storage/v1/object/public/product-images/a.jpg"
  check("a variant's square loads a 128px copy, never the original", variantThumbSrc(own) === `/_next/image?url=${encodeURIComponent(own)}&w=128&q=88`, variantThumbSrc(own))
  check("  a local preview or another host is drawn as it is", variantThumbSrc("blob:x") === "blob:x" && variantThumbSrc("https://example.com/a.jpg") === "https://example.com/a.jpg")
  check("  faded in once decoded, in a fixed box, an empty one dashed with a plus", /data-\[loaded\]:opacity-100/.test(table) && /border-dashed/.test(table) && /<ImagePlus/.test(table))
  check("  with a remove x on hover, and a spinner over the preview while it uploads", /data-variant-thumb-remove/.test(table) && /group-hover\/thumb:opacity-100/.test(table) && /focus-visible:opacity-100/.test(table) && /data-variant-thumb-uploading/.test(table))
  check("the variant's details show its photo with Change and Remove", /data-variant-photo=""/.test(table) && />\s*\{row\.imageUrl \? "Change" : "Add photo"\}/.test(table))
  check("an upload is the row's at once: a local preview, then the address, never saved as a preview", /URL\.createObjectURL\(file\)/.test(cards) && /setPending\(/.test(cards) && /patchRows\(keys, \(\) => \(\{ imageUrl: url \}\)\)/.test(cards))
  check("the picker offers the product's photos first, Upload, and Choose from your files", /data-variant-photo-choice/.test(cards) && /aria-label="Choose from your files"/.test(cards) && /<FilesLibraryChooser/.test(cards))

  const opts = [{ name: "Size", values: ["S", "M"] }, { name: "Color", values: ["Sand", "Black"] }]
  const rows: VariantRow[] = [["S", "Sand"], ["S", "Black"], ["M", "Sand"], ["M", "Black"]].map(([a, b]) => emptyRow([a, b, null]))
  const key = combinationKey(["S", "Sand", null])
  const scopes = photoScopes([key], "S / Sand", rows, opts as never)
  check("one photo for several: only this one, every Sand, every S (colour first)", scopes.map((s) => s.label).join("|") === "Only S / Sand|Every Sand|Every S" && scopes[1].keys.length === 2 && scopes[1].keys.every((k) => k.includes("sand")), scopes)
  check("  a group's photo is already the whole group", photoScopes(rows.slice(0, 2).map((r) => combinationKey(r.options)), "S", rows, opts as never).length === 1)
  check("  one option: no choice to make", photoScopes([combinationKey(["S", null, null])], "S", [emptyRow(["S", null, null]), emptyRow(["M", null, null])], [{ name: "Size", values: ["S", "M"] }] as never).length === 1)
}

console.log("\nThe chosen variant's photo on the storefront")
{
  const v = toVariant("p", { id: "v1", product_id: "p", name: "Sand", price_cents: 100, image_url: "https://abc.supabase.co/storage/v1/object/public/product-images/sand.jpg" }, true)
  check("a website card's option carries its photo, at Storelib's own address", typeof v.image === "string" && /\/media\/product-images\/sand\.jpg$/.test(v.image), v)
  check("  and none for an option without one, or one that is not https", toVariant("p", { id: "v2", product_id: "p", name: "Black", price_cents: 100, image_url: "javascript:x" }, true).image === undefined)
  check("the variants are read with their photo, falling back when the column is missing", /VARIANT_COLUMNS_WITH_IMAGE, VARIANT_COLUMNS, VARIANT_COLUMNS_MINIMAL/.test(read("lib/website-builder/shop-products.ts")))
  const card = toCard({ id: "p", title: "Tee", slug: "tee", price_cents: 100, thumbnail_url: "https://img.test/a.png", gallery_urls: ["https://img.test/a.png"], type: "physical", status: "published" } as never, [{ id: "v1", product_id: "p", name: "Sand", price_cents: 100, image_url: "https://img.test/sand.png" }, { id: "v2", product_id: "p", name: "Black", price_cents: 100 }])
  const p = productObject(card) as O
  check("an imported theme: a variant's featured_media is its photo, one of the product's media", p.variants[0].featured_media?.src === "https://img.test/sand.png" && p.media.some((m: O) => m === p.variants[0].featured_media), p.variants[0].featured_media)
  /* Round 25: Shopify answers nil for a variant without its own photo (Dawn's `featured_media == nil`, Horizon's `| default: product.featured_image`), so a gallery stays where it is. */
  check("  a variant without one answers none, as Shopify does, and the theme falls back to the product's", p.variants[1].featured_media === null && p.featured_media === p.media[0])
  check("  the picture knows its variant, by id only", p.media[1].attached_to_variant === true && p.media[1].variant_ids[0] === "v1" && !("variants" in p.media[1] && (p.media[1].variants as unknown[]).length))
  const chosen = productObject(card, { selectedVariantId: "v1" }) as O
  check("  ?variant= of a variant with a photo: the theme draws that photo first", chosen.selected_or_first_available_variant.featured_media.src === "https://img.test/sand.png")
  const js = productJson(p) as O
  check("  /products/<handle>.js gives each variant's featured_media id, as a theme's script reads it", js.variants[0].featured_media?.id === p.media[1].id && js.variants[0].featured_image?.src === "https://img.test/sand.png")
  check("  and /products.json each picture's variant_ids", (productFeedJson(p) as O).images[1].variant_ids[0] === "v1")
  const gallery = read("components/product/product-gallery.tsx")
  const box = read("components/physical/buy-box.tsx")
  check("storelib.com's product page: the buy box tells the gallery, which moves to the photo", /announceVariantPhoto\(data\.product\.id, chosenImage\)/.test(box) && /onVariantPhoto\(followVariantsOf/.test(gallery) && /followVariantsOf=\{product\.type === "physical" \? product\.id : undefined\}/.test(read("app/(marketing)/p/[slug]/page.tsx")))
  check("  only after the buyer picks, and the small photo only where no gallery follows", /picked\.current = true/.test(box) && /!galleryFollows \?/.test(box))
}

console.log("\nThe product's FAQ on every product page")
{
  const faqs = productFaqs([{ question: " Fit? ", answer: "True to size.\nSize up." }, { question: "x", answer: "" }, null, { question: "<b>Hi</b>", answer: "a & b" }])
  check("read as plain text, answered ones only", faqs.length === 2 && faqs[0].question === "Fit?", faqs)
  check("as rich text: escaped, in <p> and <strong>", productFaqsHtml(faqs) === "<p><strong>Fit?</strong></p><p>True to size.<br>Size up.</p><p><strong>&lt;b&gt;Hi&lt;/b&gt;</strong></p><p>a &amp; b</p>", productFaqsHtml(faqs))
  const facts = productFacts({ id: "p", title: "Tee", faqs: [{ question: "Fit?", answer: "True" }] })!
  check("a built website's page hands sections product.faqs", facts.faqs?.length === 1 && facts.faqs_html === "<p><strong>Fit?</strong></p><p>True</p>")
  check("a Product FAQ dynamic source, on product pages", DYNAMIC_SOURCES.some((s) => s.id === "product.faqs" && s.kind === "html" && s.templates?.includes("product") && s.label === "Product FAQ"))
  const ctx = dynamicContext({ theme: {}, product: facts })
  check("  in a rich text setting: the questions", fillSources("{{ product.faqs }}", "richtext", ctx) === facts.faqs_html, fillSources("{{ product.faqs }}", "richtext", ctx))
  check("  in a text setting: words only", !/</.test(String(fillSources("{{ product.faqs }}", "text", ctx))) && /Fit\?/.test(String(fillSources("{{ product.faqs }}", "text", ctx))))
  check("the builder's canvas reads them too", /faqs: p\.faqs \}\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /\$\{LIST_COLUMNS\}, faqs/.test(read("app/api/website-builder/products/route.ts")))

  /* Not an FAQ section option: Accordion FAQ is the reference section every AI prompt quotes, and its size is budgeted (tests/ai-reference.test.ts). */
  check("the reference FAQ section is left as it was", !/product\.faqs/.test(DEFAULT_THEME_SOURCES["sections/faq_accordion.storelib"]))
  const old = { id: "s", type: "product", name: "Product", settings: { image_width: "50%" }, blocks: [{ id: "t", type: "title", settings: {} }, { id: "d", type: "description", settings: {} }, { id: "s2", type: "share", settings: {} }] }
  const seeded = withProductFaq(old as never)
  check("a website product section saved before the block gets Product questions under the description, once", seeded.blocks!.map((b) => b.type).join() === "title,description,product_faq,share" && seeded.settings[FAQ_SEEDED] === true)
  check("  deleted after that, it stays deleted", withProductFaq({ ...seeded, blocks: seeded.blocks!.filter((b) => b.type !== "product_faq") }).blocks!.length === 3)
  check("  a section from the preset is left as it is", JSON.stringify(withProductBlocks(mainProductSection()).blocks) === JSON.stringify(mainProductSection().blocks))
  check("  a section with every block deleted stays empty", withProductFaq({ ...old, blocks: [] } as never).blocks!.length === 0)

  /* Imported themes. */
  const card = { id: "p", settings: { title: "Tee", faqs: [{ question: "Fit?", answer: "True\nto size" }] } }
  const prod = productObject(card)
  check("an imported theme reads them at product.metafields.storelib.faqs", faqsOf(prod).length === 1)
  const rows = [
    { id: "a", type: "collapsible_row", settings: { heading: "Shipping", content: "<p>Fast</p>" } },
    { id: "b", type: "collapsible_row", settings: { heading: "Returns", content: "<p>30 days</p>", icon: "truck" } },
    { id: "c", type: "share", settings: {} },
  ]
  const added = withFaqTab(rows, faqsOf(prod))!
  check("  a theme with collapsible rows gets one more, headed FAQ, after its last", added.map((b) => b.id).join() === "a,b,storelib-product-faq,c" && added[2].type === "collapsible_row" && added[2].settings!.heading === "FAQ" && added[2].settings!.icon === "question_mark", added)
  check("  each answer line its own paragraph, escaped", added[2].settings!.content === "<p><strong>Fit?</strong></p><p>True</p><p>to size</p>")
  const empty = withFaqTab([{ id: "x", type: "collapsible_tab", settings: { heading: "FAQ", content: "" } }, rows[0]], faqsOf(prod))!
  check("  an empty row headed FAQ is filled instead", empty.length === 2 && /Fit\?/.test(String(empty[0].settings!.content)))
  const mine = withFaqTab([{ id: "x", type: "collapsible_tab", settings: { heading: "FAQ", content: "<p>Mine</p>" } }], faqsOf(prod))!
  check("  a row with words of its own keeps them, and the product's are a row named apart", mine.length === 2 && mine[0].settings!.content === "<p>Mine</p>" && mine[1].settings!.heading === "Product questions")
  check("  rows inside a group are found", withFaqTab([{ id: "g", type: "group", settings: {}, blocks: [rows[0]] }], faqsOf(prod))![0].blocks!.length === 2)
  check("  no rows: nothing here", withFaqTab([{ id: "t", type: "title", settings: {} }], faqsOf(prod)) === null)
  const section = `<div><h1>Tee</h1><form action="/cart/add" method="post"><button>Add</button></form><div class="rte"><p>Soft cotton tee.</p></div></div>`
  const under = withFaqUnderDescription(section, "<p>Soft cotton tee.</p>", faqsOf(prod))!
  check("  otherwise under the description in the main product section", under.indexOf("data-storelib-product-faq") > under.indexOf("Soft cotton tee.") && under.indexOf("data-storelib-product-faq") < under.indexOf("</div></div>"))
  check("  after the product form when the description is not drawn", withFaqUnderDescription(section.replace("<p>Soft cotton tee.</p>", ""), "<p>Soft cotton tee.</p>", faqsOf(prod))!.indexOf("data-storelib-product-faq") > section.indexOf("</form>"))
  check("  never in a section without a product form, and never twice", withFaqUnderDescription("<div>x</div>", "", faqsOf(prod)) === null && withFaqUnderDescription(under, "<p>Soft cotton tee.</p>", faqsOf(prod)) === null)
  check("  the questions are text, never markup", !/<b>/.test(faqBlockHtml([{ question: "<b>x</b>", answer: "<script>" }])) && !/<script>/.test(faqTabHtml([{ question: "q", answer: "<script>" }])))
  check("  a theme whose code reads the metafield draws them itself", themeReadsFaqs(["{% for f in product.metafields.storelib.faqs.value %}"]) && !themeReadsFaqs(["{{ product.title }}"]))
  check("  wired into the section drawing, once a page", /withFaqTab\(instance\.blocks, faqs\)/.test(read("lib/storelib-theme/compat/theme.ts")) && /FAQ_SHOWN\.add\(/.test(read("lib/storelib-theme/compat/theme.ts")))
  check("no FAQ structured data is added (Google keeps FAQ rich results to government and health sites)", !/FAQPage/.test(read("lib/storelib-theme/compat/product-faq.ts").replace(/\/\*[\s\S]*?\*\//g, "")) && /No FAQ structured data/.test(read("lib/storelib-theme/compat/product-faq.ts")))

  const editor = read("app/app/products/new/product-editor.tsx")
  check("the editor says where they show, with a link to see it", /data-faq-where=""/.test(editor) && /Shows on your product page under the description\./.test(editor) && /onClick=\{handleRedirectToProduct\}[^>]*>\s*See it/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

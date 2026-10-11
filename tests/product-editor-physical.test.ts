/**
 * The product editor for a physical product (round R5): prices in the
 * store's currency, options and variants that keep what was typed, who ships
 * it following the store's setting, Advanced in groups, sales channels a
 * physical product can sell on, typed custom fields, the category searched
 * by the words people use and usable in collections, and the product's
 * questions and details on the product page.
 *
 *   npx tsx tests/product-editor-physical.test.ts
 *
 * The browser half (scratchpad probe in the R5 report) drives the same
 * components at 390 and 1280px.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { currencyMark, formatStoreMoney, markInset, moneyPlaceholder, storeCurrencyOf } from "@/lib/store/currency"
import { emptyRow, groupByFirst, priceRange, remapRows, renameValueInRows, rowsForCombinations, type VariantRow } from "@/components/physical/variant-rows"
import { combinations, combinationKey, normaliseOptions } from "@/lib/physical/variants"
import { MODEL_METHOD, followsStore, fulfilmentSummary, storeFulfilment } from "@/lib/physical/fulfilment-default"
import { cleanCustomFields, fieldProblem, fieldRows, readCustomFields, shownCustomFields, storedCustomFields } from "@/lib/products/custom-fields"
import { searchCategoriesByWords } from "@/lib/products/category-suggest"
import { inSmartCollection, readRules, type RuleProduct } from "@/lib/physical/collections"
import { productObject } from "@/lib/storelib-theme/compat/objects"
import { OUTPUT } from "@/lib/storelib-theme/compat/runtime"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nPrices in the store's currency")
{
  check("dollars before the number, as before", formatStoreMoney(2500, "USD") === "$25.00" && currencyMark("usd").position === "prefix")
  check("lei after it", formatStoreMoney(123450, "RON") === "1,234.50 lei" && currencyMark("RON").position === "suffix", formatStoreMoney(123450, "RON"))
  check("euro, pound and Canadian dollar keep their signs", formatStoreMoney(100, "EUR") === "€1.00" && formatStoreMoney(100, "GBP") === "£1.00" && currencyMark("CAD").symbol === "CA$")
  check("yen has no decimals", formatStoreMoney(250000, "JPY") === "¥2,500" && moneyPlaceholder("JPY") === "0")
  check("anything unreadable is US dollars", storeCurrencyOf(null) === "USD" && storeCurrencyOf("dollars") === "USD" && storeCurrencyOf(" ron ") === "RON")
  check("a longer mark gets more room", markInset("CAD") > markInset("USD") && markInset("RON") > markInset("USD"))
  const loader = read("app/app/products/load-editor.ts")
  check("the editor reads the currency Settings keeps (payout_currency) on the server", /select\("payout_currency"\)/.test(loader) && /currency: storeCurrencyOf\(/.test(loader))
  const editor = read("app/app/products/new/product-editor.tsx")
  check("no price field in the editor prints a bare $", !/>\$<\/span>/.test(editor) && /\{priceMark\.node\}/.test(editor) && /<StoreCurrencyProvider currency=\{creator\.currency\}>/.test(editor))
  const ui = read("components/physical/ui.tsx")
  check("the physical cards' price field takes the store's mark", /useMoneyMark\(\)/.test(ui) && !/>\s*\$\s*<\/span>/.test(ui))
}

console.log("\nOptions and variants keep what was typed")
{
  const opts = (o: { name: string; values: string[] }[]) => combinations(normaliseOptions(o))
  const stash = new Map<string, VariantRow>()
  let rows: VariantRow[] = [{ ...emptyRow([null, null, null]), price: "20", sku: "TEE" }]
  rows = rowsForCombinations(opts([{ name: "Size", values: ["S", "M"] }]), rows, stash)
  check("a first option's rows start at the product's price", rows.length === 2 && rows.every((r) => r.price === "20"), rows.map((r) => r.price))
  rows = rows.map((r) => (r.options[0] === "M" ? { ...r, price: "25", stock: { L1: "4" } } : r))
  rows = rowsForCombinations(opts([{ name: "Size", values: ["S", "M"] }, { name: "Color", values: ["Black", "White"] }]), rows, stash)
  const mBlack = rows.find((r) => combinationKey(r.options) === combinationKey(["M", "Black", null]))
  check("M grows into M / Black at M's price, but not M's stock or SKU", mBlack?.price === "25" && !mBlack.stock.L1 && mBlack.sku === "", mBlack)
  rows = rows.map((r) => (r.options[0] === "M" && r.options[1] === "White" ? { ...r, sku: "M-W" } : r))
  rows = renameValueInRows(rows, 0, "M", "Medium")
  rows = rowsForCombinations(opts([{ name: "Size", values: ["S", "Medium"] }, { name: "Color", values: ["Black", "White"] }]), rows, stash)
  check("a renamed value keeps its rows", rows.find((r) => r.options[0] === "Medium" && r.options[1] === "White")?.sku === "M-W")
  rows = rowsForCombinations(opts([{ name: "Size", values: ["S"] }, { name: "Color", values: ["Black", "White"] }]), rows, stash)
  check("a removed value's rows go", rows.length === 2)
  rows = rowsForCombinations(opts([{ name: "Size", values: ["S", "Medium"] }, { name: "Color", values: ["Black", "White"] }]), rows, stash)
  check("typed back, they return as they were", rows.find((r) => r.options[0] === "Medium" && r.options[1] === "White")?.sku === "M-W")
  const moved = remapRows(rows, ["Size", "Color"], ["Color", "Size"])
  check("an option moved: each row's values follow", moved.find((r) => r.sku === "M-W")?.options.join() === "White,Medium,")
  const dropped = remapRows(rows, ["Size", "Color"], ["Size"])
  check("an option removed: rows that became the same keep the first", dropped.length === 2 && dropped.every((r) => r.options[1] === null))
  check("grouped by the first option", groupByFirst(rows).map((g) => g.value).join() === "S,Medium")
  check("a group's prices read as a range", priceRange([{ ...emptyRow(["a", null, null]), price: "10" }, { ...emptyRow(["b", null, null]), price: "" }], "12", (c) => `$${c / 100}`) === "$10 to $12")
  const cards = read("components/physical/product-cards.tsx")
  check("no Angus Farm placeholder anywhere in the editor", !/Angus/.test(cards + read("components/physical/variant-options.tsx") + read("components/physical/variant-table.tsx")))
  check("changing the weight or size unit converts what is typed, it never relabels it", /changeWeightUnit\(v as WeightUnit\)/.test(cards) && /changeDimUnit\(v as DimensionUnit\)/.test(cards) && /const g = toGrams\(typed, from\)/.test(cards))
  check("options can be reordered, renamed and removed; Edit all and grouped rows exist", /moveOption/.test(cards) && /renameValue/.test(cards) && /data-variants-edit-all/.test(read("components/physical/variant-table.tsx")) && /useSortable/.test(read("components/physical/variant-options.tsx")))
}

console.log("\nWho ships it: the store's setting, unless the product has its own")
{
  const locs = [
    { id: "home", kind: "home" as const, active: true },
    { id: "pod", kind: "print_on_demand" as const, active: true },
  ]
  check("a store that ships itself: every product is the seller's, from any place", JSON.stringify(storeFulfilment("self", "home", locs)) === JSON.stringify({ method: "self", locationId: null }))
  check("a mix ships itself unless a product says otherwise", MODEL_METHOD.hybrid === "self")
  check("print on demand: its partner, not the home default", storeFulfilment("print_on_demand", "home", locs).locationId === "pod")
  check("no partner set up yet: none, and the order is marked to pass on", storeFulfilment("dropshipping", "home", locs).locationId === null)
  const store = storeFulfilment("print_on_demand", "home", locs)
  check("a product saved before its partner existed still follows the store", followsStore({ method: "print_on_demand", locationId: null }, store) && !followsStore({ method: "self", locationId: null }, store))
  check("said in a few words", fulfilmentSummary({ method: "print_on_demand", locationId: "pod" }, [{ id: "pod", name: "Gelato" }]) === "Printed and shipped by Gelato" && fulfilmentSummary({ method: "self", locationId: null }, []) === "You pack and ship it")
  const route = read("app/api/physical/settings/route.ts")
  check("a change to the store's answer reaches the products that followed it", /followNewDefault\(c\.db, c\.creatorId, before, await storeFulfilmentFor/.test(route))
  const server = read("lib/physical/fulfilment-default-server.ts")
  check("  only the caller's physical products that matched the old answer", /eq\("creator_id", creatorId\)\.eq\("type", "physical"\)\.eq\("fulfillment_method", before\.method\)/.test(server))
  const cards = read("components/physical/product-cards.tsx")
  check("the editor has no fulfilment card: one line in Shipping, its own answer under Advanced", !/id="physical-fulfillment"/.test(cards) && /data-shipped-by=""/.test(cards) && /Fulfil this product differently/.test(cards))
}

console.log("\nSales channels a physical product sells on")
{
  const ch = read("app/app/products/new/sales-channels-card.tsx")
  check("Creator page and Explore are not listed for a physical product", /const shown = physical \? loaded\.channels\.filter\(forPhysical\) : loaded\.channels/.test(ch))
  check("a new one never starts on no channel when Settings starts new products on the creator page", /physical \? startingChannels\(d\.channels\.filter\(forPhysical\), d\.defaultKey\)/.test(ch))
  check("the API is unchanged: the same PUT with the channels it is off", /body: JSON\.stringify\(\{ productId: id, off \}\)/.test(ch))
}

console.log("\nCustom fields, typed")
{
  const rows = [
    { key: "Material", value: "Linen", type: "text" as const, show: true },
    { key: "Care instructions", value: "Wash cold\r\n\r\n\r\nDry flat", type: "multiline" as const, show: true },
    { key: "Weight", value: "1,5", type: "number" as const, show: false },
  ]
  const stored = storedCustomFields(rows)
  check("stored with label, type, whether shown, and order", stored.care_instructions?.label === "Care instructions" && stored.care_instructions.type === "multiline" && stored.weight.show === false && stored.material.pos === 0)
  check("long text keeps its line breaks, a number is a number", stored.care_instructions.value === "Wash cold\n\nDry flat" && stored.weight.value === "1.5", stored)
  check("templates still read plain values", JSON.stringify(cleanCustomFields(stored)) === JSON.stringify({ material: "Linen", care_instructions: "Wash cold\n\nDry flat", weight: "1.5" }), cleanCustomFields(stored))
  check("buyers see only the shown ones, in order", shownCustomFields(stored).map((f) => f.label).join() === "Material,Care instructions")
  check("a field saved before types reads as hidden text", JSON.stringify(readCustomFields({ isbn: "978" })[0]) === JSON.stringify({ key: "isbn", value: "978", label: "Isbn", type: "text", show: false, pos: 1000 }) && fieldRows({ isbn: "978" })[0].show === false)
  check("a wrong value says why", fieldProblem({ key: "Guide", value: "nope", type: "url" }) === "Guide should be a link starting with https://" && fieldProblem({ key: "Pages", value: "12a", type: "number" }) === "Pages should be a number" && fieldProblem({ key: "", value: "x" }) !== null && fieldProblem({ key: "", value: "" }) === null)
  check("javascript: is not a link", fieldProblem({ key: "Guide", value: "javascript:alert(1)", type: "url" }) !== null)
  const editor = read("app/app/products/new/product-editor.tsx")
  check("Save stops on a field that does not fit its type, and saves the typed shape", /customFields\.map\(fieldProblem\)/.test(editor) && /custom_fields: storedCustomFields\(customFields\)/.test(editor))
}

console.log("\nCategories: found by the words people use, and used by collections")
{
  check("tee finds T-Shirts, perfume finds Fragrance", searchCategoriesByWords("tee", "physical")[0] === "T-Shirts" && searchCategoriesByWords("perfume", "physical")[0] === "Fragrance", [searchCategoriesByWords("tee", "physical"), searchCategoriesByWords("perfume", "physical")])
  check("never a name from the other list", searchCategoriesByWords("preset", "physical").length === 0)
  const rules = readRules([{ field: "category", op: "equals", value: "Candles" }])
  const p = (category: string | null): RuleProduct => ({ id: "x", title: "t", type: "physical", tags: [], vendor: null, priceCents: 100, compareAtCents: null, inventory: null, weightGrams: null, category })
  check("a smart collection can be every Candle", rules.length === 1 && inSmartCollection(rules, "all", p("Candles")) && !inSmartCollection(rules, "all", p("Mugs & Cups")) && !inSmartCollection(rules, "all", p(null)))
  check("every reader of a collection reads the category", /category: p\.category \?\? null/.test(read("lib/physical/collections-server.ts")) && /category: typeof p\.category === "string"/.test(read("lib/website-builder/storefront-collections-server.ts")) && /createdAt: p\.created_at, category: p\.category \?\? null/.test(read("lib/physical/checkout-pricing-server.ts")))
}

console.log("\nThe product's questions and details reach the buyer")
{
  const page = read("app/(marketing)/p/[slug]/page.tsx")
  check("creator page product view: no download answers or Lifetime access on a physical product", /if \(product\.type === "physical"\) return \[\]/.test(page) && /product\.type === "physical"\s*\? configFaqs/.test(page) && /displayFaqs\.length > 0 \? \(/.test(page))
  check("  and its shown custom fields under Details", /data-details-section/.test(page) && /shownCustomFields\(/.test(page))
  const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string }[]; presets: { blocks: { type: string }[] }[] }
  check("the website's product section has Product questions and Product details blocks, in a new page's preset", ["product_faq", "product_details"].every((t) => schema.blocks.some((b) => b.type === t) && schema.presets[0].blocks.some((b) => b.type === t)))
  const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
  check("  drawn as text, never as markup", /product_faq: ProductFaq/.test(blocks) && /product_details: ProductDetails/.test(blocks) && !/dangerouslySetInnerHTML=\{\{ __html: f\.answer/.test(blocks))
  check("  read on the server with the product", /faqs: productFaqs\(row\.faqs\)/.test(read("lib/products/product-section-data.ts")) && /details: shownCustomFields\(row\.custom_fields\)/.test(read("lib/products/product-section-data.ts")))
  const obj = productObject({ id: "p", settings: { title: "Tote", fields: { material: "Canvas" }, faqs: [{ question: "Q?", answer: "A." }] } }) as Record<string, any>
  check("an imported theme reads custom.material as a metafield, printed or .value", obj.metafields.custom.material[OUTPUT] === "Canvas" && obj.metafields.custom.material.value === "Canvas" && obj.metafields.custom.material.type === "single_line_text_field")
  check("  and the questions as storelib.faqs.value", obj.metafields.storelib.faqs.value[0].answer === "A.")
  check("  read for the imported theme's product page", /read\("description, faqs"\)/.test(read("lib/website-builder/compat-site.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

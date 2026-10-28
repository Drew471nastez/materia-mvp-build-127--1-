/**
 * Round 20, the product editor for a physical product:
 *   1. Settings without a call to action, a sales count or a download's
 *      refund policy; Limit sales as the most one order may take, kept on
 *      the product (SQL part 131), held by the product page and the checkout
 *   2. options and variants: compact fields with sensible values, grips that
 *      follow the finger, parts that fold open, a calm save
 *   3. a link to Settings saves a draft and goes, without a title or photo
 *
 *   npx tsx tests/product20.test.ts
 *
 * The browser half (390 touch at 4x CPU, and 1440) is the round 20 probe in
 * the report: the flow, the drag, the questions and the motion.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cappedQuantity, missingColumn, overLimit, readOrderLimit } from "@/lib/physical/order-limit"
import { barcodeProblem, barcodeTyped, compareAtProblem, countTyped, decimalTyped, moneyTyped, repeatedSkus, skuTyped } from "@/lib/physical/typed-values"
import { variantStock } from "@/lib/physical/storefront-stock"
import { isStale, rememberCreated, rememberDeleted } from "@/lib/products/delete-client"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const ed = read("app/app/products/new/product-editor.tsx")
const cards = read("components/physical/product-cards.tsx")
const options = read("components/physical/variant-options.tsx")
const table = read("components/physical/variant-table.tsx")

console.log("\n1. Settings for a thing that ships")
{
  const physical = ed.slice(ed.indexOf('{productType === "physical" ? (\n                  <>\n                    <div className={SWITCH_GROUP} data-physical-settings'), ed.indexOf("{/* Call to Action */}"))
  check("the physical branch has Limit sales and the returns line, and nothing else", /title="Limit sales"/.test(physical) && /\/app\/settings\?tab=returns/.test(physical) && !/Call to action|Show sales count|Refund policy/.test(physical), physical.length)
  check("the download's call to action, sales count and refund policy stay as they were", /Call to action/.test(ed) && /title="Show sales count"/.test(ed) && /title="Refund policy"/.test(ed) && /title="Limit sales"\s*hint="Stop selling after a number of copies"/.test(ed))
  check("a physical product saves none of the three", /show_sales_badge: productType === "physical" \? false : showSalesBadge/.test(ed) && /refund_policy_enabled: productType === "physical" \? false/.test(ed) && /call_to_action: productType === "physical" \? null/.test(ed))
  check("the returns link goes through the editor's own question", /void openSettings\("\/app\/settings\?tab=returns"\)/.test(ed))
  check("the limit is sent with the physical save, and read back", /maxPerOrder: orderLimit\.on \? Number\(orderLimit\.count\) : null/.test(cards) && /limitLoaded\.current\?\.\(/.test(cards))
}

console.log("\nLimit sales: the most one order may take")
{
  check("read as 1 to 999, anything else none", readOrderLimit(2) === 2 && readOrderLimit("5") === 5 && readOrderLimit(0) === null && readOrderLimit(-3) === null && readOrderLimit("x") === null && readOrderLimit(5000) === 999 && readOrderLimit(null) === null)
  check("the quantity picker stops at it, or at stock when that is lower", cappedQuantity(999, 2) === 2 && cappedQuantity(1, 2) === 1 && cappedQuantity(40, null) === 40)
  check("untracked stock is still held to it", cappedQuantity(variantStock(0, { tracked: false, keepSelling: false, lowAt: 5 }).maxQuantity, 3) === 3)
  const limits = new Map([["p1", 2]])
  check("a cart within it passes", overLimit([{ productId: "p1", title: "Tee", quantity: 1 }, { productId: "p1", title: "Tee", quantity: 1 }], limits) === null)
  check("one product's variants count together, and the reason names it", overLimit([{ productId: "p1", title: "Tee", quantity: 2 }, { productId: "p1", title: "Tee", quantity: 1 }], limits) === "Tee: up to 2 per order. Lower the quantity to continue.")
  check("a database without part 131 is told apart", missingColumn({ code: "42703" }) && missingColumn({ code: "PGRST204" }) && !missingColumn({ code: "23505" }) && !missingColumn(null))
  const pricing = read("lib/physical/checkout-pricing-server.ts")
  check("the checkout refuses a cart over it", /overLimit\(lines\.filter\(\(l\) => l\.type === "physical"\), await orderLimits\(db, physicalIds\)\)/.test(pricing))
  check("and never selects the column with the rest, so a missing column can't stop a sale", !/max_per_order/.test(pricing))
  const stock = read("lib/physical/storefront-stock.ts")
  check("the product page and the website section read it through the one stock rule", /cappedQuantity\(s\.maxQuantity, limit\)/.test(stock) && /physicalStock\(db, \{ id: row\.id,/.test(read("lib/products/product-section-data.ts")))
  const server = read("lib/physical/catalog-server.ts")
  check("saved in its own request: everything else saves without part 131", /if \("maxPerOrder" in body\)/.test(server) && /missingColumn\(error\) && limit === null/.test(server))
}

console.log("\nSQL part 131")
{
  const sql = read("supabase/sql/run-now/131_products_max_per_order.sql")
  const lines = sql.trim().split("\n")
  check("a comment first, one statement a line, notify pgrst last", lines[0].startsWith("/*") && lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("idempotent", /ADD COLUMN IF NOT EXISTS max_per_order integer/.test(sql) && /DROP CONSTRAINT IF EXISTS products_max_per_order_check/.test(sql))
  check("a migrations copy, the same text", read("supabase/migrations/20270104_products_max_per_order.sql") === sql)
  check("a README row and a p131 column in 99_check_after", /`131_products_max_per_order\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p131_products_max_per_order/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("built into the four files", read("supabase/sql/run-four/3_of_4_latest.sql").includes("products_max_per_order_check"))
}

console.log("\n2. Sensible values in every field")
{
  check("money: a comma is the point, two places, never two points", moneyTyped("12,5") === "12.5" && moneyTyped("1,234.50") === "1234.50" && moneyTyped("1.2.3") === "1.23" && moneyTyped("12.505") === "12.50" && moneyTyped("$ 9") === "9" && moneyTyped(".5") === "0.5")
  check("money: none for yen, seven digits at most, no leading zeros", moneyTyped("2500.5", 0) === "2500" && moneyTyped("123456789") === "1234567" && moneyTyped("007") === "7")
  check("a count is never negative", countTyped("-5") === "5" && countTyped("0012") === "12" && countTyped("0") === "0" && countTyped("1e3") === "13")
  check("a weight takes one point and three places", decimalTyped("1,2509") === "1.250" && decimalTyped("..5") === "0.5")
  check("a SKU has no spaces or symbols", skuTyped("mug blk #11") === "mug-blk-11" && skuTyped("A_B/C.D-1") === "A_B/C.D-1")
  check("a barcode is digits, and an ISBN's X", barcodeTyped("978-0-306-40615-x") === "978030640615X" && barcodeProblem("12345") !== null && barcodeProblem("5901234123457") === null && barcodeProblem("") === null)
  check("two variants with one SKU are found, in any case", repeatedSkus(["A1", "a1", "B", ""]).size === 1 && repeatedSkus(["A", "B"]).size === 0)
  check("a compare at price that shows no sale is said", compareAtProblem("10", "12") !== null && compareAtProblem("15", "12") === null && compareAtProblem("", "12") === null)
  check("stock fields in the editor take no minus sign", !/<NumberInput allowNegative/.test(cards + table))
  check("Save stops on a SKU two variants share", /repeatedSkus\(rows\.map\(\(r\) => r\.sku\)\)\.size\) return "Two variants have the same SKU"/.test(cards))
  const ui = read("components/physical/ui.tsx")
  check("compact fields: 40px and 16px type on a phone (no iOS zoom), 36px from 640px", /FIELD_COMPACT =\s*"h-10 [^"]*text-\[16px\][^"]*sm:h-9 sm:text-\[14px\]"/.test(ui))
}

console.log("\n2. Variants that move smoothly")
{
  const drag = read("app/app/products/new/hold-to-drag.ts")
  check("a grip follows the finger after a few pixels, with no hold", /useSensor\(TouchSensor, \{ activationConstraint: \{ distance: GRIP_DISTANCE_PX \} \}\)/.test(drag) && /GRIP_TOUCH = "[^"]*touch-none/.test(drag))
  check("options and values use the grip, and the keyboard still moves them", /useGripDragSensors\(\)/.test(options) && /KeyboardSensor/.test(drag) && /data-grip=""/.test(options))
  check("the rows around make room on a short curve", /SORT_TRANSITION = \{ duration: 180/.test(options) && (options.match(/transition: SORT_TRANSITION/g) ?? []).length === 2)
  check("an option's line keeps its place; chips and fields fold through Reveal", /<Reveal open=\{!option\.open\}>/.test(options) && /<Reveal open=\{option\.open\}>/.test(options))
  check("a removed value or option fades before it goes", /LEAVE_MS/.test(options) && (options.match(/setLeaving\(/g) ?? []).length >= 4)
  check("a variant's details, a group and Advanced fold out", /<Reveal open=\{open\}>/.test(table) && /<Reveal open=\{!isFolded\}>/.test(table) && /<Reveal open=\{advancedOpen\}>/.test(cards))
  check("new rows fade in; the first draw does not", /function useNewKeys/.test(table) && /entering && ENTER/.test(table))
  check("a save keeps the open option open", /openBefore\.includes\(clean\(o\.name\)\)/.test(cards) && /apply\(res\.data\.product, store, options\.filter\(\(o\) => o\.open\)/.test(cards))
}

console.log("\n3. Save and go, without a title or photo")
{
  check("a product not live yet is kept as a draft on the way", /confirm: "Save draft and go", cancel: "Stay", alt: "Leave without saving"/.test(ed) && /saveDraftRef\.current\(\)/.test(ed))
  check("a live product is saved as the bar saves it, so it stays live", /confirm: "Save and go", cancel: "Stay", alt: "Leave without saving"/.test(ed) && /live \? handleSaveChangesRef\.current\(\)/.test(ed))
  const draft = ed.slice(ed.indexOf("const saveDraftForLeave"), ed.indexOf("saveDraftRef.current = saveDraftForLeave"))
  check("the draft asks for nothing: no title, photo, file or category", /saveProduct\(false\)/.test(draft) && !/showToast\("Add a/.test(draft) && !/selectedCategory\)/.test(draft.split("savedValuesRef")[0]))
  check("a draft with no title still gets an address of its own", /let finalSlug = slug \|\| `draft-\$\{suffix\(\)\}`/.test(ed) && /\.eq\("slug", finalSlug\)/.test(ed))
  check("a new one moves to its own address, so Back from Settings finds it", /window\.history\.replaceState\(\{\}, "", `\/app\/products\/\$\{result\.productId\}`\)/.test(draft) && /rememberCreated\(result\.productId\)/.test(draft))
  check("then it goes in the app, never a reload", /router\.push\(href\)/.test(ed) && !/window\.location\.(href|assign)\s*=?\s*\(?href/.test(ed))
  check("the products list reads again when it lacks the new draft", (() => { rememberCreated("new-1"); const stale = isStale([{ id: "old", status: "draft" }]); const fresh = !isStale([{ id: "new-1", status: "draft" }]); rememberDeleted("new-1"); return stale && fresh && !isStale([{ id: "old", status: "draft" }]) })())
  check("a draft with no title reads Untitled draft in the list", (read("app/app/products/products-client.tsx").match(/product\.title \|\| "Untitled draft"/g) ?? []).length === 3 /* Round 40: the phone row's link is named by it too. */)
  check("the question's third button stays on one line on a computer", /mr-auto h-8 whitespace-nowrap/.test(read("app/app/products/new/confirm-sheet.tsx")))
}

console.log("\nCopy")
{
  const mine = options + table + read("lib/physical/order-limit.ts") + read("lib/physical/typed-values.ts")
  /* dnd-kit's and CSS's own `transform` (a property, not a word in the copy) is left out. */
  const prose = mine.replace(/\btransform\b(?=\s*[,:})?.]|\s*\?)|(?<=[.{(,]\s*)transform\b|(?<=-)transform\b|translate3d|\{ transform \}/g, "")
  check("no em dashes or filler words in what this round wrote", !/—/.test(mine) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)\w*/i.test(prose), prose.match(/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)\w*.{0,30}/gi))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

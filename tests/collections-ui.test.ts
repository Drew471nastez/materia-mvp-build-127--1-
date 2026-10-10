/**
 * Products › Collections, in Storelib's own screens.
 *
 *   /app/products/collections        the list, read on the server, the products page's shape
 *   /app/collections                 moved: a permanent redirect to the address above
 *   the editor                       SheetDialog: a dialog on a computer, the shared bottom sheet on a phone
 *   Pick products / Match by rules   the sliding segmented control, the panels cross-fading
 *   rules                            sentences, a select of product types, a live count of what they catch
 *   delete                           a quiet button and the app's confirm, never red
 *   covers                           the collection's picture, its products' pictures, or its initial
 *
 *   npx tsx tests/collections-ui.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { howWords, opsFor, valueWords, finishedRules, ruleProduct, picturesOf, countWords } from "@/app/app/products/collections/collection-parts"
import { inSmartCollection } from "@/lib/physical/collections"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const DIR = "app/app/products/collections"
const page = read(`${DIR}/page.tsx`)
const list = read(`${DIR}/collections-client.tsx`)
const editor = read(`${DIR}/collection-editor.tsx`)
const parts = read(`${DIR}/collection-parts.tsx`)
const ui = [list, editor, parts].join("\n")

console.log("\nWhere it lives\n")
{
  check("/app/products/collections has a page, a list and an editor", existsSync(`${DIR}/page.tsx`) && existsSync(`${DIR}/collections-client.tsx`) && existsSync(`${DIR}/collection-editor.tsx`))
  check("  the old screen is gone", !existsSync("app/app/collections/collections-client.tsx"))
  const moved = read("app/app/collections/page.tsx")
  check("/app/collections redirects there for good", /permanentRedirect\("\/app\/products\/collections"\)/.test(moved) && !/<CollectionsClient/.test(moved))
  check("the sidebar's Collections, under Products, goes there", /\{ href: "\/app\/products\/collections", label: "Collections" \}/.test(read("components/app/sidebar.tsx")))
  check("  and the products page's Collections button", /<Link href="\/app\/products\/collections" data-products-collections=""/.test(read("app/app/products/products-client.tsx")))
  /* October 2026: the empty picker is a small card with the one thing to do (controls/empty-picker.tsx). */
  check("  and the builder's Create a collection", /<EmptyPicker kind="collection" \/>/.test(read("components/website-builder/editor/controls/collection-controls.tsx")) && /"\/app\/products\/collections"/.test(read("components/website-builder/editor/controls/empty-picker.tsx")) && /"Create"/.test(read("components/website-builder/editor/controls/empty-picker.tsx")))
  check("nothing links to /app/collections any more", ![read("components/app/sidebar.tsx"), read("app/app/products/products-client.tsx"), read("components/website-builder/editor/controls/collection-controls.tsx")].some((s) => /["']\/app\/collections["']/.test(s)))
  check("it is a list, not the product editor: the setup widget and the slow-load spinner treat it like one",
    /\^\\\/app\\\/products\\\/\(\?!collections\(\\\/\|\$\)\)\[\^\/\]\+/.test(read("components/app/sidebar.tsx"))
      && /if \(path === "\/app\/products\/collections"\) return true\s*\n\s*if \(\/\^\\\/app\\\/products\\\/\[\^\/\]\+\(\\\/\|\$\)\/\.test\(path\)\) return false/.test(read("lib/ui/app-navigation.ts")))
}

console.log("\nThe list lands whole\n")
{
  check("the page reads collections and products on the server and hands them over", /await collectionsArea\(/.test(page) && /<CollectionsClient initialCollections=\{collections\} products=\{products\} \/>/.test(page))
  check("  the API answers from the same reader", /collectionsArea\(c\.db, c\.creatorId\)/.test(read("app/api/collections/route.ts")))
  check("  the client fetches nothing to draw itself, and has no skeleton", !/useEffect\([^)]*load/.test(list) && !/animate-pulse/.test(ui) && !/fetch\("\/api\/collections"\)/.test(list))
  check("  no loading boundary for it either", !existsSync(`${DIR}/loading.tsx`))
  check("the products page's pane, bar and column, and its enter animation", /orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-\[#f8f9fa\] app-page-enter/.test(list) && /<PaneBar width=\{PAGE_WIDTH\} className=\{cn\(LIST_BAR, PAGE_BAR, PAGE_GUTTER\)\}>/.test(list) && /const PAGE_WIDTH = "max-w-\[1200px\] lg:max-w-\[1323px\]"/.test(list))
  check("  a phone row of 64px with a 50px cover; the products table's rows from 768px", /relative flex h-16 items-center gap-3 px-3/.test(list) && /size="phone"/.test(list) && /group h-14 cursor-pointer lg:h-\[62px\] xl:h-\[70px\]/.test(list))
}

console.log("\nCovers, not icons\n")
{
  check("no stock icon stands for a collection", !/\bLayers\b/.test(ui) && !/from "lucide-react"/.test(list))
  check("its own picture, else its products' pictures (one, two side by side, or one tall and two stacked), else its initial", /collection\.imageUrl \? \[collection\.imageUrl\] : pictures\.slice\(0, 3\)/.test(parts) && /row-span-2/.test(parts) && /<Letter title=\{collection\.title\}/.test(parts))
  const byId = new Map([
    ["a", { id: "a", title: "A", thumbnail_url: "https://x/a.jpg", type: "digital", status: "published", price_cents: 100 }],
    ["b", { id: "b", title: "B", thumbnail_url: null, type: "digital", status: "published", price_cents: 100 }],
    ["c", { id: "c", title: "C", thumbnail_url: "https://x/c.jpg", type: "course", status: "published", price_cents: 100 }],
  ])
  check("  the pictures are the ones its products have, in its order", JSON.stringify(picturesOf({ productIds: ["b", "c", "a"] }, byId)) === JSON.stringify(["https://x/c.jpg", "https://x/a.jpg"]))
}

console.log("\nThe editor\n")
{
  check("SheetDialog: a dialog on a computer, the shared bottom sheet on a phone, with no close button", /<SheetDialog\b/.test(editor) && /showCloseButton=\{false\}/.test(editor) && /phone=\{phone\}/.test(editor) && !/\bModal\b/.test(ui) && !/components\/physical\/ui/.test(ui))
  check("  the sheet keeps one height, cannot be pulled away mid save, and says when it has gone", /sheet=\{\{ height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT, dismissible: !busy, onClosed \}\}/.test(editor))
  check("  Cancel and Save at its foot, outside what scrolls", /data-editor-foot=""[^>]*shrink-0/.test(editor) && /min-h-0 flex-1 overflow-y-auto overscroll-contain/.test(editor))
  check("Pick products / Match by rules is the sliding segmented control, and the panels cross-fade", /<Segmented\b[\s\S]{0,200}"Pick products"[\s\S]{0,80}"Match by rules"/.test(editor) && /<SwapPanels\b/.test(editor) && /from "\.\.\/new\/editor-controls"/.test(editor))
  check("a condition is a sentence that stacks on a phone: field and comparison, then the value", /grid grid-cols-2 gap-2[^"]*sm:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(0,1fr\)_minmax\(0,1\.15fr\)_auto\]/.test(editor) && /col-span-2 flex min-w-0 items-center gap-2 sm:contents/.test(editor))
  check("  product type is a select of kinds", /rule\.field === "type" \? \(\s*<select/.test(editor) && /PRODUCT_KINDS\.filter/.test(editor))
  check("  Add condition is a quiet row", /data-add-condition=""/.test(editor) && /Add condition/.test(editor))
  check("  what the rules catch is counted as they are typed, by the storefront's own rule", /inSmartCollection\(finished, match, ruleProducts\[i\]\)/.test(editor) && /<Caught /.test(editor))
  check("stock, weight and vendor rules only while physical commerce is on", /physical \|\| !PHYSICAL_RULES\.has\(f\)/.test(editor) && /usePhysicalCommerceEnabled\(\)/.test(editor) && /new Set\(\["vendor", "inventory", "weight"\]\)/.test(parts))
  check("the API contract is the one it was: POST to create, PUT to save, DELETE to remove", /id \? `\/api\/collections\/\$\{id\}` : "\/api\/collections", id \? "PUT" : "POST"/.test(list) && /`\/api\/collections\/\$\{c\.id\}`, "DELETE"/.test(list))
}

console.log("\nDelete is quiet, and asks first\n")
{
  check("no red anywhere near delete", !/text-red|bg-red|BTN_DANGER|criticalDepth|quietDanger|variant: "destructive"/.test(ui))
  check("Delete collection is the app's white secondary button, in grey words", /data-delete-collection=""[^\n]*className=\{cn\(secondaryDepth, [^)]*text-\[#4b5563\]/.test(editor))
  check("it asks with the app's confirm, never window.confirm", /useConfirm\(\)/.test(list) && /confirm: "Delete"/.test(list) && !/window\.confirm|\bconfirm\(/.test(ui.replace(/useConfirm\(\)/g, "")))
  check("  once the editor has gone, so the question is never under it; Keep it brings the editor back", /close\(async \(\) => \{\s*const yes = await ask\(\{\s*title: `Delete \$\{c\.title\}\?`/.test(list) && /if \(!yes\) return setOpen\(true\)/.test(list))
  check("  unsaved changes are asked about the same way", /title: "Discard changes\?"/.test(list) && /else setOpen\(true\)/.test(list))
}

console.log("\nThe words\n")
{
  const smart = (rules: { field: "type" | "price" | "tag"; op: "equals" | "less_than"; value: string }[], match: "all" | "any" = "all") => ({ kind: "smart" as const, rules, match })
  check("Picked by hand", howWords({ kind: "manual", rules: [], match: "all" }) === "Picked by hand")
  check("a rule reads as a sentence", howWords(smart([{ field: "type", op: "equals", value: "course" }])) === "Product type is Course")
  check("  and says how many more, with and or or", howWords(smart([{ field: "price", op: "less_than", value: "30" }, { field: "tag", op: "equals", value: "x" }], "any")) === "Price is less than $30 or 1 more")
  check("a number compares, a kind is or is not", opsFor("price").includes("greater_than") && !opsFor("type").includes("contains") && opsFor("type").length === 2)
  check("values as a person says them", valueWords({ field: "weight", op: "less_than", value: "500" }) === "500 g" && valueWords({ field: "type", op: "equals", value: "physical" }) === "Physical product")
  check("an unfinished condition is not counted", finishedRules([{ field: "type", op: "equals", value: "" }, { field: "price", op: "less_than", value: "abc" }]).length === 0)
  const p = ruleProduct({ id: "1", title: "Pack", thumbnail_url: null, type: "digital", status: "published", price_cents: 1900, tags: ["summer"] })
  check("the preview reads products the way the storefront does", inSmartCollection(finishedRules([{ field: "price", op: "less_than", value: "30" }]), "all", p) && !inSmartCollection(finishedRules([{ field: "tag", op: "equals", value: "winter" }]), "all", p))
  check("one product, two products", countWords(1) === "1 product" && countWords(2) === "2 products")
  check("no em dashes in what a person reads", !/—/.test(ui.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

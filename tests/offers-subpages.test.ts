/**
 * ===========================================================================
 *  OFFERS, COUPONS, SIZE CHARTS AND INVENTORY: SUB PAGES THAT WORK
 * ===========================================================================
 * The owner: "upsells and bundles when I'm creating a new offer or editing
 * an offer should act as sub pages, not modals or mobile bottom sheets ...
 * kind of like on orders. Do the same for coupons. Do the same for size
 * charts. Ensure inventory has no issues ... Coupons ... applies very well
 * at checkout."
 *
 * 1. What a sub page hands back to its list (lib/ui/rows-with-return).
 * 2. The size chart table: a pasted block, the keys, a row moved
 *    (lib/size-charts/grid).
 * 3. A code's scope in every checkout (lib/checkout/coupon-scope): physical
 *    only and collections now count for downloads and the basket too, with
 *    the other rules (dates, uses, minimum, products) as they were.
 * 4. The frames, read from the source: routes, layouts, no dialog or sheet,
 *    no loading boundary, the list opening and taking back, depth on the
 *    buttons, Inventory's reads in batches and its first frame.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { rowsWithReturn } from "@/lib/ui/rows-with-return"
import { moveRow, nextCell, pasteIntoRows, readPastedBlock } from "@/lib/size-charts/grid"
import { SIZE_CHART_LIMITS } from "@/lib/size-charts/model"
import { digitalCoverage, productsInCollections, scopeCovers } from "@/lib/checkout/coupon-scope"
import { checkCoupon, checkCouponLines, type CouponRow } from "@/lib/checkout/coupons"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)
const code = (p: string) => stripComments(read(p))
const has = (p: string) => existsSync(join(root, p))

async function main() {
  console.log("\n1. What a sub page hands back to its list\n")
  {
    const rows = [{ id: "a", t: 1 }, { id: "b", t: 2 }]
    check("a saved row replaces its old self, in place", JSON.stringify(rowsWithReturn(rows, { id: "b", saved: { id: "b", t: 9 } })) === JSON.stringify([{ id: "a", t: 1 }, { id: "b", t: 9 }]))
    check("a new one joins at the end, where a new offer applies", rowsWithReturn(rows, { id: "c", saved: { id: "c", t: 3 } }).map((r) => r.id).join() === "a,b,c")
    check("a deleted one goes", rowsWithReturn(rows, { id: "a", deleted: true }).map((r) => r.id).join() === "b")
    check("a cancel (no id, nothing saved) leaves the rows as they are", rowsWithReturn(rows, { id: null }) === rows && rowsWithReturn(rows, { id: "a" }) === rows && rowsWithReturn(rows, null) === rows)
  }

  console.log("\n2. The size chart table\n")
  {
    check("one value is typed, not pasted as a block", readPastedBlock("38") === null)
    const block = readPastedBlock("S\t86\t69\r\nM\t91\t71\r\n")
    check("a spreadsheet's rows and tabs are read, Windows line ends too", JSON.stringify(block) === JSON.stringify([["S", "86", "69"], ["M", "91", "71"]]))
    const laid = pasteIntoRows([["XS", "", ""]], 3, { row: 0, col: 0 }, block!)
    check("laid in from the cell it lands in, rows added as needed", JSON.stringify(laid.rows) === JSON.stringify([["S", "86", "69"], ["M", "91", "71"]]) && laid.dropped === 0)
    const wide = pasteIntoRows([["S", "", ""]], 3, { row: 0, col: 1 }, [["86", "69", "12"]])
    check("cells past the last column are left out and counted, never a new column", JSON.stringify(wide.rows) === JSON.stringify([["S", "86", "69"]]) && wide.dropped === 1)
    const full = pasteIntoRows(Array.from({ length: SIZE_CHART_LIMITS.rows }, () => ["x"]), 1, { row: SIZE_CHART_LIMITS.rows - 1, col: 0 }, [["a"], ["b"]])
    check("never past the chart's row limit", full.rows.length === SIZE_CHART_LIMITS.rows && full.dropped === 1)
    check("Enter goes one row down in the same column", JSON.stringify(nextCell({ row: 0, col: 2 }, "Enter", 3)) === JSON.stringify({ row: 1, col: 2 }))
    check("Enter on the last row asks for a new size", nextCell({ row: 2, col: 1 }, "Enter", 3)?.addRow === true)
    check("the down arrow on the last row stays", nextCell({ row: 2, col: 1 }, "ArrowDown", 3) === null)
    check("Shift and Enter, and the up arrow, go one row up; not past the first", JSON.stringify(nextCell({ row: 1, col: 0 }, "ShiftEnter", 3)) === JSON.stringify({ row: 0, col: 0 }) && nextCell({ row: 0, col: 0 }, "ArrowUp", 3) === null)
    check("no new row past the limit", nextCell({ row: SIZE_CHART_LIMITS.rows - 1, col: 0 }, "Enter", SIZE_CHART_LIMITS.rows) === null)
    check("a row moves up and down, and not past either end", moveRow(["S", "M", "L"], 2, -1).join() === "S,L,M" && moveRow(["S", "M"], 0, -1).join() === "S,M" && moveRow(["S", "M"], 1, 1).join() === "S,M")
  }

  console.log("\n3. A code's scope in every checkout\n")
  {
    const SHOP = "shop-1"
    const base: CouponRow & { physical_only?: boolean; collection_ids?: string[] | null } = { id: "c1", code: "TEN", creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true }
    const ebook = { id: "ebook", type: "digital" }
    const mug = { id: "mug", type: "physical" }
    check("physical products only: a download is never covered, a mug is", !scopeCovers({ ...base, physical_only: true }, ebook, null) && scopeCovers({ ...base, physical_only: true }, mug, null))
    check("with collections, only what is in them, whatever the product list says", scopeCovers({ ...base, collection_ids: ["tees"], product_ids: ["ebook"] }, mug, new Set(["mug"])) && !scopeCovers({ ...base, collection_ids: ["tees"], product_ids: ["ebook"] }, ebook, new Set(["mug"])))
    check("collections not read yet cover nothing, never everything", !scopeCovers({ ...base, collection_ids: ["tees"] }, mug, null))
    check("otherwise the product list, where none is every product", scopeCovers(base, ebook, null) && scopeCovers({ ...base, product_ids: ["ebook"] }, ebook, null) && !scopeCovers({ ...base, product_ids: ["ebook"] }, mug, null))

    /* A database that answers the three reads the scope makes, and records them. */
    const asked: string[] = []
    const db = {
      from(table: string) {
        const rows: Record<string, Record<string, unknown>[]> = {
          product_collections: [
            { id: "manual", kind: "manual", rules: [], match: "all", creator_id: SHOP },
            { id: "smart", kind: "smart", rules: [{ field: "tag", op: "equals", value: "cotton" }], match: "all", creator_id: SHOP },
            { id: "theirs", kind: "manual", rules: [], match: "all", creator_id: "someone-else" },
          ],
          product_collection_items: [
            { collection_id: "manual", product_id: "course" },
            { collection_id: "theirs", product_id: "ebook" },
          ],
          products: [
            { id: "ebook", title: "Ebook", type: "digital", tags: [], price_cents: 1000 },
            { id: "course", title: "Course", type: "course", tags: [], price_cents: 5000 },
            { id: "tee-pdf", title: "Tee pattern", type: "digital", tags: ["cotton"], price_cents: 800 },
          ],
        }
        let out = rows[table] ?? []
        const q = {
          select: () => q,
          eq: (col: string, v: unknown) => ((out = out.filter((r) => r[col] === v)), q),
          in: (col: string, vs: unknown[]) => ((out = out.filter((r) => vs.includes(r[col]))), q),
          then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
            asked.push(table)
            return Promise.resolve({ data: out, error: null }).then(res)
          },
        }
        return q
      },
    }
    const inside = await productsInCollections(db, SHOP, ["manual", "smart", "theirs"], [
      { id: "ebook", title: "Ebook", type: "digital", tags: [], vendor: null, priceCents: 1000, compareAtCents: null, inventory: null, weightGrams: null },
      { id: "course", title: "Course", type: "course", tags: [], vendor: null, priceCents: 5000, compareAtCents: null, inventory: null, weightGrams: null },
      { id: "tee-pdf", title: "Tee pattern", type: "digital", tags: ["cotton"], vendor: null, priceCents: 800, compareAtCents: null, inventory: null, weightGrams: null },
    ])
    check("collections: hand-picked items and a smart collection's rules, only the store's own", inside.has("course") && inside.has("tee-pdf") && !inside.has("ebook"), [...inside])

    asked.length = 0
    check("a code with neither reads nothing and leaves it to the product list", (await digitalCoverage(db, base, [ebook])) === null && asked.length === 0)
    const physicalOnly = await digitalCoverage(db, { ...base, physical_only: true }, [ebook])
    check("a physical only code on a download: covered by nothing, with nothing read", !!physicalOnly && physicalOnly(ebook) === false && asked.length === 0)
    const byCollection = await digitalCoverage(db, { ...base, collection_ids: ["manual"] }, [{ id: "course", type: "course" }, ebook])
    check("a collection code in the basket: the course in it is covered, the ebook is not", !!byCollection && byCollection({ id: "course", type: "course" }) && !byCollection(ebook))

    /* The download checkout: the same rule, through checkCoupon's covers. */
    const refused = checkCoupon({ ...base, physical_only: true } as CouponRow, { productId: "ebook", priceCents: 2000, covers: () => physicalOnly!(ebook) })
    check("a physical only code typed for an ebook is refused, in the product's words", refused.ok === false && /does not apply to this product/.test((refused as { error: string }).error))
    const basket = checkCouponLines({ ...base, discount_type: "fixed", discount_value: 5 } as CouponRow, [{ productId: "course", creatorId: SHOP, cents: 5000 }, { productId: "ebook", creatorId: SHOP, cents: 1000 }], { covers: (l) => byCollection!({ id: l.productId, type: l.productId === "course" ? "course" : "digital" }) })
    check("a basket: the code comes off the covered lines only", basket.ok === true && JSON.stringify((basket as { discounts: number[] }).discounts) === JSON.stringify([500, 0]))

    /* The rules a code always had, unchanged: dates, uses, a minimum, another store's lines. */
    const now = new Date("2026-10-28T12:00:00Z")
    const line = [{ productId: "ebook", creatorId: SHOP, cents: 2000 }]
    const err = (c: Partial<CouponRow>, l = line) => {
      const r = checkCouponLines({ ...base, ...c } as CouponRow, l, { now })
      return r.ok ? null : (r as { error: string }).error
    }
    check("not started yet", /not active yet/.test(err({ starts_at: "2026-11-01T00:00:00Z" }) ?? ""))
    check("expired", /expired/.test(err({ expires_at: "2026-10-01T00:00:00Z" }) ?? ""))
    check("used up at its limit", /used up/.test(err({ usage_limit: 3, usage_count: 3 }) ?? "") && err({ usage_limit: 3, usage_count: 2 }) === null)
    check("turned off", /not valid/.test(err({ is_active: false }) ?? ""))
    check("an order under the minimum, counted over the lines it covers", /at least/.test(err({ min_purchase_cents: 2500 }) ?? "") && err({ min_purchase_cents: 2000 }) === null)
    check("another store's lines are never discounted", /does not apply/.test(err({}, [{ productId: "ebook", creatorId: "other", cents: 2000 }]) ?? ""))
    const capped = checkCouponLines({ ...base, discount_type: "fixed", discount_value: 50 } as CouponRow, line, { now })
    check("a fixed amount never takes a line below zero", capped.ok === true && (capped as { discountCents: number }).discountCents === 2000)

    const pricing = code("lib/checkout/pricing.ts")
    check("the download checkout and the basket both ask the scope", /digitalCoverage\(db, c, \[\{ id: productId as string, type: productType \}\]\)/.test(pricing) && /const scoped = await digitalCoverage\(db, coupon, lines\.map/.test(pricing) && /\{ currency, covers \}/.test(pricing))
    check("  the marketplace price too", /covers: ask\.scope \? await ask\.scope\(found\) : null/.test(pricing))
    const physical = code("lib/physical/checkout-pricing-server.ts")
    check("the physical checkout uses the same rule and the same collection read", /scopeCovers\(c, \{ id: l\.productId, type: l\.type \}, inCollections\)/.test(physical) && /productsInCollections\(db, creatorId, c\.collection_ids as string\[\]/.test(physical))
  }

  console.log("\n4. The frames\n")
  {
    /* Offers */
    for (const f of ["app/(storelib)/app/offers/new/page.tsx", "app/(storelib)/app/offers/[id]/page.tsx", "app/(storelib)/app/offers/new/layout.tsx", "app/(storelib)/app/offers/[id]/layout.tsx"]) check(`offers: ${f} exists`, has(f))
    check("offers: a layer of its own on a phone, a page in the shell from md, as a coupon", ["app/(storelib)/app/offers/new/layout.tsx", "app/(storelib)/app/offers/[id]/layout.tsx"].every((f) => /<PageLayer pill inset="bar" phoneOnly>/.test(code(f))))
    check("offers: no route loading boundary, as every /app page", !has("app/(storelib)/app/offers/loading.tsx") && !has("app/(storelib)/app/offers/new/loading.tsx") && !has("app/(storelib)/app/offers/[id]/loading.tsx"))
    const newPage = code("app/(storelib)/app/offers/new/page.tsx")
    check("offers: ?kind= starts a bundle, an upsell or a quantity break; anything else a bundle", /const KINDS: readonly OfferKind\[\] = \["bundle", "checkout", "quantity_break"\]/.test(newPage) && /: "bundle"/.test(newPage))
    const idPage = code("app/(storelib)/app/offers/[id]/page.tsx")
    check("offers: an id that is not one of this store's goes back to the list", /if \(!UUID\.test\(id\)\) redirect\("\/app\/offers"\)/.test(idPage) && /a\.offers\.find\(\(o\) => o\.id === id\)/.test(idPage) && /if \(!offer\) redirect\("\/app\/offers"\)/.test(idPage))
    check("offers: every read is this creator's", /offersArea\(createAdminClient\(\), creator\.id as string\)/.test(code("app/(storelib)/app/offers/load-offers.ts")))
    const editor = code("app/(storelib)/app/offers/offer-editor.tsx")
    check("offers: the editor is not a dialog or a sheet", !/SheetDialog|BottomSheet|<Dialog|Modal/.test(editor))
    check("offers: a bar with Cancel or Back and Save under lg, a header and a foot bar from lg", /data-editor-bar=""/.test(editor) && /data-editor-head=""/.test(editor) && /data-editor-foot=""/.test(editor) && /<LeaveButton mode=\{leaveMode\}/.test(editor))
    check("offers: leaving with changes asks, a new one too", /Discard changes\?/.test(editor) && /Discard this offer\?/.test(editor))
    check("offers: a save and a delete go back to the list with what they did", /offersReturn\.leave\(router, \{ id: saved\?\.id \?\? offer\?\.id \?\? null, saved,/.test(editor) && /offersReturn\.leave\(router, \{ id: offer\.id, deleted: true,/.test(editor))
    check("offers: the kind is kept in the address while it changes", /window\.history\.replaceState\(window\.history\.state, "", newOfferHref\(k\)\)/.test(editor))
    const list = code("app/(storelib)/app/offers/offers-client.tsx")
    check("offers: the list opens a page, not an editor over itself", /offersReturn\.open\(router, offer \? offerHref\(offer\.id\) : newOfferHref\(kind\)\)/.test(list) && !/<OfferEditor/.test(list))
    check("offers: and lays the page's change over its rows, then reads them again", /rowsWithReturn\(initialOffers, offersReturn\.peek\(\)\)/.test(list) && /const back = offersReturn\.take\(\)/.test(list) && /router\.refresh\(\)/.test(list))
    check("offers: a slow navigation to it keeps the page you are on", /\^\\\/app\\\/offers\\\/\[\^\/\]\+\(\\\/\|\$\)/.test(read("lib/ui/app-navigation.ts")))

    /* Coupons: already sub pages; their physical options now look like the rest of the form. */
    check("coupons: new and saved are pages of their own", has("app/(storelib)/app/coupons/new/page.tsx") && has("app/(storelib)/app/coupons/[id]/page.tsx") && !has("app/(storelib)/app/coupons/loading.tsx"))
    const options = code("components/physical/coupon-options.tsx")
    check("coupons: the shipping options are the form's grouped switches", /<div className=\{SWITCH_GROUP\}>/.test(options) && (options.match(/<SwitchRow /g) ?? []).length === 3 && !/<Toggle /.test(options))

    /* Size charts */
    for (const f of ["app/(storelib)/app/products/size-charts/new/page.tsx", "app/(storelib)/app/products/size-charts/[id]/page.tsx"]) check(`size charts: ${f} exists`, has(f))
    check("size charts: the same frame, and physical commerce only", ["app/(storelib)/app/products/size-charts/new/layout.tsx", "app/(storelib)/app/products/size-charts/[id]/layout.tsx"].every((f) => /<PageLayer pill inset="bar" phoneOnly>/.test(code(f))) && /await requirePhysicalPage\(\)/.test(code("app/(storelib)/app/products/size-charts/load-size-charts.ts")))
    const chartList = code("app/(storelib)/app/products/size-charts/size-charts-client.tsx")
    check("size charts: the list opens a page", /sizeChartsReturn\.open\(router, chart \? sizeChartHref\(chart\.id\) : newSizeChartHref\(\)\)/.test(chartList) && !/<SizeChartEditor/.test(chartList))
    const chartPage = code("app/(storelib)/app/products/size-charts/size-chart-page.tsx")
    check("size charts: the page draws the shared fields as cards, saves and deletes through the API", /<SizeChartFields state=\{state\} uploadImage=\{upload\} targets=\{targets\} rules=\{rules\} card=\{CARD\}/.test(chartPage) && /\/api\/size-charts\/\$\{chart\.id\}/.test(chartPage) && /method: "DELETE"/.test(chartPage))
    const form = code("components/physical/size-chart-form.tsx")
    check("size charts: the table's keys and paste are wired", /onKeyDown=\{\(e\) => onCellKey\(e, r, c\)\}/.test(form) && /onPaste=\{\(e\) => onCellPaste\(e, r, c\)\}/.test(form) && /data-size-chart-row-up=/.test(form) && /data-size-chart-row-down=/.test(form))
    check("size charts: a part is a component of its own, so typing never remounts a field", /^function FieldPart\(/m.test(form) && !/const Part = /.test(form))
    check("size charts: the product editor keeps its dialog, so the product stays as it was under it", /* Changed on purpose (wave 10): the shared SheetDialog, a dialog on a computer and the app's sheet on a phone (tests/size-chart-dialog-w10.test.ts). */ /<SheetDialog\s+open=\{open\}/.test(code("components/physical/size-chart-editor.tsx")) && /<SizeChartEditor/.test(code("components/physical/size-chart-card.tsx")))

    /* Buttons with depth */
    const ui = code("components/physical/ui.tsx")
    check("the physical pages' buttons wear the app's depth", /export const BTN_PRIMARY = cn\(primaryDepth,/.test(ui) && /export const BTN_SECONDARY = cn\(secondaryDepth,/.test(ui) && /export const BTN_DANGER = cn\(secondaryDepth,/.test(ui))
    const pages = ["app/(storelib)/app/offers/offer-editor.tsx", "app/(storelib)/app/offers/offer-fields.tsx", "app/(storelib)/app/products/size-charts/size-chart-page.tsx", "components/physical/size-chart-form.tsx"].map(code).join("\n")
    /* The keyboard ring is the app's own violet (components/ui/depth-button.ts, Segmented): only what is drawn at rest counts. */
    check("no violet, no gradient, no glass on the new pages", !/#8b5cf6|#7c3aed|gradient|backdrop-blur/i.test(pages.replace(/focus-visible:[^\s"]+/g, "")))
    const said = ["app/(storelib)/app/offers/offer-editor.tsx", "app/(storelib)/app/products/size-charts/size-chart-page.tsx", "components/physical/size-chart-form.tsx", "lib/checkout/coupon-scope.ts"].map(read).join("\n")
    check("no em dash and none of the banned words", !/—/.test(said) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(said))

    /* Inventory */
    const inv = code("lib/physical/inventory-server.ts")
    check("inventory: variants read in batches, so a large shop's ids fit the address", /for \(let i = 0; i < productIds\.length; i \+= VARIANT_BATCH\)/.test(inv) && /export const VARIANT_BATCH = 200/.test(inv))
    check("inventory: ?filter= is read by the server, so both sides draw the same first frame", /<InventoryClient initialView=/.test(code("app/(storelib)/app/inventory/page.tsx")) && !/window\.location\.search/.test(code("app/(storelib)/app/inventory/inventory-client.tsx")))
    check("inventory: what saved before a later failure is shown at once", /if \(settingsChanged\) onDone\(\)/.test(code("app/(storelib)/app/inventory/inventory-client.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()

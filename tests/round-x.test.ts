/**
 * Round X: Settings on phones as it was before the sheet, sections that show
 * whole, the page behind the sheet holding still, and Buy it now as wide as
 * Shopify draws it.
 *
 *   npx tsx tests/round-x.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nSettings on a phone")
const form = read("components/app/settings-form-new.tsx")
const sheet = read("components/app/settings-sheet.tsx")
check("under the app's header and beside its rail, as a page, not over them", /max-lg:z-\[49\] max-lg:top-\[calc\(68px\+env\(safe-area-inset-top,0px\)\)\]/.test(sheet) && /md:max-lg:left-\[var\(--app-rail-w,240px\)\]/.test(sheet))
check("no handle and no Back strip of its own on a phone", /"max-lg:hidden",/.test(sheet) && !/data-settings-page-back/.test(sheet))
/* Changed on purpose (round R1): the soft fill and its hairline are the pill's own background and inset shadow, eased in place; the span laid over the pill was what made WebKit hide its words and blink its icon. */
check("the pills as before: words on grey, the open one on a soft fill that eases in place", !/data-settings-tab-fill=""/.test(form) && /bg-\[#f3f4f6\] text-\[#1a1a2e\] shadow-\[inset_0_0_0_1px_#d1d5db/.test(form) && /transition-\[color,background-color,box-shadow\]/.test(form) && !/border-\[#1a1a2e\] bg-\[#1a1a2e\] text-white/.test(form))
check("the pressed pill glides to the middle of the row", /pill\.offsetLeft - \(row\.clientWidth - pill\.offsetWidth\) \/ 2/.test(form) && /behavior: pillPlaced\.current \? "smooth"/.test(form))
check("the title and the address pill share a row again", /grid grid-cols-\[auto_minmax\(0,1fr\)\] items-center/.test(form))

console.log("\nA section shows whole")
check("its data is fetched as Settings opens, and on a press or a hover", /prefetchGet\(\[\.\.\.new Set\(Object\.keys\(TAB_DATA\)/.test(form) && /onPointerDown=\{\(\) => prefetchGet\(tabData/.test(form) && /onPointerEnter=\{\(\) => prefetchGet\(tabData/.test(form))
/* Changed on purpose (round R1): data already kept swaps on the press; data on its way is waited for at most DATA_WAIT_MS (160ms), not 450. */
check("the section follows the pill at once when its data is here, never more than 160ms later", /if \(urls\.every\(\(u\) => peekGet\(u\) !== null\)\) show\(\)/.test(form) && /whenGets\(urls\), new Promise\(\(r\) => window\.setTimeout\(r, DATA_WAIT_MS\)\)/.test(form) && /const DATA_WAIT_MS = 160/.test(form))
check("the scroll moves with the new section, not before it", /scrollPending\.current = true/.test(form) && /\}, \[panelTab\]\)/.test(form))
/* Round R1: each pill's own list is kept and fetched ahead too, and a filter is worked out from All when All is the whole log. */
check("Activity starts from what was fetched ahead", /const own = peekGet<Page>\(pathOf\(f\)\)/.test(read("components/app/settings/activity-panel.tsx")) && /const all = peekGet<Page>\(pathOf\("all"\)\)/.test(read("components/app/settings/activity-panel.tsx")))
check("Settings is warmed on phones too, at most every few minutes", /Date\.now\(\) - settingsWarmedAt < 4 \* 60_000/.test(read("components/app/sidebar.tsx")))

console.log("\nThe page behind the sheet")
const stage = read("components/app/app-stage.tsx")
check("opening Settings over a page, or closing it back onto that page, is not a landing", /data-settings-sheet-mode="over"/.test(stage) && /if \(pageChanged && \(sheetOver \|\| \(under !== null && pathname === under\)\)\) return/.test(stage))

console.log("\nBuy it now")
const buy = String((compatFilter("payment_button") as unknown as (v: unknown, a: unknown[], k: object) => unknown)({}, [], {}))
check("Shopify's own rules come with it: a block as wide as the row", /:where\(\.shopify-payment-button__button\)\{display:block;width:100%/.test(buy) && /:where\(\.shopify-payment-button\)\{display:block;width:100%;flex:1 1 100%;grid-column:1\/-1\}/.test(buy))
check("weighing nothing, so the theme's own button rules still win", !/\.shopify-payment-button__button\{/.test(buy.replace(/:where\([^)]*\)/g, "")))
check("still a submit named checkout that the page sends to the checkout", /name="checkout"/.test(buy) && /data-storelib-buy-now/.test(buy))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

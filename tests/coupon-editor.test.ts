/**
 * ===========================================================================
 *  THE COUPON EDITOR: ITS FORM, AND ITS FRAME
 * ===========================================================================
 * 1. The form, run as it is (app/app/coupons/coupon-form.ts): a saved code
 *    read into it, what typing may put in a field, the generated code, the
 *    first thing wrong and which field it is, the body sent, which the
 *    server's own check (readCouponInput) takes, and the summary.
 * 2. What the list does with what the editor hands back (withReturn).
 * 3. The frame, read from the source: the product editor's. A full screen
 *    layer on a phone, a page in the shell from md, the 1200px page with a
 *    header, two columns and a foot bar from lg; the list opens it with the
 *    layer's move and takes it back at the view it was on; no violet.
 *    scripts/check-coupons-page.mjs measures all of it in a browser.
 */
import { readFileSync } from "node:fs"
import {
  emptyForm,
  formPayload,
  formProblem,
  fromCoupon,
  generateCode,
  summaryLines,
  typedAmount,
  typedCode,
  typedWhole,
  withReturn,
  type CouponForm,
  type CouponRecord,
} from "@/app/app/coupons/coupon-form"
import { readCouponInput } from "@/lib/checkout/coupons"
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
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

const PRODUCT = "00000000-0000-4000-8000-000000000001"
const saved: CouponRecord = {
  id: "c1",
  code: "SUMMER20",
  discount_type: "percentage",
  discount_value: 20,
  product_ids: [PRODUCT],
  usage_limit: 100,
  usage_count: 14,
  starts_at: null,
  expires_at: "2026-10-15T13:21:00.000Z",
  min_purchase_cents: 2550,
  is_active: true,
}
const filled = (over: Partial<CouponForm>): CouponForm => ({ ...emptyForm(), code: "SPRING25", discount_value: "25", ...over })

console.log("\nA saved code, read into the form")
{
  const f = fromCoupon(saved)
  check("its code, kind and value", f.code === "SUMMER20" && f.discount_type === "percentage" && f.discount_value === "20", f)
  check("selected products, with the ids it names", f.applies_to === "specific" && f.product_ids.length === 1)
  check("a minimum of 2550 cents reads $25.50, and its switch is on", f.has_min_purchase && f.min_purchase_amount === "25.50", f.min_purchase_amount)
  check("a use limit, its switch on", f.has_usage_limit && f.usage_limit === "100")
  check("no start, an end in the viewer's own time", !f.has_start && f.starts_at === "" && f.has_end && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(f.expires_at), f.expires_at)
  const fixed = fromCoupon({ ...saved, discount_type: "fixed", discount_value: 5.5, product_ids: null, min_purchase_cents: null, usage_limit: null })
  check("a fixed $5.50 reads 5.50; no products means all; no limits means switches off", fixed.discount_value === "5.50" && fixed.applies_to === "all" && !fixed.has_min_purchase && !fixed.has_usage_limit, fixed)
  check("and read back unchanged, it sends what was saved", (() => {
    const body = formPayload(f)
    return body.discount_value === 20 && body.min_purchase_cents === 2550 && body.usage_limit === 100 && body.product_ids?.[0] === PRODUCT && body.starts_at === null && body.expires_at === saved.expires_at
  })(), formPayload(f))
}

console.log("\nWhat typing may put in a field")
check("a code is capitals, digits, - and _, 32 at most", typedCode("spring 25!-x_y") === "SPRING25-X_Y" && typedCode("a".repeat(40)).length === 32)
check("an amount keeps one point and two places, and takes a comma for a point", typedAmount("12,5") === "12.5" && typedAmount("1.234") === "1.23" && typedAmount("$1.2.3") === "1.23" && typedAmount("a1b") === "1")
check("a count is digits only", typedWhole("1,000") === "1000" && typedWhole("-5") === "5")

console.log("\nGenerate")
{
  const all = generateCode(() => Uint8Array.from({ length: 8 }, (_, i) => i * 31))
  check("eight characters that pass the server's pattern", /^[A-Z0-9_-]{3,32}$/.test(all) && all.length === 8, all)
  const many = Array.from({ length: 200 }, () => generateCode())
  check("never 0, O, 1 or I, which read as each other", many.every((c) => !/[01OI]/.test(c)))
  check("and not the same twice in 200", new Set(many).size === 200)
}

console.log("\nThe first thing wrong, and where")
const problem = (f: CouponForm, savedCode: string | null = null) => formProblem(f, savedCode)
check("no code", problem(filled({ code: "" }))?.field === "code")
check("a code too short", problem(filled({ code: "AB" }))?.field === "code")
check("a code saved before the rules is kept as it is", problem(filled({ code: "x1" }), "x1") === null)
check("no value", problem(filled({ discount_value: "" }))?.message === "Enter how much it takes off.")
check("a value of 0", problem(filled({ discount_value: "0" }))?.field === "value")
check("more than 100%", problem(filled({ discount_value: "100.5" }))?.message === "A percentage is at most 100.")
check("100% is allowed", problem(filled({ discount_value: "100" })) === null)
check("a fixed amount over $100,000", problem(filled({ discount_type: "fixed", discount_value: "100001" }))?.field === "value")
check("selected products with none picked", problem(filled({ applies_to: "specific" }))?.field === "products")
check("a minimum switched on and left empty", problem(filled({ has_min_purchase: true }))?.field === "minimum")
check("a use limit of 0", problem(filled({ has_usage_limit: true, usage_limit: "0" }))?.field === "uses")
check("a start switched on with no date", problem(filled({ has_start: true }))?.field === "start")
check("an end before the start", problem(filled({ has_start: true, starts_at: "2026-10-10T10:00", has_end: true, expires_at: "2026-10-01T10:00" }))?.message === "The end has to be after the start.")
check("in the order the page reads: the code before the value", problem(filled({ code: "", discount_value: "" }))?.field === "code")
check("a switch turned off forgets what it held", problem(filled({ has_min_purchase: false, min_purchase_amount: "" })) === null)

console.log("\nThe body sent is the one the server takes")
{
  const f = filled({
    discount_type: "fixed",
    discount_value: "5.5",
    applies_to: "specific",
    product_ids: [PRODUCT],
    has_min_purchase: true,
    min_purchase_amount: "19.99",
    has_usage_limit: true,
    usage_limit: "250",
    has_start: true,
    starts_at: "2026-10-01T09:00",
    has_end: true,
    expires_at: "2026-10-08T09:00",
    is_active: false,
  })
  const body = formPayload(f)
  check("money in cents, counts as numbers, dates as instants", body.discount_value === 5.5 && body.min_purchase_cents === 1999 && body.usage_limit === 250 && body.starts_at === new Date("2026-10-01T09:00").toISOString() && body.is_active === false, body)
  const server = readCouponInput(body)
  check("readCouponInput accepts it whole", server.ok === true, server)
  if (server.ok) check("and keeps every value", server.values.discount_type === "fixed" && server.values.discount_value === 5.5 && server.values.min_purchase_cents === 1999 && server.values.product_ids?.[0] === PRODUCT && server.values.is_active === false)
  const off = formPayload(filled({ has_min_purchase: false, min_purchase_amount: "10", has_usage_limit: false, usage_limit: "5", has_end: false, expires_at: "2026-10-08T09:00", applies_to: "all", product_ids: [PRODUCT] }))
  check("a rule switched off is sent as none, whatever its field still holds", off.min_purchase_cents === null && off.usage_limit === null && off.expires_at === null && off.product_ids === null, off)
}

console.log("\nThe summary")
{
  const lines = summaryLines(filled({ applies_to: "specific", product_ids: [PRODUCT], has_min_purchase: true, min_purchase_amount: "25", has_usage_limit: true, usage_limit: "1" }), [{ id: PRODUCT, title: "Presets" }])
  check("what it takes off and on what, then each rule", lines[0] === "25% off Presets" && lines.includes("Orders of $25 or more") && lines.includes("Can be used once") && lines.includes("No end date"), lines)
  const fixed = summaryLines(filled({ discount_type: "fixed", discount_value: "5.5" }), [])
  check("a fixed amount in dollars, on all products", fixed[0] === "$5.50 off all products", fixed)
  check("a value not typed yet is left out, not guessed", summaryLines(filled({ discount_value: "" }), [])[0] === "Applies to all products")
}

console.log("\nBack on the list")
{
  const rows = [{ id: "a", code: "A" }, { id: "b", code: "B" }]
  check("a saved row replaces the one the router kept", withReturn(rows, { id: "b", saved: { ...saved, id: "b", code: "B2" } })[1].code === "B2")
  check("a new one goes first", withReturn(rows, { id: "n", saved: { ...saved, id: "n", code: "NEW" } })[0].id === "n")
  check("a deleted one is gone", withReturn(rows, { id: "a", deleted: true }).map((r) => r.id).join() === "b")
  check("a way back with nothing saved changes nothing", withReturn(rows, { id: "a" }) === rows && withReturn(rows, null) === rows)
}

console.log("\nThe frame: the product editor's")
{
  const editor = code("app/app/coupons/coupon-editor.tsx")
  const layouts = [code("app/app/coupons/new/layout.tsx"), code("app/app/coupons/[id]/layout.tsx")]
  check("both pages are a layer on a phone and a page in the shell from md, with the pill kept",
    layouts.every((l) => /<PageLayer pill inset="bar" phoneOnly>\{children\}<\/PageLayer>/.test(l)))
  check("both pages draw the one editor", /<CouponEditor products=\{load\.products\} currency=\{load\.currency\} initialCoupon=\{null\} \/>/.test(code("app/app/coupons/new/page.tsx")) && /<CouponEditor key=\{id\} products=\{load\.products\} currency=\{load\.currency\} initialCoupon=\{coupon\} \/>/.test(code("app/app/coupons/[id]/page.tsx")))
  check("it scrolls in its own pane, with room for the pill at its foot on a phone",
    /className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-\[#f8f9fa\] max-md:\[\[data-page-layer\]_&\]:pb-\[calc\(32px\+env\(safe-area-inset-bottom\)\)\] lg:flex lg:flex-col"/.test(editor))
  check("below lg one bar at the top, under the status bar on a phone: the way out and Save",
    /data-editor-bar=""[\s\S]{0,200}"sticky top-0 z-30 bg-\[#f8f9fa\] transition-shadow duration-150 max-md:\[\[data-page-layer\]_&\]:pt-\[env\(safe-area-inset-top\)\] lg:hidden"/.test(editor)
      && /<LeaveButton mode=\{leaveMode\} disabled=\{busy\} asks=\{dirty\} label="Going back to coupons" onLeave=\{\(\) => void leave\(\)\} \/>\s*<CouponSaveButton/.test(editor))
  check("from lg the 1200px page, its gutter the shared app-gutter (10px on a phone, 32px from lg), a page header with the way back",
    /data-editor-page="" className="mx-auto w-full max-w-\[760px\] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-\[1200px\] lg:pb-8 lg:pt-6"/.test(editor)
      && /data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex"/.test(editor) && /aria-label="Back to coupons"/.test(editor))
  check("two columns, two thirds and one third", /lg:grid lg:grid-cols-\[minmax\(0,2fr\)_minmax\(272px,1fr\)\] lg:items-start/.test(editor) && /data-editor-main=""/.test(editor) && /data-editor-side=""/.test(editor))
  check("Cancel and Save in a sticky bar along the foot from lg", /data-editor-foot=""\s*className="sticky bottom-0 z-30 mt-auto hidden[^"]*lg:block"/.test(editor))
  check("Cancel asks before a change is thrown away, in the product editor's sheet", /useConfirm\(\)/.test(editor) && /title: "Discard changes\?"/.test(editor))
  check("the way out and a save go back through the list's return", /returnToCoupons\(router, \{ id: initialCoupon\?\.id \?\? null \}\)/.test(editor) && /returnToCoupons\(router, \{ id: saved\?\.id/.test(editor) && /useCouponListOrigin\(\)/.test(editor) && /warmCoupons\(router\)/.test(editor))
  check("Cmd or Ctrl and S saves", /e\.metaKey \|\| e\.ctrlKey/.test(editor))
  check("a problem is said under its field, not in a box at the top", /<FieldError id="coupon-value" problem=\{problem\} \/>/.test(editor) && /aria-invalid=\{wrong\("value"\)/.test(editor))
  check("a code already taken is the code field's problem", /res\.status === 409[^\n]*point\(\{ field: "code"/.test(editor))

  const list = code("app/app/coupons/coupons-client.tsx")
  check("the list opens a coupon with the layer's move", (list.match(/openFromLink\(`\/app\/coupons\/\$\{coupon\.id\}`\)/g) ?? []).length >= 3 && /openCoupon\(router, `\/app\/coupons\/\$\{coupon\.id\}`\)/.test(list) && /onClick=\{openFromLink\("\/app\/coupons\/new"\)\}/.test(list))
  check("it lays the editor's change over the rows the router kept, then refreshes", /useState<Coupon\[\]>\(\(\) => withReturn\(initialCoupons, peekReturn\(\)\)\)/.test(list) && /const back = takeReturn\(\)/.test(list) && /router\.refresh\(\)/.test(list))
  /* Whether it is a return is read once, on the first render: the same answer takes up the view and holds the stage's landing (tests/return-navigation). */
  check("and takes up the view it was on only on a return", /const \[returning\] = useState\(isReturning\)/.test(list) && /useState<View>\(\(\) => \(returning && leftAt \? leftAt : "all"\)\)/.test(list))

  /* Changed on purpose: Coupons takes the one round trip every commerce list shares (components/app/list-return.ts). */
  const ret = code("components/app/list-return.ts")
  check("back in history when the list opened it, a replace marked as a return otherwise", /createListReturn<CouponReturn>\(COUPONS_HREF\)/.test(code("app/app/coupons/list-return.ts")) && /if \(!back\) return replaceWithList\(\)|if \(back\) backThen\(replaceWithList\)/.test(ret) && /backThen\(/.test(ret) && /const replaceWithList = \(\) => \{\s*markTraversal\(\)\s*router\.replace\(listHref\)/.test(ret) && /moveLayer\("enter"/.test(ret) && /moveLayer\("leave"/.test(ret))

  const files = ["app/app/coupons/coupon-editor.tsx", "app/app/coupons/coupon-parts.tsx", "app/app/coupons/coupons-client.tsx"].map(read).join("\n")
  check("no violet anywhere in the coupon pages", !/#8b5cf6|#7c3aed|#6d28d9|#f5f3ff|violet-|buttonAccent|primaryDepth/i.test(files))
  check("no em dash in what they say", !/—/.test(files.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")))
}

console.log("\nThe edit route")
{
  const put = code("app/api/coupons/[id]/route.ts")
  check("only the products an edit adds must be the creator's, so a code naming a deleted product can still be edited and turned off",
    /const added = \(input\.values\.product_ids \?\? \[\]\)\.filter\(\(pid\) => !before\.has\(pid\)\)/.test(put) && /productsAreTheirs\(who\.supabase, who\.creatorId, added\)/.test(put))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

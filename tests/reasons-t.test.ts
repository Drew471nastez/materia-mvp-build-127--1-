/**
 * Round T: return and refund reasons, one list per store, used everywhere
 * a return is asked for or a refund is made.
 *
 *   npx tsx tests/reasons-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_REFUND_REASONS, DEFAULT_RETURN_REASONS, FALLBACK_REASON, acceptedReason, freeValue, readReason, reasonLabel, valueFromLabel } from "@/lib/store/reasons"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe lists\n")
{
  const oldReturn = ["size", "damaged", "defective", "not_as_described", "wrong_item", "changed_mind", "other"]
  check("the default return reasons are the seven Storelib always took, so every return made before reads with its name", oldReturn.every((v) => DEFAULT_RETURN_REASONS.some((r) => r.value === v)) && DEFAULT_RETURN_REASONS.length === 7)
  check("the default refund reasons keep the three a card network knows", ["requested_by_customer", "duplicate", "fraudulent"].every((v) => DEFAULT_REFUND_REASONS.some((r) => r.value === v)))
  check("both end with Other, where an unknown reason lands", DEFAULT_RETURN_REASONS.at(-1)?.value === FALLBACK_REASON && DEFAULT_REFUND_REASONS.at(-1)?.value === FALLBACK_REASON)
  check("a value is made from the name once: accents dropped, words joined", valueFromLabel("Trop grand, renvoyé") === "trop_grand_renvoye" && valueFromLabel("  !!  ") === "reason" && valueFromLabel("x".repeat(80)).length === 40)
  check("  and never taken twice", freeValue("size", ["size", "size_2"]) === "size_3" && freeValue("new", ["size"]) === "new")
  check("a name is 1 to 60 characters, a description up to 200, no markup", readReason({ label: " <b>Too big</b> " }).ok && (readReason({ label: " <b>Too big</b> " }) as { label: string }).label === "bToo big/b" && !readReason({ label: "   " }).ok && ((readReason({ label: "x", description: "y".repeat(300) }) as { description: string }).description.length === 200))
}

console.log("\nReading a stored reason\n")
{
  const own = [{ value: "size", label: "Doesn't fit", description: null }]
  check("the store's own name first", reasonLabel("size", "return", own) === "Doesn't fit")
  check("  then Storelib's", reasonLabel("damaged", "return", own) === "Arrived damaged" && reasonLabel("duplicate", "refund") === "Charged twice")
  check("  then the value written out, never a blank", reasonLabel("lost_in_post", "refund") === "Lost in post" && reasonLabel(null, "refund") === "")
  check("a reason not on the store's list is kept as Other, never refused", acceptedReason("hacked", own) === FALLBACK_REASON && acceptedReason("size", own) === "size" && acceptedReason("<x>", own) === FALLBACK_REASON)
}

console.log("\nUsed everywhere\n")
{
  const orders = read("lib/physical/orders-server.ts")
  check("opening a return checks the reason against the store's list", /const reasonList = await reasonsFor\(db, input\.creatorId, "return"\)/.test(orders) && /acceptedReason\(input\.reason, reasonList\)/.test(orders) && !/RETURN_REASONS/.test(orders))
  check("  and keeps the name it was asked with, in its own write", /reason_label: reasonLabel\(reason, "return", reasonList\)/.test(orders))
  const page = read("app/checkout/physical/order/[token]/page.tsx")
  const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
  check("the buyer's order page offers the store's return reasons", /reasonsFor\(db, order\.creatorId, "return"\)/.test(page) && /reasons=\{reasons\.map/.test(page) && /\{reasons\.map\(\(r\) => \(/.test(view))
  const panel = read("components/physical/order-panel.tsx")
  check("the shop's return dialog and each return read the same list", /useReasons\("return"\)/.test(panel) && /reasonLabel\(r\.reason, "return", reasons\)/.test(panel) && !/REASON_LABEL/.test(panel))
  const detail = read("app/app/orders/order-detail.tsx")
  const payouts = read("app/app/payouts/payouts-client.tsx")
  check("both refund dialogs offer the store's refund reasons", /useReasons\("refund"\)/.test(detail) && /useReasons\("refund"\)/.test(payouts) && !/const REFUND_REASONS = \[/.test(payouts))
  check("  and Payouts now sends the one picked", /JSON\.stringify\(\{ orderId: order\.id, reason: refundReason \}\)/.test(payouts))
  const route = read("app/api/stripe/refund/route.ts")
  check("the refund route keeps only a reason value, never free text", /\/\^\[a-z0-9_\]\{1,40\}\$\/\.test\(body\.reason\)/.test(route))
  const timeline = read("lib/orders/timeline.ts")
  check("the order's timeline shows the reason by its name", /reasonLabel\(line\.refund_reason, "refund"\)/.test(timeline))
}

console.log("\nSettings › Returns and refunds\n")
{
  const form = read("components/app/settings-form-new.tsx")
  check("every store has it; without physical products it is Refunds, with refund reasons only", !/COMMERCE_TABS = new Set<string>\(\[[^\]]*"returns"/.test(form) && /label: "Refunds"/.test(form) && /<ReasonsPanel kinds=\{physicalCommerce \? \["return", "refund"\] : \["refund"\]\} \/>/.test(form))
  const ui = read("components/app/settings/reasons-panel.tsx")
  check("a reason is added, renamed, described, moved and removed; Other stays", /send\("POST"/.test(ui) && /send\("PUT"/.test(ui) && /send\("PATCH"/.test(ui) && /send\("DELETE"/.test(ui) && /!isNew && !fixed \?/.test(ui))
  check("a change reaches every open dialog at once, with the list as saved", /forgetReasons\(\{ \[kind\]: next \}\)/.test(ui))
  const hook = read("lib/store/use-reasons.ts")
  check("  in this tab through the hook's listeners, in other tabs through a BroadcastChannel", /listeners\.add\(on\)/.test(hook) && /listeners\.delete\(on\)/.test(hook) && /new BroadcastChannel\(CHANNEL\)/.test(hook) && /postMessage\(l\)/.test(hook))
  const server = read("lib/store/reasons-server.ts")
  check("a list nobody changed has no rows; the first change writes the defaults out first", /if \(rows\.length === 0\) return \{ kind, reasons: defaultsFor\(kind\), custom: false/.test(server) && /async function rowsOf/.test(server) && /onConflict: "creator_id,kind,value"/.test(server))
  check("  every write is filtered by the caller's own store", (server.match(/\.eq\("creator_id", creatorId\)/g) ?? []).length >= 5 && /creator_id: creatorId, kind, value/.test(server))
  check("  Other can't be removed", /if \(value === FALLBACK_REASON\) return \{ ok: false/.test(server))
  const api = read("app/api/store/reasons/route.ts")
  check("the route is the owner's alone, any store", /shopCaller\(\)/.test(api) && !/physicalCaller/.test(api))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

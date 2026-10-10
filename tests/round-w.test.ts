/**
 * Round W: buyers' cases about orders (lib/support/cases, SQL part 117),
 * physical receipts that open the order page, and the store's identity on
 * what buyers get (part 118).
 *
 *   npx tsx tests/round-w.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CASE_REASONS, readNewCase, reasonsFor, statusAfterMessage, caseLink } from "@/lib/support/cases"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhose turn a case is")
check("a buyer's message puts it with the store", statusAfterMessage("buyer", { status: "buyer", escalated: false }) === "store")
check("the store's reply puts it with the buyer", statusAfterMessage("store", { status: "store", escalated: false }) === "buyer")
check("once Storelib is in, anyone's message puts it with Storelib", statusAfterMessage("buyer", { status: "buyer", escalated: true }) === "storelib" && statusAfterMessage("store", { status: "store", escalated: true }) === "storelib")
check("Storelib's reply goes to the buyer unless it says the store", statusAfterMessage("storelib", { status: "storelib", escalated: true }) === "buyer" && statusAfterMessage("storelib", { status: "storelib", escalated: true }, { to: "store" }) === "store")
check("an internal note changes nothing", statusAfterMessage("storelib", { status: "storelib", escalated: true }, { internal: true }) === "storelib")

console.log("\nWhat a buyer can say")
check("a parcel can arrive damaged; a download can't", reasonsFor("physical").includes("damaged") && !reasonsFor("digital").includes("damaged"))
check("a download can't be opened; a parcel has nothing to open", reasonsFor("digital").includes("access") && !reasonsFor("physical").includes("access"))
check("every reason the page offers is one the database takes", [...reasonsFor("physical"), ...reasonsFor("digital")].every((r) => CASE_REASONS.includes(r)))
const sql = read("supabase/sql/run-now/117_order_cases.sql")
check("and the database's list is the same one", CASE_REASONS.every((r) => sql.includes(`'${r}'`)))
check("a reason the order can't have is refused", readNewCase({ reason: "damaged", message: "it is broken, see photos" }, "digital").ok === false)
check("a message too short to help with is refused", readNewCase({ reason: "damaged", message: "bad" }, "physical").ok === false)
check("a proper one is taken", readNewCase({ reason: "not_arrived", message: "Ordered two weeks ago, nothing yet." }, "physical").ok === true)
check("the buyer's link carries the case and its key, nothing else", caseLink("https://storelib.com/", "abc", "k e y") === "https://storelib.com/order-help/abc?k=k%20e%20y")

console.log("\nWired")
const server = read("lib/support/cases-server.ts")
check("the buyer's email and name come from the order, never the request", /buyer_email: order\.buyerEmail/.test(server) && !/body\.email|input\.email/.test(server))
check("only the link's hash is stored, and the link is derived (the same in every email)", /access_hash: hash\(secret\)/.test(server) && /orderCaseSecret/.test(server))
check("an order's open case is joined, not doubled", /neq\("status", "resolved"\)/.test(server))
check("Storelib hears when it is asked in, and the store's emails reply to the buyer", /emailStorelib/.test(server) && /replyTo: from === "buyer" \? row\.buyer_email/.test(server))
const routes = read("tests/admin-key-routes.test.ts")
check("the buyer's two routes are public on purpose, and say why", /"order-help\/route\.ts"/.test(routes) && /"order-help\/\[id\]\/route\.ts"/.test(routes))
check("the store answers from Support › From buyers", /BuyerCaseThread/.test(read("app/app/support/support-client.tsx")))
check("Storelib answers from Resolution center › Buyer cases", /<BuyerCases onCount/.test(read("app/admin/resolution/resolution-center.tsx")))
check("the admin is told which SQL part is missing", /Run SQL part 114/.test(read("app/api/admin/support/route.ts")) && /SQL part 117/.test(read("app/api/admin/cases/route.ts")))
check("buyers get help from the order page and the receipt", /<OrderHelp kind="physical"/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /<OrderHelp kind="digital"/.test(read("app/receipt/[token]/receipt-view.tsx")))
check("/order-help is a platform path on every host", /"\/order-help"\]/.test(read("proxy.ts")))

console.log("\nA thing that ships has no download receipt")
const receiptPage = read("app/receipt/[token]/page.tsx")
check("a receipt link for a physical item opens its order page", /physicalOrderPageFor\(admin, token\)/.test(receiptPage) && /redirect\(orderPage\)/.test(receiptPage))
const po = read("lib/receipts/physical-order.ts")
check("found by the Stripe session, or by the fingerprint a free order keeps", /stripe_session_id/.test(po) && /session_fingerprint/.test(po))

console.log("\nThe store signs what buyers get")
const id = read("lib/store/identity-server.ts")
check("logo: Store details, else the website's, else the photo", id.indexOf('"store"') < id.indexOf('"website"') && id.indexOf('"website"') < id.indexOf('"profile"'))
check("email: Store details, else support email, else the owner's, never a relay", /contact_email/.test(id) && /support_email/.test(id) && /\\\+slb-/.test(id))
check("SQL part 118 adds the logo and contact email", /logo_url/.test(read("supabase/sql/run-now/118_store_identity.sql")) && /contact_email/.test(read("supabase/sql/run-now/118_store_identity.sql")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

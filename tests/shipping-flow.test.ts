/**
 * ===========================================================================
 *  SHIPPING: THE PROMISES THAT COST MONEY WHEN THEY BREAK
 * ===========================================================================
 * Every other feature in this app fails by looking wrong. This one fails by
 * booking a courier twice, by letting the wrong person download a label with
 * two people's names on it, or by sending a parcel to an address nobody chose.
 * None of those show up on a screen — they show up on an invoice, or they do
 * not show up at all.
 *
 * So the properties are written down: who may do what, what cannot happen
 * twice, and what must never reach a browser.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { sanitizedPayload, validateShipment } from "../lib/eawb"
import { extractLatestStatus, isTerminal, mapCarrierStatus, shouldAdvance } from "../lib/shipping/status"
import { isMissingShippingSchema } from "../lib/shipping/order-access"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/**
 * Source with comments removed.
 *
 * Every "this string must not appear" assertion in this file needs this, and
 * the reason is that the comments in these routes DESCRIBE the very things
 * being asserted absent — the seller view is documented as "the label to do it
 * with", right above the function whose body must not mention a label. Matching
 * raw source makes the prose fail the test while the code is correct, which is
 * the most useless kind of red.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const createAwb = read("lib/shipping/create-awb.ts")
const createRoute = read("app/api/shipping/create/route.ts")
const sellerAwbRoute = read("app/api/shipping/order/[orderId]/awb/route.ts")
const addressRoute = read("app/api/shipping/address/route.ts")
const labelRoute = read("app/api/shipping/label/[orderId]/route.ts")
const orderRoute = read("app/api/shipping/order/[orderId]/route.ts")
const lockersRoute = read("app/api/shipping/lockers/route.ts")
const orderAccess = read("lib/shipping/order-access.ts")
const sql = read("supabase/sql/RUN_SHIPPING.sql")
const picker = read("components/shipping/locker-picker.tsx")

console.log("\nShipping: the promises that cost money when they break\n")

/* ── ONE PLACE SPENDS MONEY ──────────────────────────────────────────────── */
//
// `createOrder` from lib/eawb is the call that books a real courier. If more
// than one module calls it, the idempotency guards can be bypassed simply by
// going through the other one — which is the kind of mistake that is invisible
// until a duplicate arrives.
const AWB_CALLERS = [
  ["lib/shipping/create-awb.ts", createAwb],
  ["app/api/shipping/create/route.ts", createRoute],
  ["app/api/shipping/order/[orderId]/awb/route.ts", sellerAwbRoute],
  ["app/api/shipping/address/route.ts", addressRoute],
] as const
check(
  "only lib/shipping/create-awb.ts calls createOrder()",
  AWB_CALLERS.every(([path, src]) =>
    path === "lib/shipping/create-awb.ts" ? /\bcreateOrder\(/.test(src) : !/\bcreateOrder\(/.test(src),
  ),
  "        A second call site can book a courier without passing the three\n" +
    "        idempotency guards. There must be exactly one.",
)

/* ── IDEMPOTENCY ─────────────────────────────────────────────────────────── */
check(
  "guard 1: an order that already has an AWB returns without calling the courier",
  /if\s*\(\s*order\.awb_number\s*\)/.test(createAwb) &&
    createAwb.indexOf("if (order.awb_number)") < createAwb.indexOf("await createOrder("),
  "        The read-first check must come BEFORE the provider call.",
)
check(
  "guard 2: the claim is conditional on awb_number still being null",
  /\.update\(\{\s*shipping_status:\s*"creating"[\s\S]{0,200}?\.is\("awb_number",\s*null\)/.test(createAwb),
  "        Without `.is(\"awb_number\", null)` two concurrent callers both win\n" +
    "        the claim and both book a shipment.",
)
check(
  "guard 2: the claim is a returning update, so the loser can tell it lost",
  /\.is\("awb_number",\s*null\)[\s\S]{0,120}?\.select\("id"\)/.test(createAwb),
  "        Without `.select(\"id\")` the update reports success for zero rows\n" +
    "        and the losing caller proceeds to book a second shipment.",
)
check(
  "guard 2: the claim also refuses an in-flight creation",
  /\.neq\("shipping_status",\s*"creating"\)/.test(createAwb),
)
check(
  "guard 3: a unique index on awb_number exists in the migration",
  /create unique index[\s\S]{0,120}?on public\.orders \(awb_number\)[\s\S]{0,80}?where awb_number is not null/i.test(sql),
  "        The database is the only guard application code cannot race.",
)
check(
  "a failed booking releases the claim so a retry is possible",
  /shipping_creation_failed[\s\S]{0,300}?\.is\("awb_number",\s*null\)/.test(createAwb),
)
check(
  "an AWB that was booked but not saved is reported, never swallowed",
  /save_failed/.test(createAwb) && /awb: result\.awb/.test(createAwb),
  "        If the courier is booked and the write fails, the AWB must come back\n" +
    "        in the result — otherwise a real shipment exists that nothing can find.",
)

/* ── NOTHING SHIPS WITHOUT BEING PAID FOR, OR WITHOUT A DESTINATION ──────── */
check(
  "an unpaid order cannot be shipped",
  /\["completed",\s*"paid",\s*"succeeded"\]/.test(createAwb) && /not_paid/.test(createAwb),
)
check(
  "an order with no delivery address cannot be shipped",
  /missing_delivery_address/.test(createAwb),
)
check(
  "the paid and address checks both run before the provider call",
  createAwb.indexOf("not_paid") < createAwb.indexOf("await createOrder(") &&
    createAwb.indexOf("missing_delivery_address") < createAwb.indexOf("await createOrder("),
)
check(
  "the seller cannot book a shipment before the buyer has chosen a locker",
  /awaiting_buyer_address/.test(sellerAwbRoute) &&
    /!resolved\.order\.ship_fixed_location_id/.test(sellerAwbRoute),
)

/* ── AUTOMATIC BOOKING IS OFF UNTIL SOMEBODY SWITCHES IT ON ──────────────── */
check(
  "auto-AWB is opt-in, and defaults to off",
  /process\.env\.SHIPPING_AUTO_AWB === "1"/.test(createAwb),
  "        A deployment must not start booking couriers before an operator has\n" +
    "        watched one label come out correctly and funded the wallet.",
)
check(
  "the auto-booking is awaited, not fired and forgotten",
  /if \(autoAwbEnabled\(\)\)[\s\S]{0,300}?await createAwbForOrder\(orderId\)/.test(addressRoute),
  "        A serverless function that returns can be frozen mid-flight, and a\n" +
    "        half-executed booking is the one thing this must never produce.",
)

/* ── WHO MAY DO WHAT ─────────────────────────────────────────────────────── */
check(
  "the label is seller-only",
  /resolved\.party !== "seller"/.test(labelRoute),
  "        The label carries both parties' names and the delivery point.",
)
check(
  "only the buyer may set where their own parcel goes",
  /resolved\.party !== "buyer"/.test(addressRoute),
  "        Otherwise a seller could redirect a parcel after the sale.",
)
check(
  "booking from the seller route requires being the verified seller",
  /resolved\.party !== "seller"/.test(sellerAwbRoute),
)
check(
  "every party check uses the VERIFIED user id, never the local session read",
  [addressRoute, labelRoute, orderRoute, sellerAwbRoute].every(
    (src) => /requireVerifiedUser\(/.test(src) && !/readSessionAuth\(/.test(src),
  ),
  "        resolveOrderParty hands the id to the admin client, which bypasses\n" +
    "        RLS — so the id IS the credential and must come from getUser().",
)
check(
  "the seller ownership chain is walked server-side, not taken from the request",
  /from\("products"\)[\s\S]{0,200}?creator_id[\s\S]{0,400}?from\("creators"\)[\s\S]{0,200}?user_id/.test(orderAccess),
)
check(
  "a stranger and a nonexistent order get the same answer",
  [addressRoute, labelRoute, orderRoute, sellerAwbRoute].every((src) => /not_found/.test(src)) &&
    !/forbidden/.test(labelRoute),
  "        Distinguishable answers let someone probe order ids for existence.",
)

/* ── WHAT MUST NEVER REACH A BROWSER ─────────────────────────────────────── */
check(
  "the provider's label URL is never returned to the client",
  !/labelUrl:\s*(result|created)\.labelUrl/.test(sellerAwbRoute) &&
    /labelUrl: `\/api\/shipping\/label\//.test(sellerAwbRoute),
  "        The upstream link is a bearer URL: it survives the holder ceasing to\n" +
    "        be the seller, and lands in history, Referer and screenshots.",
)
check(
  "the label is streamed under our own authorisation, not redirected to",
  /new NextResponse\(buf/.test(labelRoute) && !/NextResponse\.redirect/.test(labelRoute),
)
check(
  "the label response is not cacheable by anything shared",
  /"Cache-Control":\s*"private, no-store"/.test(labelRoute),
)
check(
  "the label fetch refuses a non-https stored URL",
  /parsed\.protocol !== "https:"/.test(labelRoute),
)
const orderRouteCode = stripComments(orderRoute)
check(
  "the buyer's view never includes the label or the seller's address",
  (() => {
    const buyer = orderRouteCode.slice(
      orderRouteCode.indexOf("function buyerView"),
      orderRouteCode.indexOf("function sellerView"),
    )
    return buyer.length > 100 && !/label/i.test(buyer) && !/address_from|sender/i.test(buyer)
  })(),
  "        A buyer must not receive the label link or the seller's address.",
)
check(
  "the seller's view never includes the buyer's phone number",
  (() => {
    const seller = orderRouteCode.slice(
      orderRouteCode.indexOf("function sellerView"),
      orderRouteCode.indexOf("export async function GET"),
    )
    return seller.length > 100 && !/ship_phone|phone:/.test(seller)
  })(),
  "        The courier handles contacting the buyer; we do not hand out numbers.",
)
check(
  "no shipping route logs the API key or a full upstream URL",
  [createAwb, labelRoute, addressRoute, lockersRoute, orderRoute].every(
    (src) => !/console\.(log|error|warn)\([^)]*\b(EAWB_API_KEY|apiKey|X-API-Key)\b/i.test(src),
  ),
)
check(
  "the label failure log does not include the upstream URL",
  /console\.error\("\[shipping\/label\] upstream fetch failed", \{ orderId, status/.test(labelRoute),
)

/* ── THE ADDRESS COMES FROM THE PROVIDER, NOT FROM THE CLIENT ────────────── */
check(
  "the client sends a locker id and the server resolves the address",
  /listFixedLocations\(/.test(addressRoute) &&
    /all\.find\(\(l\) => Number\(l\.id\) === lockerId\)/.test(addressRoute),
  "        Accepting a street from the request lets someone pair one city's\n" +
    "        locker id with another city's address.",
)
check(
  "an unknown locker id is rejected",
  /unknown_locker/.test(addressRoute),
)
check(
  "the address cannot be changed once an AWB exists",
  /already_shipped/.test(addressRoute) &&
    // Comments stripped, so the four explanatory lines between the two calls do
    // not push them apart and fail a distance-based match.
    /\.eq\("id", orderId\)\s*\.is\("awb_number",\s*null\)/.test(stripComments(addressRoute)),
  "        And the precondition is re-asserted at WRITE time, not only at read\n" +
    "        time — the webhook may book the shipment in between.",
)
check(
  "the phone number is validated, not stored as typed",
  /function normalisePhone/.test(addressRoute) && /\^07\\d\{8\}\$/.test(addressRoute),
)

/* ── THE CARRIER POLL CANNOT BECOME A FLOOD ──────────────────────────────── */
check(
  "the refresh rate limit lives in the database, not in memory",
  /shipping_last_checked_at/.test(orderRoute) && !/let lastChecked|const lastChecked/.test(orderRoute),
  "        Vercel instances share no memory; an in-process timer limits nothing.",
)
check(
  "the refresh is claimed conditionally, so two pollers make one provider call",
  /\.lt\("shipping_last_checked_at",\s*cutoff\)[\s\S]{0,120}?\.select\("id"\)/.test(orderRoute),
)
check(
  "a terminal shipment is never re-polled",
  /if \(isTerminal\(current\)\) return order/.test(orderRoute),
)
check(
  "a tracking failure never takes the order page down",
  /} catch \{\s*\n\s*return order\s*\n\s*\}/.test(orderRoute),
)

/* ── DEGRADING WHEN THE MIGRATION HAS NOT BEEN RUN ───────────────────────── */
check(
  "an undefined column is recognised by SQLSTATE and by PostgREST's wording",
  isMissingShippingSchema({ code: "42703" }) &&
    isMissingShippingSchema({ message: "Could not find the 'awb_number' column of 'orders'" }) &&
    isMissingShippingSchema({ message: 'column orders.awb_number does not exist' }),
)
check(
  "an ordinary failure is NOT mistaken for a missing migration",
  !isMissingShippingSchema({ code: "PGRST301", message: "JWT expired" }) &&
    !isMissingShippingSchema(null) &&
    !isMissingShippingSchema({ message: "fetch failed" }),
  "        Degrading on any error would hide a real outage behind an empty panel.",
)
check(
  "the order route answers configured:false instead of erroring",
  /schema === "absent"[\s\S]{0,160}?configured: false/.test(orderRoute),
)

/* ── THE STATUS VOCABULARY ───────────────────────────────────────────────── */
check(
  "a failed delivery is not read as a completed one",
  mapCarrierStatus("Colet nelivrat") === "returned" && mapCarrierStatus("Colet livrat") === "delivered",
  "        'livrat' is a substring of 'nelivrat'; order matters in the rules.",
)
check("an unrecognised status maps to null rather than a guess", mapCarrierStatus("bloop") === null)
check("an empty status maps to null", mapCarrierStatus("") === null && mapCarrierStatus(null) === null)
check(
  "a late scan cannot walk a delivered parcel backwards",
  shouldAdvance("delivered", "in_transit") === false && isTerminal("delivered"),
  "        Carrier feeds are not ordered; this reads to a buyer as their\n" +
    "        delivered order having gone missing.",
)
check(
  "progress still moves forward normally",
  shouldAdvance("awb_created", "shipped") === true && shouldAdvance(null, "in_transit") === true,
)
check("the same status twice is not an advance", shouldAdvance("shipped", "shipped") === false)
check(
  "a booking failure can always be superseded by a real carrier status",
  shouldAdvance("shipping_creation_failed", "shipped") === true,
)

/* ── READING THE CARRIER'S TRACKING PAYLOAD ──────────────────────────────── */
//
// The tracking response is the one part of this integration whose shape has NOT
// been verified against a real response — there is no shipment to track yet. So
// the extractor is structure-agnostic, and these assert that it stays that way.
check(
  "the latest event wins when several are present",
  extractLatestStatus({ events: [{ status: "Preluat" }, { status: "In tranzit" }, { status: "Livrat" }] })?.text ===
    "Livrat",
)
check(
  "it finds a status however deeply it is nested",
  extractLatestStatus({ data: { result: { history: [{ event_name: "Colet livrat" }] } } })?.text === "Colet livrat",
)
check(
  "a nearby date is carried along with the text",
  extractLatestStatus({ events: [{ status: "Livrat", date: "2026-08-11" }] })?.at === "2026-08-11",
)
check("nothing status-shaped returns null", extractLatestStatus({ foo: 1, bar: [2, 3] }) === null)
check("a malformed payload does not throw", extractLatestStatus(null) === null && extractLatestStatus("x") === null)
check(
  "the extracted text is bounded",
  (extractLatestStatus({ status: "x".repeat(5000) })?.text.length ?? 0) <= 300,
)

/* ── THE LOCKER ID SURVIVES THE TRIP TO THE PROVIDER ─────────────────────── */
//
// A REAL BUG, pinned. The admin page sent fixed_location_id, the route's address
// whitelist did not list it, and it was dropped silently. The result priced
// perfectly — /orders/prices does not enforce the locker requirement — and then
// failed creation with "Service 4 requires fixed location for pickup address".
// The cheap call that exists to validate the expensive one said yes.
{
  const base = {
    carrier_id: 6,
    service_id: 4,
    billing_address_id: 391214,
    total_weight: 1,
    parcels: [{ sequence_no: 1, size: { weight: 1, width: 25, height: 10, length: 35 } }],
    parcel_content: "test",
  }
  const withLockers = {
    ...base,
    address_from: { contact: "A", street_name: "S", fixed_location_id: 66725 },
    address_to: { contact: "B", street_name: "T", fixed_location_id: 2210235 },
  }

  check(
    "the admin route's address whitelist includes fixed_location_id",
    /fixed_location_id/.test(read("app/api/admin/shipping-test/route.ts")),
    "        This omission was the bug. Without it the id never leaves the route.",
  )
  check(
    "both locker ids reach the body the provider receives",
    (() => {
      const p = sanitizedPayload(withLockers) as Record<string, Record<string, unknown>>
      return p.address_from.fixed_location_id === 66725 && p.address_to.fixed_location_id === 2210235
    })(),
  )
  check(
    "a locker id arriving as a string is sent as an integer",
    (() => {
      const p = sanitizedPayload({
        ...base,
        address_from: { fixed_location_id: "66725" as unknown as number },
        address_to: { fixed_location_id: "2210235" as unknown as number },
      }) as Record<string, Record<string, unknown>>
      return p.address_from.fixed_location_id === 66725 && p.address_to.fixed_location_id === 2210235
    })(),
    "        Form inputs give strings; the API wants integers.",
  )
  check(
    "an empty locker id becomes absent, not 0",
    (() => {
      const p = sanitizedPayload({
        ...base,
        address_from: { fixed_location_id: "" as unknown as number },
        address_to: { fixed_location_id: 2210235 },
      }) as Record<string, Record<string, unknown>>
      return !("fixed_location_id" in p.address_from)
    })(),
    "        0 is a value a validator rejects rather than ignores.",
  )
  check(
    "service 4 with both locker ids passes validation",
    validateShipment(withLockers).length === 0,
  )
  check(
    "service 4 missing the SENDER locker is refused, naming that side",
    (() => {
      const problems = validateShipment({ ...withLockers, address_from: { contact: "A" } })
      return problems.length === 1 && /address_from\.fixed_location_id/.test(problems[0])
    })(),
  )
  check(
    "service 4 missing the RECIPIENT locker is refused, naming that side",
    (() => {
      const problems = validateShipment({ ...withLockers, address_to: { contact: "B" } })
      return problems.length === 1 && /address_to\.fixed_location_id/.test(problems[0])
    })(),
  )
  check(
    "service 4 missing both is refused with both named",
    validateShipment({ ...withLockers, address_from: {}, address_to: {} }).length === 2,
  )
  check(
    "service 2 (door→locker) requires only the recipient locker",
    validateShipment({ ...withLockers, service_id: 2, address_from: {} }).length === 0 &&
      validateShipment({ ...withLockers, service_id: 2, address_to: {} }).length === 1,
  )
  check(
    "service 3 (locker→door) requires only the sender locker",
    validateShipment({ ...withLockers, service_id: 3, address_to: {} }).length === 0 &&
      validateShipment({ ...withLockers, service_id: 3, address_from: {} }).length === 1,
  )
  check(
    "service 1 (door→door) requires neither",
    validateShipment({ ...withLockers, service_id: 1, address_from: {}, address_to: {} }).length === 0,
  )
  check(
    "createOrder validates BEFORE sending anything",
    (() => {
      const src = read("lib/eawb.ts")
      const fn = src.slice(src.indexOf("export async function createOrder"))
      return fn.indexOf("validateShipment(input)") < fn.indexOf("eawbPostJson")
    })(),
    "        POST /orders is the one endpoint whose failures we cannot assume\n" +
      "        were side-effect free.",
  )
  check(
    "the quote and the create call share one body builder",
    (() => {
      const src = stripComments(read("lib/eawb.ts"))
      return (
        /getPrices[\s\S]{0,400}?buildOrderBody\(input\)/.test(src) &&
        /createOrder[\s\S]{0,600}?buildOrderBody\(input\)/.test(src)
      )
    })(),
    "        Fields cannot disappear between quote and creation if there is only\n" +
      "        one place that builds the body.",
  )
  check(
    "our own refusal is not reported as a provider failure",
    /e\?\.code === "validation"[\s\S]{0,200}?invalid_shipment/.test(createAwb),
    "        'The courier rejected this' sends someone to look at the courier;\n" +
      "        the truth is usually an unset EAWB_SENDER_LOCKER_ID.",
  )
  check(
    "the sanitized payload keeps the ids and drops the people",
    (() => {
      const p = sanitizedPayload({
        ...base,
        address_from: { contact: "Ion Pop", phone: "0712345678", email: "a@b.ro", fixed_location_id: 66725 },
        address_to: { contact: "B", fixed_location_id: 2210235 },
      }) as Record<string, Record<string, unknown>>
      const s = JSON.stringify(p)
      return (
        p.address_from.fixed_location_id === 66725 &&
        !s.includes("Ion Pop") &&
        !s.includes("0712345678") &&
        !s.includes("a@b.ro")
      )
    })(),
  )
  check(
    "the test page reports the payload on a SUCCESSFUL quote too",
    /ok: true,\s*\n?\s*mode,\s*\n?\s*options,[\s\S]{0,200}?payload: sanitizedPayload/.test(
      read("app/api/admin/shipping-test/route.ts"),
    ),
    "        A quote that prices a payload creation would reject is exactly the\n" +
      "        case that hid this bug, so success must show what was sent.",
  )
}

/* ── THE LOCKER SEARCH ───────────────────────────────────────────────────── */
check(
  "locker search folds diacritics, so 'Bucuresti' finds 'București'",
  /normalize\("NFD"\)/.test(lockersRoute),
)
check(
  "the locker response is capped",
  /MAX_RESULTS/.test(lockersRoute) && /\.slice\(0, MAX_RESULTS\)/.test(lockersRoute),
)
check(
  "the locker response carries no account or order data",
  !/buyer|order|awb|customer/i.test(lockersRoute.slice(lockersRoute.indexOf(".map((l) => ({"), lockersRoute.indexOf("return NextResponse.json"))),
)
// The picker DISPLAYS the locality — that is the point of it, a human needs to
// recognise the place. What matters is that none of that display text is part
// of what gets POSTed: the body carries the id, the name and the phone, and the
// server looks the address up again from the id.
check(
  "the request body carries the locker id and no address fields",
  (() => {
    const panel = read("components/shipping/order-shipping-panel.tsx")
    const body = panel.slice(panel.indexOf("JSON.stringify({ orderId"), panel.indexOf("})," ) + 3)
    return (
      /lockerId: locker\.id/.test(body) &&
      !/street|locality|county|address/i.test(body)
    )
  })(),
  "        Accepting an address from the client lets one city's locker id be\n" +
    "        paired with another city's street.",
)
check(
  "a stale search response cannot overwrite a newer one",
  /if \(mine !== seq\.current\) return/.test(picker),
  "        A slow query for 'clu' landing after 'cluj' would replace the right\n" +
    "        answer with a stale one.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

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
import { distanceKm, formatDistance, isUsableCoord } from "../lib/geo"
import { splitStreet } from "../lib/shipping/compare"
import { validateHomeAddress } from "../lib/shipping/preference"
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
/** The provider client: payload building, labels, cancellation. */
const eawbLib = read("lib/eawb.ts")
/** Locker resolution and phone validation live here, shared by BOTH places a
 *  buyer can choose a locker: the pre-payment step and the order page. */
const prefLib = read("lib/shipping/preference.ts")
const prefRoute = read("app/api/shipping/preference/route.ts")
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
  "auto-AWB is ON by default, with an explicit off switch",
  /process\.env\.SHIPPING_AUTO_AWB !== "0"/.test(createAwb),
  "        A marketplace generates the label when the order is placed. The flag\n" +
    "        survives as an escape hatch for the day the courier account is\n" +
    "        wrong and the cheapest fix is to stop booking.",
)
check(
  "what makes automatic safe is checked before the provider, not after",
  (() => {
    // ON by default is only defensible because each of these refuses BEFORE a
    // courier is called: unpaid, no destination, already booked, empty wallet.
    const i = createAwb.indexOf("await createOrder(")
    return (
      createAwb.indexOf("not_paid") < i &&
      createAwb.indexOf("missing_delivery_address") < i &&
      createAwb.indexOf("if (order.awb_number)") < i &&
      /getAccountBalance/.test(eawbLib)
    )
  })(),
)
check(
  "the paid-status list exists once, not once per caller",
  (() => {
    // A second list of "paid-ish" strings would drift, and the drift shows up
    // as a courier booked for an order nobody paid for.
    const others = [orderRoute, read("app/api/cron/shipping-awb/route.ts")]
    return (
      /export function isPaid/.test(createAwb) &&
      others.every((s) => !/"completed",\s*"paid",\s*"succeeded"/.test(stripComments(s)) || /\.in\("status"/.test(s))
    )
  })(),
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
    // Names the leak precisely rather than banning the substring "sender".
    // The earlier version did the latter and failed on `senderCarrierId()` —
    // a courier id the buyer already sees on their own tracking, and not an
    // address at all. A proxy that flags harmless symbols trains people to
    // edit the test instead of reading it.
    return (
      buyer.length > 100 &&
      !/label/i.test(buyer) &&
      !/senderAddress|address_from|EAWB_SENDER_/.test(buyer)
    )
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
  /listFixedLocations\(/.test(prefLib) && /all\.find\(\(l\) => Number\(l\.id\) === lockerId\)/.test(prefLib),
  "        Accepting a street from the request lets someone pair one city's\n" +
    "        locker id with another city's address.",
)
check(
  "BOTH places a buyer picks a locker go through the one resolver",
  /resolveLocker\(/.test(addressRoute) && /resolveLocker\(/.test(prefRoute),
  "        The pre-payment step and the order page must not be able to\n" +
    "        validate a locker differently.",
)
check(
  "an unknown locker id is rejected",
  // The code is produced in one place and FORWARDED, not restated. Both
  // callers surface `resolvedLocker.code` / `resolved.code` verbatim, so a new
  // rejection reason added to the resolver reaches the client without either
  // route having to learn about it.
  /code: "unknown_locker"/.test(prefLib) &&
    /code: resolvedLocker\.code/.test(addressRoute) &&
    /code: resolved\.code/.test(prefRoute),
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
  // One normaliser, shared. Two copies would eventually disagree about what a
  // valid Romanian mobile is, and the courier SMSes the pickup code to it.
  /export function normalisePhone/.test(prefLib) &&
    /\^07\\d\{8\}\$/.test(prefLib) &&
    /normalisePhone\(/.test(addressRoute) &&
    /normalisePhone\(/.test(prefRoute),
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
      // Each function's own body, sliced to the next top-level `export`, so this
      // does not depend on how far apart the two calls happen to sit. An earlier
      // version used a character window and broke the moment a pre-flight check
      // was added between them — which is exactly the kind of edit that must NOT
      // fail this assertion.
      const bodyOf = (name: string) => {
        const start = src.indexOf(`export async function ${name}`)
        if (start < 0) return ""
        const next = src.indexOf("\nexport ", start + 1)
        return src.slice(start, next < 0 ? src.length : next)
      }
      return (
        bodyOf("getPrices").includes("buildOrderBody(input)") &&
        bodyOf("createOrder").includes("buildOrderBody(input)")
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

/* ── AN EMPTY WALLET, AND THE FAKE AWB IT RETURNS ────────────────────────── */
//
// A REAL 402, and what it taught. The provider ACCEPTED and priced the shipment
// (19.89 RON, exactly the quote), created order 183060, and only then failed to
// charge for it. That order is now permanently order_status:"failed" with
// awb:"NEGENERAT" — and every retry against an empty wallet leaves another one.
{
  const eawb = read("lib/eawb.ts")

  check(
    "a 402 is its own outcome code, not a generic http_error",
    /response\.status === 402[\s\S]{0,400}?taggedError\(\s*"insufficient_funds"/.test(eawb),
    "        A 402 is not a bad payload and not an outage — the request was\n" +
      "        fine. Reporting it as 'HTTP 402' sends someone to debug the request.",
  )
  check(
    "the balance is read BEFORE the order is posted",
    (() => {
      const fn = eawb.slice(eawb.indexOf("export async function createOrder"))
      return fn.indexOf("getAccountBalance") < fn.indexOf('eawbPostJson<Record<string, unknown>>("/orders"')
    })(),
    "        Finding out from the provider costs a permanent failed order.",
  )
  check(
    "a balance that cannot be READ does not block a shipment",
    /code\?: string \}\)\?\.code === "insufficient_funds"\) throw err/.test(eawb),
    "        Only our own refusal stops the flow; a blip on the profile\n" +
      "        endpoint is not a reason to refuse a shipment they would accept.",
  )
  check(
    "the wallet balance comes from the profile, the only endpoint that has it",
    /getAccountBalance[\s\S]{0,300}?\/account\/profile/.test(eawb),
    "        /account/wallet and /account/balance both 404.",
  )
  check(
    '"NEGENERAT" is never stored as an AWB',
    (() => {
      const m = eawb.match(/const NOT_AN_AWB = (\/[^\n]+\/i)/)
      if (!m) return false
      const re = new RegExp(m[1].slice(1, -2), "i")
      return re.test("NEGENERAT") && re.test("negenerat") && !re.test("2SD1234567")
    })(),
    "        A failed order still carries an `awb` field. Storing it would set\n" +
      "        awb_number, which every idempotency guard keys off — permanently\n" +
      "        blocking a real retry with a tracking number that does not exist.",
  )
  check(
    "an insufficient balance is retryable, but not invalid",
    /code === "insufficient_funds"[\s\S]{0,200}?retryable: true/.test(createAwb),
  )
  check(
    "the create route answers 402, not 500, when the wallet is empty",
    /insufficient_funds"\s*\n?\s*\?\s*402/.test(read("app/api/shipping/create/route.ts")),
  )
  check(
    "the connection check reports the balance without being able to fail on it",
    /try \{\s*\n?\s*wallet = await getAccountBalance\(\)\s*\n?\s*\} catch \{/.test(
      read("app/api/admin/shipping-test/route.ts"),
    ),
  )
}

/* ── A FAILED BOOKING MUST NOT COST THE BUYER ANYTHING ───────────────────── */
//
// The production contract for HTTP 402 / PAYMENT_FAILED: the Storelib order
// stays PAID, shipping is marked failed, no second customer order is created,
// the buyer is never charged again, and an admin can retry once the wallet is
// funded.
{
  check(
    "a failed booking never touches the order's payment status",
    (() => {
      // Every update in the failure path, checked for the payment fields. The
      // order's own `status` must not appear — that is what "stays paid" means.
      const tail = createAwb.slice(createAwb.indexOf("} catch (err) {"))
      return !/\bstatus:\s/.test(tail) && !/amount_cents/.test(tail)
    })(),
  )
  check(
    "the failure path marks shipping_creation_failed",
    /catch \(err\)[\s\S]{0,400}?shipping_status: "shipping_creation_failed"/.test(createAwb),
  )
  check(
    "the failure is recorded BEFORE the outcome is classified",
    (() => {
      const tail = createAwb.slice(createAwb.indexOf("} catch (err) {"))
      // Otherwise an early return for one error code would skip the write, and
      // that order would sit in 'creating' forever — unretryable.
      return tail.indexOf('shipping_status: "shipping_creation_failed"') < tail.indexOf('code === "validation"')
    })(),
  )
  check(
    "a failed booking releases the claim, so a retry can take it",
    (() => {
      // The claim is `shipping_status = 'creating'` and the guard refuses
      // `.neq("shipping_status", "creating")`. Writing 'shipping_creation_failed'
      // is what makes the order claimable again.
      return (
        /\.neq\("shipping_status", "creating"\)/.test(createAwb) &&
        /shipping_status: "shipping_creation_failed"/.test(createAwb)
      )
    })(),
  )
  check(
    "nothing in the shipping module creates an order row or charges a card",
    (() => {
      const s = createAwb + read("app/api/shipping/create/route.ts") + read("app/api/shipping/address/route.ts")
      return !/from\("orders"\)\s*\.insert/.test(s) && !/stripe/i.test(s)
    })(),
    "        A courier failing is not a reason to re-run checkout.",
  )
  check(
    "an insufficient balance leaves the order retryable",
    /code: "insufficient_funds", message: e\.message, retryable: true/.test(createAwb),
  )
}

/* ── COMPARING CARRIERS INSTEAD OF HARDCODING ONE ────────────────────────── */
//
// Measured live, Bucharest→Cluj, 1kg: DPD 13.23 · FAN 16.17 · Sameday 19.89 ·
// GLS 21.18. The hardcoded Sameday choice was the third cheapest of four.
{
  const compare = read("lib/shipping/compare.ts")

  check(
    "each carrier is priced with ITS OWN lockers, not a wildcard",
    // Comments stripped: the header DESCRIBES the wildcard in order to explain
    // why it is not used, and an earlier version of this check failed on its
    // own documentation.
    !/carrier_id:\s*0/.test(stripComments(compare)) && /carrier_id: carrierId/.test(compare),
    "        A wildcard quote sent with Sameday locker ids returned a FAN\n" +
      "        Courier option. The price engine resolves addresses to localities\n" +
      "        and does not check the locker belongs to the carrier it quotes.",
  )
  check(
    "an option carries the locker pair it was priced with",
    /from: cFrom,\s*\n?\s*to: cTo,/.test(compare),
    "        Selecting a carrier without its lockers books a parcel to a locker\n" +
      "        that carrier does not serve.",
  )
  check(
    "a quote echoing another carrier is discarded, not shown",
    /options\.find\(\(o: EawbPriceOption\) => Number\(o\.carrier_id\) === carrierId\)/.test(compare),
  )
  check(
    "results are sorted cheapest first",
    /options\.sort\(\(a, b\) => a\.total - b\.total\)/.test(compare),
  )
  check(
    "one carrier's outage does not take the comparison down",
    /Promise\.all\(jobs\)/.test(compare) && /skip: \{ carrierId, carrier, reason:/.test(compare),
  )
  check(
    "selecting an option in the UI adopts its lockers too",
    (() => {
      const ui = read("app/admin/shipping-test/_client.tsx")
      const fn = ui.slice(ui.indexOf("const selectOption"))
      return (
        /setCarrierId/.test(fn) &&
        /setServiceId/.test(fn) &&
        /fixed_location_id: String\(o\.from\.id\)/.test(fn) &&
        /fixed_location_id: String\(o\.to\.id\)/.test(fn)
      )
    })(),
  )
  check(
    "compare mode creates nothing",
    (() => {
      const route = read("app/api/admin/shipping-test/route.ts")
      const block = route.slice(route.indexOf('if (mode === "compare")'), route.indexOf('if (mode === "quote")'))
      return !/createOrder/.test(block)
    })(),
  )

  // splitStreet — the empty street_number that made Sameday 400.
  check(
    "a hyphenated house number is not torn in half",
    (() => {
      const a = splitStreet("Str. Sergent Pechiu Ion 3-7")
      const b = splitStreet("Calea Vitan 55-59")
      const c = splitStreet("str. Eugen Ionesco 73")
      return (
        a.street === "Str. Sergent Pechiu Ion" &&
        a.streetNumber === "3-7" &&
        b.street === "Calea Vitan" &&
        b.streetNumber === "55-59" &&
        c.streetNumber === "73"
      )
    })(),
    "        Without digits in the class after \\d+, '3-7' split as street\n" +
      "        '…Ion 3-' and number '7' — the number torn in half and its first\n" +
      "        digits glued onto the street name.",
  )
  check(
    "the buyer's saved address uses the same splitter as the comparison",
    /splitStreet\(address,/.test(prefLib),
    "        The same broken regex was written out twice.",
  )
  check(
    "an address with no number gets FN, never an empty string",
    (() => {
      const a = splitStreet("str. Unirii nr.")
      const b = splitStreet("str. BANAT Nr. FN")
      return (
        a.streetNumber === "FN" &&
        b.streetNumber === "FN" &&
        a.street === "str. Unirii" &&
        b.street === "str. BANAT"
      )
    })(),
    "        975 of 12,079 lockers have no trailing number, and the API rejects\n" +
      "        an empty one: 'The street_number field is required'. FN is the\n" +
      "        Romanian notation the couriers' own data uses.",
  )
  check(
    "a leading digit stays in the street name",
    (() => {
      const r = splitStreet("str. 1 DECEMBRIE")
      // "1 Decembrie" is a street name; number 1 would be wrong.
      return r.streetNumber === "FN" && /1 DECEMBRIE/.test(r.street)
    })(),
  )
  check(
    "the street never comes back empty",
    splitStreet("", "FANbox X").street === "FANbox X" && splitStreet("nr.", "Easybox 9").street === "Easybox 9",
  )
  check(
    "place matching covers the county, so Bucharest's sectors are found",
    /county_name \|\| ""\)\.includes\(folded\)/.test(compare),
    "        Only 47 lockers are filed under locality 'Bucuresti'; ~2,600 are\n" +
      "        under 'Sector 1'..'Sector 6' with county 'Bucuresti'. Matching\n" +
      "        locality alone reported DPD, GLS and Cargus as absent from the\n" +
      "        capital.",
  )
}

/* ── BOTH LOCKERS MUST BE ON ONE COURIER'S NETWORK ───────────────────────── */
//
// A REAL BUG, caught in review before it shipped a parcel. Production defaulted
// to carrier 6 (Sameday) while the buyer's picker listed lockers from EVERY
// network. A buyer choosing a DPD or FAN box would have had Sameday booked
// against a locker Sameday does not serve — the same class of failure as the
// dropped fixed_location_id, and this one routes a real parcel.
{
  const addressRoute = read("app/api/shipping/address/route.ts")

  check(
    "the buyer's locker carrier is validated against the seller's network",
    /Number\(locker\.carrier_id\) !== senderCarrierId\(\)/.test(prefLib) &&
      /code: "wrong_carrier"/.test(prefLib),
    "        DPD cannot collect from a Sameday easybox and Sameday cannot\n" +
      "        deliver to a FANbox.",
  )
  check(
    "the chosen locker's carrier is recorded on the order",
    // Both write paths: the order page, and the pre-payment choice applied
    // afterwards.
    /shipping_carrier_id: p\.carrierId/.test(addressRoute) &&
      /shipping_carrier_id: pref\.carrierId/.test(prefLib),
  )
  check(
    "booking uses the recorded carrier before falling back to the default",
    (() => {
      // Anchored on the shipment builder, not on the first "carrier_id:" in the
      // file — that one is the `shipping_carrier_id` TYPE declaration, and an
      // earlier version of this check matched it and measured nothing.
      const i = createAwb.indexOf("const shipment: EawbShipmentInput")
      const slice = createAwb.slice(i, i + 700)
      const recorded = slice.indexOf("order.shipping_carrier_id")
      // The fallback is the SENDER's carrier, not a standalone default: home
      // delivery records no carrier, but the sender is still a locker, so the
      // booking must use whoever owns the seller's drop-off point.
      const fallback = slice.indexOf("senderCarrierId()")
      return recorded > -1 && fallback > -1 && recorded < fallback
    })(),
  )
  check(
    "the order row actually selects shipping_carrier_id",
    /shipping_carrier_id/.test(createAwb.slice(0, createAwb.indexOf("export type CreateAwbResult"))),
    "        Reading a column that was never selected is silently undefined,\n" +
      "        which would fall through to the default carrier every time.",
  )
  check(
    "the picker is filtered to that one network, client-side too",
    (() => {
      // The picker now sits inside DeliveryChoice, which both entry points
      // render — so the carrier has to be threaded through it.
      const choice = read("components/shipping/delivery-choice.tsx")
      const pipedThrough = /<LockerPicker[\s\S]{0,200}?carrierId=\{carrierId\}/.test(choice)
      return (
        pipedThrough &&
        [
          "components/shipping/order-shipping-panel.tsx",
          "app/checkout/livrare/_client.tsx",
        ].every((f) => /<DeliveryChoice[\s\S]{0,400}?carrierId=\{carrierId\}/.test(read(f)))
      )
    })(),
    "        The server check stands alone, but offering lockers it will refuse\n" +
      "        is a choice the buyer should never be shown.",
  )
  check(
    "the sender's carrier and sender's locker come from one configuration",
    (() => {
      const s = read("lib/shipping/create-awb.ts")
      return /EAWB_SENDER_CARRIER_ID/.test(s) && /EAWB_SENDER_LOCKER_ID/.test(s)
    })(),
    "        Changing carrier means changing the drop-off locker too; they must\n" +
      "        never be guessed independently.",
  )
}

/* ── CHOOSING THE LOCKER BEFORE PAYING ───────────────────────────────────── */
//
// Vinted asks before it takes the money. The order does not exist yet at that
// point, so the choice is stored against the BUYER and attached afterwards.
{
  const checkoutPage = read("app/checkout/page.tsx")
  const deliveryClient = read("app/checkout/livrare/_client.tsx")

  check(
    "the payment client is not touched by the delivery step",
    (() => {
      // The gate is a redirect from the server component. The 2,300-line
      // payment client must contain nothing about lockers or shipping.
      const client = read("app/checkout/checkout-client.tsx")
      return !/locker|livrare|shipping/i.test(client)
    })(),
    "        The safest change to a payment path is one that does not touch it.",
  )
  check(
    "only physical products are sent to the delivery step",
    /product\.type === "physical"/.test(checkoutPage),
    "        A digital product has no parcel; the step would be wrong, not just\n" +
      "        unnecessary.",
  )
  check(
    "the gate cannot loop",
    /deliverySet !== "1"/.test(checkoutPage) && /deliverySet.*1/.test(read("app/checkout/livrare/page.tsx")),
  )
  check(
    "a buyer who already has a saved address is not asked again",
    /readPreference\(/.test(checkoutPage) && /if \(!hasPreference\)/.test(checkoutPage),
  )
  check(
    "a failure to read the preference never blocks a purchase",
    /catch \{[\s\S]{0,200}?hasPreference = true/.test(checkoutPage),
    "        A missing address is recoverable on the order page afterwards; a\n" +
      "        purchase blocked at the last step is not.",
  )
  check(
    "the buyer can skip the step",
    /Aleg mai târziu/.test(deliveryClient),
  )
  check(
    "a provider outage forwards to payment instead of trapping the buyer",
    /shipping_not_configured" \|\| json\.code === "provider_unavailable"[\s\S]{0,120}?proceed\(\)/.test(
      deliveryClient,
    ),
  )
  check(
    "a signed-in buyer's identity is their verified id, never a posted email",
    /const email = userId \? null :/.test(prefRoute) && /requireVerifiedUser\(/.test(prefRoute),
    "        Otherwise anyone could write to another member's row by posting\n" +
      "        their address.",
  )
  check(
    "the preferences table is server-only",
    (() => {
      const s = read("supabase/sql/RUN_SHIPPING.sql")
      const block = s.slice(s.indexOf("buyer_shipping_prefs"))
      // RLS enabled and NO policies: a guest row has no owner to write a policy
      // against, so the service role is the only way in.
      return (
        /alter table public\.buyer_shipping_prefs enable row level security/.test(block) &&
        !/create policy[\s\S]{0,200}buyer_shipping_prefs/.test(block)
      )
    })(),
    "        Without RLS on, every buyer's phone number is readable with the\n" +
      "        anon key.",
  )
  check(
    "attaching the choice to an order is idempotent",
    // Guarded on ship_mode, NOT the locker id. A home delivery has no locker,
    // so the old guard would have re-applied on every single poll and reported
    // every home order as still needing an address, forever.
    /\.is\("ship_mode", null\)\s*\n?\s*\.is\("awb_number", null\)/.test(stripComments(prefLib)),
    "        It runs on every poll from either party, so it must only ever\n" +
      "        write once.",
  )
  check(
    "'has an address' is decided by the mode, never by the locker id",
    (() => {
      // Four places asked this question; all four must ask it the same way, or
      // a home delivery is invisible to one of them.
      const order = stripComments(orderRoute)
      return (
        /needsAddress: !o\.ship_mode/.test(order) &&
        /buyerReady: Boolean\(o\.ship_mode\)/.test(order) &&
        /!order\.ship_mode && !order\.awb_number/.test(order) &&
        /\.is\("ship_mode", null\)/.test(stripComments(prefLib))
      )
    })(),
  )
  check(
    "the order is matched on its own buyer, not on anything from the request",
    /readPreference\(admin, \{ userId: order\.buyer_id, email: order\.buyer_email \}\)/.test(orderRoute),
  )
  check(
    "a guest is identified by email only while they have no account",
    /email: who\.userId \? null :/.test(prefLib),
    "        Once a buyer has an account, user_id is the key and the guessable\n" +
      "        identity stops existing for them.",
  )
}

/* ── HOME DELIVERY, AND THE SERVICE IT IMPLIES ───────────────────────────── */
//
// Verified live, Bucharest→Cluj with a TYPED address: the provider resolves
// free-text "Cluj-Napoca" to locality 4571, so a typed town is acceptable.
// DPD locker→door 15.23 RON against locker→locker 13.23.
{
  const choice = read("components/shipping/delivery-choice.tsx")

  check(
    "the service is derived from where the buyer chose, not defaulted",
    /order\.ship_fixed_location_id\s*\n?\s*\? EAWB_SERVICE\.lockerToLocker\s*\n?\s*: EAWB_SERVICE\.lockerToDoor/.test(
      createAwb,
    ),
    "        The seller always drops at a locker, so the buyer's end decides:\n" +
      "        locker→locker (4) or locker→door (3).",
  )
  check(
    "there is no fixed default service left to override it",
    // Comments stripped: the file NAMES the removed variable in order to
    // explain why it is gone, and matching that is matching the documentation.
    !/EAWB_DEFAULT_SERVICE_ID/.test(stripComments(createAwb)),
    "        A fixed default would silently book locker→locker for a buyer who\n" +
      "        asked for home delivery.",
  )
  check(
    "a home address with no street number sends FN, not an empty string",
    (() => {
      const r = validateHomeAddress({ county: "Cluj", locality: "Cluj-Napoca", street: "Str. Memorandumului" })
      return r.ok && r.pref.streetNo === "FN" && r.pref.mode === "home" && r.pref.lockerId === null
    })(),
  )
  check(
    "a home address missing county, town or street is refused",
    (() => {
      const missing = [
        { locality: "Cluj-Napoca", street: "Str. X" },
        { county: "Cluj", street: "Str. X" },
        { county: "Cluj", locality: "Cluj-Napoca" },
      ]
      return missing.every((m) => validateHomeAddress(m).ok === false)
    })(),
  )
  check(
    "a complete home address is accepted",
    (() => {
      const r = validateHomeAddress({
        county: "Cluj",
        locality: "Cluj-Napoca",
        street: "Strada Memorandumului",
        streetNo: "28",
      })
      return r.ok && r.pref.streetNo === "28" && r.pref.carrierId === null
    })(),
    "        Home delivery is not tied to one network — every courier delivers\n" +
      "        to a door — so the carrier is left for the booking step.",
  )
  check(
    "both places a buyer chooses render the SAME component",
    ["components/shipping/order-shipping-panel.tsx", "app/checkout/livrare/_client.tsx"].every((f) =>
      /<DeliveryChoice/.test(read(f)),
    ),
    "        Two copies of a delivery form drift, and one of them ends up\n" +
      "        collecting a field the courier needs and the other does not.",
  )
  check(
    "the database refuses a half-specified delivery point",
    (() => {
      const s = read("supabase/sql/RUN_SHIPPING.sql")
      return /mode = 'locker' and locker_id is not null/.test(s) && /mode = 'home' and street is not null/.test(s)
    })(),
    "        A row claiming to be a locker delivery with no locker would fail\n" +
      "        at the courier — after payment.",
  )
  check(
    "home delivery columns are added with ALTER, not folded into CREATE",
    (() => {
      // SQL comments start with `--`; stripComments only knows JS, so they are
      // removed here before looking for statement adjacency.
      const s = read("supabase/sql/RUN_SHIPPING.sql").replace(/^\s*--.*$/gm, "")
      const i = s.indexOf("create table if not exists public.buyer_shipping_prefs")
      const after = s.slice(i)
      return /alter table public\.buyer_shipping_prefs\s+add column if not exists mode/.test(after)
    })(),
    "        `create table if not exists` silently skips a database where this\n" +
      "        file has already been run, leaving newer code querying columns\n" +
      "        that do not exist.",
  )
  check(
    "the two modes are offered as a visible choice, not a hidden default",
    /role="tab"/.test(choice) && /Easybox/.test(choice) && /La adresă/.test(choice),
  )
}

/* ── LOCATION: OFFERED, NEVER IMPOSED ────────────────────────────────────── */
{
  const geoHook = read("components/shipping/use-geolocation.ts")

  check(
    "the location prompt is bound to a click, never fired on mount",
    (() => {
      // getCurrentPosition PROMPTS. It must live in the callback, not the
      // effect — a refusal is permanent for the origin, and spending that one
      // chance on page load loses the feature for good.
      const effect = geoHook.slice(geoHook.indexOf("useEffect("), geoHook.indexOf("const prime"))
      return !/getCurrentPosition/.test(effect) && /const prime = useCallback/.test(geoHook)
    })(),
  )
  check(
    "the permission is only QUERIED on mount, which never prompts",
    /permissions\s*\n?\s*\?\.query\(\{ name: "geolocation"/.test(geoHook),
  )
  check(
    "a denied or unavailable permission hides the button rather than dangling it",
    /status !== "denied" &&\s*\n?\s*geo\.state\.status !== "unavailable"/.test(picker),
  )
  check(
    "distance sorting happens before the result cap",
    (() => {
      const r = stripComments(lockersRoute)
      return r.indexOf("withDistance.sort") < r.indexOf(".slice(0, MAX_RESULTS)")
    })(),
    "        Otherwise 'nearest 60' means nearest of an arbitrary first 60.",
  )
  check(
    "lockers with no coordinates sink instead of sorting as if at the origin",
    /if \(a\.km === null\) return b\.km === null \? 0 : 1/.test(lockersRoute),
  )
  check(
    "a location lets the buyer browse without typing",
    /!near && q\.trim\(\)\.length < MIN_QUERY/.test(picker),
  )
  check(
    "the buyer's coordinates are never persisted or logged",
    (() => {
      const r = lockersRoute
      // Used to sort one response and then discarded. No insert, no console.
      return !/console\.(log|error|warn)[\s\S]{0,120}(lat|lng)/.test(r) && !/\.insert\(/.test(r)
    })(),
  )
  check(
    "distance is formatted at a precision that matches the distance",
    (() => {
      return (
        formatDistance(0.35) === "350 m" &&
        formatDistance(2.4) === "2,4 km" &&
        formatDistance(18.2) === "18 km"
      )
    })(),
  )
  check(
    "the haversine distance is right for a known pair",
    (() => {
      // Bucharest → Cluj-Napoca is about 325 km great-circle.
      const km = distanceKm({ lat: 44.4268, lng: 26.1025 }, { lat: 46.7712, lng: 23.6236 })
      return km > 315 && km < 335
    })(),
  )
  check(
    "null island and out-of-range coordinates are rejected",
    !isUsableCoord({ lat: 0, lng: 0 }) &&
      !isUsableCoord({ lat: 91, lng: 0 }) &&
      !isUsableCoord({ lat: NaN, lng: 10 }) &&
      isUsableCoord({ lat: 44.4, lng: 26.1 }),
  )
}

/* ── SEEING A REAL LABEL, AND UNDOING IT ─────────────────────────────────── */
//
// The provider has NO sandbox — checked against its OpenAPI document, which
// contains zero occurrences of sandbox / test_mode / dry_run / simulate. So a
// real AWB costs real money, and the only thing that makes testing affordable
// is that DELETE /orders/{id} refunds the wallet.
{
  const testRoute = read("app/api/admin/shipping-test/route.ts")
  const labelRoute2 = read("app/api/admin/shipping-test/label/route.ts")
  const ui = read("app/admin/shipping-test/_client.tsx")

  check(
    "the label link is read from download_url, the field that exists",
    /data\.download_url as string/.test(eawbLib),
    "        It looked for `link` / `url`, which the provider does not return —\n" +
      "        every label would have come back null, and the failure would have\n" +
      "        looked like 'the courier has not produced one yet'.",
  )
  check(
    "the label PDF is fetched as bytes, not as a bearer link",
    /Accept: "application\/pdf"/.test(eawbLib) && /orders\/labels/.test(eawbLib),
  )
  check(
    "the label renders in the page instead of downloading",
    /<iframe[\s\S]{0,200}?shipping-test\/label\?orderId=/.test(ui) &&
      /"Content-Disposition": `inline;/.test(labelRoute2),
    "        The barcode is the thing being verified; a link does not show it.",
  )
  check(
    "the label route is admin-only and 404s otherwise",
    /isAdminAuthenticated\(\)/.test(labelRoute2) && /"Not found" \}, \{ status: 404 \}/.test(labelRoute2),
  )
  check(
    "a booked shipment can be cancelled, and cancel takes the PROVIDER order id",
    /export async function cancelOrder/.test(eawbLib) &&
      /method: "DELETE"/.test(eawbLib) &&
      /providerOrderId/.test(testRoute),
    "        DELETE /orders/{id} refunds to the wallet — the only reason a real\n" +
      "        test is affordable.",
  )
  check(
    "the balance is shown again after a cancellation",
    (() => {
      // Comments stripped first, and the block bounded by the NEXT branch
      // rather than by a character count — a window measured in characters
      // shrinks every time an explanation is added above the line it is
      // looking for, which has now cost this file three false failures.
      const src = stripComments(testRoute)
      const start = src.indexOf('if (mode === "cancel")')
      const end = src.indexOf('if (mode === "track")', start)
      const block = src.slice(start, end > start ? end : undefined)
      return /getAccountBalance\(\)/.test(block) && /cancelOrder\(/.test(block)
    })(),
    "        'Did the money come back' is the question being asked.",
  )
  check(
    "cancelling is offered next to the AWB, not hidden",
    /call\("cancel", \{ providerOrderId: created\.orderId \}\)/.test(ui),
  )
}

/* ── THE AWB AS A SCANNABLE CODE ─────────────────────────────────────────── */
{
  const qrLib = read("lib/shipping/qr.ts")

  check(
    "the QR encodes the AWB alone, with no URL or wrapper",
    (() => {
      // A courier's scanner expects the tracking number and nothing else.
      // Wrapping it in a URL produces a code that scans to something the
      // scanner cannot use, and that a human cannot read back off the screen.
      const s = stripComments(qrLib)
      return !/https?:\/\//.test(s) && !/JSON\.stringify/.test(s) && /QRCode\.toString\(value/.test(s)
    })(),
  )
  check(
    "empty input yields no code rather than a code encoding nothing",
    /if \(!value\) return null/.test(qrLib),
    "        A QR of an empty string still scans, and yields nothing — worse\n" +
      "        than no QR at all.",
  )
  check(
    "generating a QR can never take down the page that shows it",
    /} catch \{\s*\n?\s*return null\s*\n?\s*\}/.test(qrLib),
  )
  check(
    "the data URI is base64, not raw SVG",
    /base64,\$\{Buffer\.from\(svg, "utf8"\)\.toString\("base64"\)\}/.test(qrLib),
    "        SVG contains '#', which terminates a data URI early in some\n" +
      "        browsers unless escaped.",
  )
  check(
    "error correction is raised above the default for screen scanning",
    /const ERROR_CORRECTION = "Q"/.test(qrLib),
  )
  check(
    "the QR is generated server-side, never in the client bundle",
    (() => {
      // Importing `qrcode` into a "use client" module would ship the encoder to
      // every buyer for something only the server needs.
      const clients = [
        "components/shipping/order-shipping-panel.tsx",
        "app/admin/shipping-test/_client.tsx",
      ]
      return clients.every((f) => !/from "qrcode"|shipping\/qr/.test(read(f)))
    })(),
  )
  check(
    "the QR is built beside the AWB it encodes, in both places",
    /qrDataUri\(result\.awb\)/.test(read("app/api/admin/shipping-test/route.ts")) &&
      /qrDataUri\(order\.awb_number\)/.test(orderRoute),
    "        Generated apart from the number, the two can disagree.",
  )
  check(
    "the buyer never receives a QR — only the seller stands at a locker",
    (() => {
      const src = stripComments(orderRoute)
      const buyer = src.slice(src.indexOf("function buyerView"), src.indexOf("function sellerView"))
      return !/qr/i.test(buyer)
    })(),
  )
  check(
    "the AWB is always shown as text beside the code",
    (() => {
      // The QR is an aid. If it will not scan — glare, a cracked screen, a
      // scanner that wants a barcode — the number must still be readable.
      const ui = read("app/admin/shipping-test/_client.tsx")
      return /select-all break-all font-mono/.test(ui) && /alt=\{`Cod QR pentru AWB/.test(ui)
    })(),
  )
  check(
    "qrcode was already a dependency, so nothing new was installed",
    (() => {
      const pkg = JSON.parse(read("package.json")) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      return Boolean(pkg.dependencies?.qrcode) && Boolean(pkg.devDependencies?.["@types/qrcode"])
    })(),
  )
}

/* ── THE LABEL APPEARS WITHOUT ANYONE ASKING ─────────────────────────────── */
//
// Two triggers, because one is fast and the other is reliable, and neither
// touches the payment flow — four separate places create orders in this
// codebase and none of them had to change.
{
  const cron = read("app/api/cron/shipping-awb/route.ts")

  check(
    "the sweep is scheduled",
    (() => {
      const v = JSON.parse(read("vercel.json")) as { crons?: Array<{ path: string; schedule: string }> }
      return Boolean(v.crons?.some((c) => c.path === "/api/cron/shipping-awb"))
    })(),
  )
  check(
    "the sweep answers on GET, which is what Vercel Cron sends",
    /export async function GET/.test(cron) && /export async function POST/.test(cron),
  )
  check(
    "the sweep is authorised by CRON_SECRET",
    /`Bearer \$\{secret\}`/.test(cron),
  )
  check(
    "the sweep looks for a destination by MODE, not by locker id",
    /\.not\("ship_mode", "is", null\)/.test(cron),
    "        A home delivery has no locker id and would be swept up forever, or\n" +
      "        never, depending on which way the test was written.",
  )
  check(
    "the sweep is bounded per run",
    /const BATCH = \d+/.test(cron) && /\.limit\(BATCH\)/.test(cron),
    "        Each booking is a round trip that spends money; an unbounded loop\n" +
      "        is the wrong shape for that.",
  )
  check(
    "an empty wallet stops the run instead of failing every pending order",
    /if \(result\.code === "insufficient_funds"\) break/.test(cron),
  )
  check(
    "the sweep books through the same guarded function as everything else",
    /createAwbForOrder\(order\.id\)/.test(cron) && !/\bcreateOrder\(/.test(cron),
    "        Overlapping runs are safe only because the claim and the unique\n" +
      "        index are inside that function.",
  )
  check(
    "a missing migration is quiet, not a recurring error",
    /isMissingShippingSchema\(error\)/.test(cron) && /shipping_not_configured/.test(cron),
    "        A cron that screams every ten minutes trains people to ignore it.",
  )
  check(
    "the sweep logs counts, never order ids",
    (() => {
      const log = cron.slice(cron.indexOf("console.log(\"[cron/shipping-awb]\""))
      return /considered|booked|failed/.test(log) && !/order\.id|orders\.map/.test(log.slice(0, 200))
    })(),
  )
  check(
    "the fast path books as soon as the address lands on a PAID order",
    /autoAwbEnabled\(\) && isPaid\(order\.status\)[\s\S]{0,200}?await createAwbForOrder\(order\.id\)/.test(orderRoute),
  )
  check(
    "the fast path is awaited, not fired and forgotten",
    (() => {
      const src = stripComments(orderRoute)
      const i = src.indexOf("if (autoAwbEnabled() && isPaid(")
      return i > -1 && /await createAwbForOrder/.test(src.slice(i, i + 300))
    })(),
    "        A serverless function that returns can be frozen mid-flight, and a\n" +
      "        half-executed booking is the one thing this must never produce.",
  )
  check(
    "the seller's panel no longer tells them to press a button first",
    (() => {
      const panel = read("components/shipping/order-shipping-panel.tsx")
      return /Eticheta se generează automat/.test(panel) && /Reîncearcă/.test(panel)
    })(),
    "        The copy has to match what actually happens, and the button is now\n" +
      "        a retry rather than the normal path.",
  )
}

/* ── TWO BUGS FOUND IN REVIEW, PINNED ────────────────────────────────────── */
{
  check(
    "a guest's email is matched with eq, never ilike",
    (() => {
      // ilike treats `_` and `%` as WILDCARDS, and underscores are ordinary in
      // email addresses. "john_doe@x.com" matched "johnXdoe@x.com" — which in
      // readPreference returned a different person's name and phone, and in
      // savePreference DELETED their saved address.
      const s = stripComments(prefLib)
      return !/\.ilike\(/.test(s) && /\.eq\("email", normaliseEmail\(who\.email\)\)/.test(s)
    })(),
  )
  check(
    "guest lookups are also scoped to rows with no user_id",
    (() => {
      const s = stripComments(prefLib)
      // Otherwise a guest email could match a member's row from before they
      // signed up.
      return (s.match(/\.is\("user_id", null\)/g) ?? []).length >= 2
    })(),
  )
  check(
    "emails are normalised through one function on both write and read",
    (() => {
      const s = stripComments(prefLib)
      return (
        /function normaliseEmail/.test(s) && (s.match(/normaliseEmail\(/g) ?? []).length >= 3
      )
    })(),
    "        Written lowercased and read raw, a differently-cased address\n" +
      "        silently gets a second row and loses the first.",
  )
  check(
    "booking on the order page re-reads instead of returning the stale copy",
    // Comments stripped before matching. A window measured in characters
    // shrinks every time an explanation is added above the line it is looking
    // for; that has now cost this file four false failures, so the rule is:
    // never match across prose.
    /if \(created\.ok\)[\s\S]{0,200}?readOrderShipping\(admin, order\.id\)/.test(stripComments(orderRoute)),
    "        The booking writes the AWB, carrier, label URL and status. Patching\n" +
      "        fields onto the pre-booking object made the response say 'no AWB'\n" +
      "        milliseconds after producing one, so the seller saw 'generating…'\n" +
      "        until they refreshed a page that was already finished.",
  )
  check(
    "orders written before ship_mode existed are backfilled",
    (() => {
      const s = read("supabase/sql/RUN_SHIPPING.sql")
      return (
        /update public\.orders\s+set ship_mode = 'locker'/.test(s) &&
        /update public\.orders\s+set ship_mode = 'home'/.test(s)
      )
    })(),
    "        Everything now asks 'has a destination been chosen?' via the mode.\n" +
      "        Without this, an order that already had a locker would read as\n" +
      "        having none and be overwritten by the buyer's saved preference.",
  )
  check(
    "the UI's delivery modes cannot drift from the server's",
    (() => {
      // Two DeliveryMode unions exist — one in the client component, one in the
      // server module — because a client bundle must not import server code.
      // They must agree, so the values are compared rather than the types.
      const modes = (src: string) => {
        const m = src.match(/type DeliveryMode = ([^\n]+)/)
        return m ? m[1].replace(/[\s"']/g, "").split("|").sort().join(",") : null
      }
      const ui = modes(read("components/shipping/delivery-choice.tsx"))
      const server = modes(prefLib)
      return ui !== null && ui === server
    })(),
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
  "a LOCKER choice is sent as an id, never as an address",
  (() => {
    // Home delivery legitimately posts a typed street — that IS the data, and
    // the server validates it. What must never happen is the client supplying
    // the address OF A LOCKER: the server looks that up from the id, so the two
    // can never disagree. So the address field is only ever populated for home.
    const send = (f: string) => {
      const s = read(f)
      const i = s.indexOf("body: JSON.stringify({")
      return s.slice(i, i + 400)
    }
    return [
      "components/shipping/order-shipping-panel.tsx",
      "app/checkout/livrare/_client.tsx",
    ].every((f) => {
      const body = send(f)
      return (
        /lockerId: locker\?\.id/.test(body) &&
        /address: mode === "home" \? address : undefined/.test(body) &&
        !/street|locality|county/i.test(body)
      )
    })
  })(),
  "        Accepting a locker's address from the client lets one city's locker\n" +
    "        id be paired with another city's street.",
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

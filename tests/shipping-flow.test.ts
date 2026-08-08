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
import { fitZoom, project, tilesFor, unproject } from "../lib/geo-tiles"
import { clusterByScreenGrid, zoomToBreakUp } from "../lib/shipping/cluster"
import { normalizeLocker, toStoredLocker } from "../lib/shipping/locker"
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
      // DeliveryChoice now opens the full-screen LockerScreen rather than
      // embedding a picker, so the carrier is threaded through that instead.
      // Both entry points render DeliveryChoice, so checking it covers both.
      const choice = read("components/shipping/delivery-choice.tsx")
      const pipedThrough = /<LockerScreen[\s\S]{0,300}?carrierId=\{carrierId\}/.test(choice)
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
    "a physical listing renders the marketplace checkout, not the digital one",
    (() => {
      const s = stripComments(checkoutPage)
      // The branch returns BEFORE the digital client is reached, so the two can
      // never both render.
      const branch = s.slice(s.indexOf('product.type === "physical"'))
      return /MarketplaceCheckout/.test(branch) && branch.indexOf("MarketplaceCheckout") < branch.indexOf("CheckoutPageClient")
    })(),
    "        A jacket needs an address and postage; a download needs tips, VAT\n" +
      "        and a licence. One component for both is how the old client got to\n" +
      "        2,300 lines.",
  )
  check(
    "delivery is asked for on the checkout page itself",
    (() => {
      const s = read("components/checkout/marketplace-checkout.tsx")
      return /LockerScreen/.test(s) && /AddressSheet/.test(s) && /DeliveryOptions/.test(s)
    })(),
    "        The separate /checkout/livrare gate existed because the old payment\n" +
      "        client could not be touched. The marketplace checkout can.",
  )
  check(
    "the buyer can still skip the standalone delivery step",
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
    "a request that never answers cannot hang the UI forever",
    (() => {
      // A REAL BUG, seen on the iOS app: the button sat on "Se caută…" until
      // the page was reloaded. PositionOptions.timeout only bounds ACQUIRING a
      // fix once permission exists — it does not bound the permission step, and
      // a WKWebView with no NSLocationWhenInUseUsageDescription drops the
      // request entirely: no success callback, no error callback, ever.
      const s = stripComments(geoHook)
      return (
        /const WATCHDOG_MS/.test(geoHook) &&
        /setTimeout\(\(\) => \{/.test(s) &&
        /clearTimeout\(watchdog\)/.test(s)
      )
    })(),
  )
  check(
    "the watchdog outlives the API's own timeout, so the specific error wins",
    (() => {
      const t = Number(geoHook.match(/const TIMEOUT_MS = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0)
      const w = Number(geoHook.match(/const WATCHDOG_MS = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0)
      return t > 0 && w > t
    })(),
    "        A genuine slow fix should get to report its own, more useful,\n" +
      "        error before the generic one fires.",
  )
  check(
    "only the first outcome is applied",
    /if \(settled\) return\s*\n?\s*settled = true/.test(stripComments(geoHook)),
    "        A late callback arriving after the watchdog would otherwise flip\n" +
      "        the UI back out of the state it had just settled into.",
  )
  check(
    "a WebView that throws synchronously does not leave the spinner running",
    /\} catch \{\s*\n?\s*settle\(\{ status: "unavailable" \}\)/.test(stripComments(geoHook)),
  )
  check(
    "the native app is told the app itself needs updating",
    /isNativeApp\(\)[\s\S]{0,120}?App Store/.test(geoHook),
    "        Info.plist is compiled into the binary, so a web deploy cannot fix\n" +
      "        it and telling someone to check their settings would be wrong.",
  )
  check(
    "a failed attempt can be retried",
    /Încearcă din nou/.test(read("components/shipping/location-prompt.tsx")),
  )
  check(
    "a denied or unavailable permission never leaves a dead button on screen",
    (() => {
      // The bare button moved into LocationPrompt, which returns early for
      // every settled state — null when there is nothing to be done, and one
      // line of help when the answer was no.
      const p = read("components/shipping/location-prompt.tsx")
      return (
        /if \(state\.status !== "idle" && state\.status !== "locating"\)/.test(p) &&
        /if \(state\.status === "denied"\)/.test(p) &&
        /return null/.test(p)
      )
    })(),
  )
  check(
    "distance sorting happens before the result cap",
    (() => {
      const r = stripComments(lockersRoute)
      return r.indexOf("withDistance.sort") < r.indexOf(".slice(0, cap)")
    })(),
    "        Otherwise 'nearest 60' means nearest of an arbitrary first 60.",
  )
  check(
    "lockers with no coordinates sink instead of sorting as if at the origin",
    /if \(a\.km === null\) return b\.km === null \? 0 : 1/.test(lockersRoute),
  )
  check(
    "the system dialog is never spent cold",
    (() => {
      // On iOS the OS alert may only ever be shown ONCE; decline it and every
      // later request silently fails until the user finds the app in Settings.
      // So our own explanation comes first, and only "Permite" calls the real
      // thing. "Nu acum" costs nothing — the system prompt was never shown.
      const p = read("components/shipping/location-prompt.tsx")
      return /onClick=\{onAllow\}/.test(p) && /Nu acum/.test(p) && !/getCurrentPosition/.test(p)
    })(),
  )
  check(
    "a dismissal is remembered for the session, not forever",
    (() => {
      const p = read("components/shipping/location-prompt.tsx")
      // sessionStorage: a new visit is a fair time to ask again, and a buyer
      // who declined last month may be somewhere else entirely today. A prompt
      // that reappears within the same session is what makes people uninstall.
      //
      // Comments stripped — the file NAMES localStorage to explain why it is
      // not used, and matching that is matching the documentation.
      const code = stripComments(p)
      return /sessionStorage/.test(code) && !/localStorage/.test(code)
    })(),
  )
  check(
    "storage being unavailable does not break checkout",
    (() => {
      const p = read("components/shipping/location-prompt.tsx")
      return (p.match(/catch \{/g) ?? []).length >= 2
    })(),
    "        Private mode throws on sessionStorage; showing the card once more\n" +
      "        is a better failure than crashing a purchase.",
  )
  check(
    "a refused permission explains where to re-enable it, per platform",
    (() => {
      const p = read("components/shipping/location-prompt.tsx")
      return /isNativeApp\(\)/.test(p) && /Setări/.test(p) && /bara de adrese/.test(p)
    })(),
    "        The fix is not in this app, so pointing at it is the only useful\n" +
      "        thing left to say.",
  )
  check(
    "the prompt is not rendered on the server, where sessionStorage does not exist",
    (() => {
      const p = read("components/shipping/location-prompt.tsx")
      // Defaults to dismissed and flips in an effect; assuming "not dismissed"
      // would flash the card on every single load.
      return /useState\(true\)/.test(p) && /useEffect\(\(\) => \{\s*\n?\s*setDismissed/.test(p)
    })(),
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

/* ── THE SIMULATOR LETS YOU CHOOSE, NOT TYPE IDS ─────────────────────────── */
{
  const ui = read("app/admin/shipping-test/_client.tsx")

  check(
    "both easyboxes are chosen with a search, not a numeric field",
    (() => {
      // Typing 66725 into a text box is not choosing. Two pickers, one per
      // party, and the sender's filtered to lockers that accept drop-offs.
      const pickers = ui.match(/<LockerPicker/g) ?? []
      return pickers.length >= 1 && /dropOffOnly=\{dropOff\}/.test(ui)
    })(),
  )
  check(
    "picking a locker writes its id AND its address together",
    (() => {
      const i = ui.indexOf("onSelect={(l) => {")
      const block = ui.slice(i, i + 600)
      return (
        /fixed_location_id: String\(l\.id\)/.test(block) &&
        /locality_name: l\.locality/.test(block) &&
        /county_name: l\.county/.test(block) &&
        /street_name:/.test(block)
      )
    })(),
    "        The provider validates both, and an id from one city paired with a\n" +
      "        street from another is exactly the mismatch that caused the 400.",
  )
  check(
    "a locker with no street number gets FN, not an empty field",
    /street_number: m \? m\[2\] : "FN"/.test(ui),
  )
  check(
    "the picker only filters by carrier once a carrier is chosen",
    /carrierId=\{Number\(carrierId\) > 0 \? Number\(carrierId\) : undefined\}/.test(ui),
    "        Comparing all couriers means all their lockers are fair game.",
  )
  check(
    "the comparison can be restricted to the chosen sender locker",
    /call\("compare", \{ pinSenderLocker: true \}\)/.test(ui) &&
      /body\.pinSenderLocker \? Number\(body\.from\?\.fixed_location_id\)/.test(
        read("app/api/admin/shipping-test/route.ts"),
      ),
    "        'What can I get from THIS locker' is a different question from\n" +
      "        'what is cheapest between these two towns'.",
  )
  check(
    "that button is disabled until a sender locker exists",
    /disabled=\{busy !== null \|\| !from\.fixed_location_id\}/.test(ui),
  )
}

/* ── SEARCH THAT FINDS WHAT YOU TYPED ────────────────────────────────────── */
{
  // The real function, lifted out of the route so the behaviour is tested
  // rather than the regex that implements it.
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const tokenise = (q: string) => fold(q).split(/[\s,._-]+/).map((t) => t.trim()).filter(Boolean)
  const matches = (hay: string, q: string) => {
    for (const t of tokenise(q)) {
      if (/^\d{1,2}$/.test(t)) {
        if (!new RegExp(`(^|[^0-9])${t}([^0-9]|$)`).test(hay)) return false
      } else if (!hay.includes(t)) return false
    }
    return true
  }
  const sector4 = fold("PROFI VACARESTI Str. Vacaresti 391 Sector 4 Bucuresti")
  const sector3 = fold("easybox Alliance Str. Sergent Pechiu Ion 3-7 Sector 3 Bucuresti")

  check(
    "words can be typed in any order",
    matches(sector4, "profi bucuresti") && matches(sector4, "bucuresti profi"),
    "        A plain substring found NOTHING for 'profi bucuresti' — the two\n" +
      "        words sit far apart in the address and a substring must be\n" +
      "        contiguous.",
  )
  check(
    "a sector number is not satisfied by a house number",
    !matches(sector4, "sector 3") && matches(sector3, "sector 3"),
    "        The bare '3' is inside '391', so 'sector 3' matched a locker in\n" +
      "        Sector 4.",
  )
  check(
    "extra words narrow the list rather than widening it",
    matches(sector3, "easybox sector 3") && !matches(sector4, "easybox sector 3"),
  )
  check(
    "longer numbers still match as substrings",
    matches(sector4, "391") && !matches(sector3, "391"),
  )
  check(
    "diacritics are still ignored in both directions",
    matches(fold("Str. București nr. 1"), "bucuresti") && matches(sector4, "vacaresti"),
  )
  check(
    "the route uses the tokenised matcher, not a raw includes",
    /matchesQuery\(/.test(lockersRoute) && /function tokenise/.test(lockersRoute),
  )
}

/* ── THE MAP ─────────────────────────────────────────────────────────────── */
{
  const map = read("components/shipping/locker-map.tsx")

  check(
    "the map costs no dependency and no API key",
    (() => {
      const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> }
      const deps = Object.keys(pkg.dependencies ?? {})
      return (
        !deps.some((d) => /^(leaflet|maplibre|mapbox|react-map|google-map)/.test(d)) &&
        !/apiKey|api_key|accessToken/i.test(map)
      )
    })(),
    "        A mapping library is 40–150 KB shipped to every buyer to draw one\n" +
      "        pin.",
  )
  check(
    "a locker with no coordinates renders no map at all",
    /Number\.isFinite\(lat\)/.test(map) && /lat === 0 && lng === 0/.test(map),
    "        NaN in the URL produces a map of the middle of the ocean, which\n" +
      "        looks like an answer.",
  )
  check(
    "the embedded frame cannot reach back into the page",
    /sandbox="allow-scripts allow-same-origin"/.test(map) && /referrerPolicy="no-referrer"/.test(map),
  )
  check(
    "there is a way out to a real maps app for directions",
    /google\.com\/maps\/search\/\?api=1&query=/.test(map),
    "        A static frame cannot give directions; the device already has an\n" +
      "        app that can.",
  )
  check(
    "the map is shown for the CHOSEN locker, in the shared picker",
    /<LockerMap/.test(picker) && /lat=\{value\.lat\}/.test(picker),
    "        So both places a buyer picks — before payment and on the order —\n" +
      "        get it from one component.",
  )
  check(
    "coordinates reach the client for it to draw",
    // Now via the normaliser, which is where the null-island rejection lives.
    /latitude/.test(lockersRoute) && /lat: n\.latitude/.test(lockersRoute),
  )
}

/* ── PICKING A LOCKER OFF THE MAP ────────────────────────────────────────── */
{
  const mapPicker = read("components/shipping/locker-map-picker.tsx")

  // The projection is the part that is either right or produces a map of the
  // sea, so it is checked against the canonical formula rather than itself.
  check(
    "the projection matches the standard Web Mercator formula",
    (() => {
      const wiki = (c: { lat: number; lng: number }, z: number) => {
        const n = Math.pow(2, z)
        const latRad = (c.lat * Math.PI) / 180
        return {
          x: (((c.lng + 180) / 360) * n) * 256,
          y: (((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n) * 256,
        }
      }
      const cases = [
        { lat: 44.4268, lng: 26.1025 },
        { lat: 52.5145, lng: 13.3501 },
        { lat: -33.86, lng: 151.21 },
        { lat: 0, lng: 0 },
      ]
      return cases.every((c) =>
        [1, 5, 12, 16, 18].every((z) => {
          const a = project(c, z)
          const b = wiki(c, z)
          return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
        }),
      )
    })(),
  )
  check(
    "a coordinate survives a round trip through the projection",
    (() => {
      const o = { lat: 44.4268, lng: 26.1025 }
      const back = unproject(project(o, 14), 14)
      return Math.abs(back.lat - o.lat) < 1e-9 && Math.abs(back.lng - o.lng) < 1e-9
    })(),
  )
  check(
    "latitude is clamped so a polar coordinate cannot blank the map",
    (() => {
      // Mercator goes to infinity at the poles; an unclamped y renders nothing
      // and looks like broken tiles. Clamped, 89.9° lands ON the top edge —
      // y ≈ 0, which floating point returns as a hair BELOW zero. An earlier
      // version of this asserted `y > 0` and failed on correct code.
      const world = 256 * Math.pow(2, 10)
      const north = project({ lat: 89.9, lng: 0 }, 10)
      const south = project({ lat: -89.9, lng: 0 }, 10)
      const inWorld = (y: number) => Number.isFinite(y) && y >= -1 && y <= world + 1
      return inWorld(north.y) && inWorld(south.y) && south.y > north.y
    })(),
  )
  check(
    "the tile grid covers the whole viewport",
    (() => {
      const centre = { lat: 44.4268, lng: 26.1025 }
      const w = 640
      const h = 340
      const tiles = tilesFor(centre, 13, w, h)
      if (tiles.length === 0) return false
      const covered =
        Math.min(...tiles.map((t) => t.left)) <= 0 &&
        Math.min(...tiles.map((t) => t.top)) <= 0 &&
        Math.max(...tiles.map((t) => t.left)) + 256 >= w &&
        Math.max(...tiles.map((t) => t.top)) + 256 >= h
      return covered
    })(),
    "        A gap at an edge shows as grey stripes across the map.",
  )
  check(
    "tiles wrap around the date line but never above the pole",
    (() => {
      const n = Math.pow(2, 4)
      const tiles = tilesFor({ lat: 0, lng: 179.9 }, 4, 640, 340)
      return tiles.every((t) => t.x >= 0 && t.x < n && t.y >= 0 && t.y < n)
    })(),
  )
  check(
    "the chosen zoom actually fits the points it was given",
    (() => {
      const pts = [
        { lat: 44.4268, lng: 26.1025 },
        { lat: 44.5, lng: 26.2 },
      ]
      const z = fitZoom(pts, 640, 340)
      const p = pts.map((c) => project(c, z))
      const w = Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x))
      const h = Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y))
      return w <= 640 && h <= 340
    })(),
  )
  check(
    "a single locker is shown at street level, not at a zoom that fits nothing",
    fitZoom([{ lat: 44.4268, lng: 26.1025 }], 640, 340) >= 15,
  )
  check(
    "the map needs no mapping library",
    (() => {
      const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> }
      return !Object.keys(pkg.dependencies ?? {}).some((d) =>
        /^(leaflet|maplibre|mapbox|react-leaflet|google-map)/.test(d),
      )
    })(),
  )
  check(
    "a marker tap selects, and a pan that ends on one does not",
    /if \(drag\.current\?\.moved\) return/.test(mapPicker),
    "        Otherwise every drag that finishes over a pin silently changes the\n" +
      "        buyer's delivery point.",
  )
  check(
    "off-screen markers are not rendered",
    // The cutoff is now TILE_SIZE, matching the tile buffer — panning does not
    // re-render, so a pin must exist as far out as a tile does or it pops in
    // at the edge of a drag.
    /p\.x < -TILE_SIZE \|\|\s*\n?\s*p\.y < -TILE_SIZE/.test(mapPicker),
    "        A hundred absolutely-positioned buttons outside the viewport is a\n" +
      "        hundred things the browser still lays out.",
  )
  check(
    "panning does not re-render: it moves one layer on the compositor",
    (() => {
      // The lag report. setCentre on every pointermove re-rendered a dozen
      // tiles and up to sixty markers, at pointer-event rate — 120 times a
      // second on a modern phone, each one a layout pass.
      const s = stripComments(mapPicker)
      const move = s.slice(s.indexOf("const onPointerMove"), s.indexOf("const onPointerUp"))
      return (
        !/setCentre\(/.test(move) &&
        /applyOffset\(dx, dy\)/.test(move) &&
        /style\.transform = `translate3d/.test(s)
      )
    })(),
  )
  check(
    "the dragged pixels are folded back into the centre on release",
    /const commitOffset[\s\S]{0,400}?setCentre\(unproject/.test(stripComments(mapPicker)),
  )
  check(
    "tiles are rendered with a buffer, since panning cannot fetch more",
    /tilesFor\(centre, zoom, size\.width, size\.height, 1\)/.test(mapPicker),
  )
  check(
    "a React reposition resets the layer transform",
    /offset\.current = \{ x: 0, y: 0 \}[\s\S]{0,200}?translate3d\(0px, 0px, 0px\)/.test(
      stripComments(mapPicker),
    ),
    "        The new tile positions already account for the new centre, so a\n" +
      "        leftover translate would double-apply it.",
  )
  check(
    "starting a pinch commits the pan first",
    /commitOffset\(\)\s*\n?\s*pinch\.current = \{/.test(stripComments(mapPicker)),
    "        Otherwise the zoom anchor is computed from a centre the map is not\n" +
      "        actually showing.",
  )
  check(
    "OpenStreetMap attribution is present, as its terms require",
    /openstreetmap\.org\/copyright/.test(mapPicker) && /© OpenStreetMap/.test(mapPicker),
  )
  check(
    "the tile host is one constant, so it can be swapped",
    (() => {
      const hosts = mapPicker.match(/https:\/\/[a-z.]*tile[a-z.]*\.[a-z]+/g) ?? []
      return new Set(hosts).size === 1 && /const TILE_URL =/.test(mapPicker)
    })(),
    "        OSM asks that heavy production traffic move to a dedicated\n" +
      "        provider; that must be a one-line change.",
  )
  check(
    "the map is reachable from the shared picker, so both flows get it",
    /<LockerMapPicker/.test(picker) && /view === "map"/.test(picker),
  )
  check(
    "zooming keeps the point under the finger exactly where it is",
    (() => {
      // Zoom-to-centre is the easy version and is subtly awful: the thing you
      // were looking at slides away as you zoom in on it. This replicates
      // zoomAround and checks the anchored point does not move.
      const W = 640
      const H = 340
      const zoomAround = (centre: { lat: number; lng: number }, z: number, next: number, fx: number, fy: number) => {
        const before = project(centre, z)
        const anchor = unproject({ x: before.x - W / 2 + fx, y: before.y - H / 2 + fy }, z)
        const a = project(anchor, next)
        return unproject({ x: a.x + W / 2 - fx, y: a.y + H / 2 - fy }, next)
      }
      const centre = { lat: 44.4268, lng: 26.1025 }
      let worst = 0
      for (const [fx, fy] of [
        [0, 0],
        [W, H],
        [100, 50],
        [600, 300],
      ]) {
        for (const [z, next] of [
          [12, 13],
          [13, 12],
          [10, 16],
          [18, 17],
        ]) {
          const b = project(centre, z)
          const anchor = unproject({ x: b.x - W / 2 + fx, y: b.y - H / 2 + fy }, z)
          const nc = zoomAround(centre, z, next, fx, fy)
          const p = project(anchor, next)
          const c = project(nc, next)
          const after = { x: p.x - (c.x - W / 2), y: p.y - (c.y - H / 2) }
          worst = Math.max(worst, Math.hypot(after.x - fx, after.y - fy))
        }
      }
      return worst < 1e-6
    })(),
  )
  check(
    "the map pinches and scroll-zooms, not just its buttons",
    (() => {
      // A map you cannot pinch reads as broken on a phone, which is the
      // platform this app mostly runs on.
      return (
        /onWheel=\{onWheel\}/.test(mapPicker) &&
        /pointers\.current\.size === 2/.test(mapPicker) &&
        /Math\.log2\(now \/ p\.distance\)/.test(mapPicker)
      )
    })(),
  )
  check(
    "a pinch is spent one whole zoom level at a time",
    /Math\.abs\(accumulated\) >= 1/.test(mapPicker),
    "        Tiles exist only at integer zooms, so the continuous pinch ratio\n" +
      "        has to be accumulated rather than applied directly.",
  )
  check(
    "a second finger cancels the pan instead of dragging the map with it",
    /if \(drag\.current\) drag\.current\.moved = true/.test(mapPicker),
    "        Otherwise lifting from a pinch registers as a tap on whatever pin\n" +
      "        happened to be underneath.",
  )
}

/* ── ONE LOCKER SHAPE, WHATEVER THE CARRIER CALLS IT ─────────────────────── */
{
  const raw = {
    id: 549670,
    fixed_location_type: "locker",
    carrier_id: 2,
    carrier_name: "DPD",
    locality_id: 13894,
    locality_name: "Sector 4",
    county_id: 10,
    county_name: "Bucuresti",
    country_code: "RO",
    name: " PROFI VACARESTI",
    address: "cal. VACARESTI Nr. 176-178",
    allows_drop_off: true,
    is_active: true,
    coordinates: { lat: 44.41567, long: 26.113185 },
    schedule: [
      { day: 1, openingHour: "00:00", closingHour: "23:59" },
      { day: 2, openingHour: "00:00", closingHour: "23:59" },
    ],
  }

  check(
    "the provider's own locker id survives normalisation untouched",
    (() => {
      const n = normalizeLocker(raw)
      return n?.providerLockerId === 549670 && n?.carrierId === 2
    })(),
    "        This is the field whose absence produced 'Service 4 requires fixed\n" +
      "        location for pickup address'. It is captured at selection time and\n" +
      "        never re-derived from an address.",
  )
  check(
    "the street is split once, server-side",
    (() => {
      const n = normalizeLocker(raw)
      return n?.street === "cal. VACARESTI Nr." && n?.streetNumber === "176-178"
    })(),
  )
  check(
    "a name with stray whitespace is trimmed",
    normalizeLocker(raw)?.name === "PROFI VACARESTI",
  )
  check(
    "real opening hours are carried through",
    (() => {
      const n = normalizeLocker(raw)
      return n?.hours.length === 2 && n.hours[0].opens === "00:00" && n.hours[0].day === 1
    })(),
    "        The provider DOES return `schedule` — the locker route was throwing\n" +
      "        it away, so the UI had nothing honest to show.",
  )
  check(
    "a malformed schedule row is dropped, not rendered half-empty",
    (() => {
      const n = normalizeLocker({
        ...raw,
        schedule: [
          { day: 1, openingHour: "09:00", closingHour: "" },
          { day: 99, openingHour: "09:00", closingHour: "18:00" },
          { day: 2, openingHour: "09:00", closingHour: "18:00" },
        ],
      })
      return n?.hours.length === 1 && n.hours[0].day === 2
    })(),
    "        Better than showing '09:00 – ' beside a real one.",
  )
  check(
    "an inactive locker is not offered at all",
    normalizeLocker({ ...raw, is_active: false }) === null,
    "        Offering it produces a booking the carrier rejects.",
  )
  check(
    "availability is never invented",
    (() => {
      // The provider exposes is_active and nothing finer. Claiming "available"
      // for a locker that may be full is a promise we cannot keep.
      const n = normalizeLocker(raw)
      return n?.availability === "unknown"
    })(),
  )
  check(
    "null island coordinates become null, not a point off Africa",
    (() => {
      const n = normalizeLocker({ ...raw, coordinates: { lat: 0, long: 0 } })
      return n?.latitude === null && n?.longitude === null
    })(),
  )
  check(
    "a locker with no id is rejected",
    normalizeLocker({ ...raw, id: 0 }) === null,
  )
  check(
    "what gets STORED is the AWB fields, not a snapshot of everything",
    (() => {
      const n = normalizeLocker(raw)
      if (!n) return false
      const s = toStoredLocker(n)
      // Opening hours and coordinates change; a copy taken at checkout would
      // slowly become a lie. The id and carrier cannot drift.
      return (
        s.providerLockerId === 549670 &&
        s.carrierId === 2 &&
        !("hours" in s) &&
        !("latitude" in s) &&
        !("availability" in s)
      )
    })(),
  )
  check(
    "pickup and delivery lockers are modelled separately",
    (() => {
      const src = read("lib/shipping/locker.ts")
      return /pickupLocker\?: StoredLocker/.test(src) && /deliveryLocker\?: StoredLocker/.test(src)
    })(),
    "        Reusing one for both is silent and expensive: the parcel is\n" +
      "        collected from wherever pickup says and delivered to wherever\n" +
      "        delivery says.",
  )
  check(
    "the locker route answers through the normaliser",
    /normalizeLocker\(l\)/.test(lockersRoute),
    "        So the shape the map renders is the shape the AWB is built from.",
  )
}

/* ── LOCKER DETAILS SHOW ONLY WHAT IS KNOWN ──────────────────────────────── */
{
  const details = read("components/shipping/locker-details.tsx")

  check(
    "no ratings, reviews or busyness are invented",
    (() => {
      const s = stripComments(details)
      return !/rating|review|stars|busy|popular/i.test(s)
    })(),
    "        None of it exists in the data, and inventing it would be lying to\n" +
      "        someone deciding where to collect a parcel.",
  )
  check(
    "each field renders only when the provider sent it",
    /schedule\.length > 0 &&/.test(details) &&
      /typeof locker\.distanceKm === "number" &&/.test(details) &&
      /locker\.carrier &&/.test(details),
    "        A sparse locker degrades to a name and an address, not a column of\n" +
      "        dashes.",
  )
  check(
    "identical consecutive days collapse into a range",
    (() => {
      // Seven rows all reading 00:00–23:59 is not information.
      const s = details
      return /function summariseHours/.test(s) && /isAlwaysOpen/.test(s)
    })(),
  )
  check(
    "a non-consecutive day does not join a range",
    /cur\.day === prev\.day \+ 1/.test(details),
    "        Monday and Wednesday sharing hours is two entries, not\n" +
      "        'Luni – Miercuri'.",
  )
  check(
    "always-open is detected only when all seven days are covered",
    (() => {
      const src = read("lib/shipping/locker.ts")
      return /hours\.length < 7/.test(src)
    })(),
  )
}

/* ── THE FULL-SCREEN PICKER ──────────────────────────────────────────────── */
{
  const screen = read("components/shipping/locker-screen.tsx")

  check(
    "tapping a pin opens details rather than selecting outright",
    (() => {
      // Tapping a pin is "what is this one?", not "this one". A picker that
      // commits on first tap makes people afraid to explore it.
      const s = stripComments(screen)
      return /onSelect=\{setFocused\}/.test(s) && /const commit = \(l: LockerOption\) =>/.test(s)
    })(),
  )
  check(
    "closing without choosing leaves the previous selection alone",
    (() => {
      const s = stripComments(screen)
      // onClose is passed straight through; only commit() calls onSelect.
      const commit = s.slice(s.indexOf("const commit ="), s.indexOf("const commit =") + 200)
      return /onSelect\(l\)/.test(commit) && !/onSelect\(/.test(s.slice(s.indexOf("onClose={onClose}") || 0, 0))
    })(),
  )
  check(
    "reopening restores the previous choice instead of resetting",
    /if \(open\) setFocused\(initial \?\? null\)/.test(screen),
  )
  check(
    "an abandoned search is cancelled, not merely ignored",
    /abort\.current\?\.abort\(\)/.test(screen) && /new AbortController\(\)/.test(screen),
    "        An abandoned search over 12,000 lockers is bandwidth on a phone.",
  )
  check(
    "an aborted request is not reported as a failure",
    /AbortError/.test(screen),
  )
  check(
    "the page behind cannot scroll while the map is up",
    /document\.body\.style\.overflow = "hidden"/.test(screen),
    "        A full-screen map over a scrolling page drags both at once.",
  )
  check(
    "Android back closes the picker instead of leaving checkout",
    /history\.pushState/.test(screen) && /popstate/.test(screen),
    "        Otherwise back throws away a half-finished purchase.",
  )
  check(
    "Escape closes the sheet first, then the screen",
    /if \(focused\) setFocused\(null\)\s*\n?\s*else onClose\(\)/.test(stripComments(screen)),
  )
  check(
    "the viewport uses dvh, not vh",
    // The height now comes from the shared slide-panel style, so the check
    // follows it there rather than asserting a literal that moved.
    /SLIDE_PANEL_STYLE/.test(screen) &&
      /height: "100dvh"/.test(read("components/checkout/full-screen-sheet.tsx")) &&
      !/100vh/.test(screen),
    "        On iOS Safari the address bar makes vh taller than the visible\n" +
      "        area, so a vh-sized map hides its own controls behind the bar.",
  )
  check(
    "the safe-area inset is respected at the top",
    /env\(safe-area-inset-top\)/.test(screen),
  )
  check(
    "the search input cannot trigger iOS zoom-on-focus",
    /text-\[16px\]/.test(screen),
    "        Anything under 16px makes Safari zoom the page when focused.",
  )
  check(
    "the map measures its own height in fill mode",
    /height: fill \? el\.clientHeight : height/.test(read("components/shipping/locker-map-picker.tsx")),
    "        That is what survives an address-bar collapse or a rotation, since\n" +
      "        neither changes any React state.",
  )
  check(
    "the results are usable without touching the map",
    /function LockerList/.test(screen) && /aria-current=/.test(screen),
  )
  check(
    "the list and map agree on which locker is highlighted",
    /focusedId=\{focused\?\.id \?\? null\}/.test(screen) && /value=\{focused\}/.test(screen),
  )
  check(
    "the map reports its bounds only after it settles",
    (() => {
      // Panning fires no React state, so `centre`/`zoom` change only when a
      // gesture commits. That makes this the equivalent of a map library's
      // moveend — a hundred-frame pan produces one call, not a hundred.
      const m = stripComments(read("components/shipping/locker-map-picker.tsx"))
      const i = m.indexOf("onBoundsChange({")
      return i > -1 && /\}, \[centre, zoom, size\.width, size\.height, onBoundsChange\]\)/.test(m)
    })(),
  )
  check(
    "the top-left corner is the MAXIMUM latitude",
    /maxLat: topLeft\.lat/.test(read("components/shipping/locker-map-picker.tsx")),
    "        Latitude runs opposite to y. Getting it backwards yields an empty\n" +
      "        rectangle every single time.",
  )
  check(
    "a tiny map movement does not refetch",
    /movedEnough/.test(screen) && /spanLat \/ 5/.test(screen),
  )
  check(
    "a zoom always refetches, even when the corner barely moved",
    /Math\.abs\(b\.maxLat - b\.minLat\) - spanLat\) > spanLat \/ 10/.test(screen),
    "        Zooming is exactly when new lockers become relevant.",
  )
  check(
    "panning back somewhere already seen costs nothing",
    /cache\.current\.get\(cacheKey\)/.test(screen) && /cache\.current\.set\(cacheKey/.test(screen),
  )
  check(
    "the viewport cache is bounded",
    /cache\.current\.size > \d+/.test(screen),
    "        Without a bound it grows for as long as somebody keeps panning.",
  )
  check(
    "typing replaces the viewport query rather than intersecting it",
    /query\.trim\(\)\.length >= MIN_QUERY \? null : bounds/.test(screen),
    "        Someone searching 'Cluj' wants Cluj, not the lockers currently on\n" +
      "        screen that happen to match the word.",
  )
  check(
    "a truncated result says so",
    /Apropie harta pentru a le vedea pe toate/.test(screen),
  )
  check(
    "the checkout row summarises the choice and offers Change",
    (() => {
      const c = read("components/shipping/delivery-choice.tsx")
      return /Schimbă/.test(c) && /setPickerOpen\(true\)/.test(c)
    })(),
  )
}

/* ── CLUSTERING ──────────────────────────────────────────────────────────── */
{
  const at = (id: number, lat: number, lng: number) => ({ id, latitude: lat, longitude: lng })

  check(
    "lockers on top of each other become one marker with a count",
    (() => {
      // Three within a few metres, one a kilometre away.
      const c = clusterByScreenGrid(
        [at(1, 44.4268, 26.1025), at(2, 44.42681, 26.10251), at(3, 44.42682, 26.10252), at(4, 44.44, 26.13)],
        12,
      )
      return c.length === 2 && c.some((g) => g.items.length === 3) && c.some((g) => g.items.length === 1)
    })(),
  )
  check(
    "zooming in breaks a cluster apart",
    (() => {
      const pts = [at(1, 44.4268, 26.1025), at(2, 44.4288, 26.1045)]
      const grouped = clusterByScreenGrid(pts, 11)
      const separate = clusterByScreenGrid(pts, 17)
      return grouped.length < separate.length && separate.length === 2
    })(),
  )
  check(
    "a cluster sits on its members, not on the grid cell",
    (() => {
      // Identical coordinates, so the pair is guaranteed into one cell — an
      // earlier version used two points 22 m apart and they straddled a cell
      // boundary, which is a REAL artefact of grid clustering and is documented
      // in lib/shipping/cluster.ts rather than tuned around here.
      const c = clusterByScreenGrid([at(1, 44.42, 26.1), at(2, 44.42, 26.1)], 12)
      const g = c[0]
      return g.items.length === 2 && g.centre.lat === 44.42 && g.centre.lng === 26.1
    })(),
  )
  check(
    "the centre is the mean of the members, not of the cell",
    (() => {
      // Two points that DO share a cell at a low zoom, where cells are large.
      const c = clusterByScreenGrid([at(1, 44.0, 26.0), at(2, 44.02, 26.02)], 8)
      if (c.length !== 1) return false
      return Math.abs(c[0].centre.lat - 44.01) < 1e-9 && Math.abs(c[0].centre.lng - 26.01) < 1e-9
    })(),
  )
  check(
    "tapping a cluster zooms enough to separate it, and not absurdly far",
    (() => {
      const c = clusterByScreenGrid([at(1, 44.4268, 26.1025), at(2, 44.4272, 26.1029)], 12)
      const target = zoomToBreakUp(c[0], 12)
      return target > 12 && target <= 16
    })(),
    "        Jumping ten levels because two lockers share a doorway is\n" +
      "        disorienting, and at that point they are the same place.",
  )
  check(
    "members with no coordinates are excluded rather than placed at (0,0)",
    (() => {
      const c = clusterByScreenGrid(
        [at(1, 44.4268, 26.1025), { id: 2, latitude: null, longitude: null }],
        12,
      )
      return c.length === 1 && c[0].items.length === 1
    })(),
  )
  check(
    "the objects that come out are the ones that went in",
    (() => {
      // So a marker can hand one straight to onSelect without a lookup.
      const original = { id: 7, latitude: 44.4, longitude: 26.1, name: "X" }
      const c = clusterByScreenGrid([original], 12)
      return (c[0].items[0] as typeof original).name === "X"
    })(),
  )
  check(
    "cluster keys are zoom-scoped so React remounts rather than animating",
    (() => {
      const pts = [at(1, 44.4268, 26.1025)]
      return clusterByScreenGrid(pts, 12)[0].key !== clusterByScreenGrid(pts, 13)[0].key
    })(),
  )
  check(
    "clustering runs on zoom changes, never during a pan",
    (() => {
      // Memoised on the pin ids and the zoom. Panning changes neither, and
      // panning does not re-render at all — so a drag never re-clusters.
      const src = stripComments(read("components/shipping/locker-map-picker.tsx"))
      const i = src.indexOf("clusterByScreenGrid(")
      const around = src.slice(Math.max(0, i - 200), i + 400)
      return /useMemo\(/.test(around) && /join\(","\), zoom\]/.test(around)
    })(),
  )
  check(
    "a cluster marker does not guess which locker was meant",
    (() => {
      const src = read("components/shipping/locker-map-picker.tsx")
      const block = src.slice(src.indexOf("if (cluster.items.length > 1)"), src.indexOf("// ── ONE LOCKER"))
      return /setZoom\(/.test(block) && !/onSelect\(/.test(block)
    })(),
  )
}

/* ── THE LOCKER SEARCH ───────────────────────────────────────────────────── */
check(
  "locker search folds diacritics, so 'Bucuresti' finds 'București'",
  /normalize\("NFD"\)/.test(lockersRoute),
)
check(
  "the locker response is capped, and says when it capped",
  // The cap is now geographic when a viewport is given and a count otherwise.
  // Either way it is bounded — 2,276 normalised lockers is half a megabyte,
  // which is not a thing to send to a phone because somebody panned.
  /const MAX_RESULTS = \d+/.test(lockersRoute) &&
    /const MAX_IN_BOUNDS = \d+/.test(lockersRoute) &&
    /\.slice\(0, cap\)/.test(lockersRoute) &&
    /truncated/.test(lockersRoute),
)
check(
  "a viewport query is allowed more results than a blind one",
  (() => {
    const blind = Number(lockersRoute.match(/const MAX_RESULTS = (\d+)/)?.[1] ?? 0)
    const bounded = Number(lockersRoute.match(/const MAX_IN_BOUNDS = (\d+)/)?.[1] ?? 0)
    return blind > 0 && bounded > blind
  })(),
  "        A viewport is already bounded by geography, so the count cap can be\n" +
    "        looser without the response growing without limit.",
)
check(
  "lockers are filtered to the visible rectangle when one is given",
  /const bboxParam = url\.searchParams\.get\("bbox"\)/.test(lockersRoute) &&
    /la >= bbox\.minLat && la <= bbox\.maxLat/.test(lockersRoute),
  "        THE FIX FOR 'SOME LOCKERS ARE INVISIBLE'. Bucharest has 2,276 active\n" +
    "        lockers and the response returned 60, so 2,216 never reached the\n" +
    "        browser. It looked like a rendering fault and was a truncation.",
)
check(
  "the bounding box is sorted rather than trusted",
  /Math\.min\(bboxParts\[0\], bboxParts\[2\]\)/.test(lockersRoute),
  "        Corners in the other order would otherwise yield an empty rectangle\n" +
    "        and an empty map.",
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

/* ── POSTAGE: THE NUMBER ON THE SCREEN AND THE NUMBER ON THE CARD ─────────── */
//
// A checkout that displays one total and charges another is the worst bug this
// area can have, and it is not caught by looking at the page. These are the
// structural reasons it cannot happen.
{
  const quoteLib = read("lib/shipping/quote.ts")
  const quoteRoute = read("app/api/shipping/quote/route.ts")
  const session = read("app/api/checkout/stripe-session/route.ts")
  const checkout = read("components/checkout/marketplace-checkout.tsx")

  check(
    "the price the card is charged is quoted by the server, not sent by the browser",
    (() => {
      const s = stripComments(session)
      const block = s.slice(s.indexOf("let shippingCents"), s.indexOf("const pricing = priceCheckout"))
      // shippingCents is only ever assigned from the server's own quote.
      return /shippingCents = quote\.cents/.test(block) && !/shippingCents = (Number\()?expectedShippingCents/.test(block)
    })(),
    "        Trusting a posted amount means a request claiming zero postage is\n" +
      "        a request that ships for free.",
  )
  check(
    "the amount the buyer was shown is compared, never charged",
    (() => {
      const s = stripComments(session)
      return /quoteMatches\(shown, quote\.cents\)/.test(s) && /shipping_price_changed/.test(s)
    })(),
    "        If the tariff moved while the page was open, the honest answer is\n" +
      "        to show the new number, not to take it quietly.",
  )
  check(
    "a quote the server cannot confirm is never charged as though it were",
    (() => {
      const s = stripComments(session)
      // Quote failed AND the page showed a price → refuse and re-ask. Charging
      // the shown figure would charge an unverified number; charging zero would
      // take a different total than the one on screen.
      return /else if \(shown > 0\) \{[\s\S]{0,400}?shipping_price_changed/.test(s)
    })(),
  )
  check(
    "a delivery quote is only asked for when there is a delivery",
    /deliveryMode === "locker" \|\| deliveryMode === "home"/.test(stripComments(session)),
    "        Every digital purchase runs through this route and must reach the\n" +
      "        courier's price endpoint exactly never.",
  )
  check(
    "the quote resolves a locker's address from the provider, not from the request",
    (() => {
      const s = stripComments(quoteLib)
      const block = s.slice(s.indexOf('if (input.mode === "locker")'), s.indexOf("} else {"))
      return (
        /listFixedLocations\("RO"\)/.test(block) &&
        /locker\.county_name/.test(block) &&
        /locker\.locality_name/.test(block) &&
        !/input\.county|input\.locality/.test(block)
      )
    })(),
    "        Otherwise one city's locker id can be paired with another city's\n" +
      "        street and priced as though it were local.",
  )
  check(
    "a locker on another carrier's network cannot be quoted",
    /Number\(locker\.carrier_id\) !== carrierId/.test(stripComments(quoteLib)),
    "        Locker→locker needs both ends on one network; the seller's drop-off\n" +
      "        point decides which.",
  )
  check(
    "the quote and the AWB ship from the same origin",
    // One senderAddress(), imported. A second copy of those environment reads
    // would drift, and the drift is a buyer charged for one route and a parcel
    // booked on another.
    /import \{ senderAddress, senderCarrierId \}/.test(quoteLib) &&
      /export function senderAddress\(\)/.test(read("lib/shipping/create-awb.ts")),
  )
  check(
    "quoting creates nothing and spends nothing",
    (() => {
      const s = stripComments(quoteLib)
      return /getPrices\(/.test(s) && !/createOrder\(/.test(s)
    })(),
    "        The price endpoint is non-mutating; the order endpoint books a\n" +
      "        courier and debits a prepaid wallet.",
  )
  check(
    "an unconfigured courier account degrades to no postage, never to a guess",
    (() => {
      const s = stripComments(quoteLib)
      return /shippingQuoteConfigured\(\)/.test(s) && /code: "not_configured"/.test(s)
    })(),
    "        Inventing a plausible number means charging for a service nobody\n" +
      "        has priced.",
  )
  check(
    "the price is converted into the currency actually being charged",
    (() => {
      const s = stripComments(quoteLib)
      // The provider bills in lei; the card may not be charged in lei yet.
      return /PLATFORM_CURRENCY === "ron"/.test(s) && /USD_RATES\.RON/.test(s)
    })(),
    "        Adding lei to a dollar total is a 4.6× error in whichever direction\n" +
      "        nobody notices first.",
  )
  check(
    "the quote endpoint answers failures with 200 and a code",
    (() => {
      const s = stripComments(quoteRoute)
      const block = s.slice(s.indexOf("if (!result.ok)"), s.indexOf("return NextResponse.json({\n    ok: true"))
      return /code: result\.code/.test(block) && !/status: 4|status: 5/.test(block)
    })(),
    "        'That locker is on another network' is a normal thing for a\n" +
      "        checkout to hear, not a malformed request.",
  )
  check(
    "the quote response carries no account details",
    (() => {
      const s = stripComments(quoteRoute)
      const body = s.slice(s.indexOf("ok: true"))
      return !/api_key|apiKey|billing_address|EAWB_|balance|wallet/i.test(body)
    })(),
  )
  check(
    "the failed-quote log does not print the seller's contact details",
    (() => {
      const s = stripComments(quoteLib)
      const line = s.slice(s.indexOf("console.error"), s.indexOf("console.error") + 200)
      return !/shipment|payload|address_from|phone|email/.test(line)
    })(),
    "        senderAddress() carries a phone number and an email; a price\n" +
      "        failure is not worth printing them for.",
  )
  check(
    "the total on the page and the amount charged come from one function",
    /priceCheckout\(/.test(checkout) && /priceCheckout\(/.test(session),
    "        Two implementations of the same arithmetic is the bug this whole\n" +
      "        module exists to prevent.",
  )
  /* ── THE SHAPE OF THE PAGE ────────────────────────────────────────────────
     Five sections, in this order, each one card summarising one decision. */
  {
    const s = stripComments(checkout)
    const parts = read("components/checkout/delivery-options.tsx")

    check(
      "the sections appear once each, in the order they are read",
      (() => {
        const order = ["Adresă", "Opțiune de livrare", "Detalii de livrare", "Plată", "Detalii preț"]
        const at = order.map((label) => {
          if (label === "Opțiune de livrare") return s.indexOf("<DeliveryOptions")
          if (label === "Plată") return s.indexOf("<PaymentCard")
          if (label === "Detalii preț") return s.indexOf("<PriceBreakdown")
          return s.indexOf(`label="${label}"`)
        })
        return at.every((i) => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
      })(),
    )
    check(
      "there is exactly one address section",
      // It used to be two — "Adresă de livrare" and "Date de contact" — which
      // left somebody guessing which of them held the field they wanted.
      (s.match(/<AddressCard/g) ?? []).length === 1,
    )
    check(
      "everything about the recipient lives behind that one card",
      (() => {
        const sheet = stripComments(read("components/checkout/address-sheet.tsx"))
        return /label="Telefon"/.test(sheet) && /label="Nume complet"/.test(sheet) && /needsEmail &&/.test(sheet)
      })(),
    )
    check(
      "a locker delivery does not demand the buyer's street",
      // The locker's own id says where the parcel goes. Asking for a house
      // number as well is asking for something that will never be used.
      /const needsStreet = method === "home"/.test(s) && /needsStreet && !isAddressComplete/.test(s),
    )
    check(
      "the total is shown once, in the bar, not twice",
      (() => {
        const bd = stripComments(read("components/checkout/price-breakdown.tsx"))
        // Two copies a couple of centimetres apart is a page that can be caught
        // arguing with itself in front of the buyer.
        return !/Total de plată/.test(bd) && /Total de plată/.test(read("components/checkout/sticky-pay-bar.tsx"))
      })(),
    )
    check(
      "the cards share one set of measurements",
      (() => {
        // A heading constant and a card constant, both used rather than
        // re-typed, so five sections cannot become five different screens.
        const usesHeading = /const HEADING = /.test(parts) && /className=\{HEADING\}/.test(parts)
        const noStrayHeadings = !/text-\[16px\] font-bold text-neutral-900">(Adresă|Plată|Detalii)/.test(s)
        return usesHeading && noStrayHeadings
      })(),
    )
    check(
      "an empty row offers a plus and a filled one a pencil",
      /filled \? <Pencil/.test(stripComments(parts)) && /: <Plus/.test(stripComments(parts)),
      "        The icon carries the whole message, which is what keeps these\n" +
        "        rows one line tall instead of wrapping a word onto a second.",
    )
    check(
      "the card is named in type, not in shipped trademark artwork",
      (() => {
        const cs = stripComments(read("components/checkout/card-sheet.tsx"))
        return /se termină cu/.test(cs) && !/\.svg|\.png|data:image/.test(cs)
      })(),
    )
  }

  check(
    "the buyer is told when postage could not be priced",
    /activeQuote\.status === "unavailable"/.test(checkout),
    "        Silently omitting the line reads as free shipping.",
  )
  check(
    "a superseded quote cannot overwrite a newer one",
    /if \(mine !== quoteSeq\.current\) return/.test(checkout),
    "        Switching locker twice quickly would otherwise leave the first\n" +
      "        answer on screen next to the second locker.",
  )
  check(
    "the header is pinned and carries its background through the status bar",
    (() => {
      const s = stripComments(checkout)
      const header = s.slice(s.indexOf("<header"), s.indexOf("</header>"))
      // Pinned by LAYOUT now, not by `sticky`: the page is exactly the viewport
      // and the content scrolls in its own box, so the header simply cannot
      // move. That also removes the last thing `sticky` could break on — a
      // transformed ancestor during a navigation.
      return (
        /h-\[100dvh\] flex-col overflow-hidden/.test(s) &&
        /shrink-0 border-b/.test(header) &&
        /paddingTop: "env\(safe-area-inset-top\)"/.test(header)
      )
    })(),
    "        Padding that starts BELOW the inset leaves the clock and signal\n" +
      "        strength sitting on whatever the page is scrolled to.",
  )
  check(
    "the checkout has a way back and a way out",
    (() => {
      const s = stripComments(checkout)
      const header = s.slice(s.indexOf("<header"), s.indexOf("</header>"))
      // Back to the item for somebody still deciding; the feed for somebody
      // who has decided not to. With only one of them, the other person
      // presses back repeatedly.
      return /onClick=\{goBack\}/.test(header) && /href="\/"/.test(header)
    })(),
  )
  check(
    "back reverses the navigation rather than pushing a new one",
    (() => {
      const s = stripComments(checkout)
      // history.back() is the move the app already animates in reverse, and it
      // is what lets the listing — and the feed behind it — restore their own
      // scroll positions. Pushing plays a FORWARD transition to a page you just
      // came from. The push is only the cold-arrival fallback.
      return /cameFromApp\.current\) router\.back\(\)/.test(s) && /router\.push\(getListingUrl\(product\.slug\)\)/.test(s)
    })(),
  )
  check(
    "back points at the current listing route, not the old subdomain URL",
    // getProductUrl builds https://<seller>.storelib.com/p/<slug> — a different
    // origin, so it is a full document load out of the app to a page that is no
    // longer where listings live.
    !/getProductUrl/.test(stripComments(checkout)) && /getListingUrl/.test(stripComments(checkout)),
  )
  check(
    "the press is acknowledged before the navigation, not after it",
    /onPointerDown=\{\(\) => void triggerHaptic\("light"\)\}/.test(stripComments(checkout)),
    "        A click event on iOS arrives after the browser has decided the\n" +
      "        touch was not a scroll or a double-tap. Feedback then is feedback\n" +
      "        after the fact, which is what reads as lag.",
  )
  check(
    "nothing on the checkout is frosted glass",
    (() => {
      // A blur behind a header or a payment total smears the photo and the
      // price through it as the page scrolls, which reads as a rendering fault.
      const files = ["components/checkout/marketplace-checkout.tsx", "components/checkout/sticky-pay-bar.tsx"]
      return files.every((f) => !/backdrop-blur/.test(read(f)))
    })(),
  )
  check(
    "the pay button is never greyed out",
    (() => {
      const bar = stripComments(read("components/checkout/sticky-pay-bar.tsx"))
      const s = stripComments(checkout)
      // A washed-out pay button says you cannot buy and nothing about what to
      // do instead. Only `busy` refuses the press, because the money is already
      // moving; anything missing sends the buyer to the field that is missing.
      return (
        /disabled=\{busy\}/.test(bar) &&
        !/disabled:opacity/.test(bar) &&
        /if \(showFirstGap\(\)\) return/.test(s)
      )
    })(),
  )
  check(
    "the page is exactly the viewport, so nothing exists below the pay bar",
    (() => {
      const s = stripComments(checkout)
      // The grey strip under the button was the area below a document that had
      // run out of content. With the page fixed to the viewport height and the
      // content scrolling in its own box, the document never scrolls and there
      // is no "below" to see.
      return /h-\[100dvh\] flex-col overflow-hidden/.test(s) && /min-h-0 flex-1 overflow-y-auto/.test(s)
    })(),
  )
  check(
    "the last price row is not flush against the bar",
    /pb-8 pt-5/.test(stripComments(checkout)),
  )
  check(
    "a missing field is named under ITS OWN section, not over the button",
    (() => {
      const s = stripComments(checkout)
      // A message at the bottom of the screen naming a field near the top says
      // what is wrong and nothing about where.
      return (
        /<GapNote\s+show=\{gap === "address"\}/.test(s) &&
        /<GapNote\s+show=\{gap === "locker"\}/.test(s) &&
        /<GapNote\s+show=\{gap === "card"\}/.test(s)
      )
    })(),
  )
  check(
    "pressing pay glides to what is missing rather than yanking a subpage open",
    (() => {
      const s = stripComments(checkout)
      // A full screen appearing because you pressed a button labelled "Pay" is
      // a place you did not ask to be.
      return (
        /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/.test(s) &&
        !/setSheet\("address"\)\s*\n\s*return true/.test(s)
      )
    })(),
  )
  check(
    "the marker clears itself once the gap is filled",
    /if \(fixed\) setGap\(null\)/.test(stripComments(checkout)),
    "        Otherwise a red line stays under a row that is now complete.",
  )
  check(
    "every subpage arrives on the same slide",
    (() => {
      const files = [
        "components/checkout/address-sheet.tsx",
        "components/checkout/card-sheet.tsx",
        "components/shipping/locker-screen.tsx",
      ]
      // Two different easings for two kinds of panel in one flow is precisely
      // what reads as unfinished.
      return files.every((f) => /full-screen-sheet/.test(read(f)))
    })(),
  )
  check(
    "the slide mounts off-screen first, and stays mounted while it leaves",
    (() => {
      const sheet = stripComments(read("components/checkout/full-screen-sheet.tsx"))
      // Set the final transform in the mounting frame and the browser collapses
      // the two states into one — nothing animates. Unmount on close and the
      // panel vanishes instead of leaving. Both are as abrupt as no animation.
      return (
        /void el\.offsetHeight/.test(sheet) &&
        /requestAnimationFrame\(\(\) => slide\("in"\)\)/.test(sheet) &&
        /setTimeout\([\s\S]{0,120}?setMounted\(false\)/.test(sheet)
      )
    })(),
  )
  check(
    "the slide animates transform and nothing else",
    (() => {
      const sheet = stripComments(read("components/checkout/full-screen-sheet.tsx"))
      // Anything else drops it onto the main thread, where it competes with
      // React and with Stripe's iframes.
      return /transition = `transform /.test(sheet) && !/transition = `(width|height|top|left|opacity)/.test(sheet)
    })(),
  )
  check(
    "the fraud frame is disabled without asking what platform this is",
    (() => {
      const loader = stripComments(read("lib/stripe-client.ts"))
      // A runtime platform check was the one part of the previous fix that
      // could silently not apply — there is no way to be sure from here what a
      // given device's user-agent says, or whether the Capacitor global is on
      // `window` yet when the checkout mounts.
      return (
        /loadStripe\.setLoadParameters\(\{ advancedFraudSignals: false \}\)/.test(loader) &&
        !/isNativeWebView|Capacitor/.test(loader)
      )
    })(),
  )
  check(
    "the fee explanation is a real sheet, not a line that unfolds",
    (() => {
      const bd = stripComments(read("components/checkout/price-breakdown.tsx"))
      // Four sentences wedged between two price rows push the total off screen
      // at the exact moment somebody is deciding.
      return /<BottomSheet/.test(bd) && !/openInfo === line\.label/.test(bd)
    })(),
  )
  check(
    "the page reserves no empty space for a bar that never covered anything",
    (() => {
      const bar = stripComments(read("components/checkout/sticky-pay-bar.tsx"))
      return /PAY_BAR_SPACER = ""/.test(bar) && !/PAY_BAR_SPACER/.test(stripComments(checkout))
    })(),
  )
  check(
    "the item card shows what was actually bought",
    (() => {
      const parts = stripComments(read("components/checkout/delivery-options.tsx"))
      // Title and price alone left a hand's width of nothing between them,
      // which reads as something failing to load.
      return /Marcă/.test(parts) && /Mărime/.test(parts) && /Stare/.test(parts) && !/mt-auto/.test(parts)
    })(),
  )
  check(
    "one condition lookup, shared",
    (() => {
      const card = read("components/explore/mobile-listing-card.tsx")
      return (
        /export function conditionLabel/.test(read("lib/marketplace/categories.ts")) &&
        !/function conditionLabel/.test(card) &&
        /conditionLabel/.test(read("app/checkout/page.tsx"))
      )
    })(),
    "        Two copies is two places for \"very_good\" to come out as raw\n" +
      "        snake_case on one screen and as a label on the other.",
  )
  check(
    "returning to the feed does not undo its own scroll restore",
    (() => {
      const feed = stripComments(read("components/explore/mobile-feed.tsx"))
      // An effect with a dependency array ALSO runs on mount, and coming back
      // from a listing is a mount — so the two scroll-to-top effects fired two
      // frames after the restore and threw it away. They now skip the first
      // run, which is the only run that was never a change.
      return /catSettled\.current/.test(feed) && /tabSettled\.current/.test(feed)
    })(),
  )
  /* ── STAYING INSIDE THE APP ───────────────────────────────────────────────
     Opening the checkout in the native app navigated the whole WebView to
     https://js.stripe.com/v3/m-outer-<hash>.html — Stripe's advanced fraud
     signals frame — and the buyer ended up in Safari mid-purchase. */
  {
    const loader = read("lib/stripe-client.ts")
    const guard = read("lib/stripe-nav-guard.ts")

    check(
      "advanced fraud signals are switched off the way Stripe actually reads it",
      /loadStripe\.setLoadParameters\(\{ advancedFraudSignals: false \}\)/.test(stripComments(loader)),
      "        It is a LOAD parameter. Passed as the second argument to\n" +
        "        loadStripe() it lands in StripeConstructorOptions and is dropped\n" +
        "        silently — which is exactly what was happening.",
    )
    check(
      "nobody passes it as a constructor option any more",
      (() => {
        // A @ts-ignore over an option Stripe's own typings do not have was the
        // tell that it was never being read.
        const files = [
          "lib/stripe-client.ts",
          "components/checkout/marketplace-checkout.tsx",
          "app/checkout/checkout-client.tsx",
          "components/app/billing/checkout-modal.tsx",
          "app/app/checkout/CheckoutClient.tsx",
        ]
        return files.every((f) => !/\{ advancedFraudSignals: false \} : undefined/.test(read(f)))
      })(),
    )
    check(
      "the fraud frame is blocked as well as disabled",
      // The guard matched "controller" only, so m-outer walked through all
      // four of its layers untouched.
      /\(controller\|m-outer\)/.test(guard),
    )
    check(
      "the frames that ARE the payment form are never blocked",
      (() => {
        const re = /const CONTROLLER_IFRAME_RE = (.+)/.exec(stripComments(guard))?.[1] ?? ""
        // elements-inner-* is the card input itself; blocking it means a
        // checkout with no card fields in it.
        return !/elements|link-|payment-element/.test(re)
      })(),
    )
    check(
      "Stripe.js is never loaded at module scope",
      (() => {
        const files = [
          "components/checkout/marketplace-checkout.tsx",
          "app/checkout/checkout-client.tsx",
          "components/app/billing/checkout-modal.tsx",
          "app/app/checkout/CheckoutClient.tsx",
        ]
        // A module-scope call runs on import and locks the load parameters
        // before any other checkout on the page can choose them — so the flag
        // above would be lost to whichever module imported first.
        return files.every((f) => !/^const stripePromise = loadStripe\(/m.test(stripComments(read(f))))
      })(),
    )
    check(
      "one loader, so the decision is made once",
      ["components/checkout/marketplace-checkout.tsx", "app/checkout/checkout-client.tsx"].every((f) =>
        /from "@\/lib\/stripe-client"/.test(read(f)),
      ),
    )
    check(
      "the marketplace checkout loads Stripe only when a card is needed",
      (() => {
        const s = stripComments(checkout)
        return /<Elements stripe=\{stripePromise\}>/.test(s) && /onNeedStripe\(\)/.test(s)
      })(),
      "        Loading it on page open puts the fraud frame and the controller\n" +
        "        frame live while somebody is still choosing an easybox.",
    )
  }

  check(
    "the card number never reaches this application",
    (() => {
      const s = stripComments(read("components/checkout/card-sheet.tsx"))
      // Stripe's own iframes, and a PaymentMethod id is all that comes back.
      return (
        /CardNumberElement/.test(s) &&
        /stripe\.createPaymentMethod\(/.test(s) &&
        !/fetch\(/.test(s)
      )
    })(),
  )
  check(
    "a payment that succeeded is never presented as retryable",
    (() => {
      const s = stripComments(checkout)
      const block = s.slice(s.indexOf("confirm-payment"))
      // The money HAS moved by this point. "Try again" here is an invitation to
      // pay twice.
      return /Plata a reușit/.test(block) && !/încearcă din nou/i.test(block.slice(0, block.indexOf("router.replace")))
    })(),
  )
  check(
    "every subpage commits on its own save and discards on close",
    ["components/checkout/address-sheet.tsx", "components/checkout/card-sheet.tsx"].every((f) => {
      const s = stripComments(read(f))
      // onSave is called from the save button only — never from onClose.
      return /onSave\(/.test(s) && !/onClose = [\s\S]{0,80}onSave/.test(s)
    }),
    "        Opening a subpage to check what you typed must never be able to\n" +
      "        clear it.",
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

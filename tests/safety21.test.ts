/**
 * Round 21 safety review: what the last rounds added, attacked and then held.
 *
 *   the live router of an imported theme never sends a visitor to another
 *   site: /%2F%2Fevil.example and the theme's old Shopify host followed by
 *   //evil.example both stay on the shop
 *   a payouts sheet link: tampered, swapped, expired or for a closed store,
 *   it opens nothing
 *   an order line named twice in one request counts twice, so nobody ships
 *   or returns more than was bought
 *   a ticket's earlier payment form is closed before a new one opens, and no
 *   form outlives its held seat, so a member is never charged twice for one
 *   ticket and a seat is never sold after its hold went back
 *   the perf beacon refuses a body that says it is too big before reading it
 *
 *   npx tsx tests/safety21.test.ts
 */
import { readFileSync } from "node:fs"
import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import { answer, onSitePath, type SiteData } from "@/lib/storelib-theme/compat/site"
import { siteLink } from "@/lib/storelib-theme/compat/links"
import { SHEET_TTL_MS, signSheetLink, verifySheetLink } from "@/lib/payments/stripe/app-sheet-link"
import { mergeItemQuantities, unfulfilledQuantities } from "@/lib/physical/status"
import { EVENT_FORM_MINUTES, EVENT_HOLD_MINUTES, closeEarlierForm, eventCheckoutParams, startEventCheckout, type CheckoutDeps } from "@/lib/communities/server/event-checkout"
import { resetTicketsReady } from "@/lib/communities/server/event-tickets"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

/** Where a browser goes for a Location header answered on https://shop.example. */
const landsOn = (location: string) => new URL(location, "https://shop.example/page").host

type Row = Record<string, any>

async function main() {
  /* ── Open redirects on imported theme sites ──────────────────────────── */
  console.log("\nAn imported theme's live site keeps its visitors")
  const facts = { pages: ["home", "collection", "page"], products: [], collections: [] }
  for (const raw of ["//old.myshopify.com//evil.example", "https://old.myshopify.com//evil.example/a", "//old.myshopify.com/\\evil.example"]) {
    const to = siteLink(raw, facts, { pageFallback: false })
    check(`the old store's ${JSON.stringify(raw)} becomes a page of this site`, landsOn(to) === "shop.example", to)
  }
  check("an ordinary old store link still lands where it did", siteLink("https://old.myshopify.com/collections/all?x=1", facts) === "/collections/all?x=1")
  check("and the old store's home is the home page", siteLink("https://old.myshopify.com", facts) === "/")
  check("a link to another site is left as the creator wrote it", siteLink("https://example.org/x", facts) === "https://example.org/x")

  const site = {} as SiteData
  const get = (path: string, query: string) => answer(site, { method: "GET", path, query: new URLSearchParams(query), body: null, cart: [] })
  const back = await get("/%2F%2Fevil.example", "sl_cart=clear")
  const location = back.headers?.Location ?? ""
  check("back from paying with a crafted address: the redirect stays on the shop", back.status === 303 && landsOn(location) === "shop.example", location)
  const plain = await get("/collections/all", "sl_cart=clear&page=2")
  check("an ordinary return still keeps its path and query", plain.headers?.Location === "/collections/all?page=2", plain.headers?.Location)
  const post = (returnTo: string) => answer(site, { method: "POST", path: "/localization", query: new URLSearchParams(), body: { return_to: returnTo }, cart: [] })
  for (const r of ["/\\evil.example", "//evil.example", "https://evil.example"]) {
    const res = await post(r)
    check(`a form's return_to ${JSON.stringify(r)} never leaves the shop`, landsOn(res.headers?.Location ?? "") === "shop.example", res.headers?.Location)
  }
  check("a form's own return_to on the shop is kept", (await post("/products/a?b=1")).headers?.Location === "/products/a?b=1")
  check("folding keeps a path that was already the shop's", onSitePath("/a//b") === "/a//b" && onSitePath("//x") === "/x" && onSitePath("/\\x") === "/x" && onSitePath("https://checkout.example/x") === "https://checkout.example/x")

  /* ── The payouts sheet link ──────────────────────────────────────────── */
  console.log("\nA payouts sheet link opens one creator's form, for half an hour")
  process.env.ORDER_LINK_SECRET = "test-secret-for-safety21-0123456789"
  const C = "11111111-1111-4111-8111-111111111111"
  const U = "22222222-2222-4222-8222-222222222222"
  const now = Date.now()
  const token = signSheetLink({ c: C, u: U, f: "bank" }, now) as string
  check("a fresh link is read back as the creator and form it names", verifySheetLink(token, now)?.c === C && verifySheetLink(token, now)?.f === "bank")
  check("past thirty minutes it opens nothing", verifySheetLink(token, now + SHEET_TTL_MS + 1) === null)
  const [body, sig] = token.split(".")
  const swapped = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), c: "33333333-3333-4333-8333-333333333333" })).toString("base64url")
  check("another creator's id under the same signature opens nothing", verifySheetLink(`${swapped}.${sig}`, now) === null)
  check("a signature cut short opens nothing", verifySheetLink(`${body}.${sig.slice(0, 10)}`, now) === null)
  const longer = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), e: now + 365 * 86_400_000 })).toString("base64url")
  check("a later expiry written in by hand opens nothing", verifySheetLink(`${longer}.${sig}`, now) === null)
  const route = code("app/api/payouts-sheet/route.ts")
  check("a store closed since the link was made opens nothing (deleted_at)", /row\.deleted_at\)\s*return NextResponse\.json\(\{ error: EXPIRED \}/.test(route) && /select\("id, user_id, deleted_at"\)/.test(route))
  check("the owner is read again, never taken from the token alone", /row\.user_id !== link\.u/.test(route))
  const page = readFileSync("app/payouts-sheet/page.tsx", "utf8") + readFileSync("app/payouts-sheet/payouts-sheet.tsx", "utf8")
  check("the token rides in the fragment, leaves the address bar once read, and the page sends no Referer", /referrer: "no-referrer"/.test(page) && /history\.replaceState/.test(page) && /location\.hash/.test(page))

  /* ── An order line named twice ───────────────────────────────────────── */
  console.log("\nOne order line, named twice in a request, counts twice")
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const open = unfulfilledQuantities([{ orderId: A, quantity: 2, fulfilled: 0, returned: 0, requiresShipping: true } as never])
  const asked = [{ orderId: A, quantity: 2 }, { orderId: A, quantity: 2 }]
  const before = asked.every((i) => i.quantity <= (open.get(i.orderId) ?? 0))
  const merged = mergeItemQuantities(asked)
  check("the old check let 2 + 2 through on a line with 2 left (the bug)", before)
  check("merged, it is one entry of 4, which the line's 2 refuses", merged.length === 1 && merged[0].quantity === 4 && merged[0].quantity > (open.get(A) ?? 0))
  const mixed = mergeItemQuantities([{ orderId: A, quantity: 1, restock: true }, { orderId: B, quantity: 0, restock: true }, { orderId: A, quantity: 1.7, restock: false }, { orderId: B, quantity: -3, restock: true }])
  check("nothing, less than nothing and fractions are not items; the first entry's restock choice stays", mixed.length === 1 && mixed[0].quantity === 2 && mixed[0].restock === true, mixed)
  const orders = code("lib/physical/orders-server.ts")
  check("fulfilling and returning both count a line once", (orders.match(/mergeItemQuantities\((?:input\.items|\(Array\.isArray\(p\.items\))/g) ?? []).length === 2)

  /* ── Paid event tickets: one payment, one ticket ─────────────────────── */
  console.log("\nA ticket is paid for once")
  const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
  const EID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d"
  const CREATOR = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
  const BUYER = "00000000-0000-4000-8000-000000000002"
  const iso = (t: number) => new Date(t).toISOString()
  const community = { id: CID, slug: "makers", name: "Makers", status: "published", access: "free", creator_id: CREATOR, events_enabled: true, classroom_enabled: true } as unknown as CommunityRow
  const viewer = { userId: BUYER, member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, perms: null } as unknown as Viewer
  const event = { id: EID, community_id: CID, title: "Paid workshop", description: "", cover_url: null, kind: "online", starts_at: iso(now + 7 * 86_400_000), ends_at: iso(now + 7 * 86_400_000 + 3_600_000), timezone: "UTC", location: null, meeting_url: null, livestream_url: null, capacity: 1, going_count: 0, access: {}, host_id: CREATOR, replay_video_id: null, status: "scheduled", reminder_24h_at: null, reminder_1h_at: null, created_by: CREATOR, created_at: iso(now - 86_400_000), updated_at: iso(now - 86_400_000), price_cents: 2500, currency: "usd", sales_close_at: null, refund_window_hours: 24, refund_policy: null, tickets_sold: 0 }
  let serial = 0
  const holds: Row[] = []
  const world = (): MemDb => {
    resetTicketsReady()
    return memDb(
      { communities: [{ id: CID }], creators: [{ id: CREATOR, stripe_account_id: "acct_live123" }], community_events: [event], community_event_tickets: [], community_event_rsvps: [] },
      {
        unique: { community_event_tickets: [["event_id", "user_id"], ["checkout_session_id"]] },
        rpc: {
          community_event_ticket_hold(a: Row, db: MemDb) {
            holds.push(a)
            const tickets = (db.tables.community_event_tickets ??= []) as Row[]
            const mine = tickets.find((t) => t.event_id === a.p_event && t.user_id === a.p_user)
            if (mine?.status === "paid") return { data: { ok: false, reason: "already_paid" }, error: null }
            const row = mine ?? { id: `20000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, event_id: a.p_event, community_id: CID, user_id: a.p_user, created_at: iso(now) }
            Object.assign(row, { status: "held", source: "purchase", checkout_session_id: a.p_session, amount_cents: 2500, currency: "usd", held_until: iso(now + a.p_minutes * 60_000) })
            if (!mine) tickets.push(row)
            return { data: { ok: true, ticket_id: row.id, held_until: row.held_until, amount_cents: 2500, currency: "usd", seats_left: 0 }, error: null }
          },
        } as never,
      },
    ) as MemDb
  }
  const sessions = new Map<string, { status: "open" | "complete" | "expired" }>()
  const expired: string[] = []
  const stripe = {
    checkout: {
      sessions: {
        async create(params: Row) {
          const id = `cs_test_tab${sessions.size + 1}0000000000`
          sessions.set(id, { status: "open" })
          lastParams = params
          return { id, client_secret: `${id}_secret` }
        },
        async retrieve(id: string) {
          return { id, status: sessions.get(id)?.status ?? "expired", payment_status: sessions.get(id)?.status === "complete" ? "paid" : "unpaid" } as never
        },
        async expire(id: string) {
          const s = sessions.get(id)
          if (!s || s.status !== "open") throw new Error("This Checkout Session is not open")
          s.status = "expired"
          expired.push(id)
          return { id }
        },
      },
    },
  }
  let lastParams: Row = {}
  const deps: CheckoutDeps = {
    stripe: stripe as never,
    ready: async () => true,
    fee: async (cents) => ({ platformFeeCents: Math.round(cents * 0.05) + 30, feePercent: 5, feeFixedCents: 30, planId: "free", pricingTier: "standard", feeRuleVersion: "v1" }),
    chargeCurrency: "usd",
  }
  const db = world()
  const first = await startEventCheckout(db, deps, { community, viewer, eventId: EID, email: null })
  const second = await startEventCheckout(db, deps, { community, viewer, eventId: EID, email: null })
  const firstId = first.ok ? first.sessionId : ""
  check("two tabs each get a form", first.ok === true && second.ok === true, { first, second })
  check("opening the second closed the first, so it cannot be paid as well", sessions.get(firstId)?.status === "expired" && expired.includes(firstId))
  check("the second form stays open", second.ok === true && sessions.get(second.sessionId)?.status === "open")
  const ticket = (db.tables.community_event_tickets as Row[])[0]
  check("the held seat names the open form", second.ok === true && ticket.checkout_session_id === second.sessionId)

  /* The first tab was paid a moment before the second opened. */
  sessions.set(second.ok ? second.sessionId : "", { status: "complete" })
  const third = await startEventCheckout(db, deps, { community, viewer, eventId: EID, email: null })
  check("a form already paid is not followed by a second charge", third.ok === false && third.code === "already_paid", third)
  check("closeEarlierForm says paid, closed or open", (await closeEarlierForm(stripe as never, second.ok ? second.sessionId : "")) === "paid" && (await closeEarlierForm(stripe as never, "cs_missing_000000000")) === "closed")

  console.log("\nNo form outlives its seat")
  const lifetime = Number(lastParams.expires_at) - Math.floor(Date.now() / 1000)
  check("Stripe's form closes before the seat's hold ends, and no sooner than Stripe allows", lifetime >= 30 * 60 - 5 && lifetime <= EVENT_FORM_MINUTES * 60 && EVENT_FORM_MINUTES < EVENT_HOLD_MINUTES, { lifetime, EVENT_FORM_MINUTES, EVENT_HOLD_MINUTES })
  check("the hold is asked for that long", holds.every((h) => h.p_minutes === EVENT_HOLD_MINUTES))
  const params = eventCheckoutParams({ event: event as never, community, buyer: { userId: BUYER, email: null }, creatorId: CREATOR, destination: "acct_live123", currency: "usd", fee: { platformFeeCents: 155, feePercent: 5, feeFixedCents: 30, planId: "free", pricingTier: "standard", feeRuleVersion: "v1" }, now: 1_000_000_000 })
  check("the expiry is counted from when the form is made", params.expires_at === 1_000_000 + EVENT_FORM_MINUTES * 60)

  /* ── The perf beacon ─────────────────────────────────────────────────── */
  console.log("\nThe public speed beacon")
  const beacon = code("app/api/perf/beacon/route.ts")
  const lengthAt = beacon.indexOf('req.headers.get("content-length")')
  check("a body that says it is too big is refused before it is read", lengthAt > 0 && lengthAt < beacon.indexOf("await req.text()"))
  check("and one that lies is still measured after", /text\.length > MAX_BODY_BYTES/.test(beacon))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

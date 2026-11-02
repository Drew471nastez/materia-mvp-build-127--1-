/**
 * ===========================================================================
 *  PHYSICAL READINESS: EACH GAP, THE NOTICES, AND THE SCREENS THAT SHOW IT
 * ===========================================================================
 * lib/physical/readiness.ts against fixture stores, one per gap; the
 * transition that decides when a creator is told; the notice and its
 * reminder through the real engine (tests/notify-memory-store.ts), sent
 * once, capped, skipped once fixed, and never to a buyer; and the source of
 * every screen that draws it.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/physical-readiness.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  NEW_PRODUCT,
  blockingItems,
  fitsSomeRate,
  needsNotice,
  physicalReadiness,
  readinessTransition,
  recommendedItems,
  type PhysicalReadiness,
  type ReadinessFacts,
  type ReadinessProduct,
} from "@/lib/physical/readiness"
import { productsFrom } from "@/lib/physical/readiness-server"
import type { Location, ShippingProfile, ShippingRate } from "@/lib/physical/types"
import { emailChannel } from "@/lib/notify/channels/email"
import { inAppChannel } from "@/lib/notify/channels/in-app"
import { runWork, type EngineDeps } from "@/lib/notify/engine"
import { handle } from "@/lib/notify/orchestrator"
import { emit } from "@/lib/notify/outbox"
import { setPreference } from "@/lib/notify/preferences"
import { REGISTRY } from "@/lib/notify/registry"
import { emailClass } from "@/lib/notify/email-budget"
import { renderEmail, renderInApp } from "@/lib/notify/templates"
import type { ChannelResult, DomainEvent, OutgoingEmail } from "@/lib/notify/types"
import { MemoryNotifyStore } from "./notify-memory-store"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const realLog = console.log
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("{")) return
  realLog(...a)
}
console.warn = () => undefined

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const rate = (o: Partial<ShippingRate> = {}): ShippingRate => ({ id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 500, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: null, maxDays: null, active: true, position: 0, ...o })
const profile = (rates: ShippingRate[], o: Partial<ShippingProfile> = {}): ShippingProfile => ({ id: "gen", name: "General", isDefault: true, zones: [{ id: "z1", profileId: o.id ?? "gen", name: "US", countries: ["US"], regions: [], restOfWorld: false, rates }], ...o })
const location = (o: Partial<Location> = {}): Location => ({
  id: "loc1", name: "Home", kind: "home", country: "US", city: "Austin", addressLine1: "1 Main St", addressLine2: null, region: "TX", postalCode: "78701", phone: null, email: null,
  active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h", pickupHours: null, localDelivery: null, partner: null, ...o,
})
const product = (o: Partial<ReadinessProduct> = {}): ReadinessProduct => ({ id: "p1", title: "Mug", live: true, requiresShipping: true, tracked: true, inStock: true, weightGrams: 400, priceCents: 2000, shippingProfileId: null, locationId: null, ...o })
const ready = (o: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  paymentsReady: true,
  products: [product()],
  profiles: [profile([rate()])],
  locations: [location()],
  defaultLocationId: "loc1",
  packages: 1,
  packageGrams: 100,
  taxMode: "none",
  taxRates: 0,
  contactEmail: true,
  businessDetails: null,
  ...o,
})
const ids = (r: PhysicalReadiness, level?: "blocking" | "recommended") => r.items.filter((i) => !level || i.level === level).map((i) => i.id)

/* ── The answer, one gap at a time ─────────────────────────────────────── */

console.log("\nA store with everything set up")
{
  const r = physicalReadiness(ready())
  check("nothing open, ready, one live product", r.items.length === 0 && r.ready && r.live === 1 && r.physical === 1, r.items)
  check("no physical products: nothing is asked at all", physicalReadiness(ready({ products: [], profiles: [], locations: [] })).items.length === 0)
}

console.log("\nBlocking: each one is what the checkout really refuses")
{
  const pay = physicalReadiness(ready({ paymentsReady: false }))
  check("payments not ready: blocking, to Payouts", ids(pay, "blocking").join() === "payments" && pay.items[0].href === "/app/payouts")
  check("payments unknown (null) claims nothing", physicalReadiness(ready({ paymentsReady: null })).items.length === 0)

  const none = physicalReadiness(ready({ profiles: [] }))
  check("no rate anywhere, no pickup, no local delivery: delivery blocks, to Shipping", ids(none, "blocking").join() === "delivery" && none.items[0].href === "/app/settings?tab=shipping")
  const carrierOnly = physicalReadiness(ready({ profiles: [profile([rate({ kind: "carrier" })])] }))
  check("a carrier rate with no carrier connected is no rate", ids(carrierOnly, "blocking").includes("delivery"))
  const inactive = physicalReadiness(ready({ profiles: [profile([rate({ active: false })])] }))
  check("a switched off rate is no rate", ids(inactive, "blocking").includes("delivery"))
  const emptyZone = physicalReadiness(ready({ profiles: [{ id: "gen", name: "General", isDefault: true, zones: [{ id: "z", profileId: "gen", name: "Nowhere", countries: [], regions: [], restOfWorld: false, rates: [rate()] }] }] }))
  check("a rate in a zone with no places ships nowhere", ids(emptyZone, "blocking").includes("delivery"))
  const pickup = physicalReadiness(ready({ profiles: [], locations: [location({ pickupEnabled: true, pickupHours: "Mon to Fri 9 to 5" })] }))
  check("no rates but local pickup: buyers can still check out, nothing blocks", pickup.ready, pickup.items)
  const local = physicalReadiness(ready({ profiles: [], locations: [location({ localDelivery: { enabled: true, codes: ["787"], priceCents: 0, minOrderCents: null, freeOverCents: null, note: null } })] }))
  check("no rates but local delivery: nothing blocks", local.ready, local.items)
  const digitalOnly = physicalReadiness(ready({ profiles: [], products: [product({ requiresShipping: false })] }))
  check("nothing that ships (a gift card kind of product): no shipping gap", !ids(digitalOnly).includes("delivery"))

  const two = ready({ profiles: [profile([rate()]), { id: "fragile", name: "Fragile", isDefault: false, zones: [] }], products: [product(), product({ id: "p2", title: "Vase", shippingProfileId: "fragile" })] })
  const pr = physicalReadiness(two)
  check("a live product on a profile with no rates: blocking, naming it", ids(pr, "blocking").join() === "profile_rates" && pr.items[0].title === "Vase has no shipping rate" && pr.items[0].products?.join() === "Vase")

  const heavyFirst = physicalReadiness(ready({ profiles: [profile([rate({ kind: "weight", tiers: [{ from: 1000, priceCents: 900 }] })])], packageGrams: 0 }))
  check("a weight rate from 1 kg and a 400 g mug: no price for it, blocking", ids(heavyFirst, "blocking").join() === "rate_fit" && /Mug gets no shipping price/.test(heavyFirst.items[0].title))
  const withBox = physicalReadiness(ready({ profiles: [profile([rate({ kind: "weight", tiers: [{ from: 450, priceCents: 900 }] })])], packageGrams: 100 }))
  check("the box's weight is added the way checkout adds it (400 g + 100 g reaches the 450 g tier)", !ids(withBox).includes("rate_fit"))
  const priceTier = physicalReadiness(ready({ profiles: [profile([rate({ kind: "price", tiers: [{ from: 5000, priceCents: 0 }] })])] }))
  check("a price rate from $50 and a $20 product: blocking", ids(priceTier, "blocking").includes("rate_fit"))
  check("fitsSomeRate prices one unit like ratePrice does", fitsSomeRate(profile([rate()]), { weightGrams: 1, priceCents: 1 }) && !fitsSomeRate(profile([rate({ kind: "weight", maxValue: 10, tiers: [{ from: 0, priceCents: 1 }] })]), { weightGrams: 400, priceCents: 1 }))

  const noLoc = physicalReadiness(ready({ locations: [] }))
  check("a product that tracks stock and no location that fulfils: blocking, to Locations", ids(noLoc, "blocking").join() === "location" && noLoc.items[0].href === "/app/settings?tab=locations")
  check("a location that doesn't fulfil orders counts as none", ids(physicalReadiness(ready({ locations: [location({ fulfillsOrders: false })] })), "blocking").includes("location"))
  check("nothing tracked (made to order): no location needed", !ids(physicalReadiness(ready({ locations: [], products: [product({ tracked: false })] }))).includes("location"))

  const pod = physicalReadiness(ready({ locations: [location(), location({ id: "pf", name: "Printful", kind: "print_on_demand", partner: { provider: "printful", name: "Printful", connected: false } })], products: [product({ locationId: "pf" })] }))
  check("a print on demand location not connected, used by a live product: blocking", ids(pod, "blocking").join() === "partner" && pod.items[0].title === "Connect Printful")
  const podUnused = physicalReadiness(ready({ locations: [location(), location({ id: "pf", name: "Printful", partner: { provider: "printful", name: "Printful", connected: false } })] }))
  check("the same location with no product on it: nothing", !ids(podUnused).includes("partner"))
}

console.log("\nRecommended: it sells, something looks wrong")
{
  check("a live product with no stock: recommended, to Inventory", (() => {
    const r = physicalReadiness(ready({ products: [product({ inStock: false })] }))
    return ids(r, "recommended").join() === "stock" && r.ready && r.items[0].href === "/app/inventory"
  })())
  check("a draft with no stock is not nagged about", !ids(physicalReadiness(ready({ products: [product({ inStock: false, live: false })] }))).includes("stock"))
  const wr = ready({ profiles: [profile([rate({ kind: "weight", tiers: [{ from: 0, priceCents: 500 }] })])], products: [product({ weightGrams: null })], packages: 0, packageGrams: 0 })
  const w = physicalReadiness(wr)
  check("rates by weight and a product with no weight: recommended, to its editor", ids(w, "recommended").includes("weights") && w.items.find((i) => i.id === "weights")?.href === "/app/products/p1")
  check("rates by weight and no box: recommended", ids(w, "recommended").includes("package"))
  check("flat rates: weight and box are not asked for", !ids(physicalReadiness(ready({ products: [product({ weightGrams: null })], packages: 0 }))).some((i) => i === "weights" || i === "package"))
  check("the location it ships from has no street: recommended", ids(physicalReadiness(ready({ locations: [location({ addressLine1: null })] })), "recommended").join() === "ship_from")
  check("pickup on with no hours: recommended", ids(physicalReadiness(ready({ locations: [location({ pickupEnabled: true })] })), "recommended").join() === "pickup_hours")
  check("tax on with no rate: recommended, to Taxes", (() => {
    const r = physicalReadiness(ready({ taxMode: "manual", taxRates: 0 }))
    return ids(r, "recommended").join() === "tax_rates" && r.items[0].href === "/app/settings?tab=taxes"
  })())
  check("tax charged and no business details: recommended", ids(physicalReadiness(ready({ taxMode: "manual", taxRates: 2, businessDetails: false })), "recommended").join() === "business")
  check("business details unknown (part 153 not run): not asked", physicalReadiness(ready({ taxMode: "manual", taxRates: 2, businessDetails: null })).items.length === 0)
  check("no contact email: recommended, to Store details", ids(physicalReadiness(ready({ contactEmail: false })), "recommended").join() === "contact_email")
  check("recommended never makes a store not ready", physicalReadiness(ready({ contactEmail: false, taxMode: "manual" })).ready)
}

console.log("\nWho is checked, and the editor's question")
{
  const draftOnly = ready({ profiles: [], products: [product({ live: false })] })
  const r = physicalReadiness(draftOnly)
  check("nothing on sale: every physical product is checked (Settings' checklist) but none is live", ids(r).includes("delivery") && r.live === 0)
  check("so no notice is due", !needsNotice(r))
  const asLive = physicalReadiness(draftOnly, { asLive: "p1" })
  check("the editor asks with its draft as if published", asLive.live === 1 && ids(asLive).includes("delivery"))
  const fresh = physicalReadiness(ready({ profiles: [], products: [] }), { asLive: NEW_PRODUCT })
  check("a new product not saved yet still learns there is no shipping rate", ids(fresh, "blocking").includes("delivery") && fresh.physical === 0)
  check("and its unknown price and weight are never judged", !ids(physicalReadiness(ready({ profiles: [profile([rate({ kind: "price", tiers: [{ from: 5000, priceCents: 0 }] })])], products: [] }), { asLive: NEW_PRODUCT })).includes("rate_fit"))
  const mixed = ready({ profiles: [], products: [product({ live: false }), product({ id: "p2", title: "Tee", live: true, requiresShipping: false })] })
  check("something live: only the live products are checked", !ids(physicalReadiness(mixed)).includes("delivery"))
}

console.log("\nProducts read the way checkout prices a line")
{
  const loc = [location()]
  const rows = [
    { id: "a", title: "Mug", status: "published", track_inventory: true, weight_grams: 300, price_cents: 1500 },
    { id: "b", title: "Tee", status: "published", continue_selling: true },
    { id: "c", title: "Old", status: "archived" },
    { id: "d", title: "Print", status: "draft", fulfillment_method: "print_on_demand", fulfillment_location_id: "pod" },
  ]
  const variants = [
    { id: "va", product_id: "a", price_cents: 1200, weight_grams: 250 },
    { id: "va2", product_id: "a", active: false, price_cents: 1 },
  ]
  const ps = productsFrom(rows, variants, new Map([["va", 0]]), [...loc, location({ id: "pod", holdsInventory: false, forwarding: "provider" })])
  const byId = new Map(ps.map((p) => [p.id, p]))
  check("archived products are left out", !byId.has("c"))
  check("a tracked product with no stock is out of stock; its inactive option ignored", byId.get("a")?.tracked === true && byId.get("a")?.inStock === false && byId.get("a")?.priceCents === 1200 && byId.get("a")?.weightGrams === 250)
  check("selling past zero is never out of stock", byId.get("b")?.tracked === false && byId.get("b")?.inStock === true)
  check("printed to order never tracks stock", byId.get("d")?.tracked === false && byId.get("d")?.live === false)
  const stocked = productsFrom(rows.slice(0, 1), variants, new Map([["va", 3]]), loc)
  check("stock at a location that fulfils counts", stocked[0].inStock)
  check("stock with no location that fulfils does not", !productsFrom(rows.slice(0, 1), variants, new Map([["va", 3]]), [location({ fulfillsOrders: false })])[0].inStock)
}

/* ── When to tell ──────────────────────────────────────────────────────── */

console.log("\nWhen a creator is told")
{
  const broken = physicalReadiness(ready({ profiles: [] }))
  const fine = physicalReadiness(ready())
  const first = readinessTransition(null, broken)
  check("first look, something live with a gap: tell, episode 1, as 'live'", first.notify?.episode === 1 && first.notify.reason === "live" && first.next.broken)
  const again = readinessTransition(first.next, broken)
  check("still broken: nothing new", again.notify === null && again.next.episode === 1)
  const fixed = readinessTransition(again.next, fine)
  check("fixed: recorded as fine, keeps the count", !fixed.next.broken && fixed.next.episode === 1 && fixed.notify === null)
  const broke = readinessTransition(fixed.next, broken)
  check("ready, then the last rate deleted: tell again, episode 2, as 'broke'", broke.notify?.episode === 2 && broke.notify.reason === "broke")
  check("payments alone is not this notice (payments has its own)", readinessTransition(null, physicalReadiness(ready({ paymentsReady: false }))).notify === null)
  check("a gap with nothing live is not news either", readinessTransition(null, physicalReadiness(ready({ profiles: [], products: [product({ live: false })] }))).notify === null)
  check("skipPayments leaves payments out, and only payments", blockingItems(physicalReadiness(ready({ paymentsReady: false, profiles: [] })), { skipPayments: true }).map((i) => i.id).join() === "delivery")
  check("recommendedItems is the rest", recommendedItems(physicalReadiness(ready({ contactEmail: false }))).length === 1)
}

/* ── The notices, through the engine ───────────────────────────────────── */

const MIN = 60_000
const DAY = 24 * 60 * MIN
const USER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const EMAIL = "maker@example.com"

class FakeProvider {
  readonly name = "fake"
  sent: OutgoingEmail[] = []
  async send(email: OutgoingEmail): Promise<ChannelResult> {
    this.sent.push(email)
    return { status: "sent", providerMessageId: `<m${this.sent.length}@mg.example.com>` }
  }
}

function world() {
  const store = new MemoryNotifyStore()
  store.users.set(USER, { email: EMAIL, name: "Maker" })
  store.creators.set(CREATOR, USER)
  let current: PhysicalReadiness | null = physicalReadiness(ready({ profiles: [] }))
  ;(store as unknown as { physicalReadiness: (id: string) => Promise<PhysicalReadiness | null> }).physicalReadiness = async () => current
  const provider = new FakeProvider()
  const deps: EngineDeps = {
    store,
    providerName: provider.name,
    worker: "w1",
    now: () => store.clock.now,
    email: emailChannel({ provider, render: renderEmail, baseUrl: () => "https://storelib.com", unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`, preferencesUrl: () => "https://storelib.com/app/settings", messageDomain: "mg.example.com" }),
    inApp: inAppChannel(store, { render: renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
  }
  return {
    store,
    provider,
    set: (r: PhysicalReadiness | null) => (current = r),
    run: () => runWork(deps, 10_000),
    raise: (episode: number, reason = "live") =>
      emit({ name: "physical_readiness.not_ready", key: `physical_readiness.not_ready:${CREATOR}:${episode}`, userId: USER, creatorId: CREATOR, entityType: "creator", entityId: CREATOR, payload: { episode, reason }, occurredAt: new Date(store.clock.now).toISOString() }, { db: store, soon: false }),
    later: (ms: number) => (store.clock.now += ms),
    emails: (type: string) => provider.sent.filter((m) => m.tags?.includes(type)),
    jobs: (type: string) => store.jobs.filter((j) => j.type === type),
  }
}

async function main() {
  console.log("\nThe registry")
  const a = REGISTRY.PHYSICAL_STORE_NOT_READY
  const b = REGISTRY.PHYSICAL_STORE_NOT_READY_2
  check("creator only: never a buyer", a.recipient === "creator" && b.recipient === "creator")
  check("optional (the person's settings decide), in Products and store, on by default", a.requirement === "optional_product" && a.category === "product_and_store" && a.defaultOn && b.category === "product_and_store")
  check("a week's cooldown on each: two emails a week at most", a.cooldownSeconds === 7 * 86400 && b.cooldownSeconds === 7 * 86400)
  check("both read the store again before sending", a.condition === "physical_store_not_ready" && b.condition === "physical_store_not_ready")
  check("budgeted under the account's daily email cap", emailClass("PHYSICAL_STORE_NOT_READY") === "budgeted" && emailClass("PHYSICAL_STORE_NOT_READY_2") === "budgeted")
  check("the notice in the bell and by email, the reminder by email", a.channels.includes("in_app") && a.channels.includes("email") && b.channels.join() === "email")

  console.log("\nThe plan")
  const now = Date.parse("2026-10-01T09:00:00Z")
  const ev: DomainEvent = { name: "physical_readiness.not_ready", key: `physical_readiness.not_ready:${CREATOR}:1`, userId: USER, creatorId: CREATOR, entityType: "creator", entityId: CREATOR, payload: { episode: 1, reason: "live" }, occurredAt: new Date(now).toISOString() }
  const p1 = handle(ev, { now, userId: USER, creatorId: CREATOR })
  const p2 = handle(ev, { now: now + 3600_000, userId: USER, creatorId: CREATOR })
  check("one notice 15 minutes on and one reminder 3 days on", p1.jobs.length === 2 && Date.parse(p1.jobs.find((j) => j.type === "PHYSICAL_STORE_NOT_READY")!.runAt) === now + 15 * MIN && Date.parse(p1.jobs.find((j) => j.type === "PHYSICAL_STORE_NOT_READY_2")!.runAt) === now + 3 * DAY)
  check("keyed by the person, the store and the episode: the same event later plans the same keys", JSON.stringify(p1.jobs.map((j) => j.idempotencyKey)) === JSON.stringify(p2.jobs.map((j) => j.idempotencyKey)) && p1.jobs[0].idempotencyKey === `PHYSICAL_STORE_NOT_READY:u:${USER}:${CREATOR}:ep_1`)
  check("the earlier 'finish setting up shipping' nudges give way", p1.cancel.some((c) => c.workflow === "physical_setup"))
  check("an event without an episode plans nothing", handle({ ...ev, payload: {} }, { now, userId: USER, creatorId: CREATOR }).jobs.length === 0)

  console.log("\nSent once, with the list and the links")
  {
    const w = world()
    await w.raise(1)
    await w.raise(1)
    check("the same change raised twice is one event", w.store.events.length === 1)
    await w.run()
    check("nothing goes in the first 15 minutes", w.provider.sent.length === 0 && w.store.bell.length === 0)
    w.later(16 * MIN)
    await w.run()
    const mail = w.emails("PHYSICAL_STORE_NOT_READY")
    check("then one email to the creator, and one bell row", mail.length === 1 && mail[0].to === EMAIL && w.store.bell.filter((r) => r.type === "PHYSICAL_STORE_NOT_READY").length === 1)
    const text = mail[0]?.text ?? ""
    check("it names the gap, why, and links to where it is fixed", /Add a shipping rate/.test(text) && /nobody can buy/.test(text) && /storelib\.com\/app\/settings\?tab=shipping/.test(text), text.slice(0, 600))
    check("plain words: no em dash, no Shopify, no Liquid", !/—/.test(text + mail[0].html) && !/shopify|liquid/i.test(text + mail[0].html))
    check("it carries an unsubscribe (optional mail)", !!mail[0].headers?.["List-Unsubscribe"])
    const bell = w.store.bell.find((r) => r.type === "PHYSICAL_STORE_NOT_READY")
    check("the bell row says it and goes to the fix", /can't be bought/.test(JSON.stringify(bell)) && /tab=shipping/.test(JSON.stringify(bell)))
    await w.run()
    check("running the worker again sends nothing more", w.provider.sent.length === 1)

    w.later(3 * DAY)
    await w.run()
    check("three days on and still broken: one reminder", w.emails("PHYSICAL_STORE_NOT_READY_2").length === 1 && /still/i.test(w.emails("PHYSICAL_STORE_NOT_READY_2")[0].subject))

    console.log("\nCapped")
    w.later(DAY)
    await w.raise(2, "broke")
    await w.run()
    w.later(20 * MIN)
    await w.run()
    check("a second episode inside the week: skipped by the cooldown, no third email that week", w.jobs("PHYSICAL_STORE_NOT_READY").find((j) => j.step === "ep_2")?.skip_reason === "COOLDOWN" && w.provider.sent.length === 2)
    w.later(8 * DAY)
    await w.raise(3, "broke")
    await w.run()
    w.later(20 * MIN)
    await w.run()
    check("a week later a new episode is told again", w.jobs("PHYSICAL_STORE_NOT_READY").find((j) => j.step === "ep_3")?.state === "sent")
  }

  console.log("\nNever after it is fixed, never against the person's settings")
  {
    const w = world()
    await w.raise(1)
    await w.run()
    w.set(physicalReadiness(ready()))
    w.later(16 * MIN)
    await w.run()
    check("fixed in the 15 minutes: nothing sent, skipped as no longer true", w.provider.sent.length === 0 && w.jobs("PHYSICAL_STORE_NOT_READY")[0].skip_reason === "CONDITION_NO_LONGER_TRUE")
    w.later(3 * DAY)
    await w.run()
    check("and the reminder is skipped too", w.jobs("PHYSICAL_STORE_NOT_READY_2")[0].skip_reason === "CONDITION_NO_LONGER_TRUE")
  }
  {
    const w = world()
    w.set(physicalReadiness(ready({ paymentsReady: false })))
    await w.raise(1)
    await w.run()
    w.later(16 * MIN)
    await w.run()
    check("only payments missing: this notice stays quiet (payments has its own)", w.provider.sent.length === 0)
  }
  {
    const w = world()
    await setPreference(w.store, USER, "product_and_store", "email", false, "settings")
    await w.raise(1)
    await w.run()
    w.later(16 * MIN)
    await w.run()
    check("email turned off for Products and store: no email, the bell still has it", w.provider.sent.length === 0 && w.store.bell.some((r) => r.type === "PHYSICAL_STORE_NOT_READY"))
  }
  {
    const w = world()
    w.set(null)
    await w.raise(1)
    await w.run()
    w.later(16 * MIN)
    await w.run()
    check("the store could not be read: the job waits, nothing is guessed", w.provider.sent.length === 0 && w.jobs("PHYSICAL_STORE_NOT_READY")[0].state === "pending")
  }

  /* ── Where it is drawn ───────────────────────────────────────────────── */

  console.log("\nThe screens")
  const home = read("components/app/dashboard-client.tsx")
  check("Home: the banner above the globe banner, payments left to the payouts announcement", /<ReadinessBanner surface="home"/.test(home) && home.indexOf("<ReadinessBanner") < home.indexOf("<HomeBanner") && /skipPayments: surface === "home"/.test(read("components/physical/readiness-banner.tsx")))
  check("Home: the setup card steps aside once something is on sale (one cause, one card)", /readiness\?\.live \?\? 0\) > 0\) return null/.test(read("components/app/home/physical-setup-card.tsx")))
  check("Products: the banner over the list", /<ReadinessBanner surface="products"/.test(read("app/app/products/products-client.tsx")))
  const editor = read("app/app/products/new/product-editor.tsx")
  check("product editor: a note for physical products only, after the payout notice, never blocking", /productType === "physical" \? <ReadinessNote /.test(editor) && editor.indexOf("data-payout-setup-notice") < editor.indexOf("<ReadinessNote") && /skipPayments: true/.test(read("components/physical/readiness-banner.tsx")))
  const banner = read("components/physical/readiness-banner.tsx")
  check("blocking has no close button; recommended does, remembered per list", /function BlockingCard[\s\S]*?<\/section>/.exec(banner)?.[0].includes("aria-label") === false && /aria-label="Hide"/.test(banner) && /localStorage/.test(banner))
  check("banners show only while something physical is on sale", /r\.live === 0\) return null/.test(banner))
  const shipping = read("components/physical/shipping-settings.tsx")
  check("Settings > Shipping and Locations: the checklist, read again when the settings change", /<ReadinessChecklist version=\{readinessVersion\(data\)\}/.test(shipping) && /freshOnOpen: true/.test(read("components/physical/readiness-checklist.tsx")))
  check("a Fix link to another section switches it in place", /storelib:settings-tab/.test(read("components/physical/readiness-client.tsx")) && /addEventListener\("storelib:settings-tab"/.test(read("components/app/settings-form-new.tsx")))
  const builder = read("app/website-builder/editor/[installId]/page.tsx")
  check("the website builder: the notice in the editor's notice stack", /<PhysicalReadinessNotice \/>/.test(builder) && /r\.live === 0/.test(read("components/website-builder/editor/physical-readiness-notice.tsx")))
  const route = read("app/api/physical/readiness/route.ts")
  check("the route is behind the physical switch, for the caller's own store", /physicalCaller\((?:"store", \{ read: true \}|\{ read: true \})?\)/.test(route) && /c\.creatorId/.test(route))
  check("the editor's what-if answer is never recorded as the store's state", /if \(!asLive\) after\(/.test(route))
  const server = read("lib/physical/readiness-server.ts")
  check("cached per store and cleared by the settings saves", /unstable_cache\(/.test(server) && /revalidateTag\(readinessTag/.test(server))
  const saves = ["shipping/rates", "shipping/rates/[id]", "shipping/zones", "shipping/zones/[id]", "shipping/profiles/[id]", "locations", "locations/[id]", "packages", "settings", "tax-rates", "integrations/[provider]"]
  check("every shipping, location, package, tax and integration save recomputes", saves.every((s) => /readinessChanged\(c\)/.test(read(`app/api/physical/${s}/route.ts`))), saves.filter((s) => !/readinessChanged\(c\)/.test(read(`app/api/physical/${s}/route.ts`))))
  check("the notice goes to the store's owner, never the team member who saved", /select\("user_id"\)\.eq\("id", c\.creatorId\)/.test(server))
  const cron = read("app/api/cron/notifications/route.ts")
  check("the hourly cron sweeps before the worker sends", cron.indexOf("sweepPhysicalReadiness(") > 0 && cron.indexOf("sweepPhysicalReadiness(") < cron.indexOf("runNotificationWork("))
  check("SQL part 162 is listed and checked after", /162_physical_readiness_state\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p162_physical_readiness_state/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("the checkout itself is not touched by this work", !/readiness/.test(read("app/checkout/site/site-checkout.tsx")))

  console.log("\nThe words")
  const all = ["lib/physical/readiness.ts", "components/physical/readiness-banner.tsx", "components/physical/readiness-checklist.tsx", "components/website-builder/editor/physical-readiness-notice.tsx"].map(read).join("\n")
  const strings = (all.match(/"[^"\n]*"|`[^`\n]*`/g) ?? []).join("\n")
  check("no em dashes in what a creator reads", !/—/.test(strings))
  check("never Shopify or Liquid in what a creator reads", !/shopify|liquid/i.test(strings))
  check("no AI words", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(strings))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

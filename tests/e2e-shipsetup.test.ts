/**
 * QUICK SETUP THROUGH THE REAL ROUTES
 *
 * A Romanian store and an American one answer the first question and press
 * "Use this setup" (app/api/physical/shipping/quick-setup) over the
 * journey harness (tests/_journey: in-memory PostgREST with the SQL's
 * defaults and keys):
 *
 *   explicit    nothing is made without a price the merchant typed
 *   whole       a part that fails its checks stops the whole setup, so no
 *               zone is left without a rate
 *   once        a second press, or two presses at the same moment, leave
 *               one setup
 *   derived     units from the country, the EU or the rest of the world,
 *               the ship-from address filled only when it was empty
 *   no secrets  the settings read says which carrier app is connected and
 *               sends no key, hint or sealed secret
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey, type Person } from "./_journey/harness"
import { EU_COUNTRIES } from "@/lib/physical/quick-setup"
import { MemoryDb, PgError } from "./_journey/postgrest"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

async function main() {
  section("0. The database model rolls back a whole failed statement")
  const db = new MemoryDb()
  const original = { id: "original", name: "Before" }
  db.rows("shipping_zones").push(original)
  try {
    db.insert("shipping_zones", [{ id: "new", name: "New" }, { id: "original", name: "Duplicate" }], {})
    check("a duplicate in the second row refuses the batch", false)
  } catch (error) {
    check("a duplicate in the second row refuses the batch", error instanceof PgError && error.code === "23505")
  }
  check("the earlier row was not left behind", db.rows("shipping_zones").length === 1 && db.rows("shipping_zones")[0] === original)
  db.extraTables.add("trigger_audit")
  db.beforeWrite.shipping_zones = (row, memory) => {
    memory.rows("trigger_audit").push({ name: row.name })
    if (row.name === "Refuse") throw new PgError("P0001", "Rejected by trigger")
  }
  try {
    db.insert("shipping_zones", [{ id: "original", name: "Changed" }, { id: "other", name: "Refuse" }], { resolution: "merge" })
    check("a later trigger failure refuses the upsert", false)
  } catch (error) {
    check("a later trigger failure refuses the upsert", error instanceof PgError && error.code === "P0001")
  }
  check("the earlier update and trigger writes roll back too", original.name === "Before" && db.rows("shipping_zones").length === 1 && db.rows("trigger_audit").length === 0)
  delete db.beforeWrite.shipping_zones
  db.rows("shipping_rates").push({ id: "rate", zone_id: original.id })
  db.rows("shipping_rates").push({ id: "other-rate", zone_id: "other-zone" })
  check("the cascade is declared by the real shipping SQL", db.model.get("shipping_rates")?.cascadeDeletes.has("zone_id") === true)
  db.delete("shipping_zones", [{ path: "id", op: "eq", value: original.id, not: false }])
  check("deleting a zone cascades only its rates", db.rows("shipping_rates").length === 1 && db.rows("shipping_rates")[0].id === "other-rate")

  const j = await Journey.start()

  const store = async (email: string, slug: string, country: string): Promise<{ person: Person; creatorId: string }> => {
    const person = await j.signUp(email)
    await j.call("POST /api/onboarding/finalize", { as: person, body: { role: "creator", creatorSlug: slug } })
    const creatorId = j.rows("creators").find((c) => c.username === slug || c.slug === slug)?.id ?? j.rows("creators")[j.rows("creators").length - 1].id
    await j.call("PUT /api/store/settings", { as: person, body: { storeName: slug, defaultCountry: country } })
    await j.call("POST /api/physical/onboarding", { as: person, body: { model: "self" } })
    return { person, creatorId: creatorId as string }
  }
  const zonesOf = (creatorId: string) => j.rows("shipping_zones").filter((z) => z.creator_id === creatorId)
  const ratesOf = (creatorId: string) => j.rows("shipping_rates").filter((r) => r.creator_id === creatorId)
  const settingsOf = (creatorId: string) => j.rows("commerce_settings").find((s) => s.creator_id === creatorId)

  section("1. A store in Romania: units from the country, nothing invented")
  const ro = await store("ana@example.com", "ana-ro", "RO")
  check("onboarding set metric units without asking", settingsOf(ro.creatorId)?.unit_system === "metric", settingsOf(ro.creatorId))
  check("onboarding made a profile and a location, no zone and no rate", zonesOf(ro.creatorId).length === 0 && ratesOf(ro.creatorId).length === 0 && j.rows("shipping_profiles").some((p) => p.creator_id === ro.creatorId))

  const read = await j.call("GET /api/physical/settings", { as: ro.person })
  check("the settings read knows the store's country", read.status === 200 && read.json?.origin?.country === "RO", read.json?.origin)
  check("  and offers carrier rates only as not connected", Array.isArray(read.json?.carrierApps) && read.json.carrierApps.length >= 2 && read.json.carrierApps.every((a: { connected: boolean }) => !a.connected), read.json?.carrierApps)

  section("2. Nothing is made without a typed price, or half made")
  const none = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "RO", home: { minDays: 2, maxDays: 4 }, abroad: null } })
  check("no price at home: refused, saying where", none.status === 400 && /inside Romania/.test(none.json?.error ?? ""), none.json)
  const empty = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "RO", home: { priceCents: "", minDays: 2, maxDays: 4 }, abroad: null } })
  const nul = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "RO", home: { priceCents: null } } })
  check("an empty or null price is not read as free", empty.status === 400 && nul.status === 400, [empty.json, nul.json])
  const noAbroad = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "RO", home: { priceCents: 1500, minDays: 2, maxDays: 4 }, abroad: { minDays: 3, maxDays: 7 } } })
  check("the EU part on but no price there: refused", noAbroad.status === 400 && /rest of the EU/.test(noAbroad.json?.error ?? ""), noAbroad.json)
  const backwards = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "RO", home: { priceCents: 1500, minDays: 2, maxDays: 4 }, abroad: { priceCents: 4000, minDays: 9, maxDays: 3 } } })
  check("a part that fails its checks stops the whole setup", backwards.status === 400 && /wrong way round/.test(backwards.json?.error ?? ""), backwards.json)
  const noCountry = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { country: "XX", home: { priceCents: 1500 } } })
  check("a country that isn't one: refused", noCountry.status === 400, noCountry.json)
  check("after every refusal: still no zone, no rate", zonesOf(ro.creatorId).length === 0 && ratesOf(ro.creatorId).length === 0, zonesOf(ro.creatorId))

  section("3. Use this setup")
  const body = { country: "RO", home: { priceCents: 1500, minDays: 2, maxDays: 4, freeOverCents: 20000 }, abroad: { priceCents: 4000, minDays: 3, maxDays: 7 }, shipFrom: { addressLine1: "Strada Florilor 3", city: "Cluj-Napoca", postalCode: "400001" } }
  const made = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body })
  const zones = zonesOf(ro.creatorId)
  const home = zones.find((z) => (z.countries ?? []).join() === "RO")
  const eu = zones.find((z) => (z.countries ?? []).length === 26)
  check("two zones: Romania and the other 26 EU countries", made.status === 200 && zones.length === 2 && !!home && !!eu && !(eu.countries as string[]).includes("RO") && (eu.countries as string[]).every((c) => EU_COUNTRIES.includes(c)), { status: made.status, json: made.json, zones })
  const homeRate = ratesOf(ro.creatorId).find((r) => r.zone_id === home?.id)
  const euRate = ratesOf(ro.creatorId).find((r) => r.zone_id === eu?.id)
  check("a flat rate each, at the typed prices and days", homeRate?.kind === "flat" && homeRate.price_cents === 1500 && homeRate.min_days === 2 && homeRate.max_days === 4 && euRate?.price_cents === 4000 && euRate.max_days === 7, [homeRate, euRate])
  check("free over on the home rate only", homeRate?.free_over_cents === 20000 && euRate?.free_over_cents == null)
  const loc = j.rows("inventory_locations").find((l) => l.creator_id === ro.creatorId)
  check("the location's empty address was filled from what was shown", loc?.address_line1 === "Strada Florilor 3" && loc.city === "Cluj-Napoca" && loc.country === "RO", loc)
  check("the answer carries the profiles, settings and locations to draw", Array.isArray(made.json?.profiles) && !!made.json?.settings && Array.isArray(made.json?.locations))

  section("4. Once: a second press, and two at the same moment")
  const again = await j.call("POST /api/physical/shipping/quick-setup", { as: ro.person, body: { ...body, shipFrom: { addressLine1: "Other street 9", city: "Iasi" } } })
  check("a second press makes nothing more", again.status === 200 && again.json?.made === 0 && zonesOf(ro.creatorId).length === 2 && ratesOf(ro.creatorId).length === 2, { again: again.json?.made, zones: zonesOf(ro.creatorId).length, rates: ratesOf(ro.creatorId).length })
  check("  and a typed address is never replaced", j.rows("inventory_locations").find((l) => l.creator_id === ro.creatorId)?.address_line1 === "Strada Florilor 3")

  const us = await store("bo@example.com", "bo-us", "US")
  check("an American store gets imperial units", settingsOf(us.creatorId)?.unit_system === "imperial", settingsOf(us.creatorId))
  const usBody = { country: "US", home: { priceCents: 599, minDays: 3, maxDays: 5 }, abroad: { priceCents: 2500, minDays: 7, maxDays: 21 } }
  const [a, b] = await Promise.all([j.call("POST /api/physical/shipping/quick-setup", { as: us.person, body: usBody }), j.call("POST /api/physical/shipping/quick-setup", { as: us.person, body: usBody })])
  const usZones = zonesOf(us.creatorId)
  check("two presses at once: both answer, one setup stays", a.status === 200 && b.status === 200 && usZones.length === 2 && ratesOf(us.creatorId).length === 2, { statuses: [a.status, b.status], zoneCount: usZones.length, rateCount: ratesOf(us.creatorId).length, zones: usZones.map((z) => [z.name, z.countries, z.rest_of_world]), a: a.json, b: b.json })
  check("outside the EU, abroad is the rest of the world", usZones.some((z) => z.rest_of_world === true) && usZones.some((z) => (z.countries ?? []).join() === "US"))

  section("5. A store that set something up by hand keeps it")
  const de = await store("cy@example.com", "cy-de", "DE")
  const profileId = j.rows("shipping_profiles").find((p) => p.creator_id === de.creatorId)?.id
  await j.call("POST /api/physical/shipping/zones", { as: de.person, body: { profileId, countries: ["FR"], name: "France" } })
  await j.call("POST /api/physical/shipping/zones", { as: de.person, body: { profileId, countries: ["DE"], name: "Germany" } })
  const deMade = await j.call("POST /api/physical/shipping/quick-setup", { as: de.person, body: { country: "DE", home: { priceCents: 490 }, abroad: { priceCents: 1290 } } })
  const deZones = zonesOf(de.creatorId)
  const germany = deZones.filter((z) => (z.countries ?? []).join() === "DE")
  const restEu = deZones.find((z) => z.name === "Rest of the EU")
  check("the empty Germany zone gets the rate instead of a second Germany", deMade.status === 200 && germany.length === 1 && ratesOf(de.creatorId).some((r) => r.zone_id === germany[0].id && r.price_cents === 490), { status: deMade.status, json: deMade.json, zones: deZones.map((z) => [z.name, (z.countries ?? []).length]) })
  check("  the rest of the EU leaves France to its own zone", !!restEu && !(restEu.countries as string[]).includes("FR") && (restEu.countries as string[]).length === 25)

  section("6. The settings read sends no secret")
  j.rows("commerce_integrations").push({ id: "11111111-1111-4111-8111-111111111111", creator_id: ro.creatorId, provider: "shippo", status: "connected", config: {}, secret_ciphertext: "v1:SEALED-SHIPPO-KEY-abcd", webhook_secret_ciphertext: "v1:SEALED-HOOK-wxyz", created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  const after = await j.call("GET /api/physical/settings", { as: ro.person })
  const text = JSON.stringify(after.json)
  check("Shippo reads as connected", after.json?.carrierApps?.find((x: { id: string }) => x.id === "shippo")?.connected === true, after.json?.carrierApps)
  check("no key, hint or sealed secret in the answer", !/SEALED|ciphertext|keyHint|secretHint|abcd|wxyz/.test(text), text.slice(0, 400))
  check("no integrations list any more", !("integrations" in (after.json ?? {})))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (j.serverErrors.length) console.log("server errors:", JSON.stringify(j.serverErrors).slice(0, 900))
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

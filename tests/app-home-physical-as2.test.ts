/**
 * Round AS (track 2): Home's "Selling physical products" card shows only to a
 * store that has started selling things it ships. Physical commerce being on
 * for the platform is not enough: a creator who sells only digital products
 * never sees a shipping checklist.
 *
 *   npx tsx tests/app-home-physical-as2.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { physicalBlockers, physicalSetupStarted, physicalSteps, type PhysicalSetupFacts } from "@/lib/home/physical-setup"
import { readPhysicalSetup } from "@/lib/home/physical-setup-server"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const none: PhysicalSetupFacts = { fulfilmentChosen: false, locations: 0, rates: 0, pickupLocations: 0, physicalProducts: 0, stockedProducts: 0, packages: 0, paymentsReady: false }

/** A database that answers every query on a table with its rows, however the query is chained. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const asked: string[] = []
  const chain = (table: string): unknown => {
    const rows = tables[table] ?? []
    const result = { data: rows, error: null }
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "gt", "order", "limit", "not", "is", "neq", "range"]) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
    q.single = () => Promise.resolve({ data: rows[0] ?? null, error: null })
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad)
    return q
  }
  return { asked, from: (t: string) => (asked.push(t), chain(t)) }
}

async function main() {
  console.log("\nWhen the store has started\n")
  {
    check("a digital only store (nothing physical, payments not set up) has not started", physicalSetupStarted(none) === false)
    check("  even though its payments are a blocker, the card would not show it", physicalBlockers(none).length === 1 && physicalSetupStarted(none) === false)
    check("a physical product made: started", physicalSetupStarted({ ...none, physicalProducts: 1 }))
    check("how it fulfils chosen (shipping onboarding): started", physicalSetupStarted({ ...none, fulfilmentChosen: true }))
    check("a location added: started", physicalSetupStarted({ ...none, locations: 1 }))
    check("a shipping rate: started", physicalSetupStarted({ ...none, rates: 1 }))
    check("local pickup: started", physicalSetupStarted({ ...none, pickupLocations: 1 }))
    check("a package: started", physicalSetupStarted({ ...none, packages: 1 }))
    check("a store that has started still gets the five steps", physicalSteps({ ...none, physicalProducts: 1 }).length === 5)
  }

  console.log("\nRead off the store's own rows, no extra query\n")
  {
    const digital = fakeDb({ products: [], commerce_settings: [], inventory_locations: [], shipping_profiles: [], shipping_packages: [] })
    const f = await readPhysicalSetup(digital, "creator-a")
    check("a store with only digital products reads as not started", physicalSetupStarted(f) === false, f)
    const shipped = fakeDb({ products: [{ id: "p1", track_inventory: false, continue_selling: false }], commerce_settings: [], inventory_locations: [], shipping_profiles: [] })
    const g = await readPhysicalSetup(shipped, "creator-b")
    check("a store with one physical product reads as started", physicalSetupStarted(g) === true && g.physicalProducts === 1, g)
    const onboarded = fakeDb({ products: [], commerce_settings: [{ fulfillment_model: "self" }], inventory_locations: [], shipping_profiles: [] })
    check("a store that chose how it fulfils reads as started", physicalSetupStarted(await readPhysicalSetup(onboarded, "creator-c")) === true)
  }

  console.log("\nThe route and the card\n")
  {
    const route = read("app/api/home/physical-setup/route.ts")
    check("the route says not started and sends no steps or blockers", /if \(!physicalSetupStarted\(facts\)\) return physicalJson\(\{ started: false, steps: \[\], blockers: \[\] \}\)/.test(route))
    check("  started, it sends the steps as before", /physicalJson\(\{ started: true, steps: physicalSteps\(facts\), blockers: physicalBlockers\(facts\) \}\)/.test(route))
    check("  still the caller's own store, behind the physical switch", /physicalCaller\("store", \{ read: true \}\)/.test(route) && /readPhysicalSetup\(c\.db, c\.creatorId\)/.test(route))
    const card = read("components/app/home/physical-setup-card.tsx")
    check("the card draws nothing for a store that has not started", /setSteps\(r\.data\.started === false \? null : r\.data\.steps\)/.test(card) && /if \(!physical \|\| !steps \|\|/.test(card))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
void main()

/**
 * Round T: Home's "Selling physical products" card.
 *
 *   npx tsx tests/physical-setup-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { physicalSetupDone, physicalSteps, type PhysicalSetupFacts } from "@/lib/home/physical-setup"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const none: PhysicalSetupFacts = { fulfilmentChosen: false, locations: 0, rates: 0, pickupLocations: 0, physicalProducts: 0, stockedProducts: 0, packages: 0 }

console.log("\nThe five steps\n")
{
  const s = physicalSteps(none)
  check("five, in the order a store does them", s.map((x) => x.id).join() === "fulfilment,location,delivery,product,package" && s.every((x) => !x.done))
  check("local pickup alone is a way to deliver", physicalSteps({ ...none, pickupLocations: 1 }).find((x) => x.id === "delivery")?.done === true)
  check("a product without stock isn't done, and the step says why and goes to Inventory", (() => { const p = physicalSteps({ ...none, physicalProducts: 1 }).find((x) => x.id === "product")!; return !p.done && /no stock/.test(p.line) && p.href === "/app/inventory" })())
  check("  with none yet, it goes to a new physical product", physicalSteps(none).find((x) => x.id === "product")?.href === "/app/products/new?type=physical")
  check("every step done: the card goes", physicalSetupDone({ fulfilmentChosen: true, locations: 1, rates: 2, pickupLocations: 0, physicalProducts: 1, stockedProducts: 1, packages: 1 }))
  check("every link is a real place", physicalSteps(none).every((x) => /^\/app\/(settings\?tab=(shipping|locations)|inventory|products\/new\?type=physical)$/.test(x.href)))
}

console.log("\nWhere it shows\n")
{
  const card = read("components/app/home/physical-setup-card.tsx")
  /* Changed on purpose (round U): payments not set up keeps the card up, first, even with the five steps done. */
  check("only while physical commerce is on, and gone when done and nothing stops a sale", /if \(!physical \|\| !steps \|\| \(steps\.every\(\(s\) => s\.done\) && blockers\.length === 0\)\) return null/.test(card))
  check("Home places it under its cards", /<PhysicalSetupCard \/>/.test(read("components/app/dashboard-client.tsx")))
  check("the route is behind the physical switch, for the caller's own store", /physicalCaller\(\)/.test(read("app/api/home/physical-setup/route.ts")))
  const server = read("lib/home/physical-setup-server.ts")
  check("a read that fails counts as not done", /\.catch\(\(\) => fallback\)/.test(server))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

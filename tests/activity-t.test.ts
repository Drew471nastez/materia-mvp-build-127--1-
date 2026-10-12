/**
 * Round T: a store's activity log (SQL part 113, lib/activity), the routes
 * that write it and Settings › Activity that reads it.
 *
 *   node scripts/run-push-tests.mjs (it imports a server-only module)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { actorLabel, describeActivity, groupOf } from "@/lib/activity/actions"
import { loadActivity, recordActivity, taxRegionLabel } from "@/lib/activity/log-server"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const line = (action: string, subjectLabel: string | null = null, meta: Record<string, unknown> = {}) => describeActivity({ action, subjectLabel, meta })

console.log("\nWhat a row says")
check("a new product", line("product.created", "Honey") === "Added Honey")
check("a rename says both names", line("product.renamed", "Wildflower honey", { from: "Honey" }) === "Renamed Honey to Wildflower honey")
check("a status in words", line("product.status", "Honey", { to: "archived" }) === "Archived Honey" && line("product.status", "Honey", { to: "published" }) === "Published Honey")
check("an order by its number", line("order.fulfilled", "#1A2B3C4D") === "Fulfilled items in order #1A2B3C4D")
check("an order without one still reads", line("order.refunded") === "Refunded order")
check("a setting", line("settings.checkout") === "Changed checkout settings")
check("an integration by its name", line("integration.installed", "Meta Pixel") === "Installed Meta Pixel")
check("something new never shows a key", line("something.else") === "Made a change")
check("groups for the filter", groupOf("product.price") === "products" && groupOf("order.cancelled") === "orders" && groupOf("file.deleted") === "files" && groupOf("tax.region_added") === "settings")
check("who did it", actorLabel("person") === "You" && actorLabel("system") === "Storelib" && actorLabel("buyer") === "A buyer")
check("a tax region named by its tax and where", taxRegionLabel({ name: "TVA", country: "RO", region: null }) === "TVA (RO)" && taxRegionLabel(null) === null)

const inserted: Record<string, unknown>[] = []
const okDb = { from: () => ({ insert: async (row: Record<string, unknown>) => (inserted.push(row), { error: null }) }) }
const badDb = { from: () => ({ insert: async () => ({ error: { code: "42P01", message: "relation does not exist" } }) }) }
const throwDb = { from: () => { throw new Error("down") } }

function fakeRead(rows: unknown[], calls: string[]) {
  const q: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => (calls.push(`${name}:${args.map(String).join(",")}`), q)
  for (const n of ["select", "eq", "lt", "like", "not", "or", "order"]) q[n] = chain(n)
  q.limit = async (n: number) => (calls.push(`limit:${n}`), { data: rows, error: null })
  return { from: () => q }
}

async function main() {
  console.log("\nWriting a row")
  await recordActivity(okDb, { creatorId: "c1", userId: "u1" }, { action: "settings.store", subjectLabel: "x".repeat(400) })
  check("it goes in with who did it, as a person", inserted[0]?.creator_id === "c1" && inserted[0]?.actor_user_id === "u1" && inserted[0]?.actor === "person")
  check("names are cut to fit", String(inserted[0]?.subject_label).length === 200)
  await recordActivity(okDb, { creatorId: "c1" }, { action: "order.return_opened", actor: "buyer" })
  check("a buyer's own return says so", inserted[1]?.actor === "buyer" && inserted[1]?.actor_user_id === null)
  await recordActivity(okDb, { creatorId: "c1" }, { action: "Drop table" })
  check("an action that isn't one is skipped", inserted.length === 2)
  let threw = false
  try {
    await recordActivity(badDb, { creatorId: "c1" }, { action: "settings.store" })
    await recordActivity(throwDb, { creatorId: "c1" }, { action: "settings.store" })
  } catch {
    threw = true
  }
  check("a database without part 113, or one that is down, never fails the change", !threw)

  console.log("\nReading")
  const rows = Array.from({ length: 41 }, (_, i) => ({ id: 100 - i, created_at: "2026-10-10T10:00:00Z", actor: "person", action: "product.created", subject_type: "product", subject_id: "p", subject_label: "Honey", meta: null }))
  const calls: string[] = []
  const page = await loadActivity(fakeRead(rows, calls), "c1", { before: 500, prefix: "settings." })
  check("40 at a time, and it knows there are more", page.entries.length === 40 && page.more && !page.missing)
  check("only the store's own, older than the last one shown", calls.includes("eq:creator_id,c1") && calls.includes("lt:id,500"))
  /* Changed on purpose (round R1): offers are Products on the page (groupOf), so they are left out of Settings here too. */
  check("Settings is everything but products, offers, orders and files", calls.filter((c) => c.startsWith("not:action,like,")).length === 4 && calls.includes("not:action,like,offer.%"))
  const pcalls: string[] = []
  await loadActivity(fakeRead(rows, pcalls), "c1", { prefix: "product." })
  check("Products is products and offers, as the page groups them", pcalls.includes("or:action.like.product.%,action.like.offer.%"))

  console.log("\nThe SQL")
  const sql = read("supabase/sql/run-now/113_store_activity.sql")
  check("the migration is the same part", sql === read("supabase/migrations/20261205_store_activity.sql"))
  check("one statement a line, ending in a schema reload", sql.trim().endsWith("notify pgrst, 'reload schema';") && sql.split("\n").filter(Boolean).every((l) => l.startsWith("/*") || l.trim().endsWith(";")))
  check("the owner reads their own; nobody writes but the server", /FOR SELECT TO authenticated USING \(EXISTS \(SELECT 1 FROM public\.creators c WHERE c\.id = store_activity_log\.creator_id AND c\.user_id = auth\.uid\(\)\)\)/.test(sql) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.store_activity_log FROM PUBLIC, anon, authenticated/.test(sql))
  check("products log from a trigger that can never stop a save", /AFTER INSERT OR UPDATE OR DELETE ON public\.products/.test(sql) && /EXCEPTION WHEN OTHERS THEN RETURN NULL/.test(sql))
  check("and only for a new, deleted, renamed, repriced or restatused product", /ELSE RETURN NULL; END IF; INSERT/.test(sql))
  check("listed in the README and the check after", /113_store_activity\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p113_store_activity/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nWired in")
  const wired: [string, RegExp][] = [
    ["app/api/store/settings/route.ts", /settings\.checkout" : "settings\.store/],
    ["app/api/store/taxes/route.ts", /settings\.taxes/],
    ["app/api/store/taxes/regions/route.ts", /tax\.region_added/],
    ["app/api/store/taxes/regions/[id]/route.ts", /tax\.region_removed/],
    ["app/api/store/integrations/route.ts", /integration\.installed/],
    ["app/api/store/reasons/route.ts", /settings\.reasons/],
    ["app/api/store/channels/route.ts", /settings\.channels/],
    ["app/api/physical/settings/route.ts", /settings\.shipping/],
    ["app/api/physical/locations/route.ts", /location\.added/],
    ["app/api/physical/locations/[id]/route.ts", /location\.removed/],
    ["app/api/physical/orders/[id]/route.ts", /ORDER_ACTIVITY\[String\(body\.action\)\]/],
    ["app/api/physical/order-status/[token]/return/route.ts", /actor: "buyer"/],
    ["app/api/files/route.ts", /file\.deleted/],
  ]
  const missing = wired.filter(([f, re]) => !re.test(read(f))).map(([f]) => f)
  check("every write route records its change after it succeeds", missing.length === 0, missing)
  const form = read("components/app/settings-form-new.tsx")
  check("Settings has an Activity tab in Store", /id: "activity", label: "Activity", icon: History, group: "store"/.test(form) && /panelTab === "activity" && <ActivityPanel \/>/.test(form))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()

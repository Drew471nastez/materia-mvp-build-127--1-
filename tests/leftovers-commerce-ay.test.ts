/** Round AY: a free shipped cart pressed again is one order; booking and form emails name the store found by its owner's user id. */
import { readFileSync } from "node:fs"
import { resolveCreatorIdentityForUser } from "@/lib/email"
import { liveDeps } from "@/lib/bookings/announce-server"
import { freeKeyFor } from "@/lib/checkout/attempt-id"
import { freeOrderOfKey } from "@/lib/physical/checkout-server"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

type Row = Record<string, any>
/** A PostgREST-shaped reader over fixed rows: from().select().eq()...single()/maybeSingle(). */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(t: string) {
      const where: [string, unknown][] = []
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (where.push([c, v]), q),
        limit: () => q,
        rows: () => (tables[t] ?? []).filter((r) => where.every(([c, v]) => r[c] === v)),
        maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
        single: async () => (q.rows()[0] ? { data: q.rows()[0], error: null } : { data: null, error: { code: "PGRST116", message: "none" } }),
        then: (ok: any, bad: any) => Promise.resolve({ data: q.rows(), error: null }).then(ok, bad),
      }
      return q
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: id === "user-1" ? { email: "owner-login@example.com" } : null }, error: null }) } },
  }
}

async function main() {
  console.log("\n1. A store named by its owner's USER id (bookings, native forms)")
  const db = fakeDb({
    creators: [{ id: "creator-1", user_id: "user-1", headline: "", slug: "mia", support_email: "hello@mia.example" }],
    profiles: [{ id: "user-1", email: "owner-login@example.com", display_name: "Mia Lee", username: "mia" }],
    store_settings: [{ creator_id: "creator-1", store_name: "Mia Mugs" }],
  })
  const id = await resolveCreatorIdentityForUser(db, "user-1")
  check("the user id finds the store: its name and its support address", id.creatorId === "creator-1" && id.fromName === "Mia Mugs" && id.replyTo === "hello@mia.example")
  const none = await resolveCreatorIdentityForUser(db, "user-without-store")
  check("a user with no store gets blanks (the callers' own fallbacks), never another store", none.creatorId === null && none.fromName === "" && none.replyTo === "")
  check("an empty id reads nothing", (await resolveCreatorIdentityForUser(db, "")).creatorId === null)
  const throwing = { from: () => { throw new Error("down") } }
  check("a database that throws gives blanks, never an error", (await resolveCreatorIdentityForUser(throwing, "user-1")).fromName === "")

  const deps = liveDeps(db as never)
  const who = await deps.identity("user-1")
  check("a booking's visitor email is from the store's name, Reply-To its own address (was blank / Storelib's)", who.fromName === "Mia Mugs" && who.replyTo === "hello@mia.example")

  const forms = code("lib/forms/delivery-server.ts")
  check("form booking emails read the store by user id", /resolveCreatorIdentityForUser\(db, job\.owner_id\)/.test(forms) && !/resolveCreatorIdentity\(db, job\.owner_id\)/.test(forms))
  check("  and send from the store's own domain by its creator id, not the user id", /store: identity\?\.fromName \? identity\.creatorId : null/.test(forms))
  check("bookings read the store by user id", /resolveCreatorIdentityForUser\(db, ownerId\)/.test(code("lib/bookings/announce-server.ts")))

  console.log("\n2. A free cart that ships, pressed again: the same key is the same order")
  const holder = { current: null as { key: string; sig: string } | null }
  let n = 0
  const make = () => `key-${++n}`
  const k1 = freeKeyFor(holder, "order-A", make)
  check("the same order pressed again sends the same key", freeKeyFor(holder, "order-A", make) === k1)
  check("a changed order gets a new key", freeKeyFor(holder, "order-B", make) !== k1)
  holder.current = null
  check("after a refusal (holder cleared) the next press is a new key", freeKeyFor(holder, "order-B", make) === "key-3")

  const soon = new Date(Date.now() + 35 * 60_000).toISOString()
  const long = new Date(Date.now() + 20 * 60_000).toISOString()
  const rows = { commerce_checkouts: [
    { id: "c1", creator_id: "s", client_key: "paid-key", status: "paid", provider: "free", receipt_token: "tok1", expires_at: soon },
    { id: "c2", creator_id: "s", client_key: "card-key", status: "paid", provider: "stripe", receipt_token: "tok2", expires_at: soon },
    { id: "c3", creator_id: "s", client_key: "busy-key", status: "pending", provider: "free", receipt_token: "tok3", expires_at: soon },
    { id: "c4", creator_id: "s", client_key: "stale-key", status: "pending", provider: "free", receipt_token: "tok4", expires_at: long },
    { id: "c5", creator_id: "s", client_key: "fail-key", status: "failed", provider: "free", receipt_token: "tok5", expires_at: soon },
  ] }
  const co = fakeDb(rows)
  check("a placed free order is found by its key", (await freeOrderOfKey(co as never, "s", "paid-key", 0, 1))?.receiptToken === "tok1")
  check("  only in its own store", (await freeOrderOfKey(co as never, "other", "paid-key", 0, 1)) === null)
  check("a card order is never answered as free", (await freeOrderOfKey(co as never, "s", "card-key", 0, 1)) === null)
  const busy = await freeOrderOfKey(co as never, "s", "busy-key", 1, 1)
  check("one still being placed answers with no receipt (\"still being placed\")", busy?.id === "c3" && busy.receiptToken === null)
  check("one pending for minutes is not in progress", (await freeOrderOfKey(co as never, "s", "stale-key", 0, 1)) === null)
  check("a refused one is not an order", (await freeOrderOfKey(co as never, "s", "fail-key", 0, 1)) === null)
  check("no key, no order", (await freeOrderOfKey(co as never, "s", "nothing", 0, 1)) === null)

  const site = code("app/(storelib)/checkout/site/site-checkout.tsx")
  check("the website's Get it free sends the order's kept key, not a new one per press", /action: "free", \.\.\.body, business: null, clientKey: key,/.test(site) && /freeKeyFor\(freeKey,/.test(site))
  const phys = code("app/(storelib)/checkout/physical/physical-checkout.tsx")
  check("the physical checkout keeps its key for a free order after a lost answer", /if \(!cashOn && quote\.totals\.totalCents !== 0\) clientKey\.current = actionKey\(\)/.test(phys))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

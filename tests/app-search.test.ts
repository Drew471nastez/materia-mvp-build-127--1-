/**
 * THE /app SEARCH, ON THE SERVER
 *
 * lib/search/app-search.ts answers the header search with a creator's own
 * orders, customers, products, emails and automations. The things that would
 * go wrong quietly, and that this holds in place:
 *
 *   1. Another creator's rows. Every query runs against an in-memory database
 *      holding two creators whose rows all match the same words, and nothing
 *      of the second may come back. Every query must also NAME the creator.
 *   2. Wildcards. "%" and "_" are taken literally, not as "anything".
 *   3. Order numbers agree with the Orders page: a basket is one order, and
 *      "#1002" is the second order this creator ever took.
 *   4. A table that is not there yet empties its own group and nothing else.
 *   5. The route: signed in, POST, rate limited, the creator from the session,
 *      and the query never written to a log.
 */
import { readCode } from "./_source"
import {
  GROUP_LIMIT,
  forgetOrderIndex,
  containsPattern,
  customerHref,
  emailHref,
  escapeLike,
  isSearchable,
  normalizeQuery,
  searchCreator,
} from "@/lib/search/app-search"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

/* ─── A small database that answers the chain searchCreator uses ──────── */

type Row = Record<string, any>
interface Call {
  table: string
  columns: string
  filters: [string, string, unknown][]
}

/** ilike, with Postgres's default escape character (backslash). */
function likeToRegExp(pattern: string): RegExp {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    } else if (c === "%") out += "[\\s\\S]*"
    else if (c === "_") out += "[\\s\\S]"
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${out}$`, "i")
}

function fakeDb(tables: Record<string, Row[]>, options: { missingTables?: string[]; columns?: Record<string, string[]> } = {}) {
  /* A new database is a new world: the orders a search kept for a store (lib/search/app-search cachedOrders) are not this one's. */
  forgetOrderIndex()
  const calls: Call[] = []
  const db = {
    calls,
    from(table: string) {
      const call: Call = { table, columns: "*", filters: [] }
      calls.push(call)
      let from = 0
      let to = Infinity
      let limit = Infinity
      const builder: any = {
        select(columns: string) {
          call.columns = columns
          return builder
        },
        eq(col: string, v: unknown) {
          call.filters.push(["eq", col, v])
          return builder
        },
        in(col: string, v: unknown[]) {
          call.filters.push(["in", col, v])
          return builder
        },
        ilike(col: string, v: string) {
          call.filters.push(["ilike", col, v])
          return builder
        },
        is(col: string, v: unknown) {
          call.filters.push(["is", col, v])
          return builder
        },
        order() {
          return builder
        },
        limit(n: number) {
          limit = n
          return builder
        },
        range(a: number, b: number) {
          from = a
          to = b
          return builder
        },
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          try {
            resolve(run())
          } catch (e) {
            reject?.(e)
          }
        },
      }
      const run = () => {
        if (options.missingTables?.includes(table)) return { data: null, error: { code: "42P01", message: "relation does not exist" } }
        const known = options.columns?.[table]
        const wanted = call.columns === "*" ? [] : call.columns.split(",").map((c) => c.trim())
        const filterCols = call.filters.map((f) => f[1])
        if (known && [...wanted, ...filterCols].some((c) => !known.includes(c))) {
          return { data: null, error: { code: "42703", message: "column does not exist" } }
        }
        let rows = (tables[table] ?? []).filter((r) =>
          call.filters.every(([op, col, v]) => {
            if (op === "eq") return r[col] === v
            if (op === "in") return (v as unknown[]).includes(r[col])
            if (op === "is") return (r[col] ?? null) === v
            if (op === "ilike") return typeof r[col] === "string" && likeToRegExp(v as string).test(r[col])
            return true
          }),
        )
        rows = rows.slice(from, Number.isFinite(to) ? to + 1 : undefined).slice(0, limit)
        const data = rows.map((r) => (wanted.length ? Object.fromEntries(wanted.map((c) => [c, r[c]])) : { ...r }))
        return { data, error: null }
      }
      return builder
    },
  }
  return db
}

/* ─── Two creators, and everything of theirs matches "jane" and "launch" ─ */

const A = "creator-a"
const B = "creator-b"
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

function world() {
  return {
    products: [
      { id: "pa1", creator_id: A, title: "Launch course", status: "published", price_cents: 2900 },
      { id: "pa2", creator_id: A, title: "Preset pack 50% off", status: "draft", price_cents: 0 },
      { id: "pa3", creator_id: A, title: "Presets_v2", status: "published", price_cents: 900 },
      { id: "pb1", creator_id: B, title: "Launch course B", status: "published", price_cents: 4900 },
    ],
    orders: [
      /* A's orders, oldest first: #1001, then a basket of two rows (#1002), then #1003. */
      { id: "oa1", product_id: "pa1", created_at: day(1), stripe_session_id: "s1", amount_cents: 2900, status: "completed", currency: "usd", buyer_email: "jane@example.com", buyer_first_name: "Jane", buyer_last_name: "Doe" },
      { id: "oa2", product_id: "pa1", created_at: day(2), stripe_session_id: "s2", amount_cents: 2900, status: "completed", currency: "usd", buyer_email: "sam@example.com", buyer_first_name: "Sam", buyer_last_name: "Lee" },
      { id: "oa3", product_id: "pa3", created_at: day(2), stripe_session_id: "s2", amount_cents: 900, status: "completed", currency: "usd", buyer_email: "sam@example.com", buyer_first_name: "Sam", buyer_last_name: "Lee" },
      { id: "oa4", product_id: "pa3", created_at: day(3), stripe_session_id: "s3", amount_cents: 900, status: "completed", currency: "usd", buyer_email: "jane@example.com", buyer_first_name: "Jane", buyer_last_name: "Doe" },
      /* B's, which match every word A's do. */
      { id: "ob1", product_id: "pb1", created_at: day(1), stripe_session_id: "t1", amount_cents: 4900, status: "completed", currency: "usd", buyer_email: "jane.b@example.com", buyer_first_name: "Jane", buyer_last_name: "Bee" },
    ],
    subscribers: [
      { id: "sa1", creator_id: A, email: "janet@list.com", name: "Janet List", subscribed_at: day(1) },
      { id: "sa2", creator_id: A, email: "jane@example.com", name: "Jane Doe", subscribed_at: day(2) },
      { id: "sb1", creator_id: B, email: "jane.sub@b.com", name: "Jane Sub", subscribed_at: day(1) },
    ],
    email_campaigns: [
      { id: "ea1", creator_id: A, subject: "Launch week", status: "sent", created_at: day(1) },
      { id: "ea2", creator_id: A, subject: "100% new", status: "draft", created_at: day(2) },
      { id: "eb1", creator_id: B, subject: "Launch week B", status: "sent", created_at: day(1) },
    ],
    product_collections: [
      { id: "ca1", creator_id: A, title: "Launch bundle", published: true, created_at: day(1) },
      { id: "cb1", creator_id: B, title: "Launch bundle B", published: true, created_at: day(1) },
    ],
    coupons: [
      { id: "qa1", creator_id: A, code: "LAUNCH20", discount_type: "percentage", discount_value: 20, is_active: true, created_at: day(1) },
      { id: "qb1", creator_id: B, code: "LAUNCHB", discount_type: "fixed", discount_value: 5, is_active: true, created_at: day(1) },
    ],
    email_flows: [
      { id: "fa1", creator_id: A, name: "Launch welcome", status: "active", created_at: day(1) },
      { id: "fb1", creator_id: B, name: "Launch welcome B", status: "active", created_at: day(1) },
    ],
  }
}

const B_IDS = ["pb1", "ob1", "sb1", "eb1", "fb1", "cb1", "qb1", "LAUNCHB", "jane.b@example.com", "jane.sub@b.com"]
const CREATOR_TABLES = ["products", "subscribers", "email_campaigns", "email_flows", "product_collections", "coupons"]

function leaks(result: Awaited<ReturnType<typeof searchCreator>>): string[] {
  const text = JSON.stringify(result)
  return B_IDS.filter((id) => text.includes(id)).concat(/Launch course B|Launch week B|Launch welcome B|Launch bundle B|Jane Bee|Jane Sub/.test(text) ? ["B's words"] : [])
}

function everyQueryScoped(calls: Call[], creator: string, ownProducts: string[]): string[] {
  const bad: string[] = []
  for (const c of calls) {
    if (CREATOR_TABLES.includes(c.table)) {
      if (!c.filters.some(([op, col, v]) => op === "eq" && col === "creator_id" && v === creator)) bad.push(`${c.table} without creator_id`)
    } else if (c.table === "orders") {
      const scope = c.filters.find(([op, col]) => op === "in" && col === "product_id")
      if (!scope || !(scope[2] as string[]).every((id) => ownProducts.includes(id))) bad.push("orders not scoped to own products")
    } else {
      bad.push(`unexpected table ${c.table}`)
    }
  }
  return bad
}

async function main() {
  console.log("\nThe query")
  check("trimmed and spaced once", normalizeQuery("  jane   doe ") === "jane doe")
  check("cut at 100 characters", normalizeQuery("x".repeat(500)).length === 100)
  check("anything but text is no query", normalizeQuery({ q: "x" }) === "" && normalizeQuery(undefined) === "")
  check("one letter is not worth asking", !isSearchable("j"))
  check("two are", isSearchable("ja"))
  check("an order number of any length is", isSearchable("7") && isSearchable("#7"))

  console.log("\nWildcards are taken literally")
  check("% is escaped", escapeLike("50%") === "50\\%", escapeLike("50%"))
  check("_ is escaped", escapeLike("a_b") === "a\\_b", escapeLike("a_b"))
  check("and the escape character itself", escapeLike("a\\b") === "a\\\\b", escapeLike("a\\b"))
  check("contains wraps the escaped text", containsPattern("5%_") === "%5\\%\\_%", containsPattern("5%_"))
  check("the pattern for % matches a literal % only", likeToRegExp(containsPattern("%")).test("100% new") && !likeToRegExp(containsPattern("%")).test("Launch week"))
  check("the pattern for _ matches a literal _ only", likeToRegExp(containsPattern("_")).test("Presets_v2") && !likeToRegExp(containsPattern("_")).test("Preset pack"))

  {
    const db = fakeDb(world())
    const r = await searchCreator(db, A, "0%")
    check("a search for 0% finds the one email with 0% in it, not every email with a 0", r.groups.emails.length === 1 && r.groups.emails[0].id === "ea2", r.groups.emails)
    const u = await searchCreator(fakeDb(world()), A, "s_v")
    check("a search for s_v finds Presets_v2 and not a title with any letter there", u.groups.products.map((p) => p.id).join() === "pa3", u.groups.products)
    const every = db.calls.filter((c) => c.filters.some(([op]) => op === "ilike"))
    check("every ilike pattern was escaped", every.length >= 4 && every.every((c) => c.filters.filter(([op]) => op === "ilike").every(([, , v]) => v === "%0\\%%")), every.map((c) => c.filters))
  }

  console.log("\nOne creator's rows, never another's")
  for (const q of ["jane", "launch", "example.com", "#100", "1001", "Jane Doe"]) {
    const db = fakeDb(world())
    const r = await searchCreator(db, A, q)
    check(`"${q}": nothing of creator B comes back`, leaks(r).length === 0, leaks(r))
    const bad = everyQueryScoped(db.calls, A, ["pa1", "pa2", "pa3"])
    check(`"${q}": every query names creator A`, bad.length === 0, bad)
  }
  {
    const db = fakeDb(world())
    const r = await searchCreator(db, B, "jane")
    check("and as creator B, B's own Jane is found", r.groups.customers.some((c) => c.title === "Jane Bee"), r.groups.customers)
    check("and not A's", !JSON.stringify(r).includes("jane@example.com") && !JSON.stringify(r).includes("janet@list.com"))
    check("B's queries name B", everyQueryScoped(db.calls, B, ["pb1"]).length === 0, everyQueryScoped(db.calls, B, ["pb1"]))
  }
  {
    const db = fakeDb(world())
    const r = await searchCreator(db, "", "jane")
    check("no creator, no query at all", db.calls.length === 0 && Object.values(r.groups).every((g) => g.length === 0))
    const short = fakeDb(world())
    await searchCreator(short, A, "j")
    check("one letter never reaches the database", short.calls.length === 0)
  }

  console.log("\nOrders, numbered as the Orders page numbers them")
  {
    const r = await searchCreator(fakeDb(world()), A, "#1002")
    check("#1002 is the basket, the second order A took", r.groups.orders.length === 1 && r.groups.orders[0].id === "oa2", r.groups.orders)
    check("titled with its number", r.groups.orders[0]?.title === "Order #1002", r.groups.orders[0]?.title)
    check("with who, what and the total", r.groups.orders[0]?.detail === "Sam Lee · Launch course and 1 more · $38.00", r.groups.orders[0]?.detail)
    check("and opens that order over the Orders list", r.groups.orders[0]?.href === "/app/orders?order=oa2", r.groups.orders[0]?.href)
    const byName = await searchCreator(fakeDb(world()), A, "jane")
    check("a buyer's name finds their orders, newest first", byName.groups.orders.map((o) => o.title).join() === "Order #1003,Order #1001", byName.groups.orders.map((o) => o.title))
    const byProduct = await searchCreator(fakeDb(world()), A, "presets")
    check("a product's name finds the orders with it", byProduct.groups.orders.map((o) => o.id).join() === "oa4,oa2", byProduct.groups.orders.map((o) => o.id))
  }

  console.log("\nCollections and coupons")
  {
    const r = await searchCreator(fakeDb(world()), A, "launch")
    check("a collection opens in its editor", r.groups.collections[0]?.href === "/app/products/collections?collection=ca1" && r.groups.collections[0]?.detail === "Published", r.groups.collections[0])
    check("a coupon by its code, what it takes off and whether it is on", r.groups.coupons[0]?.title === "LAUNCH20" && r.groups.coupons[0]?.detail === "20% off · On" && r.groups.coupons[0]?.href === "/app/coupons/qa1", r.groups.coupons[0])
    const rb = await searchCreator(fakeDb(world()), B, "launch")
    check("a fixed coupon says its amount", rb.groups.coupons[0]?.detail === "$5.00 off · On", rb.groups.coupons[0])
  }

  console.log("\nOnly what was asked for")
  {
    const db = fakeDb(world())
    const r = await searchCreator(db, A, "launch", { groups: new Set(["products", "collections", "coupons"]) })
    const tables = [...new Set(db.calls.map((c) => c.table))].sort().join()
    check("a role with products reads products, collections and coupons and nothing else", tables === "coupons,product_collections,products", tables)
    check("and no order, buyer or email comes back", r.groups.orders.length === 0 && r.groups.customers.length === 0 && r.groups.emails.length === 0 && r.groups.products.length > 0)
  }

  console.log("\nThe orders, read once while somebody types")
  {
    const first = fakeDb(world())
    await searchCreator(first, A, "jan")
    await searchCreator(first, A, "jane")
    check("the next keystroke does not read every order again", first.calls.filter((c) => c.table === "orders").length === 1, first.calls.filter((c) => c.table === "orders").length)
    check("the email list is read beside the orders, not after them", /const contactsRead: Promise<Contact\[\] \| null> = wants\("customers"\)/.test(readCode("lib/search/app-search.ts")))
  }

  console.log("\nCustomers: buyers, then the email list")
  {
    const r = await searchCreator(fakeDb(world()), A, "jane")
    const people = r.groups.customers
    check("Jane the buyer once, with both her orders", people[0]?.title === "Jane Doe" && people[0]?.detail === "jane@example.com · 2 orders", people[0])
    check("her orders over all time", people[0]?.href === customerHref("jane@example.com") && people[0]?.href === "/app/orders?range=all_time&q=jane%40example.com", people[0]?.href)
    check("Janet from the email list, once", people.filter((p) => p.title === "Janet List").length === 1 && people.find((p) => p.title === "Janet List")?.href === "/app/emails")
    check("Jane is not listed twice though she is on the list too", people.filter((p) => /jane@example\.com/.test(p.detail) || p.title === "jane@example.com").length === 1, people)
  }

  console.log("\nProducts, emails and automations")
  {
    const r = await searchCreator(fakeDb(world()), A, "launch")
    check("the product opens its editor", r.groups.products[0]?.href === "/app/products/pa1" && r.groups.products[0]?.detail === "Published · $29.00", r.groups.products[0])
    check("a sent email opens on its own page over the Sent list", r.groups.emails[0]?.href === "/app/emails?tab=published&email=ea1" && r.groups.emails[0]?.detail === "Sent", r.groups.emails[0])
    check("a draft opens in the composer, a scheduled one over the Scheduled list",
      emailHref("ea2", "draft") === "/app/emails/edit/ea2" && emailHref("es1", "scheduled") === "/app/emails?tab=scheduled&email=es1" && emailHref("ex1", "partially_failed") === "/app/emails?tab=published&email=ex1")
    check("the automation opens its builder", r.groups.automations[0]?.href === "/app/emails/flow/fa1" && r.groups.automations[0]?.detail === "On", r.groups.automations[0])
    const free = await searchCreator(fakeDb(world()), A, "preset pack")
    check("a free draft says so", free.groups.products[0]?.detail === "Draft · Free", free.groups.products[0])
  }
  {
    const many = world()
    for (let i = 0; i < 12; i++) many.products.push({ id: `px${i}`, creator_id: A, title: `Launch extra ${i}`, status: "published", price_cents: 100 })
    for (let i = 0; i < 12; i++) many.email_campaigns.push({ id: `ex${i}`, creator_id: A, subject: `Launch ${i}`, status: "draft", created_at: day(5) })
    const r = await searchCreator(fakeDb(many), A, "launch")
    check(`at most ${GROUP_LIMIT} of each`, Object.values(r.groups).every((g) => g.length <= GROUP_LIMIT) && r.groups.products.length === GROUP_LIMIT && r.groups.emails.length === GROUP_LIMIT)
  }

  console.log("\nA table that is not there yet")
  {
    const r = await searchCreator(fakeDb(world(), { missingTables: ["email_flows"] }), A, "launch")
    check("automations come back empty and named", r.groups.automations.length === 0 && r.unavailable.join() === "automations", r.unavailable)
    check("and everything else is still answered", r.groups.products.length > 0 && r.groups.emails.length > 0 && r.groups.orders.length > 0)
    const noEmails = await searchCreator(fakeDb(world(), { missingTables: ["email_campaigns", "subscribers"] }), A, "jane")
    check("without the email tables, buyers are still found", noEmails.groups.customers[0]?.title === "Jane Doe" && noEmails.unavailable.join() === "customers,emails", noEmails.unavailable)
    const noName = await searchCreator(
      fakeDb(world(), { columns: { subscribers: ["id", "email", "creator_id", "subscribed_at"] } }),
      A,
      "janet",
    )
    check("before subscribers.name exists, contacts are found by email", noName.groups.customers.some((c) => c.title === "janet@list.com") && noName.unavailable.length === 0, noName)
    const noStatus = await searchCreator(fakeDb(world(), { columns: { products: ["id", "creator_id", "title"] } }), A, "launch")
    check("a column list that is refused is read again as *", noStatus.groups.products[0]?.id === "pa1", noStatus.groups.products)
    const noProducts = await searchCreator(fakeDb(world(), { missingTables: ["products"] }), A, "jane")
    check("without products, orders are unavailable rather than wrong", noProducts.groups.orders.length === 0 && noProducts.unavailable.includes("orders") && noProducts.unavailable.includes("products"))
  }

  console.log("\nThe route")
  const route = readCode("app/api/app/search/route.ts")
  check("a POST, so the query is not in an address a log keeps", /export async function POST\(/.test(route) && !/export async function GET\(/.test(route))
  /* Changed on purpose: a teammate searches the store they work in, through the service role, held to it by actingStore and the role's areas. The owner is still on their own client. */
  check("signed in; the owner on their own client", /from "@\/lib\/supabase\/server"/.test(route) && /auth\.getUser\(\)/.test(route) && /searchCreator\(supabase, creator\.id, q\)/.test(route))
  check("a teammate: the store they work in, only what their role opens", /const acting = await actingStore\(admin, user\.id\)/.test(route) && /memberCan\(acting\.role, GROUP_AREA\[g\]\)/.test(route) && /searchCreator\(admin, acting\.creatorId, q, \{ groups \}\)/.test(route) && /orders: "orders"/.test(route) && /customers: "customers"/.test(route) && /coupons: "products"/.test(route))
  check("the creator from the session's user, not the request", /\.eq\("user_id", user\.id\)/.test(route) && !/body\??\.creator/.test(route))
  check("rate limited per person", /rateLimit\(\{[\s\S]*subjects: \[`user:\$\{user\.id\}`\][\s\S]*LIMITS\.search/.test(route))
  check("never answers from a cache", /no-store/.test(route))
  const logs = [...route.matchAll(/console\.\w+\(([^)]*)\)/g), ...readCode("lib/search/app-search.ts").matchAll(/console\.\w+\(([^)]*)\)/g)].map((m) => m[1])
  check("no log line carries the query", logs.length > 0 && logs.every((l) => !/\bq\b|query|rawQuery|body/.test(l)), logs)
  check("no database error text goes back to the browser", !/error\.message|\.message\s*\}/.test(route))

  console.log("\nThe search box")
  const box = readCode("components/app/app-search.tsx")
  const shell = readCode("components/app/sidebar.tsx")
  check("the header mounts the one search component", /<AppSearch ref=\{searchRef\} \/>/.test(shell))
  check("the old pages-only modal is gone from the sidebar", !/allSearchItems|searchShortcuts|setSearchOpen/.test(shell))
  /* The phone's header carried a magnifying glass beside Explore. That row is
     for who you are and what is waiting for you, and a third icon crowded
     both, so the button is gone and the search stays on the computer's header
     where the bar itself fits. This asserts the absence so it does not come
     back by accident. */
  check("no search button in the phone's header", !/aria-label="Search"/.test(shell))
  check("it asks the search route by POST", /fetch\("\/api\/app\/search", \{\s*method: "POST"/.test(box))
  check("after a pause, and cancels the request before", /setTimeout\([\s\S]*SEARCH_DEBOUNCE_MS\)/.test(box) && /controller\.abort\(\)/.test(box) && /signal: controller\.signal/.test(box))
  check("the field is 16px on a phone", /text-\[16px\]/.test(box))
  check("a combobox over a listbox, for screen readers and the keys", /role="combobox"/.test(box) && /role="listbox"/.test(box) && /aria-activedescendant=/.test(box))
  check("up, down, Enter and Escape", /"ArrowDown"/.test(box) && /"ArrowUp"/.test(box) && /"Enter"/.test(box) && /"Escape"/.test(box))
  check("the query is never logged in the browser either", !/console\./.test(box))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()

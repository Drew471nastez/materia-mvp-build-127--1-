/**
 * THE SERVER HALF, FOR THE PROBE. Reads the tracking requests Chromium sent
 * (a JSON file: [{ path, body, headers }]), hands each to the real pipeline
 * (lib/analytics/collect) with an in-memory database that keeps Postgres's
 * rules (tests/fake-supabase), and prints the rows it wrote as JSON.
 *
 * The probe's pages are served on 127.0.0.1; the site they stand for is
 * ana.storelib.com, so each address is moved there before it is judged, as
 * the request's own Host would be on the real site.
 */
import { readFileSync } from "node:fs"
import { FakeSupabase } from "../tests/fake-supabase"
import { collect, type CollectKind } from "../lib/analytics/collect"

const CREATOR = "aaaaaaaa-0000-4000-8000-000000000001"
const USER = "aaaaaaaa-0000-4000-8000-0000000000a1"
const SITE = "aaaaaaaa-5555-4000-8000-000000000001"
const PRODUCT = "aaaaaaaa-1111-4000-8000-000000000001"

type Sent = { path: string; body: Record<string, unknown>; headers: Record<string, string>; at: number }

async function main() {
  const sent = JSON.parse(readFileSync(process.argv[2], "utf8")) as Sent[]
  const db = new FakeSupabase()
  db.table("profiles", {}, [{ id: USER, username: "ana" }])
  db.table("creators", {}, [{ id: CREATOR, user_id: USER, slug: "ana" }])
  db.table("products", {}, [{ id: PRODUCT, creator_id: CREATOR }])
  db.table("store_theme_installs", {}, [{ id: SITE, creator_id: CREATOR, status: "published", sort_order: 0 }])
  db.table("analytics_events", { defaults: () => ({ id: crypto.randomUUID() }) })
  const outcomes: string[] = []
  for (const s of sent) {
    db.clock = s.at
    const move = (v: unknown) => (typeof v === "string" ? v.replace(/^http:\/\/127\.0\.0\.1:\d+/, "https://ana.storelib.com") : v)
    const body = { ...s.body, href: move(s.body.href), pageUrl: move(s.body.pageUrl) }
    const headers = new Headers({ ...s.headers, host: "ana.storelib.com", "x-forwarded-for": "203.0.113.9" })
    headers.delete("origin")
    const kind = (s.path === "/api/track-view" ? "view" : String(s.body.eventType)) as CollectKind
    const out = await collect(
      { kind, body, headers, cookie: () => undefined, cookieNames: [] },
      { db, now: () => db.clock, mainDomain: "storelib.com", isOwnVisit: async () => false, limited: async () => false },
    )
    outcomes.push(out.reason)
  }
  const rows = db.rows("analytics_events").map((r) => ({ event_type: r.event_type, property_type: r.property_type, property_id: r.property_id, path: r.path, product_id: r.product_id, link_url: r.link_url ?? null, session_id: r.session_id, visitor_id: r.visitor_id }))
  process.stdout.write(JSON.stringify({ outcomes, rows }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

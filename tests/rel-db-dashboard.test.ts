/**
 * DATABASE AND CREATOR DASHBOARD RELIABILITY (round rel-db, fix phase)
 *
 * 1. NO RAW CLIENT. Every server module under app/ and lib/ that talks to
 *    Supabase goes through the shared factories (lib/supabase/*), whose fetch
 *    gives every request a deadline (lib/net/deadline.ts). A client built from
 *    @supabase/supabase-js by hand waits up to undici's 300s instead. The few
 *    files owned by other areas (payments, Mailgun, crons, auth) are listed
 *    by name and reported, not changed here.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { AnalyticsUnavailable, countVisits, isAnalyticsUnavailable, readAll, readAudience, readNavClicks, type Admin, type CountQuestion } from "../lib/analytics/report-read"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })

/* Raw clients in files another area owns: reported for that area, not changed in this round. */
const OWNED_ELSEWHERE = new Set([
  "app/api/stripe/webhook/route.ts",
  "app/api/stripe/webhook/connect/route.ts",
  "lib/stripe/connect-webhook.ts",
  "app/api/webhooks/mailgun/route.ts",
  "app/api/cron/process-scheduled-emails/route.ts",
  "app/api/auth/unconfirmed-account/route.ts",
])

async function run() {
  console.log("\n1. Every server Supabase client has a deadline")
  const raw: string[] = []
  for (const file of [...walk("app"), ...walk("lib")]) {
    if (file.startsWith("lib/supabase/")) continue
    const src = readCode(file)
    if (/^\s*["']use client["']/m.test(src)) continue
    /* createClient imported from supabase-js itself, under any local name */
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@supabase\/supabase-js["']/)
    if (!m) continue
    const local = m[1].split(",").map((s) => s.trim()).find((s) => /^createClient(\s+as\s+\w+)?$/.test(s))
    if (!local) continue
    const name = local.includes(" as ") ? local.split(/\s+as\s+/)[1] : "createClient"
    const calls = [...src.matchAll(new RegExp(`\\b${name}\\(([\\s\\S]*?)\\n\\s*\\}?\\)`, "g"))]
    /* A call that passes the shared fetch is bounded; anything else waits on bare fetch. */
    const bounded = calls.length > 0 && calls.every((c) => /global:\s*\{\s*fetch:\s*(mediaFetch|deadlineFetch)/.test(c[1]))
    if (!bounded) raw.push(file)
  }
  const mine = raw.filter((f) => !OWNED_ELSEWHERE.has(f))
  check("no raw @supabase/supabase-js createClient outside lib/supabase (except files owned elsewhere)", mine.length === 0, mine)
  for (const f of [
    "app/api/domains/cleanup/route.ts",
    "app/api/wishlist/route.ts",
    "app/api/wishlist/check/route.ts",
    "app/api/wishlist/merge/route.ts",
    "app/api/security/confirm-device/route.ts",
    "app/api/security/verify-email/route.ts",
  ]) {
    check(`  ${f} uses createAdminClient from @/lib/supabase/admin`, /import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/.test(readCode(f)) && !/@supabase\/supabase-js/.test(readCode(f)))
  }
  check("  business login's anon client passes the shared fetch", /global: \{ fetch: mediaFetch \}/.test(readCode("lib/businesses/server.ts")))
  const wish = readCode("app/api/wishlist/route.ts")
  check("  the wishlist still answers empty (not a 500) when the service key is missing", /if \(!url \|\| !key\) \{[\s\S]*?return null[\s\S]*?\}\s*return createAdminClient\(\)/.test(wish))
  if (raw.some((f) => OWNED_ELSEWHERE.has(f))) console.log(`  note  still raw, owned by another area: ${raw.filter((f) => OWNED_ELSEWHERE.has(f)).join(", ")}`)

  await analytics()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/** An admin client that answers every rpc with `rpcAnswer` and every table read with no rows, recording what was asked. */
function fakeAdmin(rpcAnswer: { data: unknown; error: { code?: string; message: string } | null }) {
  const tables: string[] = []
  const rpcs: string[] = []
  const builder = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, bad)
          return () => builder()
        },
      },
    )
  const admin = {
    from(table: string) {
      tables.push(table)
      return builder()
    },
    rpc(fn: string) {
      rpcs.push(fn)
      const p = Promise.resolve(rpcAnswer)
      return Object.assign(p, { abortSignal: () => p })
    },
  }
  return { admin: admin as unknown as Admin, tables, rpcs }
}

async function analytics() {
  console.log("\n2. Analytics: raw events only when the function is missing")
  const now = Date.UTC(2026, 9, 30, 12)
  const q: CountQuestion = {
    creatorId: "00000000-0000-4000-8000-000000000001",
    selector: { type: "all" } as CountQuestion["selector"],
    properties: { onePageId: null, websites: [], defaultWebsite: null },
    product: null,
    window: { start: now - 7 * 86_400_000, end: now },
    previous: { start: now - 14 * 86_400_000, end: now - 7 * 86_400_000 },
    timeZone: "UTC",
    mainDomain: "storelib.com",
    part: "all",
    now,
  }

  /* Before the PGRST202 case: that one remembers "missing" for five minutes. */
  for (const [label, error] of [
    ["a statement timeout (57014)", { code: "57014", message: "canceling statement due to statement timeout" }],
    ["a 5xx from PostgREST", { code: "", message: "upstream connect error" }],
  ] as const) {
    const t0 = Date.now()
    const { admin, tables } = fakeAdmin({ data: null, error })
    let thrown: unknown = null
    try {
      await countVisits(admin, q)
    } catch (e) {
      thrown = e
    }
    check(`${label}: the report is "unavailable", not counted from raw rows`, isAnalyticsUnavailable(thrown) && thrown instanceof AnalyticsUnavailable, String(thrown))
    check(`  and analytics_events is never read`, !tables.includes("analytics_events"), tables)
    check(`  and it answers at once (${Date.now() - t0}ms)`, Date.now() - t0 < 1_000)
  }
  {
    const { admin, tables } = fakeAdmin({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })
    const a = await readAudience(admin, q, q.window)
    check("systems and carts: a failed function leaves the cards empty, no raw read", a.audience === null && !tables.includes("analytics_events"), tables)
    const n = await readNavClicks(admin, q)
    check("clicks between pages: a failed function leaves the card empty, no raw read", n === null && !tables.includes("analytics_events"), tables)
  }
  {
    const { admin, tables } = fakeAdmin({ data: null, error: { code: "PGRST202", message: "Could not find the function public.analytics_report" } })
    const counted = await countVisits(admin, q)
    check("the function missing (PGRST202): counted from the raw rows, as before", counted.counted === "rows" && tables.includes("analytics_events"), { counted: counted.counted, tables })
  }
  {
    let pages = 0
    const page = () => {
      pages++
      const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `${pages}-${i}`, created_at: new Date(now + pages * 1000 + i).toISOString() }))
      return Promise.resolve({ data: rows, error: null })
    }
    const read = await readAll(page, { until: Date.now() - 1 })
    check("a raw read past its wall clock stops after the page in hand and says truncated", read.truncated === true && pages === 1, { pages, truncated: read.truncated })
    pages = 0
    let n = 0
    const short = await readAll(() => {
      n++
      return Promise.resolve({ data: n === 1 ? Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, created_at: new Date(now + i).toISOString() })) : [{ id: "z", created_at: new Date(now + 5000).toISOString() }], error: null })
    })
    check("  without a wall clock every page is read (1,001 rows)", short.rows.length === 1001 && !short.truncated)
  }
  const route = readCode("app/api/analytics/reports/route.ts")
  check("the reports route has maxDuration = 60", /export const maxDuration = 60\b/.test(route))
  check("  and says unavailable (503, stream line) when the function failed", /isAnalyticsUnavailable\(error\)/.test(route) && /status: 503/.test(route))
  check("  Home's all time line drops out on a failed function instead of failing the report", /allTimeOf\(admin, q\.creatorId\)\.catch\(\(e\) => \{ if \(isAnalyticsUnavailable\(e\)\) return null/.test(readCode("lib/analytics/report-answer.ts")))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * "It takes so much and it never loads."
 *
 * My Library made eleven database round trips one after the other before it
 * could draw anything, on a route marked `force-dynamic` so nothing is cached
 * in front of it. Most of them had no reason to wait for each other.
 *
 * This drives the real lib/library/get-library-downloads.ts against clients
 * that take a fixed 60ms to answer, so the depth is measured on the clock
 * rather than counted by reading the source. Five queries that take 60ms each
 * cost 300ms in a line and 180ms at this shape.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getLibraryDownloads } from "../lib/library/get-library-downloads"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

/*
  Each fake query waits this long, and the checks below read the waves off the
  clock. At 60ms three waves measured 226ms against a bound of 216, and five in
  a line would have been 300: a scheduler hiccup of a few milliseconds was the
  difference between pass and fail, and the suite failed at random on a busy
  machine while passing on an idle one. The wait is longer so the gap between
  three waves and five is hundreds of milliseconds instead of tens. It costs
  the suite about half a second and it no longer races the clock.
*/
const LATENCY = 200

interface Call {
  table: string
  start: number
  end: number
}

/** Enough of the supabase builder for this one read, with a delay on it. */
function makeClient(rows: Record<string, any[]>, calls: Call[], t0: () => number) {
  return {
    from(table: string) {
      let pending: Promise<any> | null = null
      const run = () => {
        if (!pending) {
          const start = Date.now() - t0()
          pending = new Promise((resolve) => {
            setTimeout(() => {
              calls.push({ table, start, end: Date.now() - t0() })
              resolve({ data: rows[table] ?? [], error: null })
            }, LATENCY)
          })
        }
        return pending
      }
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        maybeSingle: () => run(),
        then: (a: any, b: any) => run().then(a, b),
      }
      return builder
    },
  }
}

async function main() {
  const calls: Call[] = []
  let base = Date.now()
  const t0 = () => base

  /*
    One product owned through an entitlement whose creator name is missing, so
    the creators and profiles lookups both have work to do, and one owned
    through an order, so both sources are exercised.
  */
  const supabase = makeClient(
    {
      entitlements: [
        {
          id: "e1",
          product_id: "p1",
          created_at: "2026-01-02T00:00:00Z",
          product: { id: "p1", type: "digital", title: "Pack", creator_id: "c1" },
          creator: null,
        },
      ],
    },
    calls,
    t0,
  )
  const admin = makeClient(
    {
      orders: [
        {
          id: "o1",
          product_id: "p2",
          created_at: "2026-01-01T00:00:00Z",
          product: { id: "p2", type: "digital", title: "Guide", creator_id: "c1" },
        },
      ],
      creators: [{ id: "c1", user_id: "u9", slug: "dee" }],
      profiles: [{ id: "u9", display_name: "Dee" }],
      digital_assets: [
        { id: "a1", product_id: "p1", file_name: "pack.zip", created_at: "2026-01-02T00:00:00Z" },
      ],
    },
    calls,
    t0,
  )

  base = Date.now()
  const started = Date.now()
  const downloads = await getLibraryDownloads("u1", { supabase, admin })
  const elapsed = Date.now() - started

  const at = (table: string) => calls.find((c) => c.table === table)
  const sumOfQueries = calls.length * LATENCY

  console.log(
    `\n  ${calls.length} queries, ${LATENCY}ms each: ${sumOfQueries}ms in a line, ${elapsed}ms as written`,
  )
  for (const c of calls.slice().sort((a, b) => a.start - b.start)) {
    console.log(`    ${String(c.start).padStart(4)}ms → ${String(c.end).padStart(4)}ms  ${c.table}`)
  }
  console.log("")

  // ── It still returns the right thing ──────────────────────────────────
  check("both sources still come back", downloads.length === 2, `got ${downloads.length}`)
  check(
    "the creator name is still resolved through creators → profiles",
    downloads.every((d) => d.creatorName === "Dee"),
    JSON.stringify(downloads.map((d) => d.creatorName)),
  )
  check(
    "the newest purchase is still first",
    downloads[0]?.productId === "p1",
    downloads[0]?.productId,
  )
  check(
    "files are still attached to their product",
    downloads.find((d) => d.productId === "p1")?.files.length === 1,
  )
  check("all five queries still run", calls.length === 5, `got ${calls.length}`)

  // ── And it no longer waits for each one in turn ───────────────────────
  const ent = at("entitlements")!
  const orders = at("orders")!
  const creators = at("creators")!
  const profiles = at("profiles")!
  const assets = at("digital_assets")!

  check(
    "entitlements and orders are in flight together",
    Math.abs(ent.start - orders.start) < LATENCY / 2,
    `entitlements at ${ent.start}ms, orders at ${orders.start}ms`,
  )
  check(
    "the files do not wait for the creator names",
    Math.abs(assets.start - creators.start) < LATENCY / 2,
    `digital_assets at ${assets.start}ms, creators at ${creators.start}ms`,
  )
  check(
    "profiles still waits for creators, because it needs their user ids",
    profiles.start >= creators.end - 5,
    `profiles at ${profiles.start}ms, creators finished at ${creators.end}ms`,
  )
  check(
    "three waves deep, not five",
    elapsed < LATENCY * 3.6,
    `${elapsed}ms, and five in a line would be ${sumOfQueries}ms`,
  )
  check(
    "measurably faster than one after the other",
    elapsed < sumOfQueries * 0.75,
    `${elapsed}ms against ${sumOfQueries}ms`,
  )

  // ── The page and the shell around it ask once between them ───────────
  /** The runner runs compiled tests from the repository root, as the other suites assume. */
  const page = readFileSync(join("app", "account", "library", "page.tsx"), "utf8")
  const layout = readFileSync(join("app", "account", "library", "layout.tsx"), "utf8")

  check(
    "the library page reads downloads, profile and wishlist together",
    /await Promise\.all\(\[\s*\n\s*getLibraryDownloads/.test(page),
    "the three reads are not in one Promise.all",
  )
  check(
    "the page does not ask Supabase who is signed in a second time",
    !/auth\.getUser\(\)/.test(page) && /currentUserForRequest\(\)/.test(page),
  )
  /* Changed on purpose: the page no longer draws the buyer's own face (that
     is /account now), so it has no profile row to read at all. What stays
     true is that it never reads one a second time. */
  check(
    "the page reads no second profile row",
    !/from\("profiles"\)/.test(page) && /profileForRequest\(/.test(layout),
  )
  check(
    "and the library's other reads run beside the downloads, not after them",
    /getLibraryDownloads\(user\.id\),\s*\n\s*getLibraryExtras\(user\.id\)/.test(page),
  )
  check(
    "the layout reads the user agent while the auth request is in flight",
    /await Promise\.all\(\[\s*\n\s*isCapacitorWebView\(\)/.test(layout),
  )

  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`  failing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

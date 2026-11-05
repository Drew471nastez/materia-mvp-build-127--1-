/**
 * Round 54: the database's load with almost no visitors.
 *
 * The owner's Supabase dashboard, 24 hours: 2,683,526 API requests (about
 * 31 a second), 154,391 Postgres log lines of which 153,830 were errors.
 * Measured on a production build against a counting, schema checking stand
 * in (the SQL harness's schema, every request counted by path):
 *
 *   1. The SEO cron (every ten minutes) fetched and scored pages with no
 *      floor on their age: on an inventory of 1,000 addresses each run
 *      fetched 1,410 to 1,565 pages, each a full render with its own reads,
 *      and read every sitemap file again. Now a page is scored, a site's
 *      pages listed and Google asked again only a day after the last time,
 *      and a new walk of the sitemap files starts six hours after the last.
 *   2. Reads that ask with the newest columns first and again without them
 *      were refused first on EVERY read on a database without the part:
 *      a Postgres ERROR line each time. The rung that answered is now
 *      remembered per server for ten minutes (lib/supabase/missing-memory,
 *      lib/supabase/tolerant-select).
 *   3. The live site read every page's drafts with its published sections,
 *      and the editor's theme read moved every base64 font and picture only
 *      to drop them.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { MISSING_FOR_MS, forgetMissing, isMissingSchema, readLadder, rememberRung, rememberedRung } from "../lib/supabase/missing-memory"
import { DROPPED_FOR_MS, selectTolerant } from "../lib/supabase/tolerant-select"
import { EXPAND_EVERY_MS, INSPECT_EVERY_MS, SCORE_EVERY_MS, dueFilter, nextToExpand, nextToInspect, nextToScore } from "../lib/admin/seo/store"
import { INVENTORY_EVERY_MS, walkDue } from "../lib/admin/seo/run"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

type Answer = { data: unknown; error: { code?: string; message?: string } | null }
const missing = (col: string): Answer => ({ data: null, error: { code: "42703", message: `column reviews.${col} does not exist` } })
const ok = (data: unknown = []): Answer => ({ data, error: null })

/* A PostgREST builder that records every call and answers `rows`. */
function recorder(rows: unknown[] = []) {
  const calls: { name: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  const proxy: unknown = new Proxy(chain, {
    get(_t, name: string) {
      if (name === "then") return (resolve: (v: Answer) => void) => resolve({ data: rows, error: null })
      return (...args: unknown[]) => {
        calls.push({ name, args })
        return proxy
      }
    },
  })
  return { admin: { from: (t: string) => (calls.push({ name: "from", args: [t] }), proxy) } as never, calls }
}

async function main() {
  console.log("\nA missing column is asked for once per server, not on every read\n")
  {
    forgetMissing()
    let asked: string[] = []
    const rungs = [
      async () => (asked.push("new"), missing("videos")),
      async () => (asked.push("mid"), missing("site_status")),
      async () => (asked.push("old"), ok([{ id: 1 }])),
    ]
    const first = await readLadder("t:reviews", rungs)
    check("the first read goes down the rungs until one answers", asked.join(" ") === "new mid old" && !first.error, asked)
    asked = []
    await readLadder("t:reviews", rungs)
    check("the next read starts on the rung that answered: no refused read first", asked.join(" ") === "old", asked)
    check("  remembered for MISSING_FOR_MS (ten minutes)", MISSING_FOR_MS === 10 * 60 * 1000 && rememberedRung("t:reviews") === 2)
    check("  then the top rung is tried again, so a part run in Supabase is picked up", rememberedRung("t:reviews", Date.now() + MISSING_FOR_MS + 1) === 0)
    asked = []
    const late = await readLadder("t:timeout", [async () => (asked.push("new"), { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }), async () => (asked.push("old"), ok())])
    check("a timeout is answered as it came: not asked again, nothing remembered", asked.join(" ") === "new" && late.error?.code === "57014" && rememberedRung("t:timeout") === 0)
    check("missing means 42703, PGRST204, 42P01, PGRST205, PGRST200 only", isMissingSchema({ code: "42703" }) && isMissingSchema({ code: "PGRST205" }) && !isMissingSchema({ code: "57014" }) && !isMissingSchema({ code: "23505" }) && !isMissingSchema(null))
    rememberRung("t:bottom", 5)
    asked = []
    await readLadder("t:bottom", [async () => (asked.push("a"), ok()), async () => (asked.push("b"), ok())])
    check("a remembered rung past the end starts on the last one", asked.join(" ") === "b")
    forgetMissing()
  }

  console.log("\nselectTolerant leaves out what it found missing, for a while\n")
  {
    let reads: string[] = []
    const read = async (columns: string) => {
      reads.push(columns)
      return columns.includes("weight_grams") ? { data: null, error: { code: "42703", message: "column products.weight_grams does not exist" } } : { data: [{ id: "p" }], error: null }
    }
    const warn = console.warn
    let warned = 0
    console.warn = () => {
      warned++
    }
    let clock = 1_000_000
    const now = () => clock
    const a = await selectTolerant("t:offers", "id, title, weight_grams", ["weight_grams"], read, now)
    check("the first read is refused once and asked again without the column", reads.length === 2 && a.dropped.join() === "weight_grams" && !a.error, reads)
    reads = []
    const b = await selectTolerant("t:offers", "id, title, weight_grams", ["weight_grams"], read, now)
    check("the next read asks without it at once: one read, no refusal", reads.length === 1 && reads[0] === "id, title" && b.dropped.join() === "weight_grams", reads)
    check("  and the warning is written once, not on every read", warned === 1, warned)
    clock += DROPPED_FOR_MS + 1
    reads = []
    await selectTolerant("t:offers", "id, title, weight_grams", ["weight_grams"], read, now)
    check("after DROPPED_FOR_MS the column is asked for again", reads[0] === "id, title, weight_grams", reads)
    console.warn = warn
  }

  console.log("\nThe SEO cron takes only what is due\n")
  {
    const now = Date.parse("2026-11-05T12:00:00.000Z")
    check("a day between scores, listings and inspections of one address", SCORE_EVERY_MS === 86_400_000 && EXPAND_EVERY_MS === 86_400_000 && INSPECT_EVERY_MS === 86_400_000)
    check("the filter is never checked or older than that, its time quoted for PostgREST", dueFilter("scored_at", SCORE_EVERY_MS, now) === 'scored_at.is.null,scored_at.lt."2026-11-04T12:00:00.000Z"', dueFilter("scored_at", SCORE_EVERY_MS, now))
    for (const [name, run, col] of [
      ["scores", (admin: never) => nextToScore(admin, 10, now), "scored_at"],
      ["site listings", (admin: never) => nextToExpand(admin, 4, now), "expanded_at"],
      ["inspections", (admin: never) => nextToInspect(admin, "sc-domain:storelib.com", 20, now), "inspected_at"],
    ] as const) {
      const { admin, calls } = recorder()
      await run(admin)
      const or = calls.find((c) => c.name === "or")
      check(`${name}: the queue asks only for rows due (${col})`, !!or && or.args[0] === dueFilter(col, 86_400_000, now), calls.map((c) => c.name))
      const order = calls.findIndex((c) => c.name === "order")
      check(`  and still oldest first`, order > 0 && (calls[order].args[0] as string) === col)
    }
    check("a walk of the sitemap files starts again six hours after the last one finished", INVENTORY_EVERY_MS === 6 * 3600_000 && !walkDue(new Date(now - 3600_000).toISOString(), now) && walkDue(new Date(now - 7 * 3600_000).toISOString(), now))
    check("  and at once when none has finished or the time cannot be read", walkDue(null, now) && walkDue("not a date", now))
    const run = readCode("lib/admin/seo/run.ts")
    check("the inventory step returns before reading any file while the last walk is fresh", /if \(state && state\.next_file >= state\.files\.length && !walkDue\(state\.sweep_finished_at, Date\.now\(\)\)\) return\s*if \(!state \|\| state\.next_file >= state\.files\.length\)/.test(run))
  }

  console.log("\nSelective reads\n")
  {
    const live = readCode("lib/website-builder/published-site.ts")
    check("the live site reads its pages' published sections, not the drafts beside them", /\.from\("store_theme_pages"\)\s*\.select\("page_key, sections"\)/.test(live))
    const compat = readCode("lib/website-builder/compat-site.ts")
    check("an imported theme's pages: the drafts only for a preview", compat.includes('.select((draft ? "page_key, sections, draft_sections" : "page_key, sections") as "page_key, sections, draft_sections")'))
    const files = readCode("app/api/website-builder/themes/[installId]/files/route.ts")
    check("the editor's theme read leaves base64 files with no draft in the database", files.includes(`.or('content.not.like."base64:*",draft_content.not.is.null')`))
    check("  which it still drops when one is there", /!text\.startsWith\("base64:"\)/.test(files))
    for (const [file, key] of [
      ["lib/reviews/storefront-server.ts", "reviews:storefront-rows"],
      ["lib/reviews/storefront-server.ts", "reviews:storefront-ratings"],
      ["lib/reviews/store.ts", "reviews:published"],
      ["lib/reviews/store.ts", "reviews:ratings"],
      ["lib/store/settings-server.ts", "store_settings:logo"],
      ["lib/products/product-section-data.ts", "product_options:swatches"],
    ] as const) {
      check(`${file}: ${key} goes through readLadder`, readCode(file).includes(`readLadder("${key}"`) || readCode(file).includes(`"${key}",`))
    }
    const options = readCode("lib/products/product-section-data.ts")
    check("product options are asked again only for a missing column, never after a timeout", !/if \(res\.error\) res = await db\.from\("product_options"\)/.test(options))
  }

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

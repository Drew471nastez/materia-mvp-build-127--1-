/**
 * ===========================================================================
 *  COMMUNITIES AND SHARED JOBS THAT HOLD (rel-shared)
 * ===========================================================================
 * Each case is one reliability gap found in the communities and shared
 * systems audit, simulated with a fake and measured:
 *
 *   a community file posted without the complete step   still size and content checked
 *   "Payout available" after holds are released           to the user id, awaited
 *   the community and physical crons                      one clock from the request, under maxDuration
 *   seo-index, warm-sites, notify (timed out in prod)     a hard stop under maxDuration, resumed next run
 *   crons and webhooks                                    no bare supabase-js client without a deadline
 *   rollup-daily, storage-cleanup with a failed step      answer 500, so the run is recorded failed and alerted
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/rel-shared.test.ts)
 */
import { ownedMedia } from "@/lib/communities/server/feed"
import { communityFilesExist } from "@/lib/communities/server/post-files"
import { MEMBER_FILE_MAX_BYTES } from "@/lib/communities/post-media"
import type { CommunityRow, PostMedia } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import { pushPayoutsAvailable } from "@/lib/payments/payout-push"
import { runBudgetMs, runDeadline } from "@/lib/observability/run-deadline"
import { recordFile } from "@/lib/admin/seo/store"
import { inspectUrl } from "@/lib/admin/seo/google"
import { warmPublishedSites } from "@/lib/website-builder/warm-sites"
import { runWork } from "@/lib/notify/engine"
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { register } from "node:module"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { cleanupFailures, rollupFailures, statusForFailures } from "@/lib/observability/step-failures"
import { join } from "node:path"
import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const realFetch = globalThis.fetch
const keepAlive = setInterval(() => {}, 1_000)

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(1), member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o } as Viewer
}
const community = { id: U(900), creator_id: U(800), slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow

/** Storage as the post's checks see it: a folder listing with sizes, signed reads, removals. Bytes are served by the fetch below. */
function storageFake(files: Record<string, { size: number; bytes: Uint8Array }>) {
  const removed: string[] = []
  const db = {
    from() {
      /* the security log: written, never read here */
      return { insert: async () => ({ error: null }) }
    },
    storage: {
      from(_bucket: string) {
        return {
          async list(folder: string, opts: { search: string }) {
            const found = Object.entries(files)
              .filter(([p]) => p === `${folder}/${opts.search}`)
              .map(([p, f]) => ({ name: p.split("/").pop(), metadata: { size: f.size } }))
            return { data: found, error: null }
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: `https://fake.storage/${encodeURIComponent(path)}` }, error: null }
          },
          async remove(paths: string[]) {
            removed.push(...paths)
            return { data: null, error: null }
          },
        }
      },
    },
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input)
    const path = decodeURIComponent(href.replace("https://fake.storage/", ""))
    const f = files[path]
    if (!f) return new Response(null, { status: 404 })
    const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? "")
    const m = /bytes=(\d+)-(\d+)/.exec(range)
    const start = m ? Number(m[1]) : 0
    const end = m ? Number(m[2]) : f.bytes.length - 1
    return new Response(f.bytes.slice(start, end + 1), { status: 206 })
  }) as typeof fetch
  return { db, removed }
}

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n")
/** A Windows program: "MZ", then the PE header the sniffer looks for. */
const exeBytes = (() => {
  const b = new Uint8Array(512)
  b[0] = 0x4d
  b[1] = 0x5a
  b[0x3c] = 0x80
  b[0x80] = 0x50
  b[0x81] = 0x45
  return b
})()
const pathOf = (fileId: string, ext: string, uploader = U(1)) => `${U(800)}/community-files/${U(900)}/${uploader}/${fileId}.${ext}`
const fileMedia = (fileId: string, name: string, size: number): PostMedia => ({ type: "file", assetId: fileId, name, size, store: "community" }) as PostMedia

async function main() {
  // -------------------------------------------------------------------------
  console.log("\nA community file posted without the complete step is still checked (F1)")
  {
    /* The browser called prepare, PUT a program renamed .pdf, and never called complete. */
    const disguised = storageFake({ [pathOf(U(11), "pdf")]: { size: exeBytes.length, bytes: exeBytes } })
    const r = await ownedMedia(disguised.db as never, community, viewer(), [fileMedia(U(11), "Notes.pdf", exeBytes.length)])
    check("a program named .pdf is refused at posting", !r.ok, r)
    check("and it is removed from storage, as complete would have", disguised.removed.includes(pathOf(U(11), "pdf")), disguised.removed)

    /* Over the member's 50 MB limit (storage's own record of the size), never completed. */
    const huge = storageFake({ [pathOf(U(12), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const big = await ownedMedia(huge.db as never, community, viewer(), [fileMedia(U(12), "Big.pdf", 1000)])
    check("a file over the member's limit is refused at posting, saying the limit", !big.ok && /50 MB/.test((big as { error: string }).error), big)
    check("and it is removed", huge.removed.includes(pathOf(U(12), "pdf")))

    /* Staff may send up to 500 MB: the same size from a moderator is taken. */
    const staffBig = storageFake({ [pathOf(U(13), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const mod = await ownedMedia(staffBig.db as never, community, viewer({ role: "moderator" }), [fileMedia(U(13), "Big.pdf", 1000)])
    check("a moderator's file over the member limit is taken (staff limit)", mod.ok && staffBig.removed.length === 0, mod)

    /* The ordinary path: a real PDF, completed or not, posts as before with its checked name. */
    const fine = storageFake({ [pathOf(U(14), "pdf")]: { size: pdfBytes.length, bytes: pdfBytes } })
    const ok = await ownedMedia(fine.db as never, community, viewer(), [fileMedia(U(14), "Plan.pdf", pdfBytes.length)])
    check("a real PDF posts, keeping its name, nothing removed", ok.ok && (ok.value[0] as { name: string }).name === "Plan.pdf" && fine.removed.length === 0, ok)

    /* Existing posts: a file the post already had is not looked at again (not even listed), so old posts edit as before. */
    const empty = storageFake({})
    const kept = fileMedia(U(15), "Old.pdf", 10)
    const edit = await ownedMedia(empty.db as never, community, viewer(), [kept], [kept])
    check("a file a post already had is kept without a new check", edit.ok && empty.removed.length === 0, edit)

    /* Not there at all: the old sentence. */
    const none = await communityFilesExist(storageFake({}).db as never, community, U(1), [{ fileId: U(16), name: "x.pdf" }])
    check("a file that never arrived is still refused with the upload again sentence", !none.ok && /Upload it again/.test((none as { error: string }).error))
    globalThis.fetch = realFetch
  }

  // -------------------------------------------------------------------------
  console.log("\n\"Payout available\" goes to the seller's user id, and the run waits for it (F2)")
  {
    const creators: Record<string, string> = { [U(501)]: U(601), [U(502)]: U(602) }
    const asked: string[][] = []
    const db = {
      from(table: string) {
        return {
          select() {
            return {
              async in(_col: string, ids: string[]) {
                asked.push([table, ...ids])
                return { data: ids.filter((id) => creators[id]).map((id) => ({ id, user_id: creators[id] })), error: null }
              },
            }
          },
        }
      },
    }
    const sentTo: [string, number][] = []
    let inFlight = 0
    const send = async (userId: string, cents: number) => {
      inFlight++
      await new Promise((r) => setTimeout(r, 20))
      sentTo.push([userId, cents])
      inFlight--
    }
    const r = await pushPayoutsAvailable(db as never, [{ creatorId: U(501), cents: 1200 }, { creatorId: U(502), cents: 0 }, { creatorId: U(503), cents: 500 }], { send })
    check("the push goes to the creator's user id, read from creators", sentTo.length === 1 && sentTo[0][0] === U(601) && sentTo[0][1] === 1200, sentTo)
    check("nothing released, no push; a creator with no account is skipped", r.sent === 1 && r.skipped === 1, r)
    check("the creators are read once, by id", asked.length === 1 && asked[0][0] === "creators", asked)
    check("every send has finished when the helper returns (awaited, nothing left in flight)", inFlight === 0)

    const failing = await pushPayoutsAvailable(db as never, [{ creatorId: U(501), cents: 1 }], { send: async () => { throw new Error("no device") } })
    check("a push that fails never fails the run", failing.sent === 0 && failing.skipped === 1)

    let t = 0
    const slow = await pushPayoutsAvailable(db as never, Array.from({ length: 50 }, () => ({ creatorId: U(501), cents: 1 })), { send: async () => { t += 1_000 }, budgetMs: 25_000, now: () => t })
    check("past its time budget the rest wait for the next run", slow.sent === 30 && slow.skipped === 20, slow)

    const route = code("app/api/cron/release-holds/route.ts")
    check("release-holds no longer calls notifyPayoutAvailable with a creator id, fire and forget", !/notifyPayoutAvailable\(/.test(route))
    check("release-holds awaits the payout pushes on both paths", (route.match(/await pushPayoutsAvailable\(/g) ?? []).length === 2)
  }

  // -------------------------------------------------------------------------
  console.log("\nOne clock for a whole cron run (F3 community, F4 physical)")
  {
    /* The community run's steps, each spending ALL of the budget it is handed (a busy queue): the old shape was 10 + 45 + 10 + 15 s. */
    let t = 1_000_000
    const run = runDeadline(runBudgetMs(60), { started: t, now: () => t })
    const spent: [string, number][] = []
    const step = (name: string, ms: number) => {
      if (ms > 0) {
        spent.push([name, ms])
        t += ms
      }
    }
    t += 300 /* auth and the switch */
    step("posts", run.share(10_000))
    step("jobs", run.shareUntil(35_000, 45_000))
    step("deletions", run.share(10_000))
    step("automations", run.share(15_000))
    check("every step's budget is never negative", spent.every(([, ms]) => ms >= 0), spent)
    check("the whole run ends by 52 s from the request, under the 60 s maxDuration", t - run.started <= 52_000, { total: t - run.started, spent })
    check("the job queue stops by 35 s, so the later steps still get a turn", spent.some(([n]) => n === "deletions") && spent.some(([n]) => n === "automations"), spent)
    t = run.until - 1_000
    check("a step with under two seconds left is skipped, not started", run.share(15_000) === 0)
    check("runBudgetMs leaves a margin under maxDuration", runBudgetMs(60) === 52_000 && runBudgetMs(300) === 292_000)

    const community = code("app/api/cron/community/route.ts")
    check("community: the clock is taken before anything else in the run", /async function runJob\(request: Request\) \{\s*const run = runDeadline\(runBudgetMs\(maxDuration\)\)/.test(community))
    check("community: no step has a fixed budget counted from its own start any more", !/publishDuePosts\(db, Date\.now\(\), 10_000\)/.test(community) && !/runDueDeletions\(db, 10_000\)/.test(community) && !/runChatAutomations\(db, Date\.now\(\), 15_000\)/.test(community) && !/\{ budgetMs: RUN_BUDGET_MS \}/.test(community))

    const physical = code("app/api/cron/physical/route.ts")
    check("physical: the clock starts at the request, before the Stripe sweep and the follow-ups", /async function runJob\(request: Request\) \{\s*const run = runDeadline\(runBudgetMs\(maxDuration\)\)\s*const started = run\.started/.test(physical) && physical.indexOf("const started") < physical.indexOf("cancelStaleSitePayments(") && (physical.match(/const started =/g) ?? []).length === 1)
    check("physical: the Stripe sweep has a limit and a deadline", /cancelStaleSitePayments\(db, Date\.now\(\), SWEEP_LIMIT, started \+ SWEEP_UNTIL_MS\)/.test(physical))
    check("physical: no guard past the run's 52 s", ![...physical.matchAll(/started < (\d+)_000/g)].some((m) => Number(m[1]) > 52))
  }

  console.log("\nThe Stripe sweep stops starting cancels at its deadline (F4)")
  {
    const { cancelStaleSitePayments } = await import("@/lib/checkout/site-payment-sweep")
    const db = {
      from() {
        const q: Record<string, unknown> = {}
        for (const k of ["select", "eq", "is", "not", "lt"]) q[k] = () => q
        q.limit = async () => ({ data: [{ id: "c1", stripe_payment_intent_id: "pi_1", coupon_id: null, coupon_holder: null }], error: null })
        return q
      },
    }
    const counts = await cancelStaleSitePayments(db as never, Date.now(), 20, Date.now() - 1)
    check("past its deadline no Stripe cancel is started (nothing swept, nothing thrown)", counts.shipped === 0 && counts.baskets === 0, counts)
  }

  // -------------------------------------------------------------------------
  console.log("\nseo-index: a sitemap file unfinished at the hard stop is written again next run (item 4)")
  {
    const upserts: number[] = []
    let leftMarked = false
    const admin = {
      from() {
        return {
          upsert: async (rows: unknown[]) => {
            upserts.push(rows.length)
            return { error: null }
          },
          update() {
            leftMarked = true
            const q: Record<string, unknown> = {}
            for (const k of ["eq", "lt"]) q[k] = () => q
            q.select = async () => ({ data: [], error: null })
            return q
          },
        }
      },
    }
    const addresses = Array.from({ length: 1200 }, (_, i) => ({ url: `https://storelib.com/p/${i}`, kind: "product" as never, source: "products-1-of-1", property: "sc-domain:storelib.com" }))
    const late = await recordFile(admin as never, "products-1-of-1", addresses, new Date().toISOString(), Date.now() - 1)
    check("past the hard stop no batch is written and nothing is marked as left the sitemap", !late.complete && upserts.length === 0 && !leftMarked, { late, upserts, leftMarked })
    const whole = await recordFile(admin as never, "products-1-of-1", addresses, new Date().toISOString())
    check("with time, the file is written in batches of 500 and finished as before", whole.complete && upserts.join(",") === "500,500,200" && leftMarked && whole.written === 1200, { whole, upserts })

    const run = code("lib/admin/seo/run.ts")
    check("the walk stays on an unfinished file (next_file not moved past it)", /if \(!result\.complete\) \{\s*summary\.files\.push\(\{ name, listed: result\.written, left: 0, unfinished: true \}\)\s*break\s*\}/.test(run))
    check("a site's pages unfinished are not marked expanded", /if \(!result\.complete\) break\s*summary\.sites\+\+/.test(run))
    check("the run's clock is the request's: the route passes when it started", /runSeoCron\(\{ budgetMs: RUN_BUDGET_MS, started \}\)/.test(code("app/api/cron/seo-index/route.ts")) && /const started = options\.started \?\? Date\.now\(\)/.test(run))
    check("budget 48 s + hard stop 4 s stays under maxDuration 60 s", /RUN_BUDGET_MS = 48_000/.test(code("app/api/cron/seo-index/route.ts")) && /SEO_HARD_STOP_MS = 4_000/.test(run))
    check("no page score is started later than its worst case before the hard stop", /const lastStart = deadline - \(SCORE_WORST_MS - SEO_HARD_STOP_MS\)/.test(run) && /SCORE_WORST_MS = 20_000/.test(run))

    let aborted = 0
    const t0 = Date.now()
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => { aborted = Date.now() - t0; reject(new Error("aborted")) }))) as typeof fetch
    await inspectUrl("t", "https://storelib.com/", "sc-domain:storelib.com", hang, 1_200).catch(() => undefined)
    check("a Google inspection takes only the time the run has left (not its full 20 s)", aborted > 0 && aborted < 3_000, aborted)
  }

  console.log("\nwarm-sites: every request ends by the hard stop, and the next run starts at the first site not finished (item 4)")
  {
    const before = process.env.VERCEL_DEPLOYMENT_ID
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_test"
    let saved: { offset?: number; done?: boolean } | null = null
    const admin = {
      from() {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: async (row: { value: { offset: number; done: boolean } }) => {
            saved = row.value
            return { error: null }
          },
        }
      },
    }
    const origins = Array.from({ length: 10 }, (_, i) => `https://site${i}.storelib.com`)
    /* Sites 0 to 3 answer at once; site 4 onwards never answers (a cold deploy, a stuck page). */
    const fetcher = ((url: string, init?: RequestInit) => {
      const n = Number(/site(\d+)/.exec(String(url))?.[1])
      if (n < 4) return Promise.resolve(new Response("", { status: 200 }))
      return new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
    }) as typeof fetch
    const t0 = Date.now()
    const r = await warmPublishedSites({ budgetMs: 300, hardStopMs: 1_500, fetcher, admin: admin as never, origins: async (from: number) => (from === 0 ? { origins, read: origins.length } : { origins: [], read: 0 }) })
    const took = Date.now() - t0
    check("the run ends near its hard stop, not after 15 s per stuck page", took < 3_000, took)
    check("the next run starts at the first site not finished (offset 4), not at the top of the page", saved !== null && (saved as { offset: number }).offset === 4 && r.sites === 4, { saved, r })
    if (before === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
    else process.env.VERCEL_DEPLOYMENT_ID = before
    check("the warm route's clock is the request's", /const started = Date\.now\(\)\s*const denied/.test(code("app/api/cron/warm-sites/route.ts")) && /warmPublishedSites\(\{ budgetMs: RUN_BUDGET_MS, started \}\)/.test(code("app/api/cron/warm-sites/route.ts")))
  }

  console.log("\nnotify: the batch in hand starts no job past the hard stop; those go back to the queue (item 4)")
  {
    const handedBack: [string, boolean][] = []
    let claims = 0
    const job = (id: string) => ({ id, type: "x", recipient_user_id: "u1", recipient_email: null, attempts: 1, max_attempts: 5, data: {} })
    const store = {
      claimEvents: async () => [],
      claimJobs: async () => (claims++ === 0 ? [job("j1"), job("j2"), job("j3")] : []),
      rescheduleJob: async (id: string, _w: string, _at: string, _e: string | null, countAttempt: boolean) => {
        handedBack.push([id, countAttempt])
        return true
      },
    }
    const summary = await runWork({ store: store as never, email: null, inApp: null, worker: "w" }, 10_000, { hardStopMs: 0 })
    check("past the hard stop every claimed job is handed back, not counted as an attempt", handedBack.length === 3 && handedBack.every(([, counted]) => counted === false), handedBack)
    check("and the run says it stopped for time", summary.stoppedForTime === true)
    const route = code("app/api/cron/notify/route.ts")
    check("notify: the clock starts with the request and the forwarding takes only what is left", /async function runJob\(request: Request\) \{\s*const run = runDeadline\(runBudgetMs\(maxDuration\)\)/.test(route) && /const forwardMs = run\.share\(10_000\)/.test(route) && !/Math\.max\(2_000, 55_000/.test(route))
  }

  // -------------------------------------------------------------------------
  console.log("\nCrons and webhooks use the deadline-wrapped admin client (item 5)")
  {
    const walk = (dir: string): string[] =>
      readdirSync(join(process.cwd(), dir)).flatMap((f) => {
        const p = `${dir}/${f}`
        return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
      })
    const files = [...walk("app/api/cron"), ...walk("app/api/webhooks")]
    const bare = files.filter((f) => {
      const src = code(f)
      return /import\s*\{[^}]*\bcreateClient\b[^}]*\}\s*from\s*["']@supabase\/supabase-js["']/.test(src) && !/import\s+type\s*\{[^}]*\bcreateClient\b/.test(src)
    })
    check("no cron or webhook builds a bare supabase-js client (no request deadline, no schema-reload retry)", bare.length === 0, bare)
    check("the email cron and the Mailgun webhook use createAdminClient", ["app/api/cron/process-scheduled-emails/route.ts", "app/api/webhooks/mailgun/route.ts"].every((f) => /const supabaseAdmin = createAdminClient\(\)/.test(code(f))))
    check("and createAdminClient's fetch is the deadline one", /global: \{ fetch: mediaFetch \}/.test(code("lib/supabase/admin.ts")) && /return deadlineFetch\(input, init\)/.test(code("lib/storage/media-url.ts")))
  }

  // -------------------------------------------------------------------------
  console.log("\nA cron whose steps failed answers 500, so recordCronRun records and reports it (item 6)")
  {
    check("no failures: 200; any: 500", statusForFailures([]) === 200 && statusForFailures(["x"]) === 500)
    const f = rollupFailures([{ date: "2026-10-30", error: "boom" }, { date: "2026-10-29", propertiesError: "nope" }, { date: "2026-10-28" }], [{ day: "2026-10-30", error: "part 126 has not run" }, { day: "2026-10-29", error: "timeout" }], { error: "sweep failed" })
    check("each failed rollup, property rollup, performance day and the site speed sweep are listed; a part not run yet is not", f.length === 4 && f.some((x) => /^rollup 2026-10-30/.test(x)) && f.some((x) => /^property rollup 2026-10-29/.test(x)) && f.some((x) => /^performance 2026-10-29/.test(x)) && !f.some((x) => /part 126/.test(x)) && f.some((x) => /^website speed/.test(x)), f)
    const c = cleanupFailures({ files: ["product-images: denied"], "deleted rows": null, "ops logs": "timeout", "community uploads": [], "cart uploads": [] })
    check("storage-cleanup's failures from each sweep and purge", c.length === 2 && c[0] === "files: product-images: denied" && c[1] === "ops logs: timeout", c)

    /* The real rollup-daily route, with the database answering an error for the rollup RPC. */
    const dir = mkdtempSync(join(tmpdir(), "rel-shared-stubs-"))
    const stub = (name: string, source: string) => {
      const file = join(dir, `${name}.mjs`)
      writeFileSync(file, source)
      return pathToFileURL(file).href
    }
    const stubs: Record<string, string> = {
      "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => ({ rpc: async (name) => (globalThis.__rpcFails && name === "refresh_daily_rollup" ? { data: null, error: { message: "relation does not exist" } } : { data: 3, error: null }), from: () => ({ select: () => ({ gte: () => ({ lt: async () => ({ data: [], error: null }) }) }) }) })\n`),
      "@/lib/perf/daily": stub("perf", `export const rollupAndScorePerfDay = async (day) => ({ day, rolledUp: 1, score: 90 })\n`),
      "@/lib/website-builder/web-performance-read": stub("sites", `export const rollupPendingSiteDays = async () => ({ days: 0, rows: 0, left: 0, cleaned: 0 })\n`),
      "@/lib/observability/report": stub("report", `export const recordCronRun = (_j, _r, run) => run()\n`),
    }
    register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })
    const file = join(process.env.PUSH_TEST_OUT || dir, "__rollup-route__", "route.mjs")
    await build({
      entryPoints: [join(process.cwd(), "app/api/cron/rollup-daily/route.ts")], outfile: file, bundle: true, format: "esm", platform: "node", target: "node20",
      logLevel: "error", alias: { "@": process.cwd() }, packages: "external",
      plugins: [{ name: "stand-ins", setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.path in stubs ? { path: a.path, external: true } : undefined)) } }],
      external: ["next/*", "server-only"],
    })
    const route = (await import(pathToFileURL(file).href)) as { POST: (r: Request) => Promise<Response> }
    process.env.CRON_SECRET = "test-secret"
    const call = () => route.POST(new Request("https://storelib.com/api/cron/rollup-daily?date=2026-10-30", { method: "POST", headers: { authorization: "Bearer test-secret" } }))
    const quietError = console.error
    console.error = () => {}
    ;(globalThis as { __rpcFails?: boolean }).__rpcFails = true
    const bad = await call()
    ;(globalThis as { __rpcFails?: boolean }).__rpcFails = false
    const good = await call()
    console.error = quietError
    const badBody = (await bad.json()) as { success: boolean; failed: string[] }
    check("rollup-daily with a failed RPC answers 500 (recordCronRun records it not ok and reports it)", bad.status === 500 && badBody.success === false && badBody.failed.length === 1, { status: bad.status, badBody })
    check("rollup-daily with every step fine still answers 200", good.status === 200, good.status)
    check("storage-cleanup answers its failures' status", /status: statusForFailures\(failed\)/.test(code("app/api/cron/storage-cleanup/route.ts")) && /cleanupFailures\(\{ files: summary\.errors/.test(code("app/api/cron/storage-cleanup/route.ts")))
  }

  clearInterval(keepAlive)
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

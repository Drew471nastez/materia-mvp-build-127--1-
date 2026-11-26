/**
 * ROUND 51: THE EDITOR OPENS, PUBLISHES AND LISTS ITS FILES THROUGH A BAD NETWORK
 *
 * The owner: "Sometimes I reload the editor and it doesn't load at all",
 * "When I click Publish, sometimes it gets stuck forever", "The code editor
 * doesn't fetch the website's files: sometimes there are no sections in it",
 * and the "published" notice over the black top bar.
 *
 * Measured in a browser by scripts/check-editor-r51.mjs. Here, the parts that
 * decide it, run against every way the network misbehaves:
 *
 *   hedged        a read with no answer is sent again beside itself, so one
 *                 hung request is not the whole wait
 *   runPublish    a press always ends: published, refused, unfinished or
 *                 unconfirmed, never a spinner; a lost answer is recovered
 *                 from the job; the same press resent is one job
 *   publish-job   the route's job: the same id is one publish, a job past its
 *                 deadline reads as expired
 *   the files list   read a thousand at a time, and a failure is said
 *   the editor's open   newest open wins, a Try again after OPEN_SLOW_MS
 *   the notice    under the bar on a phone, at the foot on a computer
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hedged } from "@/lib/website-builder/load-guard"
import { runPublish, PUBLISH_TIMES, type PublishRunDeps } from "@/lib/website-builder/publish-run"
import { beginJob, isJobId, stateOf, PUBLISH_JOB_DEADLINE_S } from "@/lib/website-builder/publish-job"

let passed = 0
let failed = 0
const failures: string[] = []
const out = (s: string) => process.stdout.write(`${s}\n`)
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    failures.push(name)
  }
  out(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`)
}
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* A clock the publish runs on, moved by its own waits, so a two minute press takes no time here. */
function fakeClock() {
  let t = 0
  return { now: () => t, wait: async (ms: number) => { t += ms; await Promise.resolve() }, advance: (ms: number) => { t += ms } }
}

type Answer = { status: number; body: { job?: unknown; error?: unknown } | null }
function deps(clock: ReturnType<typeof fakeClock>, post: (n: number, job: string) => Promise<Answer>, status: (n: number, job: string) => Promise<Answer>): PublishRunDeps & { posts: string[]; asks: number } {
  const d = {
    posts: [] as string[],
    asks: 0,
    post: (job: string) => { d.posts.push(job); return post(d.posts.length, job) },
    status: (job: string) => { d.asks++; return status(d.asks, job) },
    wait: clock.wait,
    now: clock.now,
    newId: () => "11111111-2222-4333-8444-555555555555",
  }
  return d
}
/* A POST that never answers until its own deadline: the clock moves to the deadline and it rejects. */
const hang = (clock: ReturnType<typeof fakeClock>) => async (): Promise<Answer> => { clock.advance(PUBLISH_TIMES.postMs); await Promise.resolve(); throw new Error("took longer than 20s") }

async function main() {
  out("\nA read with no answer is sent again beside itself (load-guard.ts hedged)")
  {
    let tries = 0
    const t0 = Date.now()
    const v = await hedged((n) => { tries++; return n === 0 ? new Promise<string>(() => {}) : sleep(10).then(() => "second") }, 40)
    check("a first try that hangs is answered by the second", v === "second" && tries === 2 && Date.now() - t0 < 500, { v, tries })
    let quick = 0
    await hedged(() => { quick++; return Promise.resolve("ok") }, 40)
    await sleep(80)
    check("an answer in time sends nothing more", quick === 1, quick)
    let fails = 0
    const e = await hedged(() => { fails++; return Promise.reject(new Error(`no ${fails}`)) }, 40).catch((x: Error) => x.message)
    check("every try failing is the last error, the spare sent at once rather than after its wait", e === "no 2" && fails === 2, { e, fails })
    let firstFails = 0
    const after = await hedged((n) => { firstFails++; return n === 0 ? Promise.reject(new Error("dropped")) : Promise.resolve("spare") }, 10_000)
    check("a first try that fails at once is followed by the spare at once", after === "spare" && firstFails === 2, { after, firstFails })
  }

  out("\nA press of Publish always ends, and says how (publish-run.ts)")
  {
    const c = fakeClock()
    const d = deps(c, async () => ({ status: 200, body: { ok: true } as never }), async () => ({ status: 200, body: { job: "running" } }))
    check("answered: published", (await runPublish(d)).ok === true && d.posts.length === 1)
  }
  {
    const c = fakeClock()
    const d = deps(c, async () => ({ status: 400, body: { error: "Invalid action" } }), async () => ({ status: 200, body: { job: "unknown" } }))
    const o = await runPublish(d)
    check("refused: the route's own words, sent once", !o.ok && o.kind === "refused" && o.error === "Invalid action" && d.posts.length === 1, o)
  }
  {
    const c = fakeClock()
    let done = false
    const d = deps(c, async () => { c.advance(PUBLISH_TIMES.postMs); done = true; throw new Error("lost") }, async () => ({ status: 200, body: { job: done ? "done" : "running" } }))
    const o = await runPublish(d)
    check("an answer lost after it published: published, from the job", o.ok === true && d.posts.length === 1, { o, posts: d.posts.length })
  }
  {
    const c = fakeClock()
    const d = deps(c, () => new Promise<Answer>(() => {}), async (n) => ({ status: 200, body: { job: n >= 2 ? "done" : "running" } }))
    const t0 = c.now()
    const o = await runPublish(d)
    check("an answer that never comes, the job done: known within seconds, not the POST's whole wait", o.ok === true && c.now() - t0 <= PUBLISH_TIMES.firstAskMs + 2 * PUBLISH_TIMES.pollMs, { o, took: c.now() - t0 })
  }
  {
    const c = fakeClock()
    const d = deps(c, hang(c), async () => ({ status: 200, body: { job: "unknown" } }))
    const o = await runPublish(d)
    check("never arrived, twice: said, after one resend of the same press", !o.ok && o.kind === "unconfirmed" && d.posts.length === 2 && d.posts[0] === d.posts[1], { o, posts: d.posts.length })
  }
  {
    const c = fakeClock()
    const d = deps(c, hang(c), async (n) => ({ status: 200, body: { job: n > 3 ? "expired" : "running" } }))
    const o = await runPublish(d)
    check("running past its deadline: said as unfinished, Publish free again", !o.ok && o.kind === "unfinished", o)
  }
  {
    const c = fakeClock()
    const d = deps(c, async (n) => (n === 1 ? { status: 503, body: { error: "gateway" } } : { status: 200, body: {} }), async () => ({ status: 200, body: { job: "unknown" } }))
    const o = await runPublish(d)
    check("a gateway's 503 that never reached the job: sent again, published", o.ok === true && d.posts.length === 2, { o, posts: d.posts.length })
  }
  {
    const c = fakeClock()
    const d = deps(c, async (n) => { if (n === 1) { c.advance(PUBLISH_TIMES.postMs); throw new Error("lost") } return { status: 200, body: {} } }, async () => ({ status: 200, body: { job: "untracked" } }))
    const o = await runPublish(d)
    check("no jobs kept (before SQL part 360): a lost answer is sent once more", o.ok === true && d.posts.length === 2, { o, posts: d.posts.length })
  }
  {
    const c = fakeClock()
    const d = deps(c, () => new Promise<Answer>(() => {}), async () => { throw new Error("no answer") })
    const o = await runPublish(d)
    check("nothing answers at all: it still ends, within PUBLISH_TIMES.totalMs", !o.ok && c.now() <= PUBLISH_TIMES.totalMs + PUBLISH_TIMES.pollMs, { o, at: c.now() })
  }
  {
    const c = fakeClock()
    const phases: string[] = []
    const d = { ...deps(c, () => new Promise<Answer>(() => {}), async (n) => ({ status: 200, body: { job: n > 6 ? "done" : "running" } })), onPhase: (p: string) => phases.push(p) }
    await runPublish(d)
    check("a slow press says so (Still publishing)", phases.includes("slow"), phases)
  }
  {
    const c = fakeClock()
    const d = deps(c, async () => ({ status: 202, body: { job: "running" } }), async (n) => ({ status: 200, body: { job: n > 1 ? "failed" : "running", error: "Could not publish. Nothing changed: the website that was live still is." } }))
    const o = await runPublish(d)
    check("the same press already running: followed to its end, with the route's words", !o.ok && o.kind === "refused" && /Nothing changed/.test(o.error) && d.posts.length === 1, o)
  }

  out("\nThe route's job (publish-job.ts)")
  {
    check("a job id is a uuid", isJobId("11111111-2222-4333-8444-555555555555") && !isJobId("x") && !isJobId(null))
    const soon = new Date(Date.now() + 60_000).toISOString()
    const gone = new Date(Date.now() - 1_000).toISOString()
    check("a running job before its deadline is running", stateOf({ status: "running", error: null, deadline_at: soon }).state === "running")
    check("a running job past its deadline is expired", stateOf({ status: "running", error: null, deadline_at: gone }).state === "expired")
    check("a finished job keeps its state and words", stateOf({ status: "failed", error: "No", deadline_at: gone }).error === "No")
    check("no row is unknown", stateOf(null).state === "unknown")
    check("the deadline is past the route's maxDuration", PUBLISH_JOB_DEADLINE_S > Number(/export const maxDuration = (\d+)/.exec(src("app/api/website-builder/themes/[installId]/publish/route.ts"))?.[1] ?? 999))
    /* A database that has the job: the same id twice is the first one's state. */
    const rows = new Map<string, Record<string, unknown>>()
    const db = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => (rows.has(String(row.id)) ? { error: { code: "23505" } } : (rows.set(String(row.id), row), { error: null })),
        select: () => ({ eq: (_c: string, id: unknown) => ({ eq: () => ({ maybeSingle: async () => ({ data: rows.get(String(id)) ?? null, error: null }) }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => { rows.set(String(id), { ...rows.get(String(id)), ...patch }); return { error: null } } }),
        delete: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }),
      }),
    }
    const job = { id: "11111111-2222-4333-8444-555555555555", installId: "i", creatorId: "c" }
    const first = await beginJob(db as never, job)
    const again = await beginJob(db as never, job)
    check("the first press of an id begins a job", first.kind === "new")
    check("the same press sent again is told it is running, not published twice", again.kind === "seen" && again.state === "running", again)
    const missing = { from: () => ({ insert: async () => ({ error: { code: "42P01", message: 'relation "theme_publish_jobs" does not exist' } }) }) }
    check("before SQL part 360: untracked, and the publish goes ahead", (await beginJob(missing as never, job)).kind === "untracked")
    const route = src("app/api/website-builder/themes/[installId]/publish/route.ts")
    check("the route begins the job before publishing and ends it with the answer", /beginJob\(admin as never, \{ id: jobId/.test(route) && /await endJob\(createAdminClient\(\) as never, holder\.id, res\.ok, said\)/.test(route))
    check("the route answers GET ?job= for the press, signed in and for this site", /export async function GET[\s\S]*?websiteInstallCaller\(installId, "id, creator_id", \{ read: true \}\)[\s\S]*?readJob\(/.test(route))
    const sql = src("supabase/sql/run-now/360_theme_publish_jobs.sql")
    check("part 360 is safe to run again and closed to the browser", /CREATE TABLE IF NOT EXISTS public\.theme_publish_jobs/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.theme_publish_jobs FROM anon, authenticated/.test(sql) && /Safe to run again/.test(sql))
  }

  out("\nThe editor's open and its Publish")
  {
    const editor = src("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    const load = editor.slice(editor.indexOf("const loadData = useCallback"), editor.indexOf("NEVER A LOADER WITH NOTHING TO PRESS"))
    check("the website's read and the pages' reads are hedged", /hedged\(\(\) => fetchSignedIn\(\(\) => fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}`/.test(load) && /hedged\(\(\) => fetchSignedIn\(\(\) => fetchWithin\(url, \{\}, SECTIONS_WAIT_MS\)\), HEDGE_MS\)/.test(editor))
    /* Changed on purpose (r65): the newest open also marks the first read answered (openSettled), so the finally block is a block. */
    check("the newest open wins: an older one's answer changes nothing", /const epoch = quiet \? openEpoch\.current : \+\+openEpoch\.current/.test(load) && (load.match(/if \(stale\(\)\) return false/g) ?? []).length >= 4 && /if \(!stale\(\)\) \{\s*setLoading\(false\)/.test(load))
    check("every body read has an end", /deadline\(res\.json\(\), BODY_MS, "the website"\)/.test(load))
    check("an open past OPEN_SLOW_MS offers Try again over the loader", /const OPEN_SLOW_MS = 15_000/.test(editor) && /kind="editor-still-opening"/.test(editor) && /loading && loadSlow && !loadFailed/.test(editor))
    const publish = editor.slice(editor.indexOf("const publishChanges = async"), editor.indexOf("const handleSave = async"))
    check("one press at a time", /if \(publishingRef\.current\) return/.test(publish) && /finally \{\s*publishingRef\.current = false/.test(publish))
    check("the save in front of a publish has an end", /deadline\(draftQueue\.save\(snap\), PUBLISH_SAVE_MS/.test(publish) && /within\(draftQueue\.idle\(\), PUBLISH_SAVE_MS/.test(publish))
    check("the button says when it is still publishing", /publishSlow \? "Still publishing" : "Publishing"/.test(editor))
    const files = src("components/website-builder/compat/compat-files.ts")
    check("an imported theme's files are hedged and signed in", /hedged\(\(\) => fetchSignedIn\(\(\) => fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/files\?compat=1`/.test(files))
  }

  out("\nThe code editor lists every file, or says it could not (round 51)")
  {
    const route = src("app/api/website-builder/themes/[installId]/files/route.ts")
    const list = route.slice(route.indexOf("// List all custom files if no path"), route.indexOf("EVERY SAVE OF THIS FILE"))
    check("read a thousand at a time, in order, until the last", /\.order\("path"\)\s*\.range\(from, from \+ 999\)/.test(list) && /if \(rows\.length < 1000\) break/.test(list))
    check("a database that blinked is a 503, never an empty list", /return dbFailure\(listErr,/.test(list))
    const code = src("app/(storelib)/website-builder/code/[installId]/page.tsx")
    const load = code.slice(code.indexOf("const loadInstall = useCallback"), code.indexOf("useEffect(() => { loadInstall() }"))
    check("the list is read signed in and asked again on a 5xx", /retrying\(async \(\) => \{\s*const r = await fetchSignedIn\(\(\) => fetchWithDeadline\(`\/api\/website-builder\/themes\/\$\{installId\}\/files`/.test(load))
    check("a list that could not be had is said, with Try again, not drawn as the default theme alone", /toast\.error\("Couldn't list the website's files"/.test(load) && !/\} else \{\s*setFileTree\(buildThemeFileTree\(\[\]\)\)\s*\}/.test(load))
  }

  out("\nThe notice after Publish is clear of the bar (round 51)")
  {
    const editor = src("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    const bar = editor.slice(editor.indexOf("UNDER THE BAR, NEVER ON IT"), editor.indexOf("{notification?.message}"))
    check("on a phone it drops in under the bar, by the bar's own height", /isMobileView \? "top-\[calc\(var\(--wb-chrome-top,48px\)\+8px\)\]" : "bottom-6"/.test(bar))
    check("it moves by translate and opacity only", /transition-\[translate,opacity\]/.test(bar) && !/transition-all/.test(bar))
    check("in Storelib's near black, not a third colour", /bg-\[#1a1a2e\] text-white/.test(bar))
    check("on a computer over the canvas and above Ask's dock, read once when it opens", /document\.getElementById\("wb-preview-root"\)\?\.getBoundingClientRect\(\)/.test(editor) && /data-ask-pill/.test(editor) && /left: noticeBox\.left, right: "auto", width: noticeBox\.width, bottom: noticeBox\.bottom/.test(bar))
    check("a faded notice takes no press", /notification && "pointer-events-auto"/.test(bar))
  }

  {
    const mine = ["lib/website-builder/publish-run.ts", "lib/website-builder/publish-job.ts", "supabase/sql/run-now/360_theme_publish_jobs.sql", "scripts/check-editor-r51.mjs"]
    const banned = mine.filter((f) => /—/.test(src(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(src(f)))
    check("no em dash and no banned word in this round's files", banned.length === 0, banned)
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    out(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.log(e)
  process.exit(1)
})

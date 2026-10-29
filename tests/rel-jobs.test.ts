/**
 * ===========================================================================
 *  LONG WORK THAT ENDS, PROVIDERS THAT FAIL FAST, ONE RUN AT A TIME (rel-jobs)
 * ===========================================================================
 * The owner's production evidence: functions stopped at Vercel's 300 second
 * ceiling, and 503s from the website builder. Each case here is one way that
 * happened, or one fault that must stay where it started, simulated with a
 * slow or failing fake and measured:
 *
 *   Mailgun that never answers       a send ends within its budget, not 300s
 *   Mailgun down                     after a few failures, sends fail at once
 *                                    and the outbox is told "retry"
 *   a fulfilment provider down       fails fast; one seller's 429 never trips it
 *   GitHub down                      fails fast after a few calls
 *   two runs of one cron             exactly one does the work
 *   the theme agent                  a deadline counted from the request,
 *                                    a per creator limit counted from its own rows
 *   the code agent                   stops for time between turns, and gives
 *                                    up on a model call that hangs
 *   a URL that drips bytes           fetchPublic ends at its total deadline
 *   isolation                        checkout imports no AI; publishing sends no email
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/rel-jobs.test.ts)
 */
import "./_mailgun-env"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import * as esbuild from "esbuild"

import { CircuitBreaker, CircuitOpen, breakerFor, isCircuitOpen, resetBreakers, unwellStatus } from "@/lib/net/breaker"
import { MAILGUN_BREAKER, MAILGUN_TIMING, MAILGUN_UNAVAILABLE, sendMailgunEmail, sendMailgunOnce } from "@/lib/mailgun"
import { resultOf } from "@/lib/notify/providers/mailgun"
import { call as providerCall, ProviderError } from "@/lib/integrations/fulfilment/http"
import { GITHUB_BREAKER, setGitHubTransport, timing as githubTiming, compareStatus } from "@/lib/github-sync/github"
import { CRON_LEASE_MARGIN_MS, heldByEarlierRun, recordCronRun } from "@/lib/observability/report"
import { THEME_AGENT_AT_ONCE, THEME_AGENT_BUSY, themeAgentLimit, themeAgentVerdict } from "@/lib/sites/rate-limit"
import { MIN_LOOP_MS, TAIL_RESERVE_MS, loopDeadlineMs } from "@/lib/website-builder/agent/limits"
import { agentLoop, type LoopResult } from "@/lib/sites/agent/loop"
import { ProjectWorkspace } from "@/lib/sites/agent/tools"
import { blankProject } from "@/lib/sites/starter"
import type { AgentEvent, AgentProvider } from "@/lib/sites/agent/types"
import { fetchPublic } from "@/lib/api/public-fetch"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const realFetch = globalThis.fetch
/* Every deadline timer is unref'd (lib/net/deadline.ts), as a server process does not need them to stay up; a test does. */
const keepAlive = setInterval(() => {}, 1_000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A fetch that never answers, until its signal ends it: a provider that accepted the connection and went quiet. */
function hangingFetch(counter: { calls: number }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    counter.calls++
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return /* never settles: what a fetch without a deadline does */
      if (signal.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
      signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true })
    })
  }) as typeof fetch
}

// ---------------------------------------------------------------------------
console.log("\nThe breaker: opens after failures in a row, fails fast, tries one, closes")
{
  let t = 0
  const b = new CircuitBreaker("test", { failures: 3, windowMs: 1_000, cooldownMs: 500, now: () => t })
  check("starts closed and lets calls through", b.state === "closed" && b.allow())
  b.failure(); b.failure()
  check("two failures leave it closed", b.state === "closed")
  b.success(); b.failure(); b.failure()
  check("an answer in between starts the count again", b.state === "closed")
  b.failure()
  check("three in a row open it", b.state === "open" && !b.allow())
  t += 400
  check("still refusing during the cool down", !b.allow() && b.retryInMs() === 100)
  t += 100
  check("after the cool down, exactly one trial goes", b.allow() && !b.allow())
  b.failure()
  check("a failed trial opens it again", b.state === "open" && !b.allow())
  t += 500
  check("another trial after another cool down", b.allow())
  b.success()
  check("an answered trial closes it", b.state === "closed" && b.allow())
  b.failure(); t += 2_000; b.failure(); b.failure()
  check("failures further apart than the window are not in a row", b.state === "closed")
  const thrown = await b.call(async () => 1).then((v) => v)
  check("call() hands the value back", thrown === 1)
  const fb = new CircuitBreaker("fast", { failures: 1, cooldownMs: 60_000 })
  await fb.call(async () => { throw new Error("down") }).catch(() => undefined)
  const refused = await fb.call(async () => "never").catch((e: unknown) => e)
  check("an open breaker's call() throws CircuitOpen without running", isCircuitOpen(refused) && refused instanceof CircuitOpen && (refused as CircuitOpen).provider === "fast")
  check("429 and 5xx are unwell, a 4xx is an answer", unwellStatus(429) && unwellStatus(503) && !unwellStatus(400) && !unwellStatus(404))
  check("one breaker per name in an instance", breakerFor("x") === breakerFor("x") && breakerFor("x") !== breakerFor("y"))
  resetBreakers()
}

// ---------------------------------------------------------------------------
console.log("\nMailgun that never answers: the send ends within its budget")
{
  resetBreakers()
  const saved = { ...MAILGUN_TIMING, rateLimitDelays: [...MAILGUN_TIMING.rateLimitDelays] }
  MAILGUN_TIMING.attemptMs = 300
  MAILGUN_TIMING.sendBudgetMs = 600
  MAILGUN_TIMING.lookupMs = 200
  const counter = { calls: 0 }
  globalThis.fetch = hangingFetch(counter)
  const started = Date.now()
  const r = await sendMailgunEmail({ to: "buyer@example.com", subject: "Your code", html: "<p>123456</p>", transactional: true, keepBounce: true })
  const took = Date.now() - started
  check("a transactional send to a silent Mailgun fails instead of hanging", r.success === false, r)
  check("and it ended near one attempt's deadline, nowhere near 300s", took < 1_500, took)

  const started2 = Date.now()
  const r2 = await sendMailgunEmail({ to: "buyer@example.com", subject: "News", html: "<p>hi</p>" })
  const took2 = Date.now() - started2
  check("with the suppression lookups first, still bounded (two lookups and one send)", r2.success === false && took2 < 2_000, took2)

  /* A 429 every time: retried with backoff, never past the send's budget. */
  MAILGUN_TIMING.rateLimitDelays = [100, 100, 100]
  MAILGUN_TIMING.sendBudgetMs = 450
  resetBreakers()
  let tries = 0
  globalThis.fetch = (async () => {
    tries++
    return new Response(JSON.stringify({ message: "rate limited" }), { status: 429 })
  }) as typeof fetch
  const started3 = Date.now()
  const r3 = await sendMailgunEmail({ to: "buyer@example.com", subject: "x", html: "<p>x</p>", transactional: true, keepBounce: true })
  const took3 = Date.now() - started3
  check("429s are retried, capped by the send budget", r3.success === false && tries >= 2 && tries <= 4 && took3 < 900, { tries, took3 })

  /* Down: five failures in a row and the breaker answers at once, without asking Mailgun. */
  resetBreakers()
  MAILGUN_TIMING.attemptMs = 100
  MAILGUN_TIMING.sendBudgetMs = 200
  const down = { calls: 0 }
  globalThis.fetch = (async () => {
    down.calls++
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })
  }) as typeof fetch
  for (let i = 0; i < 5; i++) await sendMailgunEmail({ to: "buyer@example.com", subject: "x", html: "<p>x</p>", transactional: true, keepBounce: true })
  check("five failed sends open the Mailgun breaker", breakerFor(MAILGUN_BREAKER).state === "open")
  const before = down.calls
  const started4 = Date.now()
  const r4 = await sendMailgunEmail({ to: "buyer@example.com", subject: "x", html: "<p>x</p>", transactional: true, keepBounce: true })
  check("the next send fails at once with words that say so, and Mailgun is not asked", r4.success === false && r4.error === MAILGUN_UNAVAILABLE && down.calls === before && Date.now() - started4 < 50, { r4, calls: down.calls - before })
  const once = await sendMailgunOnce({ to: "buyer@example.com", subject: "x", html: "<p>x</p>" })
  check("the outbox's single send is refused as nothing sent (connectFailed)", once.success === false && once.connectFailed === true && down.calls === before)
  check("which the notification outbox reads as retry later: an email outage queues, it does not block", resultOf(once).status === "retry", resultOf(once))

  /* Mailgun back: after the cool down one trial goes, and an answer closes it. */
  resetBreakers()
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "<m@storelib.com>", message: "Queued" }), { status: 200 })) as typeof fetch
  const ok = await sendMailgunEmail({ to: "buyer@example.com", subject: "x", html: "<p>x</p>", transactional: true, keepBounce: true })
  check("a Mailgun that answers sends as before", ok.success === true && ok.messageId === "<m@storelib.com>", ok)
  /* A refused address is Mailgun answering: it never opens the breaker. */
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "to parameter is not a valid address" }), { status: 400 })) as typeof fetch
  for (let i = 0; i < 6; i++) await sendMailgunEmail({ to: "buyer@example.com", subject: "x", html: "<p>x</p>", transactional: true, keepBounce: true })
  check("six refused addresses leave the breaker closed", breakerFor(MAILGUN_BREAKER).state === "closed")

  Object.assign(MAILGUN_TIMING, saved)
  globalThis.fetch = realFetch
  resetBreakers()
}

// ---------------------------------------------------------------------------
console.log("\nA fulfilment provider that is down fails fast; one seller's 429 never stops the others")
{
  resetBreakers()
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response("upstream", { status: 502 })
  }) as typeof fetch
  for (let i = 0; i < 5; i++) await providerCall("Printful", "https://api.printful.test/orders", { headers: {} }).catch(() => undefined)
  const before = calls
  const started = Date.now()
  const e = await providerCall("Printful", "https://api.printful.test/orders", { headers: {} }).catch((x: unknown) => x)
  check("after five 5xx answers the next call is a retry ProviderError at once, with no request", e instanceof ProviderError && (e as ProviderError).retry === true && calls === before && Date.now() - started < 50, { calls: calls - before })
  check("another provider is not affected", breakerFor("provider:Gelato").state === "closed")

  resetBreakers()
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "slow down" }), { status: 429, headers: { "retry-after": "3" } })) as typeof fetch
  for (let i = 0; i < 8; i++) await providerCall("Shippo", "https://api.shippo.test/rates", { headers: {} }).catch(() => undefined)
  check("eight 429s (one seller's allowance) leave the provider's breaker closed", breakerFor("provider:Shippo").state === "closed")
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: "Invalid token" }), { status: 401 })) as typeof fetch
  for (let i = 0; i < 8; i++) await providerCall("Shippo", "https://api.shippo.test/rates", { headers: {} }).catch(() => undefined)
  check("and so do eight refused keys", breakerFor("provider:Shippo").state === "closed")
  globalThis.fetch = realFetch
  resetBreakers()
}

// ---------------------------------------------------------------------------
console.log("\nGitHub down fails fast after a few calls")
{
  resetBreakers()
  const savedSleep = githubTiming.sleep
  githubTiming.sleep = async () => {}
  let attempts = 0
  setGitHubTransport(async () => {
    attempts++
    return new Response(JSON.stringify({ message: "Server Error" }), { status: 502 })
  })
  for (let i = 0; i < 5; i++) await compareStatus("t", "drew/site", "a", "b").catch(() => undefined)
  check("five calls whose every attempt got a 5xx open the GitHub breaker", breakerFor(GITHUB_BREAKER).state === "open", { attempts })
  const before = attempts
  const e = await compareStatus("t", "drew/site", "a", "b").catch((x: unknown) => x as Error)
  check("the next call is refused at once without reaching GitHub", attempts === before && /not answering/.test(String((e as Error)?.message)), { message: (e as Error)?.message })
  setGitHubTransport(null)
  githubTiming.sleep = savedSleep
  resetBreakers()
}

// ---------------------------------------------------------------------------
console.log("\nTwo runs of one cron: exactly one does the work")
{
  const now = Date.now()
  const lease = 300_000 + CRON_LEASE_MARGIN_MS
  check("an earlier unfinished run inside its lease holds the job", heldByEarlierRun([{ id: 4, started_at: new Date(now - 10_000).toISOString(), finished_at: null }], 5, lease, now))
  check("a finished one does not", !heldByEarlierRun([{ id: 4, started_at: new Date(now - 10_000).toISOString(), finished_at: new Date(now).toISOString() }], 5, lease, now))
  check("a killed run stops holding once its maxDuration is up", !heldByEarlierRun([{ id: 4, started_at: new Date(now - lease - 1).toISOString(), finished_at: null }], 5, lease, now))
  check("a later row never holds an earlier one", !heldByEarlierRun([{ id: 6, started_at: new Date(now).toISOString(), finished_at: null }], 5, lease, now))

  /* A fake cron_runs table behind PostgREST's URLs, as recordCronRun speaks to it. */
  process.env.CRON_SECRET = "cron-test-secret"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test"
  const rows: { id: number; job: string; started_at: string; finished_at: string | null; ok: boolean | null; detail?: string }[] = []
  let nextId = 1
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (!url.pathname.endsWith("/rest/v1/cron_runs")) return new Response("{}", { status: 404 })
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "POST") {
      const { job } = JSON.parse(String(init?.body))
      const row = { id: nextId++, job, started_at: new Date().toISOString(), finished_at: null, ok: null }
      rows.push(row)
      return new Response(JSON.stringify([row]), { status: 201 })
    }
    if (method === "PATCH") {
      const id = Number(url.searchParams.get("id")?.replace("eq.", ""))
      Object.assign(rows.find((r) => r.id === id) ?? {}, JSON.parse(String(init?.body)))
      return new Response("", { status: 204 })
    }
    const job = url.searchParams.get("job")?.replace("eq.", "")
    const below = Number(url.searchParams.get("id")?.replace("lt.", ""))
    const since = Date.parse(url.searchParams.get("started_at")?.replace("gte.", "") ?? "")
    const found = rows.filter((r) => r.job === job && r.id < below && r.finished_at === null && Date.parse(r.started_at) >= since)
    return new Response(JSON.stringify(found.slice(0, 1)), { status: 200 })
  }) as typeof fetch

  const req = () => new Request("https://storelib.test/api/cron/x", { headers: { authorization: "Bearer cron-test-secret" } })
  let worked = 0
  const job = async () => {
    worked++
    await sleep(80)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  const [a, b] = await Promise.all([recordCronRun("/api/cron/x", req(), job, { maxDurationS: 60 }), recordCronRun("/api/cron/x", req(), job, { maxDurationS: 60 })])
  const answers = [await a.json(), await b.json()]
  check("delivered twice at once, the job ran once", worked === 1, { worked })
  check("the other answered skipped, and its row says why", answers.some((x) => x.skipped === true) && rows.some((r) => r.ok === true && /skipped/.test(r.detail ?? "")), answers)
  check("the run that worked finished its row", rows.filter((r) => r.finished_at !== null).length === 2)

  /* A run the platform killed (its row never finished) holds the job only for its maxDuration. */
  rows.push({ id: nextId++, job: "/api/cron/y", started_at: new Date(Date.now() - (60_000 + CRON_LEASE_MARGIN_MS + 1_000)).toISOString(), finished_at: null, ok: null })
  worked = 0
  await recordCronRun("/api/cron/y", req(), job, { maxDurationS: 60 })
  check("an older killed run does not stop the next one", worked === 1)
  rows.push({ id: nextId++, job: "/api/cron/z", started_at: new Date(Date.now() - 5_000).toISOString(), finished_at: null, ok: null })
  worked = 0
  await recordCronRun("/api/cron/z", req(), job, { maxDurationS: 60 })
  check("one still inside its maxDuration does", worked === 0)

  /* The database not answering: the job runs, as before part 68. */
  globalThis.fetch = (async () => { throw new TypeError("fetch failed") }) as typeof fetch
  worked = 0
  await recordCronRun("/api/cron/x", req(), job, { maxDurationS: 60 })
  check("with no record to read, the job still runs", worked === 1)
  globalThis.fetch = realFetch

  const crons = readdirSync(join(process.cwd(), "app/api/cron")).filter((d) => statSync(join(process.cwd(), "app/api/cron", d)).isDirectory())
  const missing = crons.filter((d) => {
    const src = read(`app/api/cron/${d}/route.ts`)
    return /export const maxDuration/.test(src) && !/recordCronRun\("[^"]+", request, \(\) => \w+\(request\), \{ maxDurationS: maxDuration \}\)/.test(src)
  })
  check("every cron with a maxDuration gives it to its lease", missing.length === 0, missing)
}

// ---------------------------------------------------------------------------
console.log("\nThe theme agent: a deadline from the request's start, a limit from its own rows")
{
  const t0 = 1_000_000
  check("a request that arrived 40s ago leaves the loop 300 - 45 - 40 seconds", loopDeadlineMs({ requestStartedAt: t0, now: t0 + 40_000, maxDurationS: 300, wallClockMs: 285_000 }) === 215_000)
  check("the tail kept for the commit and closing writes is 45s", TAIL_RESERVE_MS === 45_000)
  check("a run whose start ate everything still gets one turn's time", loopDeadlineMs({ requestStartedAt: t0, now: t0 + 299_000, maxDurationS: 300 }) === MIN_LOOP_MS)
  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the route counts from its first line", /installId: string \}> \}\) \{\s*\/\*[^*]*\*\/\s*const requestStartedAt = Date\.now\(\)/.test(route))
  check("and asks loopDeadlineMs for the loop's deadline", /AbortSignal\.timeout\(loopDeadlineMs\(\{ requestStartedAt, maxDurationS: maxDuration \}\)\)/.test(route))
  check("and its own limit, not only the code agent's", /const busy = await themeAgentLimit\(/.test(route))
  const writer = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
  check("Code a section does both too", /const requestStartedAt = Date\.now\(\)/.test(writer) && /loopDeadlineMs\(\{ requestStartedAt/.test(writer) && /themeAgentLimit\(/.test(writer))

  const now = Date.now()
  const at = (s: number) => new Date(now - s * 1000).toISOString()
  check("nothing asked, nothing refused", themeAgentVerdict([], now) === null)
  check(`${THEME_AGENT_AT_ONCE} questions without answers in five minutes: busy`, themeAgentVerdict([{ role: "user", created_at: at(10) }, { role: "user", created_at: at(70) }, { role: "user", created_at: at(130) }], now) === THEME_AGENT_BUSY)
  check("answered runs do not count as going", themeAgentVerdict([{ role: "user", created_at: at(10) }, { role: "user", created_at: at(70) }, { role: "assistant", created_at: at(65) }, { role: "user", created_at: at(130) }], now) === null)
  check("a run that died without answering stops counting after 300s", themeAgentVerdict([{ role: "user", created_at: at(10) }, { role: "user", created_at: at(70) }, { role: "user", created_at: at(400) }], now) === null)
  const burst = Array.from({ length: 8 }, (_, i) => [{ role: "user", created_at: at(5 + i) }, { role: "assistant", created_at: at(4 + i) }]).flat()
  check("eight questions in a minute: slow down", /faster than they can run/.test(themeAgentVerdict(burst, now) ?? ""))
  const hour = Array.from({ length: 120 }, (_, i) => [{ role: "user", created_at: at(120 + i * 25) }, { role: "assistant", created_at: at(119 + i * 25) }]).flat()
  check("120 in an hour: try again shortly", /in an hour/.test(themeAgentVerdict(hour, now) ?? ""))

  const failing = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "timeout" } }) }) }) }) }
  check("a count that cannot be read lets the run go", (await themeAgentLimit("c1", failing)) === null)
  const throwing = { from: () => { throw new Error("no database") } }
  check("so does a database that throws", (await themeAgentLimit("c1", throwing)) === null)
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {}
    for (const k of ["select", "eq", "in", "gte", "order"]) q[k] = () => q
    q.limit = async () => result
    return q
  }
  const db = {
    from: (table: string) =>
      table === "store_theme_installs"
        ? chain({ data: [{ id: "i1" }, { id: "i2" }], error: null })
        : chain({ data: [{ role: "user", created_at: at(5) }, { role: "user", created_at: at(20) }, { role: "user", created_at: at(40) }], error: null }),
  }
  check("three runs going across a creator's websites: the fourth waits", (await themeAgentLimit("c1", db)) === THEME_AGENT_BUSY)
}

// ---------------------------------------------------------------------------
console.log("\nThe code agent stops for time, between turns or on a model call that hangs")
{
  const drain = async (loop: AsyncGenerator<AgentEvent, LoopResult>) => {
    for (;;) {
      const step = await loop.next()
      if (step.done) return step.value as LoopResult
    }
  }
  let asked = 0
  const never: AgentProvider = { id: "never", complete: async () => { asked++; throw new Error("should not be asked") } }
  const late = await drain(agentLoop({ provider: never, model: "m", prompt: "p", workspace: new ProjectWorkspace(blankProject("T")), esbuild, deadlineAt: Date.now() - 1 }))
  check("past its deadline, no turn starts", asked === 0 && late.status === "failed" && /ran out of time/.test(late.error ?? ""), late)

  const hanging: AgentProvider = {
    id: "hanging",
    complete: (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      }),
  }
  const started = Date.now()
  const cut = await drain(agentLoop({ provider: hanging, model: "m", prompt: "p", workspace: new ProjectWorkspace(blankProject("T")), esbuild, deadlineAt: Date.now() + 10_000, hardDeadlineAt: Date.now() + 1_000 }))
  const took = Date.now() - started
  check("a model call that never answers is given up on at the hard deadline", took < 2_500, took)
  check("and the run says it ran out of time, not that it was cancelled", /ran out of time/.test(cut.error ?? "") && !/Cancelled/.test(cut.error ?? ""), cut.error)
  const run = read("lib/sites/agent/run.ts")
  check("runAgent counts both deadlines from the request's start", /deadlineAt: \(requestStartedAt \?\? startedAt\) \+ RUN_BUDGET_MS - BUILD_RESERVE_MS/.test(run) && /hardDeadlineAt: \(requestStartedAt \?\? startedAt\) \+ RUN_BUDGET_MS - TURN_HARD_STOP_MS/.test(run))
  check("and the route passes when it was asked", /requestStartedAt,\s*\n\s*\/\*\*\s*\n\s*\* NOT `request\.signal`/.test(read("app/api/sites/[siteId]/agent/route.ts")))
}

// ---------------------------------------------------------------------------
console.log("\nAn address that drips bytes ends at fetchPublic's total deadline")
{
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" })
    const t = setInterval(() => res.write("x"), 50)
    res.on("close", () => clearInterval(t))
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const started = Date.now()
  const e = await fetchPublic(`${origin}/slow.png`, { maxBytes: 10_000_000, timeoutMs: 400, trustOrigins: [origin] }).catch((x: unknown) => x as Error)
  const took = Date.now() - started
  check("a server that never stops sending, a byte at a time, is given up on", e instanceof Error && /timed out/.test(e.message), String(e))
  check("at the total deadline, not the idle one", took < 1_200, took)
  server.close()
}

// ---------------------------------------------------------------------------
console.log("\nEvery external call bounded, and faults stay where they start")
{
  for (const p of ["tiktok", "apple-music", "soundcloud", "spotify", "youtube"]) {
    const src = read(`app/api/onepage/${p}/route.ts`)
    check(`OnePage ${p} lookups have a deadline`, /deadlineFetch\(url, init, \{ ms: EMBED_FETCH_MS \}\)/.test(src) && !/await fetch\(/.test(src))
  }
  const mailgun = read("lib/mailgun.ts")
  check("no Mailgun request without a deadline", (mailgun.match(/await fetch\(/g) ?? []).length === 1 && /signal: controller\.signal/.test(mailgun))
  check("the GitHub sign in exchange has one", /login\/oauth\/access_token[\s\S]{0,400}signal: AbortSignal\.timeout\(ATTEMPT_TIMEOUT_MS\)/.test(read("lib/github-sync/github.ts")))
  const exporter = read("app/api/website-builder/themes/[installId]/export/route.ts")
  check("a theme export stops fetching media in time to zip inside its 60 seconds", /const mediaUntil = Date\.now\(\) \+ MEDIA_WINDOW_MS/.test(exporter) && (exporter.match(/timeoutMs: mediaWait\(\)/g) ?? []).length === 2 && !/timeoutMs: 20_000/.test(exporter))
  const bundles = read("lib/bundles.ts")
  check("a bundle's file download has one, and a file not read in time ends the ZIP unsaved", /signal: AbortSignal\.timeout\(fileMs\)/.test(bundles) && /if \(!res\) return null/.test(bundles) && /if \(!bytes\) \{[\s\S]{0,160}?return null/.test(bundles))
  check("a buyer's download waits a bounded time for a ZIP not built yet", /deadlineAt: Date\.now\(\) \+ BUYER_BUNDLE_WAIT_MS/.test(read("lib/storage/token-download.ts")))

  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir)).flatMap((f) => {
      const p = `${dir}/${f}`
      return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : [p]
    })
  const checkout = [...walk("app/api/checkout"), ...walk("lib/checkout")].filter((f) => /\.tsx?$/.test(f))
  const aiInCheckout = checkout.filter((f) => /from "@\/lib\/(sites\/agent|website-builder\/agent|storelib-ai)|@anthropic-ai\/sdk|from "openai"/.test(read(f)))
  check("checkout imports no AI module: a failed generation cannot reach a payment", aiInCheckout.length === 0, aiInCheckout)
  for (const f of ["app/api/website-builder/themes/[installId]/publish/route.ts", "app/api/sites/[siteId]/publish/route.ts"]) {
    const src = read(f)
    check(`${f.split("/").slice(-3, -1).join("/")} publish sends no email and waits on no announcement`, !/sendEmail|sendMailgun|from "@\/lib\/mail"/.test(src) && !/await announce\(/.test(src))
  }
  check("a website publish is one transaction, the live one kept on failure", /admin\.rpc\("publish_theme_install"/.test(read("app/api/website-builder/themes/[installId]/publish/route.ts")) && /Nothing changed: the website that was live still is\./.test(read("app/api/website-builder/themes/[installId]/publish/route.ts")))
  check("a notification event carries the request's id when there is one", /correlationId: event\.correlationId \?\? \(await requestCorrelationId\(\)\) \?\? randomUUID\(\)/.test(read("lib/notify/outbox.ts")))
}

clearInterval(keepAlive)
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
process.exit(0)

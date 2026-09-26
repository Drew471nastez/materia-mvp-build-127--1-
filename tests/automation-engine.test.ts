/**
 * ===========================================================================
 *  THE AUTOMATION ENGINE, DRIVEN AGAINST A STORE WITH THE DATABASE'S RULES
 * ===========================================================================
 * lib/automations/engine.ts keeps every promise with a row and a constraint:
 * a unique run per entry, a unique job per step, a unique send per step, a
 * claim that one worker wins, a lease that runs out. This file gives it an
 * in-memory store that keeps exactly those rules (and nothing kinder), then
 * does to it what production does: the same trigger twice, two workers at
 * once, a worker that dies, a sender that fails, a person who leaves between
 * steps, a creator who turns the flow off or edits it while people wait.
 *
 * The SQL that holds the same rules in Postgres is pinned at the end.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  enroll,
  processJob,
  retryDelayMs,
  runDue,
  LEASE_SECONDS,
  type FlowRow,
  type JobRow,
  type Mailer,
  type RunRow,
  type SendBegin,
  type Store,
} from "@/lib/automations/engine"
import {
  dedupeKey,
  entryRule,
  normalizeSteps,
  problemsOf,
  resolveStep,
  stepSummary,
  timeline,
  type FlowStep,
} from "@/lib/automations/flow-model"
import { cleanContactSource, contactSourceFrom, contactSourceOfOrder, joinedSentence, sourceView } from "@/lib/contacts/contact-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── A store with the database's rules ─────────────────────────────── */

const DAY = 86_400_000
let clock = Date.parse("2026-09-24T12:00:00Z")
const now = () => clock
const iso = (ms: number) => new Date(ms).toISOString()
let seq = 0
const id = (p: string) => `${p}${++seq}`

interface Run extends RunRow { dedupe_key: string; exit_reason: string | null; current_step_id: string | null }
interface Job extends JobRow { claimed_until: number | null; last_error: string | null }
interface Send { run_id: string; step_id: string; status: "sending" | "sent" | "failed" | "interrupted"; token: string; opened_at: string | null }

class MemoryStore implements Store {
  flows = new Map<string, FlowRow>()
  runs: Run[] = []
  jobs: Job[] = []
  sends: Send[] = []
  orders: Array<{ email: string; at: number; creator: string; id?: string }> = []
  suppressed = new Set<string>()
  /** Addresses whose contact row is gone: deleted by the creator, or never written (a buyer). */
  gone = new Set<string>()
  failComplete = 0

  async activeFlows(creatorId: string, trigger: string): Promise<FlowRow[] | null> {
    return [...this.flows.values()].filter((f) => f.creator_id === creatorId && f.trigger_type === trigger && f.status === "active")
  }
  /** enroll_email_flow, including its lock: nothing awaits between the checks and the writes. */
  async enroll(i: Parameters<Store["enroll"]>[0]) {
    const flow = this.flows.get(i.flowId)
    if (!flow || flow.creator_id !== i.creatorId || flow.status !== "active") return { runId: null }
    const mine = this.runs.filter((r) => r.flow_id === i.flowId && r.email === i.email)
    if (i.windowDays < 0 && mine.length > 0) return { runId: null }
    if (i.windowDays > 0 && mine.some((r) => Date.parse(r.started_at) > clock - i.windowDays * DAY)) return { runId: null }
    if (this.runs.some((r) => r.flow_id === i.flowId && r.dedupe_key === i.dedupeKey)) return { runId: null }
    const run: Run = { id: id("run"), flow_id: i.flowId, creator_id: i.creatorId, email: i.email, name: i.name, status: "active", started_at: iso(clock), context: i.context, dedupe_key: i.dedupeKey, exit_reason: null, current_step_id: i.firstStepId }
    this.runs.push(run)
    this.jobs.push(this.newJob(run.id, i.flowId, i.creatorId, i.firstStepId, null, clock))
    return { runId: run.id }
  }
  newJob(runId: string, flowId: string, creatorId: string, stepId: string, after: string | null, at: number): Job {
    return { id: id("job"), run_id: runId, flow_id: flowId, creator_id: creatorId, step_id: stepId, after_step_id: after, state: "queued", run_at: iso(at), attempts: 0, max_attempts: 5, claimed_by: null, claimed_until: null, last_error: null }
  }
  /** claim_email_flow_jobs: one synchronous pass, as one statement is. */
  async claim(worker: string, limit: number, lease: number) {
    const due = this.jobs
      .filter((j) => (j.state === "queued" && Date.parse(j.run_at) <= clock) || (j.state === "running" && (j.claimed_until ?? 0) < clock))
      .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at))
      .slice(0, limit)
    for (const j of due) {
      j.state = "running"
      j.claimed_by = worker
      j.claimed_until = clock + lease * 1000
      j.attempts++
    }
    return due.map((j) => ({ ...j }))
  }
  async flow(fid: string) { return this.flows.get(fid) ?? null }
  async run(rid: string) { const r = this.runs.find((x) => x.id === rid); return r ? { ...r } : null }
  async finishRun(rid: string, status: Run["status"], reason: string | null) {
    const r = this.runs.find((x) => x.id === rid)
    if (r && r.status === "active") { r.status = status; r.exit_reason = reason }
  }
  async setRunStep(rid: string, sid: string) { const r = this.runs.find((x) => x.id === rid); if (r?.status === "active") r.current_step_id = sid }
  async enqueue(j: Parameters<Store["enqueue"]>[0]) {
    if (this.jobs.some((x) => x.run_id === j.runId && x.step_id === j.stepId)) return false
    this.jobs.push(this.newJob(j.runId, j.flowId, j.creatorId, j.stepId, j.afterStepId, Date.parse(j.runAt)))
    return true
  }
  async jobState(rid: string, sid: string) { return this.jobs.find((x) => x.run_id === rid && x.step_id === sid)?.state ?? null }
  held(jid: string, worker: string) { const j = this.jobs.find((x) => x.id === jid); return j && j.state === "running" && j.claimed_by === worker ? j : null }
  async completeJob(jid: string, worker: string, state: "done" | "cancelled", note?: string | null) {
    if (this.failComplete > 0) { this.failComplete--; throw new Error("connection reset") }
    const j = this.held(jid, worker)
    if (!j) return false
    j.state = state; j.claimed_until = null; if (note) j.last_error = note
    return true
  }
  async retryJob(jid: string, worker: string, runAt: string, error: string) {
    const j = this.held(jid, worker)
    if (!j) return false
    j.state = "queued"; j.run_at = runAt; j.last_error = error; j.claimed_by = null; j.claimed_until = null
    return true
  }
  async failJob(jid: string, worker: string, error: string) {
    const j = this.held(jid, worker)
    if (!j) return false
    j.state = "failed"; j.last_error = error; j.claimed_until = null
    return true
  }
  async beginSend(i: Parameters<Store["beginSend"]>[0]): Promise<SendBegin> {
    const found = this.sends.find((s) => s.run_id === i.runId && s.step_id === i.stepId)
    if (!found) {
      const token = id("tok")
      this.sends.push({ run_id: i.runId, step_id: i.stepId, status: "sending", token, opened_at: null })
      return { go: true, token }
    }
    if (found.status === "sent") return { go: false, why: "sent" }
    if (found.status === "failed") { found.status = "sending"; return { go: true, token: found.token } }
    if (found.status === "sending") found.status = "interrupted"
    return { go: false, why: "interrupted" }
  }
  async finishSend(rid: string, sid: string, result: { ok: boolean }) {
    const s = this.sends.find((x) => x.run_id === rid && x.step_id === sid && x.status === "sending")
    if (s) s.status = result.ok ? "sent" : "failed"
  }
  async purchasedSince(creatorId: string, email: string, since: string) {
    return this.orders.some((o) => o.creator === creatorId && o.email === email && o.at > Date.parse(since))
  }
  async openedStep(rid: string, sid: string) { return Boolean(this.sends.find((s) => s.run_id === rid && s.step_id === sid)?.opened_at) }
  async standing(_c: string, email: string) {
    /* No row reads as the real store reads it (contactStanding): not suppressed, no token, not subscribed. */
    if (this.gone.has(email)) return { suppressed: false, unsubscribeToken: null, subscribed: false, status: null }
    return { suppressed: this.suppressed.has(email), unsubscribeToken: "unsub", subscribed: !this.suppressed.has(email) }
  }
  async identity() { return { fromName: "Astrid", replyTo: "astrid@example.com", storeUrl: "https://storelib.com/astrid" } }
  async firstOrder(creatorId: string, email: string, orderId: string) {
    return !this.orders.some((o) => o.creator === creatorId && o.email === email && o.id !== orderId)
  }
  async exitRuns(creatorId: string, email: string, trigger: string, reason: string) {
    let n = 0
    for (const r of this.runs) {
      const flow = this.flows.get(r.flow_id)
      if (r.creator_id === creatorId && r.email === email && r.status === "active" && flow?.trigger_type === trigger) { r.status = "exited"; r.exit_reason = reason; n++ }
    }
    return n
  }
  async links() { return { productUrl: null, orderUrl: null, checkoutUrl: null } }
}

function mailer(opts: { fail?: string | ((n: number) => string | null); tick?: boolean } = {}) {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  let calls = 0
  const m: Mailer = {
    compose: ({ step, token }) => ({ subject: step.config.subject, html: `${step.config.body}<img src="/o?k=${token}">`, text: step.config.body }),
    async send(mail) {
      calls++
      if (opts.tick) await new Promise((r) => setTimeout(r, 5))
      const f = typeof opts.fail === "function" ? opts.fail(calls) : opts.fail
      if (f) return { success: false, error: f }
      sent.push({ to: mail.to, subject: mail.subject, html: mail.html })
      return { success: true, messageId: `m${calls}` }
    },
  }
  return { m, sent, calls: () => calls }
}

const email = (sid: string, subject = `Subject ${sid}`): FlowStep => ({ id: sid, type: "email", config: { subject, body: `<p>Body ${sid}</p>` } })
const wait = (sid: string, amount: number, unit: "minutes" | "hours" | "days" = "days"): FlowStep => ({ id: sid, type: "wait", config: { amount, unit } })

function flowOf(store: MemoryStore, steps: FlowStep[], extra: Partial<FlowRow> = {}): FlowRow {
  const f: FlowRow = { id: id("flow"), creator_id: "c1", name: "Welcome", trigger_type: "new_subscriber", trigger_config: null, status: "active", steps, ...extra }
  store.flows.set(f.id, f)
  return f
}

const join_ = (store: MemoryStore, who = "ada@example.com", extra: Record<string, unknown> = {}) =>
  enroll(store, { triggerType: "new_subscriber", creatorId: "c1", email: who, name: "Ada Lovelace", ...extra }, clock)

async function main() {
  console.log("\nEntering a flow: the same entry twice is one run")
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    const a = await join_(store)
    const b = await join_(store, " ADA@example.com ")
    check("a join enters the welcome", a.enrolled === 1)
    check("the same join again, in any case or spacing, enters nothing", b.enrolled === 0 && store.runs.length === 1, store.runs.length)
    check("and the run has exactly one first job", store.jobs.length === 1 && store.jobs[0].step_id === "e1")
    clock += 31 * DAY
    const c = await join_(store)
    check("the welcome's default lets somebody who joins again after 30 days in again", c.enrolled === 1 && store.runs.length === 2)
    clock += 10 * DAY
    check("but not within 30 days of that", (await join_(store)).enrolled === 0)
  }
  {
    const store = new MemoryStore()
    const f = flowOf(store, [email("t1")], { trigger_type: "purchase", name: "Thank you" })
    const buy = (orderId: string) => enroll(store, { triggerType: "purchase", creatorId: "c1", email: "b@example.com", orderId, productId: "p1", productTitle: "Presets" }, clock)
    await buy("o1")
    await buy("o1")
    await buy("o2")
    check("a purchase flow enters once per order: the webhook and the browser reporting one order write one run", store.runs.filter((r) => r.flow_id === f.id).length === 2)
    f.trigger_config = { entry: { mode: "once" } }
    await buy("o3")
    check("and once per person when the creator says so", store.runs.length === 2)
    f.trigger_config = { product_ids: ["p9"] }
    const other = await buy("o4")
    check("a flow for one product ignores a purchase of another", other.enrolled === 0 && other.skipped[0]?.why === "another product")
  }
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")], { status: "paused" })
    check("an off flow takes nobody", (await join_(store)).enrolled === 0 && store.runs.length === 0)
    flowOf(store, [wait("w", 1)])
    check("nor does one that is not complete (a flow with no email)", (await join_(store)).enrolled === 0)
    const gone = new MemoryStore()
    flowOf(gone, [email("e1")])
    gone.suppressed.add("ada@example.com")
    check("somebody who unsubscribed does not enter", (await join_(gone)).enrolled === 0)
  }
  {
    const store = new MemoryStore()
    store.activeFlows = async () => null
    check("without the engine's tables the result says so, for the older path", (await join_(store)).available === false)
  }

  console.log("\nTwo workers, one job")
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1"), email("e2")])
    await join_(store)
    const { m, sent } = mailer({ tick: true })
    const [a, b] = await Promise.all([
      runDue({ store, mailer: m, worker: "A", budgetMs: 10_000, now }),
      runDue({ store, mailer: m, worker: "B", budgetMs: 10_000, now }),
    ])
    check("both workers ran at once and each email went exactly once", sent.length === 2 && new Set(sent.map((s) => s.subject)).size === 2, sent.map((s) => s.subject))
    check("between them they claimed each job once", a.claimed + b.claimed === 2, { a: a.claimed, b: b.claimed })
    check("and the run finished", store.runs[0].status === "completed")
  }

  console.log("\nA worker that dies")
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    await join_(store)
    await store.claim("dead", 10, LEASE_SECONDS)
    const { m, sent } = mailer()
    const early = await runDue({ store, mailer: m, worker: "B", budgetMs: 1000, now })
    check("its job is not taken while its lease holds", early.claimed === 0 && sent.length === 0)
    clock += (LEASE_SECONDS + 1) * 1000
    await runDue({ store, mailer: m, worker: "B", budgetMs: 1000, now })
    check("and is taken once the lease runs out, the attempt counted", sent.length === 1 && store.jobs[0].attempts === 2 && store.jobs[0].state === "done")
    const late = await store.completeJob(store.jobs[0].id, "dead", "done")
    check("the dead worker, back late, cannot mark it", late === false)
  }
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1"), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    store.failComplete = 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    clock += 2 * 60_000
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("a crash after sending and before marking done sends nothing twice",
      sent.filter((s) => s.subject === "Subject e1").length === 1 && sent.length === 2, sent.map((s) => s.subject))
    check("and the run still reaches its end", store.runs[0].status === "completed")
  }
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    const { runId } = await store.enroll({ flowId: [...store.flows.keys()][0], creatorId: "c1", email: "ada@example.com", name: null, dedupeKey: "k", windowDays: 0, triggerType: "new_subscriber", firstStepId: "e1", context: {}, source: null })
    store.sends.push({ run_id: runId!, step_id: "e1", status: "sending", token: "t", opened_at: null })
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    const run = store.runs[0]
    check("a send left half way is not sent again", sent.length === 0)
    check("it is failed with a reason the creator can read", store.jobs[0].state === "failed" && run.status === "failed" && /not sent again/.test(run.exit_reason ?? ""), run.exit_reason)
  }

  console.log("\nFailures are retried, then kept")
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    await join_(store)
    const { m, sent } = mailer({ fail: (n) => (n <= 2 ? "Mailgun 503 Service Unavailable" : null) })
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    const job = store.jobs[0]
    check("a transient failure goes back in the queue", job.state === "queued" && job.last_error === "Mailgun 503 Service Unavailable")
    check("a minute later, not straight away", Date.parse(job.run_at) - clock === retryDelayMs(1) && retryDelayMs(1) === 60_000)
    check("and nothing runs it before then", (await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })).claimed === 0)
    clock += retryDelayMs(1)
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("the second wait is longer", Date.parse(store.jobs[0].run_at) - clock === retryDelayMs(2) && retryDelayMs(2) > retryDelayMs(1))
    clock += retryDelayMs(2)
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("the third attempt sends it, once", sent.length === 1 && store.jobs[0].state === "done" && store.runs[0].status === "completed")
  }
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    await join_(store)
    const { m, sent } = mailer({ fail: "Mailgun 500" })
    for (let i = 0; i < 8; i++) {
      await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
      clock += 7 * 3_600_000
    }
    const job = store.jobs[0]
    check("after the last attempt the job is failed, not dropped", job.state === "failed" && job.attempts === 5 && sent.length === 0, { state: job.state, attempts: job.attempts })
    check("and its run says why", store.runs[0].status === "failed" && store.runs[0].exit_reason === "Mailgun 500")
    check("the send row is kept as failed", store.sends[0]?.status === "failed")
  }
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1")])
    await join_(store)
    const { m } = mailer({ fail: "'to' parameter is not a valid address" })
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("a failure another attempt cannot fix fails at once", store.jobs[0].state === "failed" && store.jobs[0].attempts === 1)
  }

  console.log("\nWho may be sent to is read when it is sent")
  {
    const store = new MemoryStore()
    flowOf(store, [email("e1"), wait("w", 2), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("the first email goes and the wait holds the second", sent.length === 1 && store.jobs.find((j) => j.step_id === "e2")?.state === "queued")
    const e2 = store.jobs.find((j) => j.step_id === "e2")!
    check("two days on, in UTC", e2.run_at === iso(clock + 2 * DAY), e2.run_at)
    store.suppressed.add("ada@example.com")
    clock += 2 * DAY + 1000
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("unsubscribing during the wait stops the second email", sent.length === 1)
    check("and the run says they left", store.runs[0].status === "exited" && store.runs[0].exit_reason === "Unsubscribed.")
  }
  {
    /*
      Found in the round 5 audit: an address the creator deleted from their
      contacts has no row, and no row read as "not suppressed", so the rest
      of a welcome series kept going to it, without an unsubscribe link (the
      link is the row). A welcome goes on only while they are on the list.
    */
    const store = new MemoryStore()
    flowOf(store, [email("e1"), wait("w", 2), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    store.gone.add("ada@example.com")
    clock += 2 * DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("a welcome stops when the address is taken off the creator's contacts", sent.length === 1 && store.runs[0].status === "exited" && store.runs[0].exit_reason === "No longer on your list.", { sent: sent.length, reason: store.runs[0].exit_reason })
  }
  {
    /* A buyer with no contact row still gets the order's own follow-up: the rule is the welcome's alone. */
    const store = new MemoryStore()
    flowOf(store, [email("e1"), wait("w", 1), email("e2")], { trigger_type: "purchase", trigger_config: { entry: { mode: "each" } } })
    store.gone.add("buyer@example.com")
    await enroll(store, { triggerType: "purchase", creatorId: "c1", email: "buyer@example.com", orderId: "o9" }, clock)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("while a purchase flow still reaches a buyer who is not a contact", sent.length === 2 && store.runs[0].status === "completed", sent.length)
  }

  console.log("\nTurning off and editing")
  {
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    f.status = "paused"
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("a flow turned off sends nothing more to people already in it", sent.length === 1 && store.jobs.find((j) => j.step_id === "e2")?.state === "cancelled")
    check("and their runs say so", store.runs[0].status === "cancelled" && /turned off/.test(store.runs[0].exit_reason ?? ""))
  }
  {
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2", "Old subject")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    f.steps = [email("e1"), wait("w", 1), email("e2", "New subject")]
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("an edit reaches people from their next step", sent[1]?.subject === "New subject")
    check("and the email already sent is not sent again", sent.filter((s) => s.subject === "Subject e1").length === 1)
  }
  {
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2"), email("e3")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    f.steps = [email("e1"), wait("w", 1), email("e3")]
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("a step removed while people wait for it is skipped to the one now after its place", sent.map((s) => s.subject).join("|") === "Subject e1|Subject e3", sent.map((s) => s.subject))
    check("resolveStep says the same", resolveStep(normalizeSteps(f.steps), "e2", "w")?.id === "e3")
  }

  {
    /* Found reading the engine: moving a step up past someone who already had it left them with no job, "in progress" for ever. */
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    f.steps = [email("e1"), email("e2"), wait("w", 1)]
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    const r = store.runs[0]
    const pending = store.jobs.filter((j) => j.run_id === r.id && (j.state === "queued" || j.state === "running"))
    check("a step moved up past someone who already had it: they finish rather than wait for ever with nothing queued", r.status === "completed" && pending.length === 0, { status: r.status, pending: pending.length })
    check("and nothing is sent twice", sent.map((x) => x.subject).join("|") === "Subject e1|Subject e2", sent.map((x) => x.subject))
  }
  {
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2"), email("e3")])
    await join_(store)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    f.steps = [email("e1"), email("e2"), wait("w", 1), email("e3")]
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("and when there is more after the step they had, they go on to it", sent.map((x) => x.subject).join("|") === "Subject e1|Subject e2|Subject e3" && store.runs[0].status === "completed", sent.map((x) => x.subject))
  }
  {
    /* A job run a second time after its worker died: the next step exists and is queued, so it is left alone and runs once. */
    const store = new MemoryStore()
    flowOf(store, [email("e1"), wait("w", 1), email("e2")])
    await join_(store)
    const { m, sent } = mailer()
    const [job] = await store.claim("A", 1, LEASE_SECONDS)
    store.failComplete = 1
    await processJob({ store, mailer: m, worker: "A", now }, job)
    clock += LEASE_SECONDS * 1000 + 1
    await runDue({ store, mailer: m, worker: "B", budgetMs: 1000, now })
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "B", budgetMs: 1000, now })
    check("moving on stays safe to repeat: a job run again after a crash neither skips nor doubles a step", sent.map((x) => x.subject).join("|") === "Subject e1|Subject e2" && store.runs[0].status === "completed", { sent: sent.map((x) => x.subject), status: store.runs[0].status })
  }
  {
    /*
      Found in the round 5 audit: a run's first job has no step before it,
      so when the creator removed that first step while its job waited (a
      send being retried), there was nothing to follow and the run ended as
      "the rest of the flow was removed", with the rest all still there.
      It goes on from what is now the first step.
    */
    const store = new MemoryStore()
    const f = flowOf(store, [email("e1"), wait("w", 1), email("e2")])
    await join_(store)
    const { m, sent } = mailer({ fail: (n) => (n === 1 ? "Mailgun 503 Service Unavailable" : null) })
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("(the first email failed once and waits for its retry)", store.jobs[0].state === "queued" && sent.length === 0)
    f.steps = [wait("w", 1), email("e2")]
    clock += 60_000 + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("the first step removed while its job waits: the run goes on from the new first step", store.runs[0].status === "active" && store.jobs.some((j) => j.step_id === "e2" && j.state === "queued"), { status: store.runs[0].status, reason: store.runs[0].exit_reason })
    clock += DAY + 1
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    check("and gets the rest of the flow, once", sent.map((x) => x.subject).join("|") === "Subject e2" && store.runs[0].status === "completed", sent.map((x) => x.subject))
    check("resolveStep: a first job's step removed stands for the flow's first step now", resolveStep(normalizeSteps(f.steps), "e1", null)?.id === "w" && resolveStep([], "e1", null) === null)
  }

  console.log("\nChecks")
  {
    const store = new MemoryStore()
    flowOf(store, [wait("w", 60), { id: "c", type: "condition", config: { check: "no_purchase_since_entry" } }, email("e1", "It has been a while")], { trigger_type: "purchase", trigger_config: { entry: { mode: "each" } } })
    await enroll(store, { triggerType: "purchase", creatorId: "c1", email: "b@example.com", orderId: "o1" }, clock)
    const { m, sent } = mailer()
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    clock += 10 * DAY
    store.orders.push({ email: "b@example.com", at: clock, creator: "c1" })
    await enroll(store, { triggerType: "purchase", creatorId: "c1", email: "b@example.com", orderId: "o2" }, clock)
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    clock += 61 * DAY
    await runDue({ store, mailer: m, worker: "A", budgetMs: 1000, now })
    const [first, second] = store.runs
    check("a win-back: the older countdown leaves because they bought again", first.status === "exited")
    check("and the newer one sends, once", second.status === "completed" && sent.length === 1, sent.length)
  }

  console.log("\nThe flow model")
  {
    const legacy = normalizeSteps([{ id: "s1", type: "email", order: 0, config: { subject: "Hi", body: "<p>x</p>", delay_value: 2, delay_unit: "hours" } }])
    check("an old email with its own delay reads as a wait, then the email", legacy.length === 2 && legacy[0].type === "wait" && legacy[0].id === "s1_wait" && legacy[1].id === "s1")
    check("and an old immediate one as just the email", normalizeSteps([{ id: "s", type: "email", order: 0, config: { subject: "a", body: "b", delay_value: 0, delay_unit: "minutes" } }]).length === 1)
    check("unknown step types are dropped", normalizeSteps([{ id: "x", type: "sms", config: {} }]).length === 0)
    check("duplicate ids are made unique, so a job can never point at two steps",
      new Set(normalizeSteps([email("a"), email("a")]).map((s) => s.id)).size === 2)
    const problems = problemsOf("new_subscriber", [{ id: "e", type: "email", config: { subject: "", body: "<p></p>" } }, wait("w", 1)])
    check("turning on is refused with each problem in words", problems.length === 3 && problems.some((p) => /needs a subject/.test(p.message)) && problems.some((p) => /is empty/.test(p.message)) && problems.some((p) => /wait at the end/.test(p.message)), problems)
    check("a check that looks at an email before it needs one", problemsOf("purchase", [{ id: "c", type: "condition", config: { check: "opened_previous_email" } }, email("e")]).some((p) => /there is none/.test(p.message)))
    check("a complete flow has none", problemsOf("purchase", [email("e"), wait("w", 3), email("f")]).length === 0)
    check("the summary counts emails and time", stepSummary([email("e"), wait("w", 3), email("f")]) === "2 emails over 3 days")
    const t = timeline([email("e"), wait("w", 3), email("f")])
    check("the timeline says when each happens from the trigger", t[0].when === "Right away" && t[1].when === "After 3 days")
    check("keys: once per person", dedupeKey({ mode: "once" }, { email: "A@x.com", now: 0 }) === "contact:a@x.com")
    check("keys: each order", dedupeKey({ mode: "each" }, { email: "a@x.com", eventId: "o1", now: 0 }) === "event:o1")
    check("the welcome may not be 'every time'", entryRule("new_subscriber", { entry: { mode: "each" } }).mode === "after")
  }

  console.log("\nWhere a contact came from")
  {
    const site = (host: string, path = "/", body?: unknown) =>
      contactSourceFrom({ request: new Request("https://x.test/api", { headers: { referer: `https://${host}${path}` } }), surface: "website", form: "footer", sent: body })
    const s = site("andrewrullz.storelib.com", "/about", { from: "instagram", utm_campaign: "spring", site: "evil.example" })
    check("a sign-up on a built site records that site's address from the page it was on", s?.surface === "website" && s?.site === "andrewrullz.storelib.com", s)
    check("not the address the page claimed", s?.site !== "evil.example")
    check("with where the visit came from, and the campaign", s?.from === "instagram" && s?.utm_campaign === "spring" && s?.form === "footer")
    check("and it reads as the address", sourceView(s).label === "andrewrullz.storelib.com" && /Footer sign-up · from Instagram · utm_campaign spring/.test(sourceView(s).detail), sourceView(s))
    const profile = contactSourceFrom({ request: new Request("https://x.test/api", { headers: { referer: "https://storelib.com/astrid" } }), surface: "profile", form: "bar" })
    const product = contactSourceFrom({ request: new Request("https://x.test/api", { headers: { referer: "https://storelib.com/astrid/presets" } }), surface: "profile", form: "bar" })
    check("the bar on a profile is the profile, the one on a product page is the product page", profile?.surface === "profile" && product?.surface === "product")
    const junk = cleanContactSource({ surface: "website", site: "not a host", from: "<script>", utm_campaign: "ada@example.com", form: "nope", name: "Ada" })
    check("anything that is not a host or a known word is dropped", junk?.site === undefined && junk?.from === undefined && junk?.utm_campaign === undefined && junk?.form === undefined && !("name" in (junk ?? {})), junk)
    check("a stranger cannot put a site on a door that has none", cleanContactSource({ surface: "onepage", site: "x.com" })?.site === undefined)
    check("an old contact reads its old one-word source", sourceView(null, "onepage_email_capture").label === "OnePage" && sourceView(null, "creator_page").label === "Storelib profile")
    check("and one with none says Not recorded", sourceView(null, "direct").label === "Not recorded" && sourceView(null, null).recorded === false)
    check("a checkout on a website says which", contactSourceOfOrder({ surface: "website", site: "shop.example.com", from: "google" }).site === "shop.example.com")
    check("run history says where they joined", joinedSentence({ surface: "website", site: "andrewrullz.storelib.com" }) === "Joined from andrewrullz.storelib.com")
    check("or where they bought", joinedSentence({ surface: "checkout", site: "andrewrullz.storelib.com" }, "purchase") === "Bought on andrewrullz.storelib.com")
  }

  console.log("\nThe database holds the same rules")
  {
    const sql = read("supabase/sql/RUN_EMAIL_AUTOMATIONS.sql")
    const migration = read("supabase/migrations/20260926_email_automation_engine.sql")
    const statements = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.trim()).filter(Boolean)
    check("the migration and the file to paste carry the same statements", statements(sql).join("\n") === statements(migration).join("\n"))
    check("every statement is on one line", statements(sql).every((l) => /;$/.test(l)), statements(sql).filter((l) => !/;$/.test(l)))
    check("no -- comments to be cut in half", !/(^|\s)--\s/m.test(sql))
    check("one run per entry", /CREATE UNIQUE INDEX IF NOT EXISTS email_flow_runs_dedupe ON public\.email_flow_runs \(flow_id, dedupe_key\)/.test(sql))
    check("one job per step per run", /CREATE UNIQUE INDEX IF NOT EXISTS email_flow_jobs_once ON public\.email_flow_jobs \(run_id, step_id\)/.test(sql))
    check("one send per step per run", /CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_once ON public\.email_flow_sends \(run_id, step_id\)/.test(sql))
    check("claims skip what another worker has locked", /FOR UPDATE SKIP LOCKED/.test(sql) && /q\.state = 'running' AND q\.claimed_until < now\(\)/.test(sql))
    check("entering is locked per flow and address, and checks the flow is on", /pg_advisory_xact_lock\(hashtext\(p_flow_id::text/.test(sql) && /status = 'active'\) THEN RETURN NULL/.test(sql))
    check("the run and its first job are written in the same function", /INSERT INTO email_flow_runs[\s\S]*INSERT INTO email_flow_jobs/.test(sql.match(/FUNCTION public\.enroll_email_flow[^\n]*/)?.[0] ?? ""))
    check("only the server can claim or enroll", /REVOKE ALL ON FUNCTION public\.claim_email_flow_jobs\(text, integer, integer\) FROM PUBLIC, anon, authenticated/.test(sql) && /REVOKE ALL ON FUNCTION public\.enroll_email_flow/.test(sql))
    check("creators may read their rows and write none", /REVOKE INSERT, UPDATE, DELETE ON public\.email_flow_sends FROM anon, authenticated/.test(sql) && /FOR SELECT USING \(creator_id IN/.test(sql))
    check("checks are added NOT VALID, so running it on old data cannot fail", (sql.match(/ADD CONSTRAINT [^\n]* NOT VALID;/g) ?? []).length === 3)
    const store = read("lib/automations/supabase-store.ts")
    check("the store marks a job only while it holds it", (store.match(/\.eq\("claimed_by", worker\)\s*\.eq\("state", "running"\)/g) ?? []).length === 3)
    check("and writes the send row before calling the sender", /status: "sending"/.test(store))
    const cron = read("app/api/cron/process-scheduled-emails/route.ts")
    check("the cron runs the engine and takes each older queued email before sending it", /runDueJobs\(/.test(cron) && /\.update\(\{ status: "sending"[\s\S]{0,120}\.eq\("status", "pending"\)/.test(cron))
    check("and never answers with a database error or an address", !/fetchError\.message|err\.message \}/.test(cron))
  }

  console.log("\nThe hourly run keeps inside its time")
  {
    const cron = read("app/api/cron/process-scheduled-emails/route.ts")
    const n = (name: string) => Number((cron.match(new RegExp(`const ${name} = ([\\d_]+)`))?.[1] ?? "NaN").replace(/_/g, ""))
    const max = Number(cron.match(/export const maxDuration = (\d+)/)?.[1]) * 1000
    check("the engine stops claiming by a deadline counted from the start of the whole run, not from its own start",
      /runDueJobs\(Math\.max\(0, Math\.min\(ENGINE_BUDGET_MS, started \+ ENGINE_DEADLINE_MS - Date\.now\(\)\)\)\)/.test(cron))
    check("with a minute of room for the batch it holds before the function's limit",
      n("ENGINE_DEADLINE_MS") + 60_000 <= max && n("LEGACY_DEADLINE_MS") < max && /Math\.min\(Date\.now\(\) \+ LEGACY_BUDGET_MS, started \+ LEGACY_DEADLINE_MS\)/.test(cron),
      { engine: n("ENGINE_DEADLINE_MS"), legacy: n("LEGACY_DEADLINE_MS"), max })
    check("the cron runs every hour, with the checkout sweep before the engine so a reminder's first email goes in the same run",
      /"path": "\/api\/cron\/process-scheduled-emails",\s*"schedule": "0 \* \* \* \*"/.test(read("vercel.json")) && cron.indexOf("runAbandonedSweep()") < cron.indexOf("runDueJobs(") && /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()

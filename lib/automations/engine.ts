/**
 * ===========================================================================
 *  THE AUTOMATION ENGINE: EVERY STEP ONCE, FOR EVERY PERSON, WHATEVER HAPPENS
 * ===========================================================================
 * Postgres is the only memory. Serverless functions share nothing, run twice,
 * die half way and come back an hour later, so every guarantee here is a row
 * and a constraint, never a variable:
 *
 *   ENTERING     A trigger (someone joins, someone buys) enters each active
 *                flow at most once per entry. The run carries a key made
 *                from the flow's entry rule (lib/automations/flow-model
 *                dedupeKey) and (flow_id, dedupe_key) is UNIQUE, and the rule's
 *                time window is checked under a lock in the same transaction
 *                that writes the run and its first job (enroll_email_flow).
 *                The same webhook delivered twice, or the browser and the
 *                webhook reporting one order, write one run.
 *
 *   TAKING WORK  Each step of a run is a job. A worker claims due jobs with
 *                one UPDATE ... FOR UPDATE SKIP LOCKED (claim_email_flow_jobs),
 *                which sets a lease. Two workers never hold the same job. A
 *                worker that dies leaves its lease to run out, and the job is
 *                claimed again, attempt counted.
 *
 *   SENDING      An email step writes its send row, UNIQUE (run_id, step_id),
 *                BEFORE calling Mailgun. Found already sent: skipped. Found
 *                mid-send (a worker died between the two): not sent again,
 *                and marked interrupted, because a second copy is worse than
 *                one the creator can see did not finish. Found failed: tried
 *                again. Whether the person is still on the list is read at
 *                send time, not only when they entered.
 *
 *   MOVING ON    A step's effect first, then the next job (UNIQUE, so a second
 *                insert is nothing), then the job is marked done, only by the
 *                worker holding it. Whichever of those a crash interrupts, the
 *                job is claimed again and every part of it is safe to repeat.
 *
 *   FAILING      A transient failure goes back in the queue with a growing
 *                wait (1 min, 5 min, 30 min, 2 h). After the last attempt, or
 *                at once for a failure that cannot improve, the job and its
 *                run are marked failed WITH the reason, and the builder shows
 *                it with a way to try again. Nothing is dropped quietly.
 *
 *   TURNING OFF  An off flow takes nobody new (checked in the enrolling
 *                transaction), and a job of an off flow is cancelled when it
 *                comes up rather than run. Turning a flow off also cancels
 *                its waiting jobs at once (app/api/automations/flows/[id]).
 *
 *   EDITING      A job names its step and the step before it. Content edits
 *                reach everyone from their next step. A removed step is
 *                skipped to whatever now follows the step before it. Emails
 *                already sent are never sent again.
 *
 * Everything that touches the database is behind `Store`, so this file is
 * the logic alone and tests drive it with an in-memory store that keeps the
 * same constraints (tests/automation-engine.test.ts).
 */

import {
  emailBefore,
  entryRule,
  isTriggerType,
  normalizeSteps,
  problemsOf,
  resolveStep,
  stepAfter,
  waitMs,
  dedupeKey,
  type EmailStep,
  type FlowStep,
  type TriggerConfig,
  type TriggerType,
} from "./flow-model"

/* ─── Rows ───────────────────────────────────────────────────────────── */

export interface FlowRow {
  id: string
  creator_id: string
  name: string
  trigger_type: string
  trigger_config: TriggerConfig | null
  status: string
  steps: unknown
}

export type RunStatus = "active" | "completed" | "exited" | "cancelled" | "failed"
export interface RunRow {
  id: string
  flow_id: string
  creator_id: string
  email: string
  name: string | null
  status: RunStatus
  started_at: string
  context: RunContext
}

export interface RunContext {
  product_title?: string
  product_id?: string
  order_id?: string
}

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled"
export interface JobRow {
  id: string
  run_id: string
  flow_id: string
  creator_id: string
  step_id: string
  after_step_id: string | null
  state: JobState
  run_at: string
  attempts: number
  max_attempts: number
  claimed_by: string | null
}

export type SendBegin =
  /** A new send row, or a failed one taken back: send it. */
  | { go: true; token: string }
  /** Sent before. Do not send again. */
  | { go: false; why: "sent" }
  /** A worker died between writing the row and hearing back. Do not send again. */
  | { go: false; why: "interrupted" }

export interface Standing {
  suppressed: boolean
  unsubscribeToken: string | null
}

export interface Identity {
  fromName: string
  replyTo: string
  storeUrl: string
}

export interface OutgoingMail {
  to: string
  fromName: string
  replyTo: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export interface Store {
  /** Active flows for a trigger. Null when the engine's tables are not there yet. */
  activeFlows(creatorId: string, trigger: TriggerType): Promise<FlowRow[] | null>
  /** enroll_email_flow. `unavailable` when the function is not there yet. */
  enroll(input: {
    flowId: string
    creatorId: string
    email: string
    name: string | null
    dedupeKey: string
    windowDays: number
    triggerType: TriggerType
    firstStepId: string
    context: RunContext
    source: unknown
  }): Promise<{ runId: string | null; unavailable?: boolean }>
  claim(worker: string, limit: number, leaseSeconds: number): Promise<JobRow[] | null>
  flow(id: string): Promise<FlowRow | null>
  run(id: string): Promise<RunRow | null>
  /** Only a run that is still active changes. */
  finishRun(runId: string, status: Exclude<RunStatus, "active">, reason: string | null): Promise<void>
  setRunStep(runId: string, stepId: string): Promise<void>
  /** Insert, and nothing when (run_id, step_id) exists. */
  enqueue(job: { runId: string; flowId: string; creatorId: string; stepId: string; afterStepId: string | null; runAt: string }): Promise<void>
  /** Each only when the job is running and held by `worker`. True when it changed. */
  completeJob(jobId: string, worker: string, state: "done" | "cancelled", note?: string | null): Promise<boolean>
  retryJob(jobId: string, worker: string, runAt: string, error: string): Promise<boolean>
  failJob(jobId: string, worker: string, error: string): Promise<boolean>
  beginSend(input: { runId: string; flowId: string; creatorId: string; stepId: string; email: string; subject: string }): Promise<SendBegin>
  finishSend(runId: string, stepId: string, result: { ok: true; providerId: string | null } | { ok: false; error: string }): Promise<void>
  purchasedSince(creatorId: string, email: string, sinceIso: string): Promise<boolean>
  openedStep(runId: string, stepId: string): Promise<boolean>
  standing(creatorId: string, email: string): Promise<Standing>
  identity(creatorId: string): Promise<Identity>
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<{ success: boolean; messageId?: string; error?: string }>
  /** Turns a creator's body into the finished email: personalised, tracked, framed, with its way out. */
  compose(input: { step: EmailStep; run: RunRow; identity: Identity; standing: Standing; token: string }): { subject: string; html: string; text: string; headers?: Record<string, string> }
  /** Counted against the creator's monthly allowance. Best effort. */
  counted?(creatorId: string): Promise<void>
}

/* ─── Retries ────────────────────────────────────────────────────────── */

export const LEASE_SECONDS = 300
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]

/** How long to wait after this many failed attempts. */
export function retryDelayMs(attempts: number): number {
  return BACKOFF_MS[Math.max(0, Math.min(BACKOFF_MS.length - 1, attempts - 1))]
}

/** A failure that another attempt cannot fix. */
export class PermanentError extends Error {}

export function isPermanentSendError(message: string): boolean {
  return /not a valid address|invalid (email|recipient|address)|Invalid email format|mailbox (does not|doesn't) exist|recipient address rejected/i.test(message)
}

/** Short, and without anything that looks like an address, for a column the creator reads. */
export function reasonText(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong"
  return raw.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "(address)").replace(/\s+/g, " ").trim().slice(0, 300) || "Something went wrong"
}

/* ─── Entering flows ─────────────────────────────────────────────────── */

export interface TriggerInput {
  triggerType: TriggerType
  creatorId: string
  email: string
  name?: string | null
  productId?: string | null
  /** A basket: every product in it. A flow for one product enters when any of them is it. */
  productIds?: string[] | null
  productTitle?: string | null
  orderId?: string | null
  /** For "each": the event this entry is for, when it is not an order. */
  eventId?: string | null
  source?: unknown
}

export interface EnrollResult {
  /** False when the engine's tables are not there yet: the caller uses the older path. */
  available: boolean
  enrolled: number
  skipped: Array<{ flowId: string; why: string }>
}

export async function enroll(store: Store, input: TriggerInput, now: number): Promise<EnrollResult> {
  const email = input.email.trim().toLowerCase()
  const out: EnrollResult = { available: true, enrolled: 0, skipped: [] }
  const flows = await store.activeFlows(input.creatorId, input.triggerType)
  if (flows === null) return { ...out, available: false }
  if (flows.length === 0) return out

  const standing = await store.standing(input.creatorId, email)
  if (standing.suppressed) {
    for (const f of flows) out.skipped.push({ flowId: f.id, why: "not on the list" })
    return out
  }

  for (const flow of flows) {
    if (!isTriggerType(flow.trigger_type)) continue
    const steps = normalizeSteps(flow.steps)
    if (steps.length === 0 || problemsOf(flow.trigger_type, steps).length > 0) {
      out.skipped.push({ flowId: flow.id, why: "flow is not complete" })
      continue
    }
    const products = Array.isArray(flow.trigger_config?.product_ids) ? flow.trigger_config!.product_ids!.filter((p) => typeof p === "string") : []
    const bought = [...(input.productIds ?? []), ...(input.productId ? [input.productId] : [])]
    if (input.triggerType === "purchase" && products.length > 0 && !bought.some((p) => products.includes(p))) {
      out.skipped.push({ flowId: flow.id, why: "another product" })
      continue
    }
    const rule = entryRule(flow.trigger_type, flow.trigger_config)
    const key = dedupeKey(rule, { email, eventId: input.orderId ?? input.eventId ?? null, now })
    const windowDays = rule.mode === "once" ? -1 : rule.mode === "after" ? rule.days : 0
    const context: RunContext = {}
    if (input.productTitle) context.product_title = input.productTitle.slice(0, 200)
    if (input.productId) context.product_id = input.productId
    if (input.orderId) context.order_id = input.orderId
    const res = await store.enroll({
      flowId: flow.id,
      creatorId: input.creatorId,
      email,
      name: input.name?.trim().slice(0, 120) || null,
      dedupeKey: key,
      windowDays,
      triggerType: input.triggerType,
      firstStepId: steps[0].id,
      context,
      source: input.source ?? null,
    })
    if (res.unavailable) return { ...out, available: false }
    if (res.runId) out.enrolled++
    else out.skipped.push({ flowId: flow.id, why: "already entered" })
  }
  return out
}

/* ─── Running one job ────────────────────────────────────────────────── */

export type JobOutcome = "done" | "cancelled" | "retry" | "failed" | "lost"

interface Ctx {
  store: Store
  mailer: Mailer
  worker: string
  now: () => number
}

/**
 * Runs one claimed job to its end. Never throws: whatever happens is written
 * to the job, and the return value says which.
 */
export async function processJob(ctx: Ctx, job: JobRow): Promise<JobOutcome> {
  const { store, worker } = ctx
  const iso = (ms: number) => new Date(ms).toISOString()
  const cancel = async (runStatus: Exclude<RunStatus, "active"> | null, reason: string) => {
    if (runStatus) await store.finishRun(job.run_id, runStatus, reason)
    return (await store.completeJob(job.id, worker, "cancelled", reason)) ? "cancelled" : "lost"
  }

  try {
    /* A lease that ran out too many times: whatever keeps killing the
       worker, one more try will not help. */
    if (job.attempts > job.max_attempts) {
      const reason = "Stopped after repeated interruptions."
      await store.finishRun(job.run_id, "failed", reason)
      return (await store.failJob(job.id, worker, reason)) ? "failed" : "lost"
    }

    const flow = await store.flow(job.flow_id)
    if (!flow) return cancel("cancelled", "The flow was deleted.")
    if (flow.status !== "active") return cancel("cancelled", "The flow was turned off.")
    const run = await store.run(job.run_id)
    if (!run) return cancel(null, "The run no longer exists.")
    if (run.status !== "active") return cancel(null, `The run had already ${run.status === "completed" ? "finished" : "stopped"}.`)

    const steps = normalizeSteps(flow.steps)
    const step = resolveStep(steps, job.step_id, job.after_step_id)
    if (!step) {
      await store.finishRun(run.id, "completed", "The rest of the flow was removed.")
      return (await store.completeJob(job.id, worker, "done")) ? "done" : "lost"
    }
    if (step.id !== job.step_id) {
      /* The step this job was for was removed; the one now in its place is
         queued as its own job, so it too runs once. */
      await store.enqueue({ runId: run.id, flowId: flow.id, creatorId: run.creator_id, stepId: step.id, afterStepId: job.after_step_id, runAt: iso(ctx.now()) })
      return (await store.completeJob(job.id, worker, "done", "Step removed; moved on.")) ? "done" : "lost"
    }

    const standing = await store.standing(run.creator_id, run.email)
    if (standing.suppressed) return cancel("exited", "Unsubscribed.")

    let delayNext = 0
    if (step.type === "email") {
      const sent = await sendStep(ctx, flow, run, step, standing)
      if (sent === "interrupted") {
        const reason = "Sending was interrupted and it is not known whether this email arrived. It was not sent again, so nobody gets it twice."
        await store.finishRun(run.id, "failed", reason)
        return (await store.failJob(job.id, worker, reason)) ? "failed" : "lost"
      }
    } else if (step.type === "wait") {
      delayNext = waitMs(step)
    } else {
      const pass = await checkCondition(store, run, steps, step)
      if (!pass) {
        await store.finishRun(run.id, "exited", "Did not meet the check.")
        return (await store.completeJob(job.id, worker, "done")) ? "done" : "lost"
      }
    }

    const next = stepAfter(steps, step.id)
    if (next) {
      await store.enqueue({ runId: run.id, flowId: flow.id, creatorId: run.creator_id, stepId: next.id, afterStepId: step.id, runAt: iso(ctx.now() + delayNext) })
      await store.setRunStep(run.id, next.id)
    } else {
      await store.finishRun(run.id, "completed", null)
    }
    return (await store.completeJob(job.id, worker, "done")) ? "done" : "lost"
  } catch (error) {
    const reason = reasonText(error)
    const permanent = error instanceof PermanentError
    if (permanent || job.attempts >= job.max_attempts) {
      await safely(() => store.finishRun(job.run_id, "failed", reason))
      return (await safely(() => store.failJob(job.id, worker, reason))) ? "failed" : "lost"
    }
    return (await safely(() => store.retryJob(job.id, worker, iso(ctx.now() + retryDelayMs(job.attempts)), reason))) ? "retry" : "lost"
  }
}

async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

async function sendStep(ctx: Ctx, flow: FlowRow, run: RunRow, step: EmailStep, standing: Standing): Promise<"sent" | "skipped" | "interrupted"> {
  const { store, mailer } = ctx
  const identity = await store.identity(run.creator_id)
  const begin = await store.beginSend({ runId: run.id, flowId: flow.id, creatorId: run.creator_id, stepId: step.id, email: run.email, subject: step.config.subject })
  if (!begin.go) return "why" in begin && begin.why === "sent" ? "skipped" : "interrupted"
  const mail = mailer.compose({ step, run, identity, standing, token: begin.token })
  let result: { success: boolean; messageId?: string; error?: string }
  try {
    result = await mailer.send({ to: run.email, fromName: identity.fromName, replyTo: identity.replyTo, ...mail })
  } catch (error) {
    result = { success: false, error: reasonText(error) }
  }
  if (!result.success) {
    const error = reasonText(result.error || "The email service did not accept it.")
    await store.finishSend(run.id, step.id, { ok: false, error })
    throw isPermanentSendError(error) ? new PermanentError(error) : new Error(error)
  }
  await store.finishSend(run.id, step.id, { ok: true, providerId: result.messageId ?? null })
  if (mailer.counted) await safely(() => mailer.counted!(run.creator_id))
  return "sent"
}

async function checkCondition(store: Store, run: RunRow, steps: FlowStep[], step: Extract<FlowStep, { type: "condition" }>): Promise<boolean> {
  switch (step.config.check) {
    case "no_purchase_since_entry":
      return !(await store.purchasedSince(run.creator_id, run.email, run.started_at))
    case "purchased_since_entry":
      return store.purchasedSince(run.creator_id, run.email, run.started_at)
    case "opened_previous_email":
    case "not_opened_previous_email": {
      const before = emailBefore(steps, step.id)
      const opened = before ? await store.openedStep(run.id, before.id) : false
      return step.config.check === "opened_previous_email" ? opened : !opened
    }
  }
}

/* ─── Running what is due ────────────────────────────────────────────── */

export interface DueResult {
  /** False when the engine's tables are not there yet. */
  available: boolean
  claimed: number
  outcomes: Record<JobOutcome, number>
}

/**
 * Claims and runs due jobs in small batches until nothing is due or the time
 * is up. A job claimed and not finished before the budget ends keeps running
 * (it is awaited); the budget only stops new claims.
 */
export async function runDue(input: { store: Store; mailer: Mailer; worker: string; budgetMs: number; batch?: number; now?: () => number }): Promise<DueResult> {
  const now = input.now ?? Date.now
  const started = now()
  const outcomes: Record<JobOutcome, number> = { done: 0, cancelled: 0, retry: 0, failed: 0, lost: 0 }
  let claimed = 0
  while (now() - started < input.budgetMs) {
    const jobs = await input.store.claim(input.worker, input.batch ?? 10, LEASE_SECONDS)
    if (jobs === null) return { available: false, claimed, outcomes }
    if (jobs.length === 0) break
    claimed += jobs.length
    for (const job of jobs) {
      const outcome = await processJob({ store: input.store, mailer: input.mailer, worker: input.worker, now }, job)
      outcomes[outcome]++
    }
  }
  return { available: true, claimed, outcomes }
}

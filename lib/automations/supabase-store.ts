import "server-only"

/**
 * The engine's Store (lib/automations/engine.ts) on Supabase, with the
 * service role. Every write that must happen once is a unique index or a
 * conditional UPDATE in the database; nothing here remembers anything
 * between calls.
 *
 * BEFORE THE SQL. supabase/sql/RUN_EMAIL_AUTOMATIONS.sql adds the tables and
 * functions. Until it runs, `enroll` and `claim` report the engine as not
 * there (a missing relation or function), and the callers use the older
 * path: see triggerEmailFlows in lib/email.tsx.
 */

import { APP_URL, standingOf } from "@/lib/email-automation"
import type { FlowRow, Identity, JobRow, RunRow, SendBegin, Standing, Store } from "./engine"
import type { TriggerType } from "./flow-model"

type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type PgError = { code?: string; message?: string } | null | undefined

/** A table or function the SQL adds, not there yet. */
export function isMissing(error: PgError): boolean {
  if (!error) return false
  const code = error.code ?? ""
  if (code === "42P01" || code === "42883" || code === "PGRST205" || code === "PGRST202" || code === "42703") return true
  return /does not exist|could not find the (table|function)|schema cache/i.test(error.message ?? "")
}

class StoreError extends Error {}

function fail(what: string, error: PgError): never {
  /* The code, never the message: a message can quote a row. */
  throw new StoreError(`Could not ${what} (${error?.code || "database error"}).`)
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const FLOW_COLUMNS = "id, creator_id, name, trigger_type, trigger_config, status, steps"

export function supabaseStore(db: Db): Store {
  const identities = new Map<string, Promise<Identity>>()
  return {
    async activeFlows(creatorId: string, trigger: TriggerType) {
      const { data, error } = await db.from("email_flows").select(FLOW_COLUMNS).eq("creator_id", creatorId).eq("trigger_type", trigger).eq("status", "active")
      if (error) fail("read the flows", error)
      return (data ?? []) as FlowRow[]
    },

    async enroll(input) {
      const args = {
        p_flow_id: input.flowId,
        p_creator_id: input.creatorId,
        p_email: input.email,
        p_name: input.name,
        p_dedupe_key: input.dedupeKey,
        p_window_days: input.windowDays,
        p_trigger_type: input.triggerType,
        p_first_step_id: input.firstStepId,
        p_context: input.context,
        p_source: input.source ?? null,
      }
      /* A trigger that fails to enter is an automation that never runs, so a
         dropped connection is tried again. The function is safe to repeat:
         a second call for the same entry writes nothing. */
      let last: PgError = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await db.rpc("enroll_email_flow", args)
        if (!error) return { runId: typeof data === "string" ? data : null }
        if (isMissing(error)) return { runId: null, unavailable: true }
        last = error
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
      }
      fail("enter the flow", last)
    },

    async claim(worker, limit, leaseSeconds) {
      const { data, error } = await db.rpc("claim_email_flow_jobs", { p_worker: worker, p_limit: limit, p_lease_seconds: leaseSeconds })
      if (error) {
        if (isMissing(error)) return null
        fail("claim work", error)
      }
      return (Array.isArray(data) ? data : []) as JobRow[]
    },

    async flow(id) {
      const { data, error } = await db.from("email_flows").select(FLOW_COLUMNS).eq("id", id).maybeSingle()
      if (error) fail("read the flow", error)
      return (data ?? null) as FlowRow | null
    },

    async run(id) {
      const { data, error } = await db.from("email_flow_runs").select("id, flow_id, creator_id, email, name, status, started_at, context").eq("id", id).maybeSingle()
      if (error) fail("read the run", error)
      return data ? ({ ...data, context: data.context ?? {} } as RunRow) : null
    },

    async finishRun(runId, status, reason) {
      const now = new Date().toISOString()
      const { error } = await db
        .from("email_flow_runs")
        .update({ status, exit_reason: reason, finished_at: now, updated_at: now })
        .eq("id", runId)
        .eq("status", "active")
      if (error) fail("finish the run", error)
    },

    async setRunStep(runId, stepId) {
      const { error } = await db.from("email_flow_runs").update({ current_step_id: stepId, updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "active")
      if (error) fail("move the run on", error)
    },

    async enqueue(job) {
      const { error } = await db.from("email_flow_jobs").upsert(
        { run_id: job.runId, flow_id: job.flowId, creator_id: job.creatorId, step_id: job.stepId, after_step_id: job.afterStepId, run_at: job.runAt, state: "queued" },
        { onConflict: "run_id,step_id", ignoreDuplicates: true },
      )
      if (error) fail("queue the next step", error)
    },

    async completeJob(jobId, worker, state, note) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state, finished_at: now, updated_at: now, claimed_until: null, ...(note ? { last_error: note } : {}) })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("finish the step", error)
      return Array.isArray(data) && data.length > 0
    },

    async retryJob(jobId, worker, runAt, message) {
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state: "queued", run_at: runAt, last_error: message, claimed_by: null, claimed_until: null, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("put the step back", error)
      return Array.isArray(data) && data.length > 0
    },

    async failJob(jobId, worker, message) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state: "failed", last_error: message, finished_at: now, updated_at: now, claimed_until: null })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("mark the step failed", error)
      return Array.isArray(data) && data.length > 0
    },

    async beginSend(input): Promise<SendBegin> {
      const { data, error } = await db
        .from("email_flow_sends")
        .insert({ run_id: input.runId, flow_id: input.flowId, creator_id: input.creatorId, step_id: input.stepId, email: input.email, subject: input.subject.slice(0, 300), status: "sending" })
        .select("token")
        .single()
      if (!error && data?.token) return { go: true, token: data.token }
      if (error && error.code !== "23505") fail("write the send", error)
      const { data: row, error: readError } = await db.from("email_flow_sends").select("status, token").eq("run_id", input.runId).eq("step_id", input.stepId).maybeSingle()
      if (readError || !row) fail("read the send", readError)
      if (row.status === "sent") return { go: false, why: "sent" }
      if (row.status === "failed") {
        const { data: taken, error: takeError } = await db
          .from("email_flow_sends")
          .update({ status: "sending", error: null, subject: input.subject.slice(0, 300), updated_at: new Date().toISOString() })
          .eq("run_id", input.runId)
          .eq("step_id", input.stepId)
          .eq("status", "failed")
          .select("token")
        if (takeError) fail("retry the send", takeError)
        if (Array.isArray(taken) && taken[0]?.token) return { go: true, token: taken[0].token }
        return { go: false, why: "interrupted" }
      }
      if (row.status === "sending") {
        await db.from("email_flow_sends").update({ status: "interrupted", updated_at: new Date().toISOString() }).eq("run_id", input.runId).eq("step_id", input.stepId).eq("status", "sending")
      }
      return { go: false, why: "interrupted" }
    },

    async finishSend(runId, stepId, result) {
      const now = new Date().toISOString()
      const patch = result.ok
        ? { status: "sent", provider_id: result.providerId, sent_at: now, error: null, updated_at: now }
        : { status: "failed", error: "error" in result ? result.error : "Send failed", updated_at: now }
      const { error } = await db.from("email_flow_sends").update(patch).eq("run_id", runId).eq("step_id", stepId).eq("status", "sending")
      if (error) fail("record the send", error)
    },

    async purchasedSince(creatorId, email, sinceIso) {
      const { data: products, error } = await db.from("products").select("id").eq("creator_id", creatorId)
      if (error) fail("read the products", error)
      const ids = (products ?? []).map((p: { id: string }) => p.id)
      if (ids.length === 0) return false
      const { count, error: ordersError } = await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .ilike("buyer_email", likeExact(email))
        .eq("status", "completed")
        .gt("created_at", sinceIso)
      if (ordersError) fail("read the orders", ordersError)
      return (count ?? 0) > 0
    },

    async openedStep(runId, stepId) {
      const { data, error } = await db.from("email_flow_sends").select("opened_at, clicked_at").eq("run_id", runId).eq("step_id", stepId).maybeSingle()
      if (error) fail("read the send", error)
      return Boolean(data?.opened_at || data?.clicked_at)
    },

    standing(creatorId, email): Promise<Standing> {
      return standingOf(db, creatorId, email)
    },

    identity(creatorId) {
      let found = identities.get(creatorId)
      if (!found) {
        found = readIdentity(db, creatorId)
        identities.set(creatorId, found)
      }
      return found
    },
  }
}

async function readIdentity(db: Db, creatorId: string): Promise<Identity> {
  const fallback = { fromName: "Storelib", replyTo: process.env.EMAIL_REPLY_TO || "support@storelib.com", storeUrl: APP_URL }
  try {
    const { data: creator } = await db.from("creators").select("slug, headline, support_email, user_id").eq("id", creatorId).maybeSingle()
    if (!creator) return fallback
    const { data: profile } = creator.user_id
      ? await db.from("profiles").select("display_name, username, email").eq("id", creator.user_id).maybeSingle()
      : { data: null }
    const fromName = profile?.display_name?.trim() || profile?.username?.trim() || creator.headline?.trim() || creator.slug?.trim() || "Storelib"
    const replyTo = (creator.support_email?.trim() || profile?.email?.trim() || fallback.replyTo).toLowerCase()
    const handle = profile?.username?.trim() || creator.slug?.trim()
    return { fromName, replyTo, storeUrl: handle ? `${APP_URL}/${encodeURIComponent(handle)}` : APP_URL }
  } catch {
    return fallback
  }
}

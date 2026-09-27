import "server-only"

import type { CronCheck, SchemaCheck, SystemPayload } from "../types"
import { Reader, isoDaysAgo, isoMinutesAgo } from "../platform-metrics"
import { plainReason } from "../plain-reason"
import { CRON_JOBS, ENV_CHECKS, EXPECTED_FUNCTIONS, EXPECTED_SCHEMA } from "../schema-expectations"

const HOUR = 60 * 60 * 1000

export async function system(r: Reader): Promise<Omit<SystemPayload, "problems" | "notices">> {
  const [crons, rateRows, rateOldest, schema] = await Promise.all([
    cronChecks(r),
    r.count("rate limit rows", "rate_limit_hits"),
    r.rows<{ created_at: string }>("rate limit oldest", "rate_limit_hits", "created_at", (q) => q.order("created_at", { ascending: true }).limit(1)),
    schemaChecks(r),
  ])

  return {
    crons,
    env: ENV_CHECKS.map((e) => ({ name: e.name, group: e.group, set: typeof process.env[e.name] === "string" && process.env[e.name]!.length > 0, ...(e.optional ? { optional: true } : {}) })),
    rateLimit: { rows: rateRows, oldest: rateOldest?.[0]?.created_at ?? null },
    schema,
  }
}

/**
 * None of the jobs writes a "last ran" row, so each is judged by the work it
 * leaves behind: a sent flow email, a released hold, a fresh rollup. When
 * there is work waiting that is older than the schedule allows, the job is
 * late. When there is no trace to read, it says so rather than guessing.
 */
async function cronChecks(r: Reader): Promise<CronCheck[]> {
  const [lastFlowSend, lateFlows, lastRelease, overdueHolds, lastRollup, lastNotify, lateNotifyJobs] = await Promise.all([
    r.rows<{ sent_at: string | null }>("cron: flow sends", "scheduled_flow_emails", "sent_at", (q) => q.not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(1)),
    r.count("cron: late flow emails", "scheduled_flow_emails", (q) => q.eq("status", "pending").lt("scheduled_for", isoMinutesAgo(120))),
    r.rows<{ created_at: string }>("cron: hold releases", "ledger_events", "created_at", (q) => q.eq("event_type", "hold_release").order("created_at", { ascending: false }).limit(1)),
    r.count("cron: overdue holds", "ledger_events", (q) => q.eq("event_type", "sale").is("released_at", null).lt("hold_until", isoDaysAgo(2))),
    r.rows<{ updated_at: string | null }>("cron: rollups", "analytics_daily_rollups", "updated_at", (q) => q.order("updated_at", { ascending: false }).limit(1)),
    r.rows<{ evaluated_at: string | null }>("cron: notifications", "notification_creator_state", "evaluated_at", (q) => q.not("evaluated_at", "is", null).order("evaluated_at", { ascending: false }).limit(1)),
    r.count("cron: late notification jobs", "notification_jobs", (q) => q.eq("state", "pending").lt("run_at", isoMinutesAgo(30))),
  ])

  const byPath = (path: string) => CRON_JOBS.find((j) => j.path === path)!
  const old = (iso: string | null | undefined, hours: number) => !!iso && Date.now() - new Date(iso).getTime() > hours * HOUR

  const flows = byPath("/api/cron/process-scheduled-emails")
  const holds = byPath("/api/cron/release-holds")
  const rollup = byPath("/api/cron/rollup-daily")
  const purge = byPath("/api/cron/purge-chat-attachments")

  const flowSign = lastFlowSend?.[0]?.sent_at ?? null
  const releaseSign = lastRelease?.[0]?.created_at ?? null
  const rollupSign = lastRollup?.[0]?.updated_at ?? null
  const notifySign = lastNotify?.[0]?.evaluated_at ?? null

  return [
    {
      ...flows,
      lastSign: flowSign,
      state: lateFlows === null ? "unknown" : lateFlows > 0 ? "late" : "ok",
      note: lateFlows === null ? r.reasonFor("cron: late flow emails") ?? "Could not be read." : lateFlows > 0 ? `${lateFlows} flow emails are more than two hours past due.` : "Nothing is waiting past its time.",
    },
    {
      ...holds,
      lastSign: releaseSign,
      state: overdueHolds === null ? "unknown" : overdueHolds > 0 ? "late" : "ok",
      note: overdueHolds === null ? r.reasonFor("cron: overdue holds") ?? "Could not be read." : overdueHolds > 0 ? `${overdueHolds} sales are more than two days past their release date.` : "No hold is past its release date.",
    },
    {
      ...rollup,
      lastSign: rollupSign,
      state: lastRollup === null ? "unknown" : !rollupSign ? "unknown" : old(rollupSign, 50) ? "late" : "ok",
      note: lastRollup === null ? r.reasonFor("cron: rollups") ?? "Could not be read." : !rollupSign ? "No rollup has ever been written." : old(rollupSign, 50) ? "The newest rollup is more than two days old." : "Rolled up within the last two days.",
    },
    { ...purge, lastSign: null, state: "unknown", note: "Leaves no record to read. Check the Vercel cron log." },
    { ...byPath("/api/cron/storage-cleanup"), lastSign: null, state: "unknown", note: "Leaves no record to read. Check the Vercel cron log." },
    { ...byPath("/api/cron/strip-image-metadata"), lastSign: null, state: "unknown", note: "Leaves no record to read. Check the Vercel cron log." },
    {
      ...byPath("/api/cron/notifications"),
      lastSign: notifySign,
      state: lastNotify === null || !notifySign ? "unknown" : old(notifySign, 3) ? "late" : "ok",
      note:
        lastNotify === null
          ? r.reasonFor("cron: notifications") ?? "Could not be read. Its SQL may not have run yet (supabase/sql/run-now/29_notification_rules.sql)."
          : !notifySign
            ? "No creator has been evaluated yet."
            : old(notifySign, 3)
              ? "No creator has been evaluated in the last three hours."
              : "Creators evaluated within the last three hours.",
    },
    {
      ...byPath("/api/cron/notify"),
      lastSign: null,
      state: lateNotifyJobs === null ? "unknown" : lateNotifyJobs > 0 ? "late" : "ok",
      note:
        lateNotifyJobs === null
          ? r.reasonFor("cron: late notification jobs") ?? "Could not be read. Its SQL may not have run yet (supabase/sql/run-now/40_notification_engine.sql)."
          : lateNotifyJobs > 0
            ? `${lateNotifyJobs} notifications are more than half an hour past due.`
            : "Nothing is waiting past its time.",
    },
  ]
}

/**
 * Read-only: one `select … limit 0` per table. A missing column is named by
 * the database one at a time, so it is taken out and the table is asked
 * again, which lists every missing column rather than the first.
 */
async function schemaChecks(r: Reader): Promise<SchemaCheck[]> {
  const tables = Object.entries(EXPECTED_SCHEMA)
  const results = await Promise.all(
    tables.map(async ([table, spec]): Promise<SchemaCheck> => {
      let columns = [...spec.columns, ...(spec.laterColumns ?? [])]
      const missing: string[] = []
      try {
        for (let i = 0; i <= columns.length; i++) {
          const { error } = await r.db.from(table).select(columns.join(", ")).limit(0)
          if (!error) return { table, present: true, missingColumns: missing, reason: null }
          if (error.code === "42P01" || error.code === "PGRST205" || /does not exist/i.test(error.message) && /relation|table/i.test(error.message)) {
            return { table, present: false, missingColumns: [], reason: plainReason(error, table) }
          }
          const named = error.message.match(/column [\w"]*\.?"?(\w+)"? does not exist/i)?.[1]
          if (!named || !columns.includes(named)) return { table, present: null, missingColumns: missing, reason: plainReason(error, table) }
          missing.push(named)
          columns = columns.filter((c) => c !== named)
          if (!columns.length) return { table, present: true, missingColumns: missing, reason: null }
        }
      } catch (e) {
        return { table, present: null, missingColumns: missing, reason: plainReason(e, table) }
      }
      return { table, present: true, missingColumns: missing, reason: null }
    }),
  )

  /* The functions, asked with arguments that make them do no work. */
  const fnChecks = await Promise.all(
    EXPECTED_FUNCTIONS.map(async (fn): Promise<SchemaCheck> => {
      const args = fn === "admin_daily_sales" ? { p_days: 1 } : fn === "admin_creator_sales" ? { p_creator_ids: [], p_since: new Date().toISOString(), p_limit: 1 } : { p_since: new Date().toISOString() }
      try {
        const { error } = await r.db.rpc(fn, args)
        if (!error) return { table: `${fn}()`, present: true, missingColumns: [], reason: null }
        const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message)
        return { table: `${fn}()`, present: missing ? false : null, missingColumns: [], reason: plainReason(error, fn) }
      } catch (e) {
        return { table: `${fn}()`, present: null, missingColumns: [], reason: plainReason(e, fn) }
      }
    }),
  )

  return [...results, ...fnChecks].sort((a, b) => Number(a.present === true && !a.missingColumns.length) - Number(b.present === true && !b.missingColumns.length))
}

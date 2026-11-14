/**
 * ===========================================================================
 *  START WITH AI: THE JOB'S ROW, MADE ONCE PER PRESS
 * ===========================================================================
 * The Website page names each press of Create with a key of its own (a
 * random id), and (creator, key) is unique in ai_site_jobs: the same press
 * sent twice, a retry after a lost answer, finds the first job instead of
 * starting a second. Without the table (SQL part 380 not run yet) the answer
 * is `missing`, and the editor builds the site inside its own request.
 *
 * ROUND L. The row also keeps what the person chose beside their words
 * (`options`: blank or inside the theme, the example they picked, a design
 * preset, preferences; `mode`, the same generation as its own column) and
 * which engine runs it (`engine`: classic, the five step pipeline, unless
 * AI_BUILDER_AGENT=1 picks the agent). All of it is written here, in the
 * create request, before the editor is opened: nothing the person chose
 * waits in the browser. The prompt is stored exactly as sent.
 *
 * A database without SQL part 401 has no such columns: the row is made
 * without them (the prompt is still whole, and blank or theme is already in
 * the website itself, see create-website.ts), and the server log says so.
 */
import type { JobEngine, StartOptions } from "@/lib/ai-builder/types"
import { isMissingTable, JOBS_TABLE } from "./server"
import { emptyState } from "./job"
import { agentOnForEveryone } from "./agent-access"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Jobs one creator may have running at once. */
export const MAX_RUNNING_JOBS = 1

/** The Website page's key for one press: 8 to 80 letters, digits and dashes. */
export function isStartKey(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,80}$/.test(v)
}

export type StartedJob = { kind: "made"; id: string } | { kind: "duplicate"; id: string; installId: string } | { kind: "missing" } | { kind: "failed" }

/** Which engine a new job runs on: the agent unless the platform switched it off (AI_BUILDER_AGENT=0, round N). */
export function startEngine(env: Record<string, string | undefined> = process.env): JobEngine {
  return agentOnForEveryone(env) ? "agent" : "classic"
}

/** A column the database does not have yet (SQL part 401 not run): checked before isMissingTable, whose words match it too. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the '[a-z_]+' column/i.test(error.message ?? "")
}

/*
  ===========================================================================
   THE BUILD IN ONE REQUEST, AND WHAT IT IS COUNTED AS (round AW)
  ===========================================================================
  app/api/website-builder/themes/[installId]/generate builds a whole website
  inside one request. It is there for a database without this table (SQL
  part 380), where the create route answers `fallback` and the editor has no
  job to follow. Nothing kept it to that: with the table there it still built,
  and it counted none of what a job counts. A body with any `checkpoint`, even
  `{}` (which starts from the beginning), was counted as a Continue, forty an
  hour (LIMITS.siteAi) where a new website is ten a day (LIMITS.siteGenerate),
  and nothing held it to one build at a time. A build is some thirty model
  calls and a dozen pictures on Storelib's keys.
*/

/**
 * From a one row read of the jobs table: "inline" when the table is not there
 * (the build runs in the request, as before), "jobs" when it is (every Start
 * with AI is a job, so nothing starts in the request), "unknown" when the read
 * failed for another reason (nothing starts: a count that cannot be read never
 * starts an AI run, lib/sites/rate-limit.ts).
 */
export function inlineBuildGate(probe: { error: { code?: string; message?: string } | null }): "inline" | "jobs" | "unknown" {
  if (!probe.error) return "jobs"
  return isMissingTable(probe.error) ? "inline" : "unknown"
}

/**
 * Which allowance a build in one request is counted in, from the job read out
 * of what was sent: a Continue only when its checkpoint carried a plan to go
 * on with. Anything else starts the website from the beginning, and is a new one.
 */
export function inlineBuildBucket(resuming: boolean, plan: unknown): "site-generate" | "site-generate-continue" {
  return resuming && plan ? "site-generate-continue" : "site-generate"
}

export async function startJobRow(
  admin: Db,
  input: { creatorId: string; ownerUserId: string | null; installId: string; prompt: string; key: string; options?: StartOptions; engine?: JobEngine },
): Promise<StartedJob> {
  const options: StartOptions = input.options ?? { generation: "theme" }
  const base = {
    creator_id: input.creatorId,
    owner_user_id: input.ownerUserId,
    install_id: input.installId,
    prompt: input.prompt,
    idempotency_key: input.key,
    status: "queued",
    step: "plan",
    progress: 0,
    state: emptyState(),
  }
  const insert = (row: Record<string, unknown>) => admin.from(JOBS_TABLE).insert(row).select("id").single()
  /* An agent job is on its one step from the start (SQL part 401 allows it); a classic one starts at plan. */
  const engine = input.engine ?? "classic"
  let { data, error } = await insert({ ...base, step: engine === "agent" ? "agent" : "plan", options, mode: options.generation, engine })
  if (error && isMissingColumn(error)) {
    console.error("[ai-site] ai_site_jobs has no options column yet (SQL part 401): the job keeps the prompt only", { code: error.code })
    ;({ data, error } = await insert(base))
  }
  if (!error && data?.id) return { kind: "made", id: data.id as string }
  if (isMissingTable(error)) return { kind: "missing" }
  if (error?.code === "23505") {
    const { data: same } = await admin.from(JOBS_TABLE).select("id, install_id").eq("creator_id", input.creatorId).eq("idempotency_key", input.key).maybeSingle()
    if (same) return { kind: "duplicate", id: (same as { id: string }).id, installId: (same as { install_id: string }).install_id }
  }
  console.error("[ai-site] could not start the job", { code: error?.code })
  return { kind: "failed" }
}

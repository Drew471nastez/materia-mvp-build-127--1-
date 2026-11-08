/**
 * ===========================================================================
 *  START WITH AI: THE JOB'S ROW, MADE ONCE PER PRESS
 * ===========================================================================
 * The Website page names each press of Create with a key of its own (a
 * random id), and (creator, key) is unique in ai_site_jobs: the same press
 * sent twice, a retry after a lost answer, finds the first job instead of
 * starting a second. Without the table (SQL part 380 not run yet) the answer
 * is `missing`, and the editor builds the site inside its own request.
 */
import { isMissingTable, JOBS_TABLE } from "./server"
import { emptyState } from "./job"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Jobs one creator may have running at once. */
export const MAX_RUNNING_JOBS = 1

/** The Website page's key for one press: 8 to 80 letters, digits and dashes. */
export function isStartKey(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,80}$/.test(v)
}

export type StartedJob = { kind: "made"; id: string } | { kind: "duplicate"; id: string; installId: string } | { kind: "missing" } | { kind: "failed" }

export async function startJobRow(admin: Db, input: { creatorId: string; ownerUserId: string | null; installId: string; prompt: string; key: string }): Promise<StartedJob> {
  const { data, error } = await admin
    .from(JOBS_TABLE)
    .insert({
      creator_id: input.creatorId,
      owner_user_id: input.ownerUserId,
      install_id: input.installId,
      prompt: input.prompt,
      idempotency_key: input.key,
      status: "queued",
      step: "plan",
      progress: 0,
      state: emptyState(),
    })
    .select("id")
    .single()
  if (!error && data?.id) return { kind: "made", id: data.id as string }
  if (isMissingTable(error)) return { kind: "missing" }
  if (error?.code === "23505") {
    const { data: same } = await admin.from(JOBS_TABLE).select("id, install_id").eq("creator_id", input.creatorId).eq("idempotency_key", input.key).maybeSingle()
    if (same) return { kind: "duplicate", id: (same as { id: string }).id, installId: (same as { install_id: string }).install_id }
  }
  console.error("[ai-site] could not start the job", { code: error?.code })
  return { kind: "failed" }
}

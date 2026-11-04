/**
 * ===========================================================================
 *  A PUBLISH IS A JOB WITH A DEADLINE, AND ITS STATE CAN BE ASKED FOR
 * ===========================================================================
 * The owner (round 51): "When I click Publish, sometimes it gets stuck
 * forever and never publishes." The editor's press was one POST, and the
 * POST was the only way to know how it went. When its answer was slow or
 * lost (a phone changing network, a proxy that dropped the connection, a
 * function that ran past its time), the button spun until the editor gave up
 * and said "taking longer than it should", with no way to tell whether the
 * site had gone live.
 *
 * So each press is a job (SQL part 360, theme_publish_jobs), named by the
 * editor with an id of its own:
 *
 *   running   started, and not past its deadline (PUBLISH_JOB_DEADLINE_S, a
 *             little past the route's maxDuration: a function still running
 *             then has been stopped by the platform)
 *   done      published
 *   failed    refused, with the route's own words
 *   expired   still "running" past its deadline: it never finished, and
 *             nothing says it went live, so Publish may be pressed again
 *             (the publish is all or nothing, publish_theme_install)
 *   unknown   no such job: the press never reached the server
 *
 * The same id sent twice is one publish: the second POST answers with the
 * first one's state rather than publishing again. The editor asks for the
 * state (GET ?job=) while its POST is slow or after it was lost
 * (lib/website-builder/publish-run.ts).
 *
 * Until part 360 has run the table is not there: every call here says
 * "untracked" and the route publishes exactly as it did before.
 */

export const PUBLISH_JOB_DEADLINE_S = 150

export type PublishJobState = "running" | "done" | "failed" | "expired" | "unknown" | "untracked"

/** A uuid, as the editor makes one (crypto.randomUUID). */
export function isJobId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

type Db = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message?: string } | null }>
    select: (cols: string) => {
      eq: (col: string, v: unknown) => {
        eq: (col: string, v: unknown) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }
      }
    }
    update: (row: Record<string, unknown>) => { eq: (col: string, v: unknown) => PromiseLike<{ error: { code?: string; message?: string } | null }> }
    delete: () => { eq: (col: string, v: unknown) => { lt: (col: string, v: unknown) => PromiseLike<{ error: unknown }> } }
  }
}

/** The table, or a column, not there yet (part 360 not run), or the schema cache that has not heard of it. */
function missing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code ?? "") || /theme_publish_jobs/.test(error.message ?? ""))
}

export interface JobRow {
  status: "running" | "done" | "failed"
  error: string | null
  deadline_at: string
}

/** What a stored row says now: a job still running past its deadline never finished. */
export function stateOf(row: JobRow | null, now = Date.now()): { state: PublishJobState; error: string | null } {
  if (!row) return { state: "unknown", error: null }
  if (row.status === "running" && Date.parse(row.deadline_at) < now) return { state: "expired", error: null }
  return { state: row.status, error: row.error }
}

export async function readJob(db: Db, installId: string, id: string): Promise<{ state: PublishJobState; error: string | null }> {
  const { data, error } = await db.from("theme_publish_jobs").select("status, error, deadline_at").eq("id", id).eq("install_id", installId).maybeSingle()
  if (missing(error)) return { state: "untracked", error: null }
  /* A read that failed is thrown: the route answers 503 and the editor asks again. */
  if (error) throw new Error(error.message ?? "read failed")
  return stateOf((data as JobRow | null) ?? null)
}

/**
 * The job begun: "new" when this press is the first of its id, otherwise the
 * state of the one that was (the same press sent twice). An expired job of
 * the same id is begun again: it never finished, and the publish is all or
 * nothing.
 */
export async function beginJob(db: Db, job: { id: string; installId: string; creatorId: string }): Promise<{ kind: "new" } | { kind: "seen"; state: PublishJobState; error: string | null } | { kind: "untracked" }> {
  try {
    const deadline = new Date(Date.now() + PUBLISH_JOB_DEADLINE_S * 1000).toISOString()
    const { error } = await db.from("theme_publish_jobs").insert({ id: job.id, install_id: job.installId, creator_id: job.creatorId, status: "running", deadline_at: deadline })
    if (!error) return { kind: "new" }
    if (missing(error)) return { kind: "untracked" }
    if (error.code !== "23505") return { kind: "untracked" }
    const seen = await readJob(db, job.installId, job.id)
    if (seen.state === "expired") {
      const again = await db.from("theme_publish_jobs").update({ status: "running", error: null, started_at: new Date().toISOString(), deadline_at: deadline, finished_at: null }).eq("id", job.id)
      return again.error ? { kind: "untracked" } : { kind: "new" }
    }
    return { kind: "seen", ...seen }
  } catch {
    /* A job that cannot be written is a publish that is not tracked, never one that is refused. */
    return { kind: "untracked" }
  }
}

/** The job's end, written. Never throws: the publish has already happened or not, and that is what was answered. */
export async function endJob(db: Db, id: string, ok: boolean, error: string | null): Promise<void> {
  try {
    await db.from("theme_publish_jobs").update({ status: ok ? "done" : "failed", error: ok ? null : (error ?? "Could not publish.").slice(0, 300), finished_at: new Date().toISOString() }).eq("id", id)
  } catch {
    /* the row stays running and reads as expired after its deadline */
  }
}

/** Jobs older than a day, for this install: nobody asks about them any more. */
export async function pruneJobs(db: Db, installId: string): Promise<void> {
  try {
    await db.from("theme_publish_jobs").delete().eq("install_id", installId).lt("started_at", new Date(Date.now() - 86_400_000).toISOString())
  } catch {
    /* housekeeping */
  }
}

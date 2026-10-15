import "server-only"

/**
 * ===========================================================================
 *  TRANSLATE WITH AI, IN THE BACKGROUND
 * ===========================================================================
 * A press of "Translate with AI" starts a job for that language
 * (store_translation_jobs, SQL part 177) and the server works through it,
 * round after round (./translation-press.ts), writing where it stands after
 * each: the texts that have a translation, out of all of them. The page only
 * reads that row, so closing the sheet, leaving Settings or refreshing never
 * stops the work, and opening it again shows the same progress at once.
 *
 *   one at a time   a press while a job runs joins it; a run holds the job
 *                   by its lease, so two never translate the same language
 *   picked up       a run that stops for time lets go of its lease and asks
 *                   for the next; one cut off is picked up by the cron
 *                   (/api/cron/translation-jobs) once its lease runs out
 *   done or failed  said on the row: a failure keeps its reason, and Try
 *                   again starts the job afresh
 *
 * Without part 177 the page falls back to pressing round by round itself.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { draftRound } from "./translation-press"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** How long a run may hold a job before another may take it over: longer than one run's window. */
const LEASE_MS = 330_000
/** A job never runs more rounds than this (150 texts each): a very large website is finished by pressing again. */
const MAX_ROUNDS = 40
/** A job waiting for a translator's allowance is tried again after this long (the cron runs every three minutes). */
const WAIT_MS = 4 * 60_000
/** And stops waiting, and says why, after this long. */
const WAIT_LIMIT_MS = 12 * 3_600_000
/** One round's own window, as the press route's. */
const ROUND_MS = 85_000

export type JobStatus = "running" | "done" | "failed"

export interface TranslationJob {
  locale: string
  status: JobStatus
  done: number
  total: number
  drafted: number
  error: string | null
  startedAt: string
  updatedAt: string
}

type Row = {
  creator_id: string
  locale: string
  status: JobStatus
  done: number
  total: number
  drafted: number
  rounds: number
  error: string | null
  started_by: string | null
  started_at: string
  updated_at: string
  lease_until: string | null
}

/** Part 177 has not run: the table is not there. */
export function jobsMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || /store_translation_jobs|schema cache|does not exist/i.test(error.message ?? "")
}

const view = (r: Row): TranslationJob => ({ locale: r.locale, status: r.status, done: r.done, total: r.total, drafted: r.drafted, error: r.error, startedAt: r.started_at, updatedAt: r.updated_at })

/** Every language's job for a store, newest state; `ready` false without part 177. */
export async function readJobs(db: Db, creatorId: string): Promise<{ ready: boolean; jobs: Record<string, TranslationJob> }> {
  const { data, error } = await db.from("store_translation_jobs").select("*").eq("creator_id", creatorId)
  if (error) return { ready: !jobsMissing(error), jobs: {} }
  const jobs: Record<string, TranslationJob> = {}
  for (const r of (data ?? []) as Row[]) jobs[r.locale] = view(r)
  return { ready: true, jobs }
}

export type StartResult = { ok: true; job: TranslationJob; run: boolean } | { ok: false; missing: true } | { ok: false; missing: false; error: string }

/**
 * A press of Translate with AI: the running job when there is one (`run`
 * false: another run holds it), else a new one held by this run.
 */
export async function startJob(db: Db, creatorId: string, locale: string, userId: string | null): Promise<StartResult> {
  const now = Date.now()
  const { data: was, error } = await db.from("store_translation_jobs").select("*").eq("creator_id", creatorId).eq("locale", locale).maybeSingle()
  if (error) return jobsMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: "Could not start translating. Try again." }
  const row = was as Row | null
  if (row?.status === "running" && row.lease_until && Date.parse(row.lease_until) > now) return { ok: true, job: view(row), run: false }
  const fresh = {
    creator_id: creatorId,
    locale,
    status: "running" as const,
    done: row?.done ?? 0,
    total: row?.total ?? 0,
    drafted: 0,
    rounds: 0,
    error: null,
    started_by: userId,
    started_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    lease_until: new Date(now + LEASE_MS).toISOString(),
  }
  const { data: put, error: putError } = await db.from("store_translation_jobs").upsert(fresh, { onConflict: "creator_id,locale" }).select("*").single()
  if (putError || !put) return jobsMissing(putError) ? { ok: false, missing: true } : { ok: false, missing: false, error: "Could not start translating. Try again." }
  return { ok: true, job: view(put as Row), run: true }
}

/** Takes over a running job whose lease has run out (a run cut off, or one that let go to be continued). False: someone holds it, or it is not running. */
async function claim(db: Db, creatorId: string, locale: string): Promise<Row | null> {
  const now = new Date()
  const { data } = await db
    .from("store_translation_jobs")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: now.toISOString() })
    .eq("creator_id", creatorId)
    .eq("locale", locale)
    .eq("status", "running")
    .or(`lease_until.is.null,lease_until.lt."${now.toISOString()}"`)
    .select("*")
  return ((data ?? []) as Row[])[0] ?? null
}

async function write(db: Db, creatorId: string, locale: string, patch: Partial<Row>): Promise<void> {
  await db.from("store_translation_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("creator_id", creatorId).eq("locale", locale)
}

/**
 * Works a job this run holds until it is done, fails, or `deadlineAt` comes;
 * `more` when there is still work and the lease was let go for the next run.
 */
export async function runJob(db: Db, creatorId: string, locale: string, deadlineAt: number): Promise<{ more: boolean }> {
  const { data } = await db.from("store_translation_jobs").select("*").eq("creator_id", creatorId).eq("locale", locale).maybeSingle()
  const row = data as Row | null
  if (!row || row.status !== "running") return { more: false }
  let drafted = row.drafted
  let rounds = row.rounds
  while (Date.now() + 15_000 < deadlineAt) {
    const r = await draftRound(db, creatorId, locale, row.started_by, Math.min(deadlineAt - 10_000, Date.now() + ROUND_MS)).catch((e: unknown) => ({ ok: false as const, status: 500, error: e instanceof Error ? e.message.slice(0, 200) : "Translating stopped." }))
    rounds += 1
    /*
      OUT OF ALLOWANCE FOR NOW (429): every translator is busy or has used
      its free allowance. The job waits and the cron picks it up again in a
      few minutes, rather than failing and asking the merchant to press
      again. After a long wait it stops and says why.
    */
    if (r.ok === false && r.status === 429 && Date.now() - Date.parse(row.started_at) < WAIT_LIMIT_MS) {
      await write(db, creatorId, locale, { error: `Waiting for the translator's allowance. It carries on by itself. (${r.error.slice(0, 300)})`, rounds: rounds - 1, lease_until: new Date(Date.now() + WAIT_MS).toISOString() })
      return { more: false }
    }
    if (r.ok === false) {
      await write(db, creatorId, locale, { status: "failed", error: r.error.slice(0, 500), rounds, lease_until: null })
      return { more: false }
    }
    drafted += r.drafted
    const finished = r.left === 0
    /* A round that wrote nothing with work left will not write anything next time either: said, not tried forever. */
    const stuck = !finished && r.drafted === 0
    const capped = !finished && rounds >= MAX_ROUNDS
    await write(db, creatorId, locale, {
      done: r.done,
      total: r.total,
      drafted,
      rounds,
      ...(finished
        ? { status: "done", error: null, lease_until: null }
        : stuck
          ? /* What is left came back empty from the translator: done, with the rest said, rather than tried for ever. */
            { status: "done", error: `${r.left} ${r.left === 1 ? "text" : "texts"} couldn't be translated automatically. Write them in the list.`, lease_until: null }
          : capped
            ? { status: "failed", error: "Paused after a long run. Press Translate again to carry on.", lease_until: null }
            : /* Going again: a waiting note from before is cleared. */ { error: null, lease_until: new Date(Date.now() + LEASE_MS).toISOString() }),
    })
    if (finished || stuck || capped) return { more: false }
  }
  /* Out of time with work left: let go, so the next run (asked for now, or the cron's) takes it straight away. */
  await write(db, creatorId, locale, { lease_until: new Date().toISOString() })
  return { more: true }
}

/** The cron's part, and a run asked for by the last: every running job nobody holds, until `deadlineAt`. */
export async function continueJobs(deadlineAt: number, only?: { creatorId: string; locale: string }): Promise<{ ran: number }> {
  const db = createAdminClient()
  let query = db.from("store_translation_jobs").select("creator_id, locale").eq("status", "running").or(`lease_until.is.null,lease_until.lt."${new Date().toISOString()}"`).order("updated_at", { ascending: true }).limit(10)
  if (only) query = query.eq("creator_id", only.creatorId).eq("locale", only.locale)
  const { data, error } = await query
  if (error) return { ran: 0 }
  let ran = 0
  for (const j of (data ?? []) as { creator_id: string; locale: string }[]) {
    if (Date.now() + 30_000 > deadlineAt) break
    if (!(await claim(db, j.creator_id, j.locale))) continue
    ran++
    const r = await runJob(db, j.creator_id, j.locale, deadlineAt)
    if (r.more) break
  }
  return { ran }
}

/** Asks for the next run of a job now, rather than at the cron's next minute. Best effort: the cron is the net. */
export async function askNextRun(origin: string, creatorId: string, locale: string): Promise<void> {
  const secret = process.env.CRON_SECRET
  if (!secret) return
  await fetch(`${origin}/api/cron/translation-jobs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ creatorId, locale }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined)
}

import "server-only"

/**
 * WHICH CODE RUNS EACH KIND OF COMMUNITY JOB (lib/communities/server/notify.ts
 * runCommunityJobs). One file per kind next to this one, and one line here.
 * A kind that is not listed is never scheduled by the cron, and a job of
 * that kind is retried and then given up, so add the handler and its line in
 * the same change that first queues the kind.
 */
import type { JobKind, JobRow } from "../../types"
import type { Db } from "../db"
import { recount } from "./recount"

export interface JobContext {
  /** When the run's budget ends (ms since the epoch). A long handler checks it and hands back `again`. */
  deadline: number
  now: number
}

/** Carry on in a later run, from this payload (a cursor), instead of finishing now. */
export interface JobOutcome {
  again?: { payload?: Record<string, unknown>; runAt?: string }
}

export type JobHandler = (db: Db, job: JobRow, ctx: JobContext) => Promise<JobOutcome | void>

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  recount,
  rollup: (db, job, ctx) => import("./rollup").then((m) => m.rollup(db, job, ctx)),
  trending: (db, job, ctx) => import("./trending").then((m) => m.trending(db, job, ctx)),
}

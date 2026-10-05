import "server-only"

/**
 * PUSH_DIGEST: the low priority notifications held back while a person's five
 * minute push window was open (likes, comments on their post, new events, new
 * followers, a followed creator's new product, new posts), sent as one push
 * when it closes: "3 new likes and 2 new comments". Payload { userId, group,
 * since }, queued by lib/notifications/push-bridge.ts once per window (its key
 * names the push that opened it), with run_at at the window's end.
 *
 * Read again when it runs: what was read in the bell meanwhile is not pushed,
 * nor anything for somebody who turned push (or that kind) off, left the
 * community or set it to mentions only. A newer window that opened since
 * makes it wait for that one instead. Runs whether communities are on or off
 * (PLATFORM_JOB_KINDS); a community's digest ends without a push while they
 * are off.
 *
 * THE DAILY REPORT EMAIL is a digest too, and the queue's kinds are fixed in
 * SQL, so it rides this kind with payload.report true (jobs/report_digest.ts).
 */
import { runPushDigest } from "@/lib/notifications/push-bridge"
import type { JobRow } from "../../types"
import type { Db } from "../db"
import type { JobContext, JobOutcome } from "./index"

export async function pushDigest(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  if ((job.payload as Record<string, unknown> | null)?.report === true) {
    const { runReportDigest } = await import("./report_digest")
    await runReportDigest(db, job.payload, ctx.now)
    return
  }
  return runPushDigest(db, job.payload, ctx.now)
}

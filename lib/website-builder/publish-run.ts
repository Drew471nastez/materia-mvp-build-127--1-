/**
 * ===========================================================================
 *  PUBLISH, FROM THE EDITOR: A PRESS THAT ALWAYS ENDS, AND SAYS HOW
 * ===========================================================================
 * The editor's half of the publish job (lib/website-builder/publish-job.ts,
 * the route's half). One press:
 *
 *   1. POST with a job id of its own, given POST_MS to answer.
 *   2. An answer: published, or refused with the route's words, and done.
 *      "Running" (the same press already on its way), a gateway's 502, 503
 *      or 504, or no answer at all (a timeout, a dropped connection) says
 *      nothing about whether it went live, so:
 *   3. The job is asked for every POLL_MS: done, failed, expired (it never
 *      finished: press again), running (still going), or unknown (the POST
 *      never arrived: sent again, same id, so it is one publish).
 *   4. Never past TOTAL_MS: whatever is known then is said.
 *
 * Before SQL part 360 has run the server keeps no jobs ("untracked"): a lost
 * answer is sent once more, which is safe because a publish is all or
 * nothing on the server.
 *
 * Pure but for what it is handed, so tests/editor-reliability-r51.test.ts
 * runs it against every way the network can misbehave.
 */
import { tt } from "@/lib/i18n/text"

export type PublishPhase = "sending" | "slow" | "checking"

export type PublishOutcome =
  | { ok: true }
  | { ok: false; kind: "refused" | "unfinished" | "unconfirmed" | "offline"; error: string; status?: number }

export interface PublishRunDeps {
  /** The POST, with the job's id; rejects on a timeout or no answer. */
  post: (job: string) => Promise<{ status: number; body: { job?: unknown; error?: unknown } | null }>
  /** GET ?job=; rejects on a timeout or no answer. */
  status: (job: string) => Promise<{ status: number; body: { job?: unknown; error?: unknown } | null }>
  wait: (ms: number) => Promise<void>
  now: () => number
  newId: () => string
  online?: () => boolean
  onPhase?: (phase: PublishPhase) => void
}

export const PUBLISH_TIMES = {
  /** How long the POST is given before the job is asked for instead. */
  postMs: 20_000,
  /** Between two asks. */
  pollMs: 2_000,
  /** How long the POST goes unanswered before the job is asked for beside it. */
  firstAskMs: 4_000,
  /** After this the button says it is still going. */
  slowMs: 8_000,
  /** The longest a press may last: past the job's own deadline (PUBLISH_JOB_DEADLINE_S), so an unfinished one is known by then. */
  totalMs: 160_000,
} as const

const GATEWAY = new Set([502, 503, 504])

function words(body: { error?: unknown } | null, fallback: string): string {
  return typeof body?.error === "string" && body.error.trim() ? body.error : fallback
}

export async function runPublish(deps: PublishRunDeps, times: Partial<Record<keyof typeof PUBLISH_TIMES, number>> = {}): Promise<PublishOutcome> {
  const t = { ...PUBLISH_TIMES, ...times }
  const job = deps.newId()
  const started = deps.now()
  const left = () => t.totalMs - (deps.now() - started)
  let slowSaid = false
  const phase = (p: PublishPhase) => {
    if (p === "slow") slowSaid = true
    deps.onPhase?.(p)
  }
  const maybeSlow = () => {
    if (!slowSaid && deps.now() - started >= t.slowMs) phase("slow")
  }
  phase("sending")

  /** One POST: an outcome, or null when it said nothing about how the publish went. */
  const send = async (): Promise<PublishOutcome | null> => {
    try {
      const r = await deps.post(job)
      if (r.status >= 200 && r.status < 300 && r.body?.job !== "running") return { ok: true }
      if (r.status === 202 || r.body?.job === "running") return null
      if (GATEWAY.has(r.status)) return null
      return { ok: false, kind: "refused", status: r.status, error: words(r.body, tt("Couldn't publish. Try again.")) }
    } catch {
      return null
    }
  }

  /*
    The POST and the asks overlap: once the POST has gone FIRST_ASK_MS without
    an answer the job is asked for beside it, so an answer that was lost costs
    a couple of seconds after the job is done, not the POST's whole wait.
  */
  let posted: PublishOutcome | null | undefined
  let inflight: Promise<void> | null = null
  const post = () => {
    posted = undefined
    inflight = send().then((o) => {
      posted = o
      inflight = null
    })
  }
  const pause = (ms: number) => (inflight ? Promise.race([inflight, deps.wait(ms)]) : deps.wait(ms))
  post()
  await pause(t.firstAskMs)
  let resent = 0
  while (true) {
    maybeSlow()
    if (posted) return posted
    if (left() <= 0) break
    phase(slowSaid ? "slow" : "checking")
    let state: unknown = null
    let said: { error?: unknown } | null = null
    try {
      const r = await deps.status(job)
      if (r.status >= 200 && r.status < 300) {
        state = r.body?.job
        said = r.body
      }
    } catch {
      /* no answer to the ask either: asked again on the next turn */
    }
    if (posted) return posted
    if (state === "done") return { ok: true }
    if (state === "failed") return { ok: false, kind: "refused", error: words(said, tt("Couldn't publish. Try again.")) }
    if (state === "expired") return { ok: false, kind: "unfinished", error: tt("Publishing didn't finish. Publish again.") }
    /*
      Never arrived (unknown), or no record is kept (untracked), and the POST
      has ended without saying: sent once more, the same press, so it is one
      publish. Twice without an answer is the connection, not the server.
    */
    if ((state === "unknown" || state === "untracked") && !inflight) {
      if (resent >= 1) break
      resent++
      post()
    }
    await pause(t.pollMs)
  }
  if (deps.online && !deps.online()) return { ok: false, kind: "offline", error: tt("You're offline. Publish again later.") }
  return { ok: false, kind: "unconfirmed", error: tt("Publish not confirmed. Check your site.") }
}

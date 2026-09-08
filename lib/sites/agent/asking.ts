import "server-only"

/**
 * ===========================================================================
 *  WAITING FOR A PERSON, FROM INSIDE A RUN
 * ===========================================================================
 * The agent asks one question and stops. The answer arrives in a DIFFERENT
 * HTTP request — the browser posts it to /api/sites/[siteId]/agent/answer while
 * the run is blocked inside the streaming request that started it.
 *
 * Those are two processes. On a serverless platform they are not even the same
 * machine, so nothing in memory can carry the answer between them: no promise,
 * no emitter, no module-level map. A row both can see is the only mechanism
 * that works, and polling it is the only way to notice it changed without a
 * listener the platform does not offer.
 *
 * ---------------------------------------------------------------------------
 *  THE DEADLINE IS THE PART THAT MATTERS
 * ---------------------------------------------------------------------------
 * The agent route runs with maxDuration 300. A run that waits without a
 * deadline does not wait indefinitely — it is KILLED mid-build, and everything
 * it had done up to that point is thrown away unsaved. Somebody who walked
 * away from a question would come back to a site that had not changed and no
 * explanation.
 *
 * So the wait is bounded by what the run can afford rather than by a constant:
 *
 *   - never past `deadline`, which is the run's own end minus the time it
 *     needs to finish building and save;
 *   - never longer than MAX_WAIT_MS, so a forgotten tab does not hold a
 *     function open for four minutes;
 *   - not at all when less than MIN_USEFUL_WAIT_MS remains, because a question
 *     nobody can realistically answer in the time available is worse than a
 *     guess — it costs the wait AND still gets the guess.
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { AgentQuestion, AnswerOutcome } from "./questions"

/**
 * Two and a half minutes. Long enough to read a question, think, and type a
 * shop name; short enough that a tab somebody abandoned still leaves the run
 * time to finish the site rather than being killed holding it.
 */
export const MAX_WAIT_MS = 150_000

/**
 * Below this there is no point starting. Fifteen seconds is not enough time to
 * answer anything, so asking would spend the remaining budget on a wait that
 * was always going to time out.
 */
export const MIN_USEFUL_WAIT_MS = 20_000

/**
 * Every second. The person is watching the screen when they answer, so this is
 * the difference between "instant" and "did it freeze" — and it is one indexed
 * lookup by primary key on a row that exists.
 */
const POLL_MS = 1_000

/** Injected so a test does not spend real seconds proving it waits. */
export interface AskDeps {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Put the question where the browser can see it and wait for what comes back.
 *
 * Never throws. A database that will not answer is reported as `timeout` — the
 * model then uses its judgement and the site still gets built, which is what
 * somebody wants far more than a failed run explaining that a poll failed.
 */
export function createAsker(input: {
  siteId: string
  runId: string
  /** Wall-clock ms after which the run must be building, not waiting. */
  deadline: number
  signal?: AbortSignal
  deps?: AskDeps
}): (question: AgentQuestion) => Promise<AnswerOutcome> {
  const now = input.deps?.now ?? (() => Date.now())
  const sleep =
    input.deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  return async (question) => {
    const room = Math.min(MAX_WAIT_MS, input.deadline - now())
    if (room < MIN_USEFUL_WAIT_MS) return { kind: "timeout" }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from("site_agent_questions")
      .insert({
        site_id: input.siteId,
        run_id: input.runId,
        question,
      })
      .select("id")
      .single()

    /**
     * The question never reached anybody, so there is nobody to wait for.
     * Waiting anyway would burn the whole window on a row that does not exist.
     */
    if (error || !data) return { kind: "timeout" }

    const rowId = (data as { id: string }).id
    const until = now() + room

    while (now() < until) {
      if (input.signal?.aborted) return { kind: "timeout" }
      await sleep(POLL_MS)

      const { data: row } = await admin
        .from("site_agent_questions")
        .select("answer, skipped, answered_at")
        .eq("id", rowId)
        .maybeSingle()

      if (!row) continue
      const answered = row as { answer: string | null; skipped: boolean; answered_at: string | null }
      if (!answered.answered_at) continue

      if (answered.skipped) return { kind: "skipped" }
      const text = (answered.answer ?? "").trim()
      /**
       * An empty answer that was submitted is a skip, not an answer. The model
       * being told "they answered: " with nothing after it is worse than being
       * told they declined.
       */
      return text ? { kind: "answered", answer: text } : { kind: "skipped" }
    }

    /**
     * Marked so the browser stops offering a box that leads nowhere, and so a
     * late answer is not silently written to a run that has moved on. Best
     * effort: the timeout stands either way.
     */
    await admin
      .from("site_agent_questions")
      .update({ answered_at: new Date().toISOString(), skipped: false })
      .eq("id", rowId)
      .is("answered_at", null)
      .then(
        () => undefined,
        () => undefined,
      )

    return { kind: "timeout" }
  }
}

/**
 * Record an answer against a question a run is waiting on.
 *
 * `.is("answered_at", null)` is the whole safety property: it makes this a
 * compare-and-swap, so a second submission — a double tap, two tabs, an answer
 * racing the timeout — cannot overwrite the first. Whoever got there first is
 * what the run acts on, which is also what the person saw happen.
 */
export async function recordAnswer(input: {
  siteId: string
  questionId: string
  answer: string
  skipped: boolean
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("site_agent_questions")
    .update({
      answer: input.skipped ? null : input.answer.slice(0, 2_000),
      skipped: input.skipped,
      answered_at: new Date().toISOString(),
    })
    .eq("id", input.questionId)
    /**
     * Scoped to the site as well as the id. The route has already proved this
     * creator owns this site; without this line an id from another site would
     * still be updated, and a question id is not a secret.
     */
    .eq("site_id", input.siteId)
    .is("answered_at", null)
    .select("id")

  if (error) return { ok: false, reason: "That could not be saved. Try again." }
  if (!data || data.length === 0) {
    return { ok: false, reason: "That question is no longer waiting for an answer." }
  }
  return { ok: true }
}
